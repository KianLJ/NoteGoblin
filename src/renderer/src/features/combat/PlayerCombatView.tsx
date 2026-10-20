// A player's Combat tab, while joined to a DM's session: the DM's battle map
// as players may see it (fog solid, hidden enemies and anything out of the
// party's sight left out by the DM's app, darkness drawn beyond what they
// can see), the turn order, and their own character: hit points, initiative,
// actions and spells, all kept on their sheet. A fellow player's numbers,
// actions and spells can be looked at too. They can drag their own token
// (not through walls); the DM's app checks the move and sends the map back out.
import { useEffect, useMemo, useState } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import type { CharacterSheetData } from '@shared/dnd5e'
import type { PlayerBattleMap, BattleMap } from '@shared/battleMap'
import { emptyCombatant, type Combatant, type InjuryLevel, type PlayerVisibleCombatant, type PlayerVisibleInitiativeState } from '@shared/encounter'
import { deriveSheet } from '@shared/content/sheet'
import { useSheetRoller } from '../dice/useSheetRoller'
import { ResizableSidebar } from '../../ui/ResizableSidebar'
import { BattleMapView, type MapTool, type Sight } from './BattleMapView'
import { RAIL, ToolRail, railKey } from './MapToolbar'
import { useRemoteDrags } from './useRemoteDrags'
import { CharacterTabs, HpControls, InitiativeField, PanelBlock, Stat, hpChange } from './CombatPanels'

interface Props {
  sessionId: string
  /** The character the player has open — theirs to play from here. */
  character: CharacterSheet | null
  /** Saves a change to that character (hit points, spent uses and slots). */
  onSaveCharacter: (patch: Partial<CharacterSheetData>) => void
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
    ac: c.ac ?? 0,
    // Players only see the real numbers of the party's own vehicle, so that's how they know it's theirs.
    ...(c.kind === 'vehicle' ? { party: known } : {}),
    ...emptyCombatant(),
    statusEffects: c.statusEffects
  }
}

/** The map as the player was sent it, in the shape the map view draws (an image shows once its picture has arrived). */
function toBattleMap(map: PlayerBattleMap, pictures: Record<string, string>, pending: Record<string, { x: number; y: number }>): BattleMap {
  return {
    cols: map.cols,
    rows: map.rows,
    feetPerCell: map.feetPerCell,
    images: (map.images ?? []).filter((i) => pictures[i.imageId]).map((i) => ({ id: i.id, src: pictures[i.imageId], x: i.x, y: i.y, w: i.w, h: i.h })),
    // A move just made shows straight away; the DM's app confirms it (or puts it back).
    tokens: Object.fromEntries(Object.entries(map.tokens).map(([id, t]) => [id, pending[id] ? { ...t, ...pending[id] } : t])),
    fog: map.fog,
    templates: map.templates,
    placements: {},
    partyStarts: [],
    walls: map.walls ?? [],
    lights: (map.lights ?? []).map((l, i) => ({ id: `light-${i}`, ...l })),
    ambient: map.ambient ?? 'bright',
    explored: {}
  }
}

export function PlayerCombatView({ sessionId, character, onSaveCharacter }: Props): JSX.Element {
  const [map, setMap] = useState<PlayerBattleMap | null>(null)
  const [initiative, setInitiative] = useState<PlayerVisibleInitiativeState | null>(null)
  // Map pictures received so far, by fingerprint.
  const [pictures, setPictures] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tool, setTool] = useState<MapTool>('move')
  const [hint, setHint] = useState('Drag your own token to move it. Scroll to zoom.')
  const [pending, setPending] = useState<Record<string, { x: number; y: number }>>({})
  // The DM and the rest of the party dragging tokens right now.
  const remoteDrags = useRemoteDrags(sessionId)

  // The map and turn order now, then every change as it happens.
  useEffect(() => {
    setLoading(true)
    void window.goblin.battleMap.fetch(sessionId).then((result) => {
      setLoading(false)
      if (!result.ok) return
      setMap(result.data.map)
      if (result.data.initiative) setInitiative(result.data.initiative)
      if (result.data.map?.images?.length) void window.goblin.battleMap.fetchImage(sessionId)
    })
    const offMap = window.goblin.battleMap.onUpdate((u) => {
      if (u.sessionId === sessionId) {
        setMap(u.map)
        setPending({})
      }
    })
    const offImage = window.goblin.battleMap.onImage(({ imageId, image }) => setPictures((p) => ({ ...p, [imageId]: image })))
    const offInit = window.goblin.initiative.onUpdate((u) => {
      if (u.sessionId === sessionId) setInitiative(u.state)
    })
    return () => {
      offMap()
      offImage()
      offInit()
    }
  }, [sessionId])

  // An image that hasn't arrived (joined between the DM adding it and now): ask for it.
  const missing = (map?.images ?? []).filter((i) => !pictures[i.imageId]).map((i) => i.imageId)
  const missingKey = missing.join(',')
  useEffect(() => {
    if (!missing.length) return
    const timer = setTimeout(() => missing.forEach((id) => void window.goblin.battleMap.fetchImage(sessionId, id)), 1500)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey, sessionId])

  const combatants = useMemo(() => (initiative?.combatants ?? []).map(asCombatant), [initiative])
  const mine = useMemo(() => new Set((initiative?.combatants ?? []).filter((c) => c.isSelf).map((c) => c.id)), [initiative])
  const selfId = (initiative?.combatants ?? []).find((c) => c.isSelf)?.id ?? null
  const turnId = initiative && initiative.turnIndex >= 0 ? (initiative.combatants[initiative.turnIndex]?.id ?? null) : null
  const fullMap = useMemo(() => (map ? toBattleMap(map, pictures, pending) : null), [map, pictures, pending])
  const sight: Sight | null = useMemo(() => (map?.vision ? { sources: map.vision.sources, explored: map.vision.explored, lights: map.lights ?? [] } : null), [map])

  // Your own character is what's shown until you pick something else.
  useEffect(() => {
    if (!selectedId && selfId) setSelectedId(selfId)
  }, [selectedId, selfId])

  // V moves, R measures.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = railKey(e, true)
      if (t === 'move' || t === 'ruler') setTool(t)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
                  display: 'grid',
                  gridTemplateColumns: '28px 1fr',
                  gap: 8,
                  alignItems: 'center',
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 8px',
                  marginBottom: 4,
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${c.id === turnId ? 'var(--accent)' : c.id === selectedId ? 'var(--border-strong)' : 'transparent'}`,
                  background: c.id === turnId ? 'var(--accent-subtle)' : c.id === selectedId ? 'var(--bg-surface)' : 'transparent',
                  color: 'inherit',
                  font: 'inherit',
                  cursor: 'pointer'
                }}
              >
                <span style={{ fontWeight: 700, textAlign: 'center', color: 'var(--text-secondary)' }}>{c.initiative ?? '–'}</span>
                <span style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: 13 }}>
                    {c.name}
                    {c.isSelf && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> (you)</span>}
                  </strong>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>
                    {c.dead ? (c.kind === 'vehicle' ? 'Wrecked' : 'Down') : c.currentHp !== null ? `${c.currentHp}/${c.maxHp} HP` : INJURY_LABEL[c.injury]}
                    {c.statusEffects.length ? ` · ${c.statusEffects.join(', ')}` : ''}
                  </span>
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
                remoteDrags={remoteDrags}
                onLiveDrag={(id, x, y) => void window.goblin.battleMap.dragToken(sessionId, id, x, y)}
                sight={sight}
              />
              <ToolRail
                tool={tool}
                playerOnly
                onTool={(t) => {
                  if (t !== 'move' && t !== 'ruler') return
                  setTool(t)
                  setHint(RAIL.find((r) => r.tool === t)!.hint)
                }}
              />
              <div style={{ position: 'absolute', left: 12, bottom: 12, maxWidth: 'calc(100% - 80px)', fontSize: 12, color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: 8, pointerEvents: 'none' }}>{hint}</div>
            </>
          ) : (
            <p style={{ margin: 'var(--space-5)', color: 'var(--text-muted)', fontSize: 13 }}>{loading ? 'Getting the map…' : 'The DM hasn’t put a map up yet.'}</p>
          )}
        </section>

        <ResizableSidebar defaultWidth={340} minWidth={240} maxWidth={560} handleSide="left" collapseStorageKey="gb-sidebar-collapsed:player-combat-detail" widthStorageKey="gb-sidebar-width:player-combat-detail">
          <aside style={{ height: '100%', borderLeft: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', overflowY: 'auto', padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {selected?.isSelf || (!selected && character) ? (
              character ? (
                <MyCharacter character={character} sessionId={sessionId} combatant={selected} onSave={onSaveCharacter} />
              ) : (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Open your character to play them from here.</p>
              )
            ) : selected?.userId ? (
              <FellowPlayer key={selected.userId} c={selected} sessionId={sessionId} />
            ) : selected ? (
              <OtherCombatant c={selected} />
            ) : (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Open your character to play them from here, or click someone on the map.</p>
            )}
          </aside>
        </ResizableSidebar>
      </div>
    </div>
  )
}

function Heading({ name, sub }: { name: string; sub: string }): JSX.Element {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, lineHeight: 1.2 }}>{name}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub}</div>
    </div>
  )
}

function Conditions({ list }: { list: string[] }): JSX.Element | null {
  if (!list.length) return null
  return (
    <PanelBlock title="Conditions">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {list.map((s) => (
          <span key={s} className="gb-badge" style={{ fontSize: 11 }}>
            {s}
          </span>
        ))}
      </div>
    </PanelBlock>
  )
}

/** The player's own character: hit points and initiative to change, then their actions and spells — everything saved to their sheet. */
function MyCharacter({ character, sessionId, combatant, onSave }: { character: CharacterSheet; sessionId: string; combatant: PlayerVisibleCombatant | null; onSave: (patch: Partial<CharacterSheetData>) => void }): JSX.Element {
  const { derived } = useMemo(() => deriveSheet(character), [character])
  const { rollDamage } = useSheetRoller(sessionId, character.name)
  const [init, setInit] = useState<number | null>(combatant?.initiative ?? null)
  // The DM's turn order has the final word; it comes back with every update.
  useEffect(() => setInit(combatant?.initiative ?? null), [combatant?.initiative])
  const setMine = (v: number | null): void => {
    setInit(v)
    void window.goblin.initiative.setMine(v)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <Heading name={character.name || 'Your character'} sub={combatant ? 'You' : 'You — not in the fight yet'} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        <Stat value={`${character.currentHp}${character.tempHp ? ` +${character.tempHp}` : ''}`} label={`HP / ${derived.maxHp}`} />
        <Stat value={`${derived.armorClass}`} label="AC" />
        {combatant ? (
          <InitiativeField value={init} onChange={setMine} onRoll={() => rollDamage([{ sides: 20, count: 1 }], derived.initiative, 'Initiative', (total) => setMine(total))} rollTitle="Roll initiative (it goes in the turn order)" />
        ) : (
          <Stat value="–" label="Init" />
        )}
      </div>
      <HpControls temp onHp={(amount, kind) => onSave(hpChange(character.currentHp, character.tempHp ?? 0, derived.maxHp, amount, kind))} />
      {character.currentHp <= 0 && <div style={{ fontSize: 12, color: 'var(--danger)' }}>You’re down — roll your death saves on your sheet.</div>}
      <Conditions list={combatant?.statusEffects ?? []} />
      <CharacterTabs character={character} sessionId={sessionId} onSave={onSave} />
    </div>
  )
}

/** A fellow player: their numbers, and their actions and spells to look at (fetched fresh when picked, and when their hit points change). */
function FellowPlayer({ c, sessionId }: { c: PlayerVisibleCombatant; sessionId: string }): JSX.Element {
  const [sheet, setSheet] = useState<CharacterSheet | null>(null)
  useEffect(() => {
    let cancelled = false
    void window.goblin.characters.getPlayerCharacter(c.userId!).then((result) => {
      if (!cancelled && result.ok) setSheet(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [c.userId, c.currentHp, c.statusEffects.join(',')])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <Heading name={c.name} sub="Party member" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        <Stat value={c.dead ? 'Down' : `${c.currentHp ?? '?'}${sheet?.tempHp ? ` +${sheet.tempHp}` : ''}`} label={`HP / ${c.maxHp ?? '?'}`} />
        <Stat value={c.ac !== null ? `${c.ac}` : '–'} label="AC" />
        <Stat value={c.initiative === null ? '–' : `${c.initiative}`} label="Init" />
      </div>
      <Conditions list={c.statusEffects} />
      {sheet ? <CharacterTabs character={sheet} sessionId={sessionId} /> : <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>They haven’t got a character open.</p>}
    </div>
  )
}

/** Anyone else: how hurt they look, and their conditions. */
function OtherCombatant({ c }: { c: PlayerVisibleCombatant }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <Heading name={c.name} sub={c.dead ? (c.kind === 'vehicle' ? 'Wrecked' : 'Down') : c.currentHp !== null ? `${c.currentHp}/${c.maxHp} HP` : INJURY_LABEL[c.injury]} />
      <Conditions list={c.statusEffects} />
    </div>
  )
}
