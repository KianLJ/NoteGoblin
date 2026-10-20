// The Combat tab (top-left switch, next to the Homebrew Workshop): the
// initiative order, a battle map with a token per combatant, and the
// selected combatant's numbers and attacks to roll. It edits the same
// encounter as the right panel's initiative tracker (encounterStore.ts).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import { nextTurnState, previousTurnState, sortedByInitiative, withCombatantHp, type Combatant } from '@shared/encounter'
import { activeBattle, canStand, fogEverything, hiddenCombatantIds, isFogged, isTestUser, newBattle, type Ambient, type BattleMap, type MapImage, type Pt, type TemplateKind } from '@shared/battleMap'
import { lightsOf, LIGHT_PRESETS, viewerKey, viewerSources, visionActive } from '@shared/vision'
import { buildCheckRollEntry, diceGroups } from '@shared/dice'
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
import { initiativeModifierFor, monsterToCombatant } from '../campaigns/InitiativeTracker'
import { playSfx } from '../audio/soundEffects'
import { CharacterTabs, HpControls, InitiativeField, MonsterAbilities, Stat, hpChange } from './CombatPanels'
import { ConfirmButton } from '../../ui/ConfirmButton'
import { ResizableSidebar } from '../../ui/ResizableSidebar'
import { BattleMapView, EyeIcon, HideToggle, LockToggle, type FogTool, type MapTool, type Sight, type WallDraw } from './BattleMapView'
import { MapControls, RAIL, ToolOptions, ToolRail, railKey, type RailTool } from './MapToolbar'
import { TestPlayersMenu } from './TestPlayersMenu'
import { useRemoteDrags } from './useRemoteDrags'

interface CombatViewProps {
  /** The session the DM is hosting — rolls and turn cues go to the table. */
  sessionId: string | null
  campaignId: string | null
  playerCharacters: Map<string, CharacterSheet>
}

const CONDITIONS = ['Blinded', 'Charmed', 'Concentrating', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious']

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
  const [hint, setHint] = useState(RAIL[0].hint)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [fogTool, setFogTool] = useState<FogTool>({ op: 'add', draw: 'rect', width: 1 })
  const [wallDraw, setWallDraw] = useState<WallDraw>('room')
  // The spell area the Spell areas tool places (the last one picked).
  const [shapeKind, setShapeKind] = useState<TemplateKind>('cone')
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const centreRef = useRef<(() => Pt) | null>(null)
  // Playing the map as a player would: '' is the DM's own view, 'party' the whole party, else a player's (or test player's) userId.
  const [playAs, setPlayAs] = useState('')
  // Players dragging their tokens right now, shown as they move.
  const remoteDrags = useRemoteDrags(null)
  const [snap, setSnapState] = useState(loadSnap)
  const setSnap = (on: boolean): void => {
    setSnapState(on)
    try {
      localStorage.setItem(SNAP_KEY, on ? '1' : '0')
    } catch {
      /* best-effort */
    }
  }

  function pickTool(r: RailTool): void {
    setTool(r === 'shapes' ? shapeKind : r)
    setHint(RAIL.find((x) => x.tool === r)!.hint)
  }

  // A tool's key picks it (V, R, S, F, W, L, I) — the player's tools only, while playing as one.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const r = railKey(e, !!playAs)
      if (r) pickTool(r)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /** Map images go in the middle of the view, 20 squares across (drag the corner, or set pixels per square, to fit the grid). */
  function addImages(files: File[]): void {
    const centre = centreRef.current?.() ?? { x: 0, y: 0 }
    files.forEach((file, n) => {
      const reader = new FileReader()
      reader.onload = () => {
        const src = String(reader.result)
        const img = new Image()
        img.onload = () => {
          const w = 20
          const h = Math.max(1, Math.round((w * img.height) / img.width))
          const added: MapImage = { id: crypto.randomUUID(), src, x: Math.round(centre.x - w / 2) + n, y: Math.round(centre.y - h / 2) + n, w, h, naturalW: img.width, naturalH: img.height }
          setMap((m) => ({ ...m, images: [...m.images, added] }))
          setSelectedImage(added.id)
          setHint('Image added. Drag it to line it up with the grid, and drag its corner (or set its pixels per square) to size it.')
        }
        img.src = src
      }
      reader.readAsDataURL(file)
    })
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

  // Playing as a player (or the party): they see what their party sees (on a map with walls or darkness), and move only their own tokens, as on their screen.
  const vision = visionActive(map)
  const players = encounter.combatants.filter((c) => c.kind === 'player' && c.userId)
  const sight: Sight | null = useMemo(() => {
    if (!playAs || !vision) return null
    const userId = playAs === 'party' ? null : playAs
    const skip = new Set(hiddenCombatantIds(encounter.combatants))
    return { sources: viewerSources(map, encounter.combatants, userId), explored: map.explored[userId ? viewerKey(map, userId) : 'party'] ?? null, lights: lightsOf(map, skip) }
  }, [playAs, vision, map, encounter.combatants])
  // Hidden and fogged enemies are left off; what's in sight is worked out by the map, live as tokens are dragged.
  const shownCombatants = useMemo(() => {
    if (!playAs) return encounter.combatants
    return encounter.combatants.filter((c) => {
      const t = map.tokens[c.id]
      if (c.kind === 'player' || (c.kind === 'vehicle' && c.party)) return true
      return t && !c.hidden && !isFogged(map, { x: t.x + t.size / 2, y: t.y + t.size / 2 })
    })
  }, [playAs, map, encounter.combatants])
  useEffect(() => {
    if (playAs && playAs !== 'party' && !players.some((c) => c.userId === playAs)) setPlayAs('')
  }, [playAs, players])
  // Playing as someone, only their tools are left.
  useEffect(() => {
    if (playAs && tool !== 'move' && tool !== 'ruler') setTool('move')
  }, [playAs, tool])
  const playingName = playAs === 'party' ? 'the party' : players.find((c) => c.userId === playAs)?.name
  const mineToMove = (id: string): boolean => {
    const c = encounter.combatants.find((x) => x.id === id)
    return !!c && c.kind === 'player' && (playAs === 'party' || c.userId === playAs)
  }
  /** A move made playing as someone, checked as the host checks a real player's (walls are checked by the map). */
  function playMove(id: string, x: number, y: number): void {
    const t = map.tokens[id]
    if (!t) return
    const moved = { ...t, x, y }
    if (!canStand(map, moved, id)) setHint('Something’s already standing there.')
    else if (isFogged(map, { x: x + t.size / 2, y: y + t.size / 2 })) setHint('You can’t see that far (it’s under fog).')
    else setMap({ ...map, tokens: { ...map.tokens, [id]: moved } })
  }

  function setInitiative(c: Combatant, initiative: number | null): void {
    setEncounter((s) => ({ ...s, combatants: s.combatants.map((x) => (x.id === c.id ? { ...x, initiative } : x)) }))
  }
  /** Rolled quietly (an enemy's roll stays the DM's), as the initiative tracker does. */
  function rollInitiative(c: Combatant): void {
    const modifier = initiativeModifierFor(c, playerCharacters, monsters, vehicles.doc.vehicles)
    setInitiative(c, buildCheckRollEntry(c.id, c.name, modifier, 'normal', true, 'Initiative').total)
    playSfx('diceRoll')
  }
  function rollAllInitiative(): void {
    setEncounter((s) => ({
      ...s,
      combatants: s.combatants.map((c) => ({ ...c, initiative: buildCheckRollEntry(c.id, c.name, initiativeModifierFor(c, playerCharacters, monsters, vehicles.doc.vehicles), 'normal', true, 'Initiative').total }))
    }))
    playSfx('diceRoll')
  }

  function step(dir: 1 | -1): void {
    const next = dir === 1 ? nextTurnState(encounter) : previousTurnState(encounter)
    setEncounter(next)
    if (dir === 1) playTurnFlowSfx(encounter.turnIndex < 0 ? 'Initiative Start' : 'Turn Change', sessionId)
    const id = sortedByInitiative(next.combatants)[next.turnIndex]?.id
    if (id) setSelectedId(id)
  }

  /**
   * Damage or healing — a vehicle ignores a hit under its threshold, can't be
   * repaired past full, and its hull follows. A player's comes off their
   * temporary hit points first, and their sheet follows (useCombatSheetSync).
   */
  function changeHp(c: Combatant, amount: number, kind: 'damage' | 'heal' | 'temp'): void {
    if (!(amount > 0)) return
    const character = characterOf(c)
    if (character && c.userId) {
      const next = hpChange(c.currentHp, character.tempHp ?? 0, c.maxHp, amount, kind)
      if (next.tempHp !== (character.tempHp ?? 0)) void window.goblin.characters.setPlayerHp(c.userId, { tempHp: next.tempHp })
      if (next.currentHp !== c.currentHp) setEncounter((s) => withCombatantHp(s, c.id, next.currentHp))
      return
    }
    if (kind === 'temp') return
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
        <TestPlayersMenu />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }} title="Use the map as a player would: see only what they see, and move only their token (walls, doors and fog stop it)">
          Play as
          <select
            className="gb-input"
            value={playAs}
            onChange={(e) => {
              setPlayAs(e.target.value)
              setHint(e.target.value ? 'Drag your token to move it — walls, closed doors and fog stop it. Scroll to zoom.' : RAIL[0].hint)
            }}
            style={{ fontSize: 12, padding: '2px 6px', maxWidth: 170 }}
          >
            <option value="">DM (everything)</option>
            {players.length > 0 && <option value="party">The whole party</option>}
            {players.map((c) => (
              <option key={c.id} value={c.userId}>
                {c.name}
                {isTestUser(c.userId) ? ' (test)' : ''}
              </option>
            ))}
          </select>
        </label>
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
          <div style={{ display: 'flex', alignItems: 'center', padding: '6px 6px 4px' }}>
            <span className="gb-label" style={{ margin: 0, flex: 1 }}>
              Initiative
            </span>
            {encounter.combatants.length > 0 && (
              <button type="button" onClick={rollAllInitiative} title="Roll initiative for everyone (enemies' rolls stay yours)" style={{ ...pill, fontSize: 11 }}>
                Roll all
              </button>
            )}
          </div>
          {ordered.map((c) => (
            <OrderRow key={c.id} c={c} turn={c.id === turnId} selected={c.id === selectedId} onClick={() => setSelectedId(c.id)} />
          ))}
        </aside>
        </ResizableSidebar>

        <section style={{ position: 'relative', flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', background: '#0b0907' }}>
          <BattleMapView
            map={map}
            onChange={(m) => setMap(m)}
            combatants={shownCombatants}
            turnId={turnId}
            selectedId={selectedId}
            onSelect={setSelectedId}
            tool={tool}
            fogTool={fogTool}
            wallDraw={wallDraw}
            snap={snap}
            onHint={setHint}
            sight={sight}
            viewer={playAs ? { canDrag: mineToMove, onMoveToken: playMove } : undefined}
            centreRef={centreRef}
            selectedImage={selectedImage}
            onSelectImage={setSelectedImage}
            remoteDrags={remoteDrags}
            onLiveDrag={sessionId ? (id, x, y) => void window.goblin.battleMap.drag(id, x, y) : undefined}
          />
          <ToolRail tool={tool} onTool={pickTool} playerOnly={!!playAs} />
          {!playAs && (
            <ToolOptions
              tool={tool}
              onShape={(k) => {
                setShapeKind(k)
                setTool(k)
              }}
              fogTool={fogTool}
              onFogTool={setFogTool}
              wallDraw={wallDraw}
              onWallDraw={setWallDraw}
              onAddImages={addImages}
              onHint={setHint}
            />
          )}
          <MapControls
            canUndo={canUndoBattleMap()}
            canRedo={canRedoBattleMap()}
            onUndo={() => undoBattleMap() && setHint('Undone. Ctrl+Y redoes it.')}
            onRedo={() => redoBattleMap() && setHint('Redone.')}
            snap={snap}
            onSnap={() => setSnap(!snap)}
            settingsOpen={settingsOpen}
            onSettings={() => setSettingsOpen((o) => !o)}
          />
          {playAs && (
            <div style={{ position: 'absolute', top: 12, left: 64, right: 190, zIndex: 5, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px 6px 14px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--accent)', boxShadow: '0 6px 20px rgba(0,0,0,0.45)', fontSize: 12, color: 'var(--text-primary)' }}>
                <span>Playing as {playingName}: you see and move as they would.</span>
                <button type="button" className="gb-btn gb-btn--secondary" style={{ fontSize: 12, padding: '2px 10px', whiteSpace: 'nowrap' }} onClick={() => setPlayAs('')}>
                  Back to DM
                </button>
              </div>
            </div>
          )}
          {settingsOpen && <MapSettings map={map} onChange={setMap} onClose={() => setSettingsOpen(false)} />}
          <div style={{ position: 'absolute', left: 12, bottom: 12, maxWidth: 'calc(100% - 80px)', fontSize: 12, color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: 8, pointerEvents: 'none' }}>{hint}</div>
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
                onInitiative={(v) => setInitiative(selected, v)}
                onRollInitiative={() => rollInitiative(selected)}
                light={map.tokens[selected.id]?.light}
                onLight={(light) => {
                  const t = map.tokens[selected.id]
                  if (t) setMap({ ...map, tokens: { ...map.tokens, [selected.id]: { ...t, light } } })
                }}
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
  onInitiative,
  onRollInitiative,
  light,
  onLight,
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
  onHp: (amount: number, kind: 'damage' | 'heal' | 'temp') => void
  onInitiative: (v: number | null) => void
  onRollInitiative: () => void
  /** The light its token carries, if any. */
  light?: { bright: number; dim: number }
  onLight: (light: { bright: number; dim: number } | undefined) => void
  onConditions: (list: string[]) => void
  onHidden: (hidden: boolean) => void
  /** Its token is locked in place on the map. */
  locked: boolean
  onLock: (locked: boolean) => void
}): JSX.Element {
  const { rollCheck, rollDamage } = useSheetRoller(sessionId, c.name)
  const [showBlock, setShowBlock] = useState(false)
  const attacks = useMemo(() => attacksFor(monster, vehicle, character), [monster, vehicle, character])
  const lightName = light ? (LIGHT_PRESETS.find((pr) => pr.bright === light.bright && pr.dim === light.dim)?.name ?? 'custom') : ''
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
        <Stat value={`${c.currentHp}${character?.tempHp ? ` +${character.tempHp}` : ''}`} label={`HP / ${c.maxHp}`} />
        <Stat value={`${c.ac}`} label="AC" />
        <InitiativeField value={c.initiative} onChange={onInitiative} onRoll={onRollInitiative} rollTitle={c.kind === 'player' ? 'Roll for them (players can roll their own in their Combat tab)' : 'Roll it quietly — players never see an enemy’s roll'} />
      </div>
      <HpControls onHp={onHp} repair={c.kind === 'vehicle'} temp={!!character} />
      {c.damageThreshold ? <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hits under {c.damageThreshold} do nothing.</div> : null}
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }} title="A light it carries lights the dark around it, for everyone who can see it">
        Carries a light
        <select
          className="gb-input"
          value={lightName}
          onChange={(e) => {
            const pr = LIGHT_PRESETS.find((x) => x.name === e.target.value)
            onLight(pr ? { bright: pr.bright, dim: pr.dim } : undefined)
          }}
          style={{ fontSize: 12, padding: '2px 6px' }}
        >
          <option value="">None</option>
          {LIGHT_PRESETS.map((pr) => (
            <option key={pr.name} value={pr.name}>
              {pr.name} ({pr.bright}/{pr.dim} ft)
            </option>
          ))}
          {lightName === 'custom' && <option value="custom">{`${light!.bright}/${light!.dim} ft`}</option>}
        </select>
      </label>
      {c.deathSaves && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Death saves: {c.deathSaves.successes} successes, {c.deathSaves.failures} failures (track them in the Initiative tab)
        </div>
      )}

      {!character && (
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
      )}

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

      {character && <CharacterTabs character={character} sessionId={sessionId} />}
      {monster && <MonsterAbilities monster={monster} sessionId={sessionId} />}
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

/** Feet per square, lighting and sight, party start spots, and clearing things off the whole map. */
function MapSettings({ map, onChange, onClose }: { map: BattleMap; onChange: (m: BattleMap) => void; onClose: () => void }): JSX.Element {
  return (
    <div style={{ position: 'absolute', top: 60, right: 12, zIndex: 6, width: 320, maxHeight: 'calc(100% - 120px)', overflowY: 'auto', padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <strong style={{ flex: 1, fontSize: 13 }}>Map</strong>
        <button type="button" onClick={onClose} style={iconBtn} title="Close">
          <XIcon size={12} />
        </button>
      </div>
      <label style={{ ...labelCol, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        Feet per square
        <input type="number" min={1} className="gb-input" value={map.feetPerCell} onChange={(e) => onChange({ ...map, feetPerCell: Math.max(1, Number(e.target.value) || 5) })} style={{ ...field, width: 64 }} />
      </label>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>The grid goes on for ever. Add map images with the Map images tool on the left, then line them up with the grid.</p>
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
            // The next free square down the starting area's left edge; drag it into place from there.
            for (let x = 0; x < 200; x++)
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={labelCol}>Lighting</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['bright', 'dim', 'dark'] as Ambient[]).map((a) => (
            <button key={a} type="button" style={{ ...toolButton(map.ambient === a), border: '1px solid var(--border-subtle)' }} onClick={() => onChange({ ...map, ambient: a })} title={AMBIENT_HINT[a]}>
              {a === 'bright' ? 'Bright' : a === 'dim' ? 'Dim' : 'Dark'}
            </button>
          ))}
        </div>
        <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
          {AMBIENT_HINT[map.ambient]} Once a map has walls or is dark, players only see what their party has line of sight to (darkvision comes from their sheets).
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={map.sharedVision !== false} onChange={(e) => onChange({ ...map, sharedVision: e.target.checked ? undefined : false })} />
          Players share what the party sees
        </label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className="gb-btn gb-btn--secondary" style={btn} onClick={() => onChange({ ...map, explored: {} })} disabled={Object.keys(map.explored).length === 0} title="Players' maps go dark again everywhere they can't see right now">
            Forget explored
          </button>
          <button type="button" className="gb-btn gb-btn--secondary" style={btn} onClick={() => onChange({ ...map, walls: map.walls.filter((w) => w.locked) })} disabled={!map.walls.some((w) => !w.locked)}>
            Remove walls
          </button>
          <button type="button" className="gb-btn gb-btn--secondary" style={btn} onClick={() => onChange({ ...map, lights: map.lights.filter((l) => l.locked) })} disabled={!map.lights.some((l) => !l.locked)}>
            Remove lights
          </button>
        </div>
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
        <button type="button" className="gb-btn gb-btn--secondary" style={btn} onClick={() => onChange({ ...map, images: map.images.filter((i) => i.locked) })} disabled={!map.images.some((i) => !i.locked)}>
          Remove images
        </button>
      </div>
    </div>
  )
}

const AMBIENT_HINT: Record<Ambient, string> = {
  bright: 'Daylight: everything in sight is seen.',
  dim: 'Twilight or a dim room: everything in sight is seen, dimly.',
  dark: 'Night or a dungeon: only lit places, and what darkvision reaches, are seen.'
}

const btn = { fontSize: 12, padding: '4px 10px' } as const
const pill = { border: '1px solid var(--accent)', color: 'var(--accent-hover)', background: 'none', borderRadius: 999, padding: '1px 8px', fontSize: 12, cursor: 'pointer', font: 'inherit' } as const
const iconBtn = { background: 'none', border: 0, color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'inline-flex' } as const
const labelCol = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--text-muted)' } as const
const field = { fontSize: 12, padding: '3px 6px' } as const
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
