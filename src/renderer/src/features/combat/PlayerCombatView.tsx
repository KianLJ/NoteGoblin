// A player's Combat tab, while joined to a DM's session: the DM's battle map
// as players may see it (fog solid, hidden enemies left out by the DM's app),
// the turn order, and their own character's attacks to roll. They can drag
// their own token; the DM's app checks the move and sends the map back out.
import { useEffect, useMemo, useState } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import type { PlayerBattleMap, BattleMap } from '@shared/battleMap'
import { emptyCombatant, type Combatant, type InjuryLevel, type PlayerVisibleCombatant, type PlayerVisibleInitiativeState } from '@shared/encounter'
import { deriveSheet } from '@shared/content/sheet'
import { diceGroups } from '@shared/dice'
import { formatModifier } from '@shared/dnd5e'
import { useSheetRoller } from '../dice/useSheetRoller'
import { ResizableSidebar } from '../../ui/ResizableSidebar'
import { BattleMapView, type MapTool } from './BattleMapView'

interface Props {
  sessionId: string
  /** The character the player has open — their attacks to roll. */
  character: CharacterSheet | null
}

const INJURY_FRACTION: Record<InjuryLevel, number> = { undamaged: 1, moderate: 0.7, bloodied: 0.45, severe: 0.2, critical: 0.05 }
const INJURY_LABEL: Record<InjuryLevel, string> = { undamaged: 'Unhurt', moderate: 'Hurt', bloodied: 'Bloodied', severe: 'Badly hurt', critical: 'Barely standing' }

/** What the map needs of a combatant — real numbers when the player may know them, else a stand-in from how hurt it looks. */
function asCombatant(c: PlayerVisibleCombatant): Combatant {
  const known = c.currentHp !== null && c.maxHp !== null
  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    initiative: c.initiative,
    currentHp: known ? c.currentHp! : c.dead ? 0 : Math.round(INJURY_FRACTION[c.injury] * 100),
    maxHp: known ? c.maxHp! : 100,
    ac: 0,
    // Players only see the real numbers of the party's own vehicle, so that's how they know it's theirs.
    ...(c.kind === 'vehicle' ? { party: known } : {}),
    ...emptyCombatant(),
    statusEffects: c.statusEffects
  }
}

export function PlayerCombatView({ sessionId, character }: Props): JSX.Element {
  const [map, setMap] = useState<PlayerBattleMap | null>(null)
  const [initiative, setInitiative] = useState<PlayerVisibleInitiativeState | null>(null)
  const [image, setImage] = useState<{ imageId: string; image: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tool, setTool] = useState<MapTool>('move')
  const [hint, setHint] = useState('Drag your own token to move it. Scroll to zoom.')
  const [pending, setPending] = useState<Record<string, { x: number; y: number }>>({})

  // The map and turn order now, then every change as it happens.
  useEffect(() => {
    setLoading(true)
    void window.goblin.battleMap.fetch(sessionId).then((result) => {
      setLoading(false)
      if (!result.ok) return
      setMap(result.data.map)
      if (result.data.initiative) setInitiative(result.data.initiative)
      if (result.data.map?.imageId) void window.goblin.battleMap.fetchImage(sessionId)
    })
    const offMap = window.goblin.battleMap.onUpdate((u) => {
      if (u.sessionId === sessionId) {
        setMap(u.map)
        setPending({})
      }
    })
    const offImage = window.goblin.battleMap.onImage(setImage)
    const offInit = window.goblin.initiative.onUpdate((u) => {
      if (u.sessionId === sessionId) setInitiative(u.state)
    })
    return () => {
      offMap()
      offImage()
      offInit()
    }
  }, [sessionId])

  // A changed image that hasn't arrived (joined between the DM changing it and now): ask for it.
  useEffect(() => {
    if (map?.imageId && image?.imageId !== map.imageId) {
      const timer = setTimeout(() => void window.goblin.battleMap.fetchImage(sessionId), 1500)
      return () => clearTimeout(timer)
    }
  }, [map?.imageId, image?.imageId, sessionId])

  const combatants = useMemo(() => (initiative?.combatants ?? []).map(asCombatant), [initiative])
  const mine = useMemo(() => new Set((initiative?.combatants ?? []).filter((c) => c.isSelf).map((c) => c.id)), [initiative])
  const turnId = initiative && initiative.turnIndex >= 0 ? (initiative.combatants[initiative.turnIndex]?.id ?? null) : null
  const fullMap: BattleMap | null = map
    ? {
        cols: map.cols,
        rows: map.rows,
        feetPerCell: map.feetPerCell,
        image: image && image.imageId === map.imageId ? image.image : null,
        // A move just made shows straight away; the DM's app confirms it (or puts it back).
        tokens: Object.fromEntries(Object.entries(map.tokens).map(([id, t]) => [id, pending[id] ? { ...t, ...pending[id] } : t])),
        fog: map.fog,
        templates: map.templates,
        placements: {},
        partyStarts: []
      }
    : null

  async function move(combatantId: string, x: number, y: number): Promise<void> {
    setPending((p) => ({ ...p, [combatantId]: { x, y } }))
    const result = await window.goblin.battleMap.moveToken(sessionId, combatantId, x, y)
    if (!result.ok) {
      setPending((p) => {
        const next = { ...p }
        delete next[combatantId]
        return next
      })
      setHint(result.error)
    }
  }

  const selected = initiative?.combatants.find((c) => c.id === selectedId) ?? null

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 var(--space-4)', borderBottom: '1px solid var(--border-subtle)' }}>
        <strong style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>Combat</strong>
        {initiative && initiative.turnIndex >= 0 && <span className="gb-badge gb-badge--accent">Round {initiative.round}</span>}
        {turnId && mine.has(turnId) && <span className="gb-badge" style={{ color: 'var(--accent-hover)' }}>Your turn</span>}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <ResizableSidebar defaultWidth={230} minWidth={170} maxWidth={400} handleSide="right" collapseStorageKey="gb-sidebar-collapsed:player-combat-order" widthStorageKey="gb-sidebar-width:player-combat-order">
          <aside style={{ height: '100%', borderRight: '1px solid var(--border-subtle)', background: 'var(--bg-sunken)', overflowY: 'auto', padding: 'var(--space-2)' }}>
            <div className="gb-label" style={{ padding: '6px 6px 4px' }}>
              Initiative
            </div>
            {(initiative?.combatants ?? []).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 8px',
                  marginBottom: 4,
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${c.id === turnId ? 'var(--accent)' : c.id === selectedId ? 'var(--border-strong)' : 'transparent'}`,
                  background: c.id === turnId ? 'var(--accent-subtle)' : 'transparent',
                  color: 'inherit',
                  font: 'inherit',
                  cursor: 'pointer'
                }}
              >
                <strong style={{ fontSize: 13 }}>
                  {c.name}
                  {c.isSelf && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> (you)</span>}
                </strong>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>
                  {c.dead ? (c.kind === 'vehicle' ? 'Wrecked' : 'Down') : c.currentHp !== null ? `${c.currentHp}/${c.maxHp} HP` : INJURY_LABEL[c.injury]}
                  {c.statusEffects.length ? ` · ${c.statusEffects.join(', ')}` : ''}
                </span>
              </button>
            ))}
            {!initiative?.combatants.length && <p style={{ margin: 6, fontSize: 12, color: 'var(--text-muted)' }}>No fight yet.</p>}
          </aside>
        </ResizableSidebar>

        <section style={{ position: 'relative', flex: 1, minWidth: 0, overflow: 'hidden', background: '#0b0907' }}>
          {fullMap ? (
            <>
              <BattleMapView
                map={fullMap}
                onChange={() => {}}
                combatants={combatants.filter((c) => fullMap.tokens[c.id])}
                turnId={turnId}
                selectedId={selectedId}
                onSelect={setSelectedId}
                tool={tool}
                fogTool={{ op: 'add', draw: 'rect', width: 1 }}
                snap
                onHint={setHint}
                viewer={{ canDrag: (id) => mine.has(id), onMoveToken: (id, x, y) => void move(id, x, y) }}
              />
              <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 5, display: 'flex', gap: 2, padding: 4, borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                {(['move', 'ruler'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setTool(t)
                      setHint(t === 'move' ? 'Drag your own token to move it. Scroll to zoom.' : 'Drag between squares to measure.')
                    }}
                    style={{ border: 0, borderRadius: 7, padding: '5px 10px', cursor: 'pointer', fontSize: 12, font: 'inherit', background: tool === t ? 'var(--accent-subtle)' : 'none', color: tool === t ? 'var(--accent-hover)' : 'var(--text-secondary)' }}
                  >
                    {t === 'move' ? 'Move' : 'Ruler'}
                  </button>
                ))}
              </div>
              <div style={{ position: 'absolute', left: 12, bottom: 12, fontSize: 12, color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: 8, pointerEvents: 'none' }}>{hint}</div>
            </>
          ) : (
            <p style={{ margin: 'var(--space-5)', color: 'var(--text-muted)', fontSize: 13 }}>{loading ? 'Getting the map…' : 'The DM hasn’t put a map up yet.'}</p>
          )}
        </section>

        <ResizableSidebar defaultWidth={280} minWidth={210} maxWidth={460} handleSide="left" collapseStorageKey="gb-sidebar-collapsed:player-combat-detail" widthStorageKey="gb-sidebar-width:player-combat-detail">
          <aside style={{ height: '100%', borderLeft: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', overflowY: 'auto', padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {selected && (
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{selected.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {selected.dead ? 'Down' : selected.currentHp !== null ? `${selected.currentHp}/${selected.maxHp} HP` : INJURY_LABEL[selected.injury]}
                  {selected.statusEffects.length ? ` · ${selected.statusEffects.join(', ')}` : ''}
                </div>
              </div>
            )}
            {character ? <MyAttacks character={character} sessionId={sessionId} /> : <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Open your character to roll their attacks here.</p>}
          </aside>
        </ResizableSidebar>
      </div>
    </div>
  )
}

/** The player's own attacks, rolled through the dice roller (and shown to the table) like the sheet's. */
function MyAttacks({ character, sessionId }: { character: CharacterSheet; sessionId: string }): JSX.Element {
  const { rollCheck, rollDamage } = useSheetRoller(sessionId, character.name)
  const { derived } = useMemo(() => deriveSheet(character), [character])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="gb-label" style={{ margin: 0 }}>
        {character.name || 'Your'} attacks
      </div>
      {derived.attacks.map((a) => {
        const dice = diceGroups(a.damage)
        return (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-raised)', border: '1px solid var(--border-subtle)' }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
              <strong>{a.name}</strong>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>{a.damageType}</span>
            </span>
            <button type="button" style={pill} onClick={() => rollCheck(`${a.name} Attack`, a.attackBonus, { advantage: a.mode ?? 'normal', critOn: a.kind === 'weapon' || a.kind === 'unarmed' ? derived.critThreshold : 20 })}>
              {formatModifier(a.attackBonus)}
            </button>
            {dice && (
              <button type="button" style={pill} onClick={() => rollDamage(dice.groups, dice.modifier, `${a.name} Damage`)}>
                {a.damage}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

const pill = { border: '1px solid var(--accent)', color: 'var(--accent-hover)', background: 'none', borderRadius: 999, padding: '1px 8px', fontSize: 12, cursor: 'pointer', font: 'inherit' } as const
