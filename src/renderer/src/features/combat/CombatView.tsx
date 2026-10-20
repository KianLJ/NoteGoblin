// The Combat tab (top-left switch, next to the Homebrew Workshop): the
// initiative order, a battle map with a token per combatant, and the
// selected combatant's numbers and attacks to roll. It edits the same
// encounter as the right panel's initiative tracker (encounterStore.ts).
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import { nextTurnState, previousTurnState, sortedByInitiative, withCombatantHp, type Combatant } from '@shared/encounter'
import { activeBattle, canStand, emptyBattleMap, fogEverything, newBattle, type BattleMap } from '@shared/battleMap'
import { diceGroups } from '@shared/dice'
import { deriveSheet } from '@shared/content/sheet'
import { formatModifier } from '@shared/dnd5e'
import { vehicleName, type TrackedVehicle } from '@shared/vehicles'
import { useAllMonsters } from '../../data/useAllMonsters'
import type { BestiaryMonster } from '../../data/bestiary'
import { renderStatblockHtml } from '../../statblock'
import { useSheetRoller } from '../dice/useSheetRoller'
import { rollInlineDice } from '../dice/inlineDice'
import { getDiceLog, subscribeDiceLog } from '../dice/diceLogStore'
import { playTurnFlowSfx } from '../audio/sfxBoardEngine'
import { useVehicles } from '../vehicles/useVehicles'
import { XIcon } from '../../ui/icons'
import { canRedoBattleMap, canUndoBattleMap, redoBattleMap, setLibrary, switchBattle, undoBattleMap, useBattleLibrary, useBattleMap, useEncounter } from './encounterStore'
import { loadSavedEncounters } from '../../data/savedEncounters'
import { monsterToCombatant } from '../campaigns/InitiativeTracker'
import { ConfirmButton } from '../../ui/ConfirmButton'
import { ResizableSidebar } from '../../ui/ResizableSidebar'
import { BattleMapView, EyeIcon, HideToggle, LockToggle, type FogDraw, type FogTool, type MapTool } from './BattleMapView'

interface CombatViewProps {
  /** The session the DM is hosting — rolls and turn cues go to the table. */
  sessionId: string | null
  campaignId: string | null
  playerCharacters: Map<string, CharacterSheet>
}

const CONDITIONS = ['Blinded', 'Charmed', 'Concentrating', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious']

const TOOLS: Array<{ tool: MapTool; label: string; hint: string }> = [
  { tool: 'move', label: 'Move', hint: 'Drag a token to move it, or drag the map to pan. Scroll to zoom.' },
  { tool: 'ruler', label: 'Ruler', hint: 'Drag between squares to measure. Diagonals count as one square.' },
  { tool: 'cone', label: 'Cone', hint: 'Drag from the caster: the distance sets its length, the direction where it points.' },
  { tool: 'sphere', label: 'Sphere', hint: 'Drag from where the spell lands: the distance sets its radius.' },
  { tool: 'line', label: 'Line', hint: 'Drag from the caster along the line (5 ft wide): the distance sets its length.' },
  { tool: 'cube', label: 'Cube', hint: 'Drag from one corner: the distance sets its side.' },
  { tool: 'fog', label: 'Fog', hint: 'Draw fog to hide parts of the map from players; switch to Cut to clear it.' }
]

const FOG_DRAWS: Array<{ draw: FogDraw; label: string; hint: string }> = [
  { draw: 'move', label: 'Move', hint: 'Click fog (or a cut) to pick it, then drag it. Delete removes it; its options can lock it.' },
  { draw: 'brush', label: 'Brush', hint: 'Paint freely.' },
  { draw: 'line', label: 'Line', hint: 'Drag a straight line.' },
  { draw: 'points', label: 'Points', hint: 'Click point by point; click the first point, double-click or press Enter to finish. Escape cancels.' },
  { draw: 'rect', label: 'Square', hint: 'Drag from one corner to the other.' },
  { draw: 'circle', label: 'Circle', hint: 'Drag from the centre outwards.' }
]

const SNAP_KEY = 'gb-combat-snap'
function loadSnap(): boolean {
  try {
    return localStorage.getItem(SNAP_KEY) !== '0'
  } catch {
    return true
  }
}

export function CombatView({ sessionId, campaignId, playerCharacters }: CombatViewProps): JSX.Element {
  const [encounter, setEncounter] = useEncounter()
  const [map, setMap] = useBattleMap()
  const vehicles = useVehicles(null, campaignId)
  const { monsters } = useAllMonsters()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tool, setTool] = useState<MapTool>('move')
  const [hint, setHint] = useState(TOOLS[0].hint)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [fogTool, setFogTool] = useState<FogTool>({ op: 'add', draw: 'rect', width: 1 })
  const [snap, setSnapState] = useState(loadSnap)
  const setSnap = (on: boolean): void => {
    setSnapState(on)
    try {
      localStorage.setItem(SNAP_KEY, on ? '1' : '0')
    } catch {
      /* best-effort */
    }
  }

  // Ctrl+Z undoes the last map change (a move, a shape, fog); Ctrl+Y or Ctrl+Shift+Z redoes it. Typing in a box keeps its own undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) return
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (undoBattleMap()) setHint('Undone. Ctrl+Y redoes it.')
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault()
        if (redoBattleMap()) setHint('Redone.')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const ordered = useMemo(() => sortedByInitiative(encounter.combatants), [encounter.combatants])
  const turnId = encounter.turnIndex >= 0 ? (ordered[encounter.turnIndex]?.id ?? null) : null
  const monsterOf = (c: Combatant): BestiaryMonster | undefined => (c.kind === 'monster' ? monsters.find((m) => m.index === c.monsterIndex) : undefined)
  const vehicleOf = (c: Combatant): TrackedVehicle | undefined => (c.kind === 'vehicle' ? vehicles.doc.vehicles.find((v) => v.id === c.vehicleId) : undefined)
  const characterOf = (c: Combatant): CharacterSheet | undefined => (c.kind === 'player' && c.userId ? playerCharacters.get(c.userId) : undefined)

  // Tokens are placed (and the map saved and shared) by useBattleMapSync, mounted in the app shell.

  const selected = encounter.combatants.find((c) => c.id === selectedId) ?? null

  function step(dir: 1 | -1): void {
    const next = dir === 1 ? nextTurnState(encounter) : previousTurnState(encounter)
    setEncounter(next)
    if (dir === 1) playTurnFlowSfx(encounter.turnIndex < 0 ? 'Initiative Start' : 'Turn Change', sessionId)
    const id = sortedByInitiative(next.combatants)[next.turnIndex]?.id
    if (id) setSelectedId(id)
  }

  /** Damage or healing — a vehicle ignores a hit under its threshold, can't be repaired past full, and its hull follows. */
  function changeHp(c: Combatant, amount: number, kind: 'damage' | 'heal'): void {
    if (!(amount > 0)) return
    if (kind === 'damage' && c.kind === 'vehicle' && c.damageThreshold && amount < c.damageThreshold) return
    const next = kind === 'damage' ? Math.max(0, c.currentHp - amount) : c.kind === 'vehicle' ? Math.min(c.maxHp, c.currentHp + amount) : c.currentHp + amount
    setEncounter((s) => withCombatantHp(s, c.id, next))
    if (c.kind === 'vehicle' && c.vehicleId) void vehicles.save({ vehicles: vehicles.doc.vehicles.map((v) => (v.id === c.vehicleId ? { ...v, hp: next } : v)) })
  }

  const setConditions = (c: Combatant, statusEffects: string[]): void =>
    setEncounter((s) => ({ ...s, combatants: s.combatants.map((x) => (x.id === c.id ? { ...x, statusEffects } : x)) }))

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 var(--space-4)', borderBottom: '1px solid var(--border-subtle)' }}>
        <strong style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>Combat</strong>
        <BattleMenu
          onLoadEnemies={(indexes) => {
            // The encounter's monsters replace whatever monsters are in the fight; the party and vehicles stay.
            const added = indexes.map((i) => monsters.find((m) => m.index === i)).filter((m): m is BestiaryMonster => !!m).map(monsterToCombatant)
            setEncounter((s) => ({ ...s, turnIndex: -1, round: 1, combatants: [...s.combatants.filter((c) => c.kind !== 'monster'), ...added] }))
            setHint(`${added.length} enem${added.length === 1 ? 'y' : 'ies'} loaded where they stood on this map last time. Roll initiative in the Initiative tab.`)
          }}
        />
        {encounter.turnIndex >= 0 && <span className="gb-badge gb-badge--accent">Round {encounter.round}</span>}
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{encounter.combatants.length === 0 ? 'Add combatants in the Initiative tab (right panel), or load an encounter from a session scene.' : ''}</span>
        <div style={{ flex: 1 }} />
        {encounter.turnIndex >= 0 ? (
          <>
            <button type="button" className="gb-btn gb-btn--secondary" style={btn} onClick={() => step(-1)}>
              Previous
            </button>
            <button type="button" className="gb-btn gb-btn--primary" style={btn} onClick={() => step(1)}>
              Next turn
            </button>
            <button
              type="button"
              className="gb-btn gb-btn--ghost"
              style={btn}
              onClick={() => {
                setEncounter((s) => ({ ...s, turnIndex: -1, round: 1 }))
                playTurnFlowSfx('End Combat', sessionId)
              }}
            >
              End combat
            </button>
          </>
        ) : (
          <button type="button" className="gb-btn gb-btn--primary" style={btn} disabled={encounter.combatants.length === 0} onClick={() => step(1)} title="Roll initiative in the Initiative tab first; the order follows it">
            Start combat
          </button>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <ResizableSidebar defaultWidth={240} minWidth={180} maxWidth={420} handleSide="right" collapseStorageKey="gb-sidebar-collapsed:combat-order" widthStorageKey="gb-sidebar-width:combat-order">
        <aside style={{ height: '100%', borderRight: '1px solid var(--border-subtle)', background: 'var(--bg-sunken)', overflowY: 'auto', padding: 'var(--space-2)' }}>
          <div className="gb-label" style={{ padding: '6px 6px 4px' }}>
            Initiative
          </div>
          {ordered.map((c) => (
            <OrderRow key={c.id} c={c} turn={c.id === turnId} selected={c.id === selectedId} onClick={() => setSelectedId(c.id)} />
          ))}
        </aside>
        </ResizableSidebar>

        <section style={{ position: 'relative', flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', background: '#0b0907' }}>
          <BattleMapView map={map} onChange={(m) => setMap(m)} combatants={encounter.combatants} turnId={turnId} selectedId={selectedId} onSelect={setSelectedId} tool={tool} fogTool={fogTool} snap={snap} onHint={setHint} />
          <div style={toolbar}>
            {TOOLS.map((t) => (
              <button
                key={t.tool}
                type="button"
                onClick={() => {
                  setTool(t.tool)
                  setHint(t.hint)
                }}
                style={toolButton(tool === t.tool)}
                title={t.hint}
              >
                {t.label}
              </button>
            ))}
            <span style={{ width: 1, background: 'var(--border-subtle)', margin: '4px 2px' }} />
            <button type="button" style={toolButton(snap)} onClick={() => setSnap(!snap)} title={snap ? 'Snapping to square corners and centres (click to place freely)' : 'Placing freely (click to snap to square corners and centres)'}>
              Snap {snap ? 'on' : 'off'}
            </button>
            <span style={{ width: 1, background: 'var(--border-subtle)', margin: '4px 2px' }} />
            <button type="button" style={{ ...toolButton(false), opacity: canUndoBattleMap() ? 1 : 0.4 }} onClick={() => undoBattleMap() && setHint('Undone. Ctrl+Y redoes it.')} disabled={!canUndoBattleMap()} title="Undo (Ctrl+Z)">
              Undo
            </button>
            <button type="button" style={{ ...toolButton(false), opacity: canRedoBattleMap() ? 1 : 0.4 }} onClick={() => redoBattleMap() && setHint('Redone.')} disabled={!canRedoBattleMap()} title="Redo (Ctrl+Y)">
              Redo
            </button>
            <span style={{ width: 1, background: 'var(--border-subtle)', margin: '4px 2px' }} />
            <button type="button" style={toolButton(settingsOpen)} onClick={() => setSettingsOpen((o) => !o)}>
              Map…
            </button>
          </div>
          {tool === 'fog' && (
            <div style={{ ...toolbar, top: 54 }}>
              {(['add', 'cut'] as const).map((op) => (
                <button key={op} type="button" style={toolButton(fogTool.op === op)} onClick={() => setFogTool({ ...fogTool, op })} title={op === 'add' ? 'Draw fog' : 'Cut fog away'}>
                  {op === 'add' ? 'Add fog' : 'Cut fog'}
                </button>
              ))}
              <span style={{ width: 1, background: 'var(--border-subtle)', margin: '4px 2px' }} />
              {FOG_DRAWS.map((d) => (
                <button
                  key={d.draw}
                  type="button"
                  style={toolButton(fogTool.draw === d.draw)}
                  onClick={() => {
                    setFogTool({ ...fogTool, draw: d.draw })
                    setHint(d.hint)
                  }}
                  title={d.hint}
                >
                  {d.label}
                </button>
              ))}
              {(fogTool.draw === 'brush' || fogTool.draw === 'line') && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 4 }} title="How wide, in squares">
                  Width
                  <input type="range" min={0.25} max={6} step={0.25} value={fogTool.width} onChange={(e) => setFogTool({ ...fogTool, width: Number(e.target.value) })} style={{ width: 80 }} />
                  <span style={{ minWidth: 26 }}>{fogTool.width}</span>
                </label>
              )}
            </div>
          )}
          {settingsOpen && <MapSettings map={map} onChange={setMap} onClose={() => setSettingsOpen(false)} />}
          <div style={{ position: 'absolute', left: 12, bottom: 12, fontSize: 12, color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: 8, pointerEvents: 'none' }}>{hint}</div>
        </section>

        <ResizableSidebar defaultWidth={290} minWidth={220} maxWidth={480} handleSide="left" collapseStorageKey="gb-sidebar-collapsed:combat-detail" widthStorageKey="gb-sidebar-width:combat-detail">
        <aside style={{ height: '100%', borderLeft: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-3)' }}>
            {selected ? (
              <Detail
                key={selected.id}
                c={selected}
                sessionId={sessionId}
                monster={monsterOf(selected)}
                vehicle={vehicleOf(selected)}
                character={characterOf(selected)}
                onHp={(amount, kind) => changeHp(selected, amount, kind)}
                onConditions={(list) => setConditions(selected, list)}
                onHidden={(hidden) => setEncounter((s) => ({ ...s, combatants: s.combatants.map((x) => (x.id === selected.id ? { ...x, hidden: hidden || undefined } : x)) }))}
                locked={!!map.tokens[selected.id]?.locked}
                onLock={(locked) => {
                  const t = map.tokens[selected.id]
                  if (t) setMap({ ...map, tokens: { ...map.tokens, [selected.id]: { ...t, locked: locked || undefined } } })
                }}
              />
            ) : (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Click a token or a name in the initiative order to see its numbers and roll its attacks.</p>
            )}
          </div>
          <RollLog />
        </aside>
        </ResizableSidebar>
      </div>
    </div>
  )
}

/**
 * The battle that's up, as one button in the header (its name, and the
 * encounter it's for). It opens a small menu: switch, add, rename or delete
 * battles, link a saved encounter, and load that encounter's enemies.
 */
function BattleMenu({ onLoadEnemies }: { onLoadEnemies: (monsterIndexes: string[]) => void }): JSX.Element {
  const library = useBattleLibrary()
  const battle = activeBattle(library)
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [encounters, setEncounters] = useState(loadSavedEncounters)
  const linked = encounters.find((e) => e.id === battle.encounterId)
  const patch = (fields: Partial<typeof battle>): void => setLibrary((l) => ({ ...l, battles: l.battles.map((b) => (b.id === battle.id ? { ...b, ...fields } : b)) }))

  // Closes on Escape; saved encounters are read fresh each time it opens (the builder may have saved more).
  useEffect(() => {
    if (!open) return
    setEncounters(loadSavedEncounters())
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Change battle, its encounter, or load its enemies"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 320, padding: '3px 10px', borderRadius: 999, border: `1px solid ${open ? 'var(--accent)' : 'var(--border-strong)'}`, background: 'var(--bg-surface-raised)', color: 'var(--text-primary)', font: 'inherit', fontSize: 12, cursor: 'pointer' }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{battle.name}</span>
        {linked && <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {linked.name}</span>}
        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <>
          {/* A click outside closes it. */}
          <div style={{ position: 'fixed', inset: 0, zIndex: 19 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 20, width: 300, padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
            <div className="gb-label" style={{ margin: 0 }}>
              Battles
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 180, overflowY: 'auto' }}>
              {library.battles.map((b) => {
                const on = b.id === battle.id
                const enc = encounters.find((e) => e.id === b.encounterId)
                return (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 'var(--radius-md)', background: on ? 'var(--accent-subtle)' : 'transparent' }}>
                    {on && renaming ? (
                      <input
                        className="gb-input"
                        autoFocus
                        defaultValue={b.name}
                        onBlur={(e) => {
                          patch({ name: e.target.value.trim() || b.name })
                          setRenaming(false)
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        style={{ flex: 1, fontSize: 12, padding: '2px 6px' }}
                      />
                    ) : (
                      <button type="button" onClick={() => switchBattle(b.id)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 0, padding: 0, color: on ? 'var(--accent-hover)' : 'var(--text-primary)', font: 'inherit', cursor: 'pointer' }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: on ? 600 : 400 }}>{b.name}</span>
                        {enc && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>{enc.name}</span>}
                      </button>
                    )}
                    {on && !renaming && (
                      <button type="button" className="gb-btn gb-btn--ghost" style={tiny} onClick={() => setRenaming(true)}>
                        Rename
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="gb-btn gb-btn--secondary"
                style={tiny}
                onClick={() => {
                  const b = newBattle(`Battle ${library.battles.length + 1}`, crypto.randomUUID())
                  setLibrary((l) => ({ ...l, battles: [...l.battles, b] }))
                  switchBattle(b.id)
                }}
                title="A new map, with its own positions and start spots"
              >
                + New battle
              </button>
              {library.battles.length > 1 && (
                <ConfirmButton
                  label="Delete this one"
                  confirmLabel="Delete it?"
                  variant="ghost"
                  danger
                  style={tiny}
                  title="Deletes this battle's map and everything placed on it"
                  onConfirm={() => {
                    const rest = library.battles.filter((b) => b.id !== battle.id)
                    switchBattle(rest[0].id)
                    setLibrary((l) => ({ ...l, battles: l.battles.filter((b) => b.id !== battle.id) }))
                  }}
                />
              )}
            </div>
            <div style={{ height: 1, background: 'var(--border-subtle)' }} />
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="gb-label" style={{ margin: 0 }}>
                Encounter for this map
              </span>
              <select className="gb-input" value={battle.encounterId ?? ''} onChange={(e) => patch({ encounterId: e.target.value || null })} style={{ fontSize: 12, padding: '3px 6px' }} title="Loading this encounter from a session scene switches to this battle">
                <option value="">None</option>
                {encounters.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.monsterIndexes.length})
                  </option>
                ))}
              </select>
            </label>
            {encounters.length === 0 && <span style={{ color: 'var(--text-muted)' }}>Save encounters in the Initiative tab’s Build Encounter to link them here.</span>}
            {linked && (
              <button
                type="button"
                className="gb-btn gb-btn--primary"
                style={{ ...tiny, alignSelf: 'flex-start' }}
                onClick={() => {
                  onLoadEnemies(linked.monsterIndexes)
                  setOpen(false)
                }}
                title="Puts this encounter's monsters in the fight (replacing any already there), where they stood on this map last time"
              >
                Load enemies
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

const tiny = { fontSize: 12, padding: '2px 8px' } as const

function OrderRow({ c, turn, selected, onClick }: { c: Combatant; turn: boolean; selected: boolean; onClick: () => void }): JSX.Element {
  const frac = Math.max(0, c.currentHp / Math.max(1, c.maxHp))
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '28px 1fr',
        gap: 8,
        alignItems: 'center',
        width: '100%',
        textAlign: 'left',
        padding: '6px 8px',
        marginBottom: 4,
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${turn ? 'var(--accent)' : selected ? 'var(--border-strong)' : 'transparent'}`,
        background: turn ? 'var(--accent-subtle)' : selected ? 'var(--bg-surface)' : 'transparent',
        color: 'inherit',
        font: 'inherit',
        cursor: 'pointer'
      }}
    >
      <span style={{ fontWeight: 700, textAlign: 'center', color: 'var(--text-secondary)' }}>{c.initiative ?? '–'}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <strong style={{ fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</strong>
          {c.hidden && (
            <span title="Hidden from players" style={{ color: 'var(--text-muted)', display: 'inline-flex' }}>
              <EyeIcon open={false} />
            </span>
          )}
          {c.currentHp <= 0 && (
            <span className="gb-badge" style={{ fontSize: 10, color: 'var(--danger)' }}>
              {c.kind === 'vehicle' ? 'Wrecked' : 'Down'}
            </span>
          )}
        </span>
        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>
          {c.currentHp}/{c.maxHp} HP · AC {c.ac}
          {c.statusEffects.length ? ` · ${c.statusEffects.join(', ')}` : ''}
        </span>
        <span style={{ display: 'block', height: 4, borderRadius: 9, background: 'var(--bg-canvas)', overflow: 'hidden', marginTop: 3 }}>
          <span style={{ display: 'block', height: '100%', width: `${frac * 100}%`, background: frac > 0.5 ? 'var(--success)' : frac > 0.25 ? 'var(--accent)' : 'var(--danger)' }} />
        </span>
      </span>
    </button>
  )
}

interface AttackLine {
  name: string
  bonus?: number
  damage?: string
  note?: string
  critOn?: number
}

/** Attack bonus and damage dice from a statblock action's text ("+6 to hit … Hit: 13 (2d8 + 4)", or the 2024 "Attack Roll: +6 … 13 (2d8 + 4)"). */
export function attackFromText(name: string, desc: string): AttackLine | null {
  const plain = desc.replace(/`dice:\s*([^`]+)`/g, '$1')
  const bonus = /([+-]\d+) to hit/.exec(plain) ?? /Attack Roll:\s*([+-]\d+)/.exec(plain)
  const dmg = /\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)/.exec(plain)
  if (!bonus && !dmg) return null
  return { name, ...(bonus ? { bonus: Number(bonus[1]) } : {}), ...(dmg ? { damage: dmg[1].replace(/\s+/g, ' ') } : {}) }
}

function attacksFor(monster?: BestiaryMonster, vehicle?: TrackedVehicle, character?: CharacterSheet): AttackLine[] {
  if (character) {
    const { derived } = deriveSheet(character)
    return derived.attacks.map((a) => ({ name: a.name, bonus: a.attackBonus, damage: a.damage, note: a.damageType, critOn: a.kind === 'weapon' || a.kind === 'unarmed' ? derived.critThreshold : 20 }))
  }
  if (vehicle) return vehicle.def.weapons.map((w) => ({ name: w.name, bonus: w.attackBonus, damage: w.damage || undefined, note: w.saveDc !== undefined ? `DC ${w.saveDc} ${(w.saveAbility ?? 'dex').toUpperCase()}` : w.damageType }))
  if (monster) return [...(monster.actions ?? []), ...(monster.bonus_actions ?? [])].map((a) => attackFromText(a.name, a.desc)).filter((x): x is AttackLine => !!x)
  return []
}

function Detail({
  c,
  sessionId,
  monster,
  vehicle,
  character,
  onHp,
  onConditions,
  onHidden,
  locked,
  onLock
}: {
  c: Combatant
  sessionId: string | null
  monster?: BestiaryMonster
  vehicle?: TrackedVehicle
  character?: CharacterSheet
  onHp: (amount: number, kind: 'damage' | 'heal') => void
  onConditions: (list: string[]) => void
  onHidden: (hidden: boolean) => void
  /** Its token is locked in place on the map. */
  locked: boolean
  onLock: (locked: boolean) => void
}): JSX.Element {
  const { rollCheck, rollDamage } = useSheetRoller(sessionId, c.name)
  const [amount, setAmount] = useState('')
  const [showBlock, setShowBlock] = useState(false)
  const attacks = useMemo(() => attacksFor(monster, vehicle, character), [monster, vehicle, character])
  const n = Number(amount)
  const hit = (kind: 'damage' | 'heal'): void => {
    onHp(n, kind)
    setAmount('')
  }
  const rollDice = (expr: string, label: string): void => {
    const parsed = diceGroups(expr)
    if (parsed) rollDamage(parsed.groups, parsed.modifier, label)
  }
  const kindLabel = c.kind === 'player' ? 'Party member' : c.kind === 'vehicle' ? `${c.party ? 'Party' : 'Enemy'} vehicle${vehicle ? ` · ${vehicle.def.size} ${vehicle.def.category.toLowerCase()}` : ''}` : `${monster?.size ?? ''} ${monster?.type ?? 'creature'}`.trim()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, lineHeight: 1.2 }}>{c.kind === 'vehicle' && vehicle ? vehicleName(vehicle) : c.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)' }}>{kindLabel}</span>
          <HideToggle hidden={!!c.hidden} onChange={onHidden} />
          <LockToggle locked={locked} onChange={onLock} />
        </div>
        {c.hidden && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Players can’t see it on the map or in the turn order.</div>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        <Stat value={`${c.currentHp}`} label={`HP / ${c.maxHp}`} />
        <Stat value={`${c.ac}`} label="AC" />
        <Stat value={c.initiative === null ? '–' : `${c.initiative}`} label="Init" />
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <input type="number" min={1} className="gb-input" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && hit('damage')} placeholder="0" aria-label="Amount" style={{ width: 60, padding: '4px 8px' }} />
        <button type="button" className="gb-btn gb-btn--secondary" style={{ ...btn, flex: 1, color: 'var(--danger)' }} disabled={!(n > 0)} onClick={() => hit('damage')} title={c.damageThreshold ? `Hits under ${c.damageThreshold} do nothing` : undefined}>
          Damage
        </button>
        <button type="button" className="gb-btn gb-btn--secondary" style={{ ...btn, flex: 1, color: 'var(--success)' }} disabled={!(n > 0)} onClick={() => hit('heal')}>
          {c.kind === 'vehicle' ? 'Repair' : 'Heal'}
        </button>
      </div>
      {c.deathSaves && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Death saves: {c.deathSaves.successes} successes, {c.deathSaves.failures} failures (track them in the Initiative tab)
        </div>
      )}

      <Block title={c.kind === 'vehicle' ? 'Weapons' : 'Attacks'}>
        {attacks.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>None to roll.</span>}
        {attacks.map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-raised)', border: '1px solid var(--border-subtle)' }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
              <strong>{a.name}</strong>
              {a.note && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>{a.note}</span>}
            </span>
            {a.bonus !== undefined && (
              <button type="button" style={pill} onClick={() => rollCheck(`${a.name} Attack`, a.bonus!, { critOn: a.critOn })} title="Roll the attack">
                {formatModifier(a.bonus)}
              </button>
            )}
            {a.damage && diceGroups(a.damage) && (
              <button type="button" style={pill} onClick={() => rollDice(a.damage!, `${a.name} Damage`)} title="Roll the damage">
                {a.damage}
              </button>
            )}
          </div>
        ))}
      </Block>

      <Block title="Conditions">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {c.statusEffects.map((s) => (
            <span key={s} className="gb-badge" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {s}
              <button type="button" onClick={() => onConditions(c.statusEffects.filter((x) => x !== s))} style={iconBtn} title={`Remove ${s}`}>
                <XIcon size={9} />
              </button>
            </span>
          ))}
          <select className="gb-input" value="" onChange={(e) => e.target.value && onConditions([...c.statusEffects, e.target.value])} style={{ fontSize: 12, padding: '2px 6px' }} aria-label="Add a condition">
            <option value="">+ Add…</option>
            {CONDITIONS.filter((x) => !c.statusEffects.includes(x)).map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
      </Block>

      {monster && (
        <div>
          <button type="button" className="gb-btn gb-btn--ghost" style={btn} onClick={() => setShowBlock((s) => !s)}>
            {showBlock ? 'Hide statblock' : 'Full statblock'}
          </button>
          {showBlock && <div className="gb-markdown" style={{ marginTop: 6 }} onClick={(e) => rollInlineDice(e, sessionId)} dangerouslySetInnerHTML={{ __html: renderStatblockHtml(monster, false) }} />}
        </div>
      )}
      {vehicle && <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Components, crew and fuel are in the Vehicles tab (right panel).</p>}
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }): JSX.Element {
  return (
    <div style={{ textAlign: 'center', padding: 6, borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-raised)', border: '1px solid var(--border-subtle)' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
    </div>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="gb-label" style={{ margin: 0 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

/** The last few rolls from the shared dice log. */
function RollLog(): JSX.Element {
  const [, bump] = useState(0)
  useEffect(() => subscribeDiceLog(() => bump((n) => n + 1)), [])
  const recent = getDiceLog().slice(-6).reverse()
  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '8px 12px', maxHeight: 150, overflowY: 'auto', flexShrink: 0 }}>
      <div className="gb-label" style={{ margin: '0 0 4px' }}>
        Rolls
      </div>
      {recent.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nothing rolled yet.</div>}
      {recent.map((r) => (
        <div key={r.id} style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 6 }}>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.rollerName}: {r.label ?? r.formula}
          </span>
          <strong>{r.total ?? '?'}</strong>
        </div>
      ))}
    </div>
  )
}

/** Grid size, the map image, and fog for the whole map. */
function MapSettings({ map, onChange, onClose }: { map: BattleMap; onChange: (m: BattleMap) => void; onClose: () => void }): JSX.Element {
  function upload(file: File): void {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      // Keep the image's shape: the columns stay, the rows follow its height.
      const img = new Image()
      img.onload = () => onChange({ ...map, image: url, rows: Math.max(4, Math.round((map.cols * img.height) / img.width)) })
      img.src = url
    }
    reader.readAsDataURL(file)
  }
  return (
    <div style={{ position: 'absolute', top: 56, left: '50%', transform: 'translateX(-50%)', zIndex: 6, width: 320, padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <strong style={{ flex: 1, fontSize: 13 }}>Map</strong>
        <button type="button" onClick={onClose} style={iconBtn} title="Close">
          <XIcon size={12} />
        </button>
      </div>
      <label style={labelCol}>
        Map image
        <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} style={{ fontSize: 12 }} />
      </label>
      {map.image && (
        <button type="button" className="gb-btn gb-btn--ghost" style={btn} onClick={() => onChange({ ...map, image: null })}>
          Remove the image (plain grid)
        </button>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        <label style={labelCol}>
          Squares across
          <input type="number" min={4} max={120} className="gb-input" value={map.cols} onChange={(e) => onChange({ ...map, cols: Math.max(4, Math.min(120, Number(e.target.value) || 4)) })} style={field} />
        </label>
        <label style={labelCol}>
          Squares down
          <input type="number" min={4} max={120} className="gb-input" value={map.rows} onChange={(e) => onChange({ ...map, rows: Math.max(4, Math.min(120, Number(e.target.value) || 4)) })} style={field} />
        </label>
        <label style={labelCol}>
          Feet each
          <input type="number" min={1} className="gb-input" value={map.feetPerCell} onChange={(e) => onChange({ ...map, feetPerCell: Math.max(1, Number(e.target.value) || 5) })} style={field} />
        </label>
      </div>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>With an image, set squares across to match the grid drawn on it; squares down follows the image’s shape.</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
        <span style={{ flex: 1, color: 'var(--text-secondary)' }} title="Where players' tokens appear when they join this battle — drag the P1, P2… squares on the map. Only you see them.">
          Party start spots: {map.partyStarts.length}
        </span>
        <button type="button" className="gs-chip" disabled={map.partyStarts.length === 0} onClick={() => onChange({ ...map, partyStarts: map.partyStarts.slice(0, -1) })} aria-label="One fewer start spot">
          −
        </button>
        <button
          type="button"
          className="gs-chip"
          onClick={() => {
            // The next free square down the left edge; drag it into place from there.
            for (let x = 0; x < map.cols; x++)
              for (let y = 0; y < map.rows; y++)
                if (!map.partyStarts.some((q) => q.x === x && q.y === y) && canStand(map, { x, y, size: 1 })) {
                  onChange({ ...map, partyStarts: [...map.partyStarts, { x, y }] })
                  return
                }
          }}
          aria-label="Another start spot"
        >
          +
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" className="gb-btn gb-btn--secondary" style={btn} onClick={() => onChange({ ...map, fog: [fogEverything(map)] })} title="Cover the whole map, then cut away what the party can see">
          Fog everything
        </button>
        <button type="button" className="gb-btn gb-btn--secondary" style={btn} onClick={() => onChange({ ...map, fog: [] })} disabled={map.fog.length === 0}>
          Clear fog
        </button>
        <button type="button" className="gb-btn gb-btn--secondary" style={btn} onClick={() => onChange({ ...map, templates: [] })} disabled={map.templates.length === 0}>
          Clear templates
        </button>
        <button type="button" className="gb-btn gb-btn--ghost" style={{ ...btn, color: 'var(--danger)' }} onClick={() => onChange({ ...emptyBattleMap(), tokens: map.tokens })}>
          Reset map
        </button>
      </div>
    </div>
  )
}

const btn = { fontSize: 12, padding: '4px 10px' } as const
const pill = { border: '1px solid var(--accent)', color: 'var(--accent-hover)', background: 'none', borderRadius: 999, padding: '1px 8px', fontSize: 12, cursor: 'pointer', font: 'inherit' } as const
const iconBtn = { background: 'none', border: 0, color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'inline-flex' } as const
const labelCol = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--text-muted)' } as const
const field = { fontSize: 12, padding: '3px 6px' } as const
const toolbar = {
  position: 'absolute',
  top: 12,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 5,
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  // In a narrow window the tools wrap onto a second line rather than running off the map.
  width: 'max-content',
  maxWidth: 'calc(100% - 24px)',
  gap: 2,
  padding: 4,
  borderRadius: 10,
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  boxShadow: '0 6px 20px rgba(0,0,0,0.45)'
} as const
const toolButton = (on: boolean): React.CSSProperties => ({
  whiteSpace: 'nowrap',
  border: 0,
  background: on ? 'var(--accent-subtle)' : 'none',
  color: on ? 'var(--accent-hover)' : 'var(--text-secondary)',
  padding: '5px 10px',
  borderRadius: 7,
  cursor: 'pointer',
  fontSize: 12,
  font: 'inherit'
})
