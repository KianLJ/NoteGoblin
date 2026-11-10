// The Combat tab (top-left switch, next to the Homebrew Workshop): the
// initiative order, a battle map with a token per combatant, and the
// selected combatant's numbers and attacks to roll. It edits the same
// encounter as the right panel's initiative tracker (encounterStore.ts).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import { sortedByInitiative, withCombatantHp, type Combatant } from '@shared/encounter'
import { activeBattle, canStand, startArea, MAX_TOKEN_SIZE, tokenCentre, turnToken, fogEverything, hiddenCombatantIds, isFogged, isTestUser, newBattle, type Ambient, type BattleMap, type MapImage, type Pt, type TemplateKind } from '@shared/battleMap'
import { lightsOf, LIGHT_PRESETS, viewerKey, viewerSources, visionActive } from '@shared/vision'
import { buildCheckRollEntry, diceGroups } from '@shared/dice'
import { deriveSheet } from '@shared/content/sheet'
import { formatModifier } from '@shared/dnd5e'
import { crewKey, fixedBonus, gunnerFor, shipCrew, vehicleName, weaponAttackBonus, weaponCrew, type CrewMember, type TrackedVehicle } from '@shared/vehicles'
import { useAllMonsters } from '../../data/useAllMonsters'
import type { BestiaryMonster } from '../../data/bestiary'
import { renderStatblockHtml } from '../../statblock'
import { useSheetRoller } from '../dice/useSheetRoller'
import { useShipFire } from './useShipFire'
import { InitiativeTracker } from '../campaigns/InitiativeTracker'
import { VehiclesPanel } from '../vehicles/VehiclesPanel'
import { VehicleDamage } from '../vehicles/VehicleDamage'
import { ShipTabs } from '../vehicles/ShipTabs'
import { StationList } from '../vehicles/StationActions'
import { Aboard } from '../vehicles/Aboard'
import { weaponReach, weaponReady } from '@shared/shipCombat'
import { rollInlineDice } from '../dice/inlineDice'
import { getDiceLog, subscribeDiceLog } from '../dice/diceLogStore'
import { useVehicles } from '../vehicles/useVehicles'
import { crewLabel, gunnerBonusFromSheet } from '../vehicles/crewBonus'
import { XIcon } from '../../ui/icons'
import { canRedoBattleMap, canUndoBattleMap, redoBattleMap, setLibrary, switchBattle, undoBattleMap, useBattleLibrary, useBattleMap, useEncounter } from './encounterStore'
import { loadSavedEncounters } from '../../data/savedEncounters'
import { initiativeModifierFor } from '../campaigns/InitiativeTracker'
import { playSfx } from '../audio/soundEffects'
import { CharacterTabs, HpControls, InitiativeField, MonsterAbilities, Stat, hpChange } from './CombatPanels'
import { ConfirmButton } from '../../ui/ConfirmButton'
import { ResizableSidebar } from '../../ui/ResizableSidebar'
import { BattleMapView, HideToggle, LockToggle, type FogTool, type MapTool, type Sight, type WallDraw } from './BattleMapView'
import { MapControls, RAIL, ToolOptions, ToolRail, railKey, type RailTool } from './MapToolbar'
import { TestPlayersMenu } from './TestPlayersMenu'
import { EncounterLibrary } from './EncounterLibrary'
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
  // Whoever's turn it is comes up on the map (the tracker on the left moves the turn on).
  useEffect(() => {
    if (turnId) setSelectedId(turnId)
  }, [turnId])
  // A vehicle sent from the tracker's Vehicles tab ("Add to initiative"), and one picked in the order to show there.
  const [pendingVehicle, setPendingVehicle] = useState<TrackedVehicle | null>(null)
  const [focusVehicle, setFocusVehicle] = useState<{ id: string } | null>(null)
  const monsterOf = (c: Combatant): BestiaryMonster | undefined => (c.kind === 'monster' ? monsters.find((m) => m.index === c.monsterIndex) : undefined)
  const vehicleOf = (c: Combatant): TrackedVehicle | undefined => (c.kind === 'vehicle' ? vehicles.doc.vehicles.find((v) => v.id === c.vehicleId) : undefined)
  const characterOf = (c: Combatant): CharacterSheet | undefined => (c.kind === 'player' && c.userId ? playerCharacters.get(c.userId) : undefined)

  // Tokens are placed (and the map saved and shared) by useBattleMapSync, mounted in the app shell.

  const selected = encounter.combatants.find((c) => c.id === selectedId) ?? null
  // The right panel: the selected combatant, or the Encounter Library. Picking someone brings their numbers back up.
  const [panel, setPanel] = useState<'detail' | 'encounters'>('detail')
  useEffect(() => {
    if (selectedId) setPanel('detail')
  }, [selectedId])

  // Playing as a player (or the party): they see what their party sees (on a map with walls or darkness), and move only their own tokens, as on their screen.
  const vision = visionActive(map)
  const players = encounter.combatants.filter((c) => c.kind === 'player' && c.userId)
  // Worked out only from what it depends on, so a change elsewhere (the explored squares, remembered spots — both follow every move) doesn't redo the lighting.
  const viewUserId = playAs === 'party' ? null : playAs
  const sightEyes = useMemo(
    () => (playAs && vision ? { sources: viewerSources(map, encounter.combatants, viewUserId), lights: lightsOf(map, new Set(hiddenCombatantIds(encounter.combatants))) } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playAs, vision, map.tokens, map.lights, map.ambient, map.sharedVision, encounter.combatants]
  )
  const sightExplored = playAs && vision ? (map.explored[viewUserId ? viewerKey(map, viewUserId) : 'party'] ?? null) : null
  const sight: Sight | null = useMemo(() => (sightEyes ? { ...sightEyes, explored: sightExplored } : null), [sightEyes, sightExplored])
  // Hidden and fogged enemies are left off; what's in sight is worked out by the map, live as tokens are dragged.
  const shownCombatants = useMemo(() => {
    if (!playAs) return encounter.combatants
    return encounter.combatants.filter((c) => {
      const t = map.tokens[c.id]
      if (c.kind === 'player' || (c.kind === 'vehicle' && c.party)) return true
      return t && !c.hidden && !isFogged(map, tokenCentre(t))
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
    else if (isFogged(map, tokenCentre({ ...t, x, y }))) setHint('You can’t see that far (it’s under fog).')
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

  // Firing a vehicle's weapon at a target on the map.
  const { myId } = useSheetRoller(sessionId)
  const round = encounter.turnIndex >= 0 ? encounter.round : null
  const fire = useShipFire({ sessionId, rollerId: myId, encounter, setEncounter, map, vehicles, playerCharacters, damageCreature: (c, amount) => changeHp(c, amount, 'damage'), setHint })
  const aimView = useMemo(() => {
    const a = fire.aim
    const v = a ? vehicleOf(encounter.combatants.find((c) => c.id === a.shooterId)!) : undefined
    const w = v?.def.weapons.find((x) => x.id === a!.weaponId)
    if (!a || !w) return null
    return { from: a.shooterId, label: w.name, arcs: w.arcs, reach: weaponReach(w, map.feetPerCell), onPick: fire.aimAt, onCancel: () => {
      fire.cancelAim()
      setHint('Stopped aiming.')
    } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fire.aim, fire.aimAt, vehicles.doc, map.feetPerCell, encounter.combatants])

  /** The vehicles a party member crews (and each one's combatant, when it's in the fight). */
  const crewingOf = (userId: string): Array<{ vehicle: TrackedVehicle; combatantId: string | null }> =>
    vehicles.doc.vehicles
      .filter((v) => Object.values(v.crew).some((people) => people.some((m) => m.userId === userId)))
      .map((v) => ({ vehicle: v, combatantId: encounter.combatants.find((x) => x.kind === 'vehicle' && x.vehicleId === v.id)?.id ?? null }))

  const setConditions = (c: Combatant, statusEffects: string[]): void =>
    setEncounter((s) => ({ ...s, combatants: s.combatants.map((x) => (x.id === c.id ? { ...x, statusEffects } : x)) }))

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 var(--space-4)', borderBottom: '1px solid var(--border-subtle)' }}>
        <strong style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>Combat</strong>
        <BattleMenu />
        {encounter.turnIndex >= 0 && <span className="gb-badge gb-badge--accent">Round {encounter.round}</span>}
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{encounter.combatants.length === 0 ? 'Add combatants in the tracker on the left, or load an encounter from a session scene.' : ''}</span>
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
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <ResizableSidebar defaultWidth={330} minWidth={260} maxWidth={600} handleSide="right" collapseStorageKey="gb-sidebar-collapsed:combat-tracker" widthStorageKey="gb-sidebar-width:combat-tracker">
          <aside style={{ height: '100%', borderRight: '1px solid var(--border-subtle)', background: 'var(--bg-sunken)', display: 'flex', flexDirection: 'column' }}>
            <InitiativeTracker
              sessionId={sessionId}
              playerCharacters={playerCharacters}
              onSelectMonster={(m) => {
                const c = encounter.combatants.find((x) => x.kind === 'monster' && x.monsterIndex === m.index)
                if (c) setSelectedId(c.id)
              }}
              onSelectCombatant={setSelectedId}
              selectedId={selectedId}
              pendingVehicle={pendingVehicle}
              onPendingVehicleConsumed={() => setPendingVehicle(null)}
              vehicles={vehicles.doc.vehicles}
              onVehicleHp={(id, hp) => void vehicles.save({ vehicles: vehicles.doc.vehicles.map((v) => (v.id === id ? { ...v, hp } : v)) })}
              onSelectVehicle={(id) => setFocusVehicle({ id })}
              vehiclesView={
                <VehiclesPanel sessionId={null} rollSessionId={sessionId} campaignId={campaignId} readOnly={false} playerCharacters={playerCharacters} focus={focusVehicle} onAddToInitiative={setPendingVehicle} />
              }
            />
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
            viewer={playAs ? { canDrag: mineToMove, onMoveToken: playMove, onFaceToken: (id, facing) => map.tokens[id] && setMap({ ...map, tokens: { ...map.tokens, [id]: turnToken(map.tokens[id], facing) } }) } : undefined}
            centreRef={centreRef}
            selectedImage={selectedImage}
            onSelectImage={setSelectedImage}
            remoteDrags={remoteDrags}
            onLiveDrag={sessionId ? (id, x, y) => void window.goblin.battleMap.drag(id, x, y) : undefined}
            aim={aimView}
            tokenPopup={playAs ? undefined : (id) => {
              const c = encounter.combatants.find((x) => x.id === id)
              const t = map.tokens[id]
              if (!c || !t) return null
              const setToken = (next: typeof t): void => setMap({ ...map, tokens: { ...map.tokens, [id]: next } })
              const fit = (n: number): number => Math.max(1, Math.min(MAX_TOKEN_SIZE, Math.round(n)))
              return (
                <TokenPopup
                  name={c.kind === 'vehicle' ? (vehicleOf(c) ? vehicleName(vehicleOf(c)!) : c.name) : c.name}
                  hidden={!!c.hidden}
                  onHidden={(hidden) => setEncounter((s) => ({ ...s, combatants: s.combatants.map((x) => (x.id === id ? { ...x, hidden: hidden || undefined } : x)) }))}
                  locked={!!t.locked}
                  onLock={(locked) => setToken({ ...t, locked: locked || undefined })}
                  facing={t.facing ?? null}
                  onFacing={(facing) => !t.locked && setToken(turnToken(t, facing === null ? undefined : facing))}
                  size={{ w: t.size, h: t.h ?? t.size }}
                  onSize={(w, h) => {
                    if (t.locked) return
                    const { h: _h, ...rest } = t
                    setToken({ ...rest, size: fit(w), ...(fit(h) !== fit(w) ? { h: fit(h) } : {}), sized: true })
                  }}
                  light={t.light}
                  onLight={(light) => setToken({ ...t, light })}
                  onClose={() => setSelectedId(null)}
                />
              )
            }}
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
          <div className="it-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={panel === 'detail'} className={`it-tab${panel === 'detail' ? ' it-tab--on' : ''}`} onClick={() => setPanel('detail')}>
              {selected ? selected.name : 'Selected'}
            </button>
            <button type="button" role="tab" aria-selected={panel === 'encounters'} className={`it-tab${panel === 'encounters' ? ' it-tab--on' : ''}`} onClick={() => setPanel('encounters')}>
              Encounters
            </button>
          </div>
          {panel === 'encounters' ? (
            <div style={{ flex: 1, minHeight: 0 }}>
              <EncounterLibrary playerCharacters={playerCharacters} />
            </div>
          ) : (
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
                playerCharacters={playerCharacters}
                crewing={selected.kind === 'player' && selected.userId ? crewingOf(selected.userId) : []}
                onAimFrom={(vehicleCombatantId, weaponId, gunnerKey) => fire.startAim(vehicleCombatantId, weaponId, gunnerKey)}
                onVehicle={(next) => {
                  // The hull and the turn order's hit points stay in step.
                  if (next.hp !== vehicleOf(selected)?.hp) setEncounter((s) => withCombatantHp(s, selected.id, next.hp))
                  void vehicles.save({ vehicles: vehicles.doc.vehicles.map((x) => (x.id === next.id ? next : x)) })
                }}
                onHint={setHint}
                round={round}
                aiming={fire.aim?.shooterId === selected.id ? fire.aim.weaponId : null}
                onAim={(weaponId) => (fire.aim?.shooterId === selected.id && fire.aim.weaponId === weaponId ? fire.cancelAim() : fire.startAim(selected.id, weaponId))}
                onFired={(weaponId) => selected.vehicleId && fire.markFired(selected.vehicleId, weaponId)}
                onRepairWeapon={(weaponId) => {
                  const v = vehicleOf(selected)
                  if (v) void vehicles.save({ vehicles: vehicles.doc.vehicles.map((x) => (x.id === v.id ? { ...x, offline: x.offline.filter((id) => id !== weaponId) } : x)) })
                }}
                onPickGunner={(weaponId, key) => {
                  const v = vehicleOf(selected)
                  if (v) void vehicles.save({ vehicles: vehicles.doc.vehicles.map((x) => (x.id === v.id ? { ...x, gunners: { ...x.gunners, [weaponId]: key } } : x)) })
                }}
                onConditions={(list) => setConditions(selected, list)}
              />
            ) : (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Click a token or a name in the initiative order to see its numbers and roll its attacks.</p>
            )}
          </div>
          )}
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
 * battles. The encounter it is for is picked, loaded and saved in EncounterCard.
 */
function BattleMenu(): JSX.Element {
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
        title="Switch, add, rename or delete battles (its encounter is in the panel on the right)"
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
          </div>
        </>
      )}
    </div>
  )
}

const tiny = { fontSize: 12, padding: '2px 8px' } as const

interface AttackLine {
  name: string
  bonus?: number
  damage?: string
  note?: string
  critOn?: number
  /** A vehicle's weapon: its id (to fire it on the map, and track its shots). */
  weaponId?: string
  /** Fired by whoever's at its station (so who can be picked). */
  crewed?: boolean
}

/** Attack bonus and damage dice from a statblock action's text ("+6 to hit … Hit: 13 (2d8 + 4)", or the 2024 "Attack Roll: +6 … 13 (2d8 + 4)"). */
export function attackFromText(name: string, desc: string): AttackLine | null {
  const plain = desc.replace(/`dice:\s*([^`]+)`/g, '$1')
  const bonus = /([+-]\d+) to hit/.exec(plain) ?? /Attack Roll:\s*([+-]\d+)/.exec(plain)
  const dmg = /\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)/.exec(plain)
  if (!bonus && !dmg) return null
  return { name, ...(bonus ? { bonus: Number(bonus[1]) } : {}), ...(dmg ? { damage: dmg[1].replace(/\s+/g, ' ') } : {}) }
}

function attacksFor(monster?: BestiaryMonster, vehicle?: TrackedVehicle, character?: CharacterSheet, playerCharacters?: Map<string, CharacterSheet>): AttackLine[] {
  if (character) {
    const { derived } = deriveSheet(character)
    return derived.attacks.map((a) => ({ name: a.name, bonus: a.attackBonus, damage: a.damage, note: a.damageType, critOn: a.kind === 'weapon' || a.kind === 'unarmed' ? derived.critThreshold : 20 }))
  }
  // A weapon with no attack bonus of its own (and no save) is fired by whoever's at its station: an NPC's tier bonus, or a character's Dex modifier + proficiency.
  if (vehicle) {
    const characterBonus = (m: CrewMember): number | undefined => {
      const sheet = m.userId ? playerCharacters?.get(m.userId) : undefined
      return sheet ? gunnerBonusFromSheet(sheet) : undefined
    }
    return vehicle.def.weapons.map((w) => {
      const crewed = fixedBonus(vehicle, w) === undefined && w.saveDc === undefined
      const who = crewed ? gunnerFor(vehicle, w.id) : null
      return {
        name: w.name,
        bonus: weaponAttackBonus(vehicle, w.id, characterBonus),
        damage: w.damage || undefined,
        note: [w.saveDc !== undefined ? `DC ${w.saveDc} ${(w.saveAbility ?? 'dex').toUpperCase()}` : w.damageType, w.range, crewed && !who ? 'nobody at its station' : ''].filter(Boolean).join(' · '),
        weaponId: w.id,
        crewed: crewed && !!who
      }
    })
  }
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
  playerCharacters,
  onPickGunner,
  crewing,
  onAimFrom,
  onVehicle,
  onHint,
  round,
  aiming,
  onAim,
  onFired,
  onRepairWeapon,
  onConditions
}: {
  c: Combatant
  sessionId: string | null
  monster?: BestiaryMonster
  vehicle?: TrackedVehicle
  character?: CharacterSheet
  onHp: (amount: number, kind: 'damage' | 'heal' | 'temp') => void
  onInitiative: (v: number | null) => void
  onRollInitiative: () => void
  playerCharacters: Map<string, CharacterSheet>
  /** Who fires a vehicle's weapon (a crewKey). */
  onPickGunner: (weaponId: string, key: string) => void
  /** A party member's places aboard vehicles: each vehicle they crew (and its combatant, when it's in the fight). */
  crewing: Array<{ vehicle: TrackedVehicle; combatantId: string | null }>
  /** The vehicle changed (a component damaged or repaired). */
  onVehicle: (v: TrackedVehicle) => void
  /** A line in the map's hint bar ("under its threshold: no damage"). */
  onHint: (text: string) => void
  /** Fire a vehicle's weapon (by its combatant) at a target on the map. */
  onAimFrom: (vehicleCombatantId: string, weaponId: string, gunnerKey: string) => void
  /** The fight's round (null: not started), for weapons cooling down. */
  round: number | null
  /** The weapon being aimed on the map, if one of this vehicle's. */
  aiming: string | null
  onAim: (weaponId: string) => void
  onFired: (weaponId: string) => void
  onRepairWeapon: (weaponId: string) => void
  onConditions: (list: string[]) => void
}): JSX.Element {
  const { rollCheck, rollDamage } = useSheetRoller(sessionId, c.name)
  const [showBlock, setShowBlock] = useState(false)
  const attacks = useMemo(() => attacksFor(monster, vehicle, character, playerCharacters), [monster, vehicle, character, playerCharacters])
  const rollDice = (expr: string, label: string): void => {
    const parsed = diceGroups(expr)
    if (parsed) rollDamage(parsed.groups, parsed.modifier, label)
  }
  const kindLabel = c.kind === 'player' ? 'Party member' : c.kind === 'vehicle' ? `${c.party ? 'Party' : 'Enemy'} vehicle${vehicle ? ` · ${vehicle.def.size} ${vehicle.def.category.toLowerCase()}` : ''}` : `${monster?.size ?? ''} ${monster?.type ?? 'creature'}`.trim()

  const attacksBlock = (
      <Block title={c.kind === 'vehicle' ? 'Weapons' : 'Attacks'}>
        {attacks.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>None to roll.</span>}
        {attacks.map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-raised)', border: '1px solid var(--border-subtle)' }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
              <strong>{a.name}</strong>
              {a.note && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>{a.note}</span>}
              {vehicle && a.weaponId && a.crewed && <GunnerPick vehicle={vehicle} weaponId={a.weaponId} onPick={(key) => onPickGunner(a.weaponId!, key)} />}
              {vehicle && a.weaponId && <FixedBonusNote vehicle={vehicle} weaponId={a.weaponId} onVehicle={onVehicle} />}
              {vehicle && a.weaponId && <WeaponState vehicle={vehicle} weaponId={a.weaponId} round={round} onRepair={() => onRepairWeapon(a.weaponId!)} />}
            </span>
            {vehicle && a.weaponId && (
              <button
                type="button"
                style={{ ...pill, display: 'inline-flex', alignItems: 'center', padding: '2px 6px', ...(aiming === a.weaponId ? { background: 'var(--accent)', color: 'var(--bg-surface)' } : {}) }}
                onClick={() => onAim(a.weaponId!)}
                disabled={!weaponReady(vehicle, vehicle.def.weapons.find((w) => w.id === a.weaponId)!, round).ok}
                title="Fire at a target on the map: checks its arc and range, rolls to hit against its AC, then rolls and applies the damage"
                aria-label={`Fire the ${a.name} at a target`}
              >
                <CrosshairIcon />
              </button>
            )}
            {a.bonus !== undefined && (
              <button
                type="button"
                style={pill}
                onClick={() => {
                  rollCheck(`${a.name} Attack`, a.bonus!, { critOn: a.critOn })
                  if (vehicle && a.weaponId) onFired(a.weaponId)
                }}
                title={vehicle ? 'Roll the attack (spends a shot and starts its cooldown)' : 'Roll the attack'}
              >
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
  )
  const conditionsBlock = (
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
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, lineHeight: 1.2 }}>{c.kind === 'vehicle' && vehicle ? vehicleName(vehicle) : c.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)' }}>{kindLabel}</span>
        </div>
        {c.hidden && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Players can’t see it on the map or in the turn order.</div>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        <Stat value={`${c.currentHp}${character?.tempHp ? ` +${character.tempHp}` : ''}`} label={`HP / ${c.maxHp}`} />
        <Stat value={`${c.ac}`} label="AC" />
        <InitiativeField value={c.initiative} onChange={onInitiative} onRoll={onRollInitiative} rollTitle={c.kind === 'player' ? 'Roll for them (players can roll their own in their Combat tab)' : 'Roll it quietly — players never see an enemy’s roll'} />
      </div>
      {vehicle ? (
        <ShipTabs
          ship={
            <>
              <VehicleDamage vehicle={vehicle} onChange={onVehicle} onHint={onHint} />
              {conditionsBlock}
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                Hired crew: {crewLabel(shipCrew(vehicle))}. Who sits where: the Stations tab. Fuel and cargo: the tracker’s Vehicles tab.
              </p>
            </>
          }
          stations={<StationList vehicle={vehicle} sheets={(userId) => playerCharacters.get(userId)} rollCheck={(label, modifier) => rollCheck(label, modifier)} crewing={{ party: playerCharacters, onChange: onVehicle }} />}
          weapons={attacksBlock}
        />
      ) : (
        <>
          <HpControls onHp={onHp} repair={c.kind === 'vehicle'} temp={!!character} />
          {c.damageThreshold ? <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hits under {c.damageThreshold} do nothing.</div> : null}
        </>
      )}
      {c.deathSaves && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Death saves: {c.deathSaves.successes} successes, {c.deathSaves.failures} failures (track them in the Initiative tab)
        </div>
      )}

      {crewing.length > 0 && c.userId && (
        <Block title="Aboard">
          <Aboard
            vehicles={crewing.map((x) => x.vehicle)}
            userId={c.userId}
            character={character}
            round={round}
            rollCheck={(label, modifier) => rollCheck(label, modifier)}
            rollDice={rollDice}
            aimFrom={(vehicleId, weaponId) => {
              const combatantId = crewing.find((x) => x.vehicle.id === vehicleId)?.combatantId
              return combatantId ? () => onAimFrom(combatantId, weaponId, `user:${c.userId}`) : undefined
            }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Rolled as {c.name}, with their own numbers.</span>
        </Block>
      )}


      {vehicle ? null : (
        <>
          {!character && attacksBlock}
          {conditionsBlock}
        </>
      )}
      {character && <CharacterTabs character={character} sessionId={sessionId} canRoll />}
      {monster && <MonsterAbilities monster={monster} sessionId={sessionId} />}
      {monster && (
        <div>
          <button type="button" className="gb-btn gb-btn--ghost" style={btn} onClick={() => setShowBlock((s) => !s)}>
            {showBlock ? 'Hide statblock' : 'Full statblock'}
          </button>
          {showBlock && <div className="gb-markdown" style={{ marginTop: 6 }} onClick={(e) => rollInlineDice(e, sessionId)} dangerouslySetInnerHTML={{ __html: renderStatblockHtml(monster, false) }} />}
        </div>
      )}
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
            const area = startArea(map)
            for (let x = area.x0; x < area.x0 + 200; x++)
              for (let y = area.y0; y < area.y1; y++)
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

/**
 * A gun whose statblock gives it an attack bonus of its own fires at that,
 * not the crew's — said here, with a way to have the crew fire it anyway (and
 * back again).
 */
function FixedBonusNote({ vehicle: v, weaponId, onVehicle }: { vehicle: TrackedVehicle; weaponId: string; onVehicle: (v: TrackedVehicle) => void }): JSX.Element | null {
  const w = v.def.weapons.find((x) => x.id === weaponId)
  if (!w || w.attackBonus === undefined || w.saveDc !== undefined) return null
  const crew = v.crewFires.includes(w.id)
  const link = { background: 'none', border: 0, padding: 0, color: 'var(--accent-hover)', cursor: 'pointer', font: 'inherit', fontSize: 11, textDecoration: 'underline' } as const
  return (
    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>
      {crew ? `Crew fires it (its statblock’s ${formatModifier(w.attackBonus)} set aside) · ` : `Fires at its own ${formatModifier(w.attackBonus)}, not the crew’s · `}
      <button type="button" style={link} onClick={() => onVehicle({ ...v, crewFires: crew ? v.crewFires.filter((id) => id !== w.id) : [...v.crewFires, w.id] })}>
        {crew ? `use ${formatModifier(w.attackBonus)}` : 'crew fires it'}
      </button>
    </span>
  )
}

/** A weapon that can't fire right now (offline, cooling down, out of ammo) — and a way to fix one knocked offline. */
function WeaponState({ vehicle, weaponId, round, onRepair }: { vehicle: TrackedVehicle; weaponId: string; round: number | null; onRepair: () => void }): JSX.Element | null {
  const w = vehicle.def.weapons.find((x) => x.id === weaponId)
  if (!w) return null
  const ready = weaponReady(vehicle, w, round)
  const shots = w.ammo !== undefined ? `${Math.max(0, w.ammo - (vehicle.ammoUsed[w.id] ?? 0))}/${w.ammo} shots` : ''
  if (ready.ok) return shots ? <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>{shots}</span> : null
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--danger)', marginTop: 2 }}>
      {ready.why}
      {vehicle.offline.includes(w.id) && (
        <button type="button" style={{ ...pill, fontSize: 10, padding: '0 6px' }} onClick={onRepair}>
          Repaired
        </button>
      )}
    </span>
  )
}

function CrosshairIcon(): JSX.Element {
  return (
    <svg width={13} height={13} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden="true" style={{ display: 'block' }}>
      <circle cx={8} cy={8} r={5.5} />
      <path d="M8 1v3M8 12v3M1 8h3M12 8h3" />
    </svg>
  )
}

/** Who fires a vehicle's weapon: picked from whoever's at its station. */
function GunnerPick({ vehicle, weaponId, onPick }: { vehicle: TrackedVehicle; weaponId: string; onPick: (key: string) => void }): JSX.Element | null {
  const who = gunnerFor(vehicle, weaponId)
  const crew = weaponCrew(vehicle, weaponId)
  if (!who) return null
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
      Fired by
      {crew.length > 1 ? (
        <select className="gb-input" value={crewKey(who)} onChange={(e) => onPick(e.target.value)} style={{ fontSize: 11, padding: '0 4px', minWidth: 0 }} aria-label="Who fires it">
          {crew.map((m) => (
            <option key={crewKey(m)} value={crewKey(m)}>
              {crewLabel(m)}
            </option>
          ))}
        </select>
      ) : (
        <span style={{ color: 'var(--text-secondary)' }}>{crewLabel(who)}</span>
      )}
    </span>
  )
}

/** Beside a selected token on the map: hide it, lock it, which way it faces, and how many squares it covers. */
function TokenPopup({
  name,
  hidden,
  onHidden,
  locked,
  onLock,
  facing,
  onFacing,
  size,
  onSize,
  light,
  onLight,
  onClose
}: {
  name: string
  hidden: boolean
  onHidden: (hidden: boolean) => void
  locked: boolean
  onLock: (locked: boolean) => void
  /** Degrees from the top of the map; null: no facing shown. */
  facing: number | null
  onFacing: (facing: number | null) => void
  size: { w: number; h: number }
  onSize: (w: number, h: number) => void
  /** The light it carries, if any. */
  light?: { bright: number; dim: number }
  onLight: (light: { bright: number; dim: number } | undefined) => void
  onClose: () => void
}): JSX.Element {
  const row = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' } as const
  const lightName = light ? (LIGHT_PRESETS.find((pr) => pr.bright === light.bright && pr.dim === light.dim)?.name ?? 'custom') : ''
  return (
    <div style={popupBox}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <strong style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</strong>
        <HideToggle hidden={hidden} onChange={onHidden} />
        <LockToggle locked={locked} onChange={onLock} />
        <button type="button" onClick={onClose} title="Done" style={iconBtn}>
          <XIcon size={11} />
        </button>
      </div>
      {hidden && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Players can’t see it on the map or in the turn order.</div>}
      <div style={row}>
        <span style={{ width: 44 }} title="Which way it faces — a ship fires into arcs and its armour is thickest at the bow; drag the handle beside the token, or press Q and E, to turn it">
          Facing
        </span>
        <button type="button" disabled={locked} style={{ ...pill, fontSize: 11, ...(facing === null ? { border: '1px solid var(--border-strong)', color: 'var(--text-secondary)' } : {}) }} onClick={() => onFacing(facing === null ? 0 : null)} title={facing === null ? 'Show which way it faces' : 'Stop showing its facing'}>
          {facing === null ? 'Off' : 'On'}
        </button>
        {facing !== null && (
          <>
            <button type="button" disabled={locked} style={{ ...pill, fontSize: 11 }} onClick={() => onFacing(facing - 45)} title="Turn 45° anticlockwise (Q)" aria-label="Turn left">
              <TurnIcon dir={-1} />
            </button>
            <span style={{ minWidth: 64, textAlign: 'center' }}>{FACING_NAMES[facing / 45] ?? `${facing}°`}</span>
            <button type="button" disabled={locked} style={{ ...pill, fontSize: 11 }} onClick={() => onFacing(facing + 45)} title="Turn 45° clockwise (E)" aria-label="Turn right">
              <TurnIcon dir={1} />
            </button>
          </>
        )}
      </div>
      <div style={row}>
        <span style={{ width: 44 }} title="How many squares it covers, across and down when it faces north — set from its size, or change it here">
          Size
        </span>
        <SizeStepper value={size.w} label="across" disabled={locked} onChange={(w) => onSize(w, size.w === size.h ? w : size.h)} />
        <span aria-hidden="true">×</span>
        <SizeStepper value={size.h} label="down" disabled={locked} onChange={(h) => onSize(size.w, h)} />
      </div>
      <div style={row} title="A light it carries lights the dark around it, for everyone who can see it">
        <span style={{ width: 44 }}>Light</span>
        <select
          className="gb-input"
          value={lightName}
          onChange={(e) => {
            const pr = LIGHT_PRESETS.find((x) => x.name === e.target.value)
            onLight(pr ? { bright: pr.bright, dim: pr.dim } : undefined)
          }}
          style={{ flex: 1, minWidth: 0, fontSize: 12, padding: '2px 6px' }}
          aria-label="The light it carries"
        >
          <option value="">None</option>
          {LIGHT_PRESETS.map((pr) => (
            <option key={pr.name} value={pr.name}>
              {pr.name} ({pr.bright}/{pr.dim} ft)
            </option>
          ))}
          {lightName === 'custom' && <option value="custom">{`${light!.bright}/${light!.dim} ft`}</option>}
        </select>
      </div>
    </div>
  )
}

const popupBox = { padding: '8px 10px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: '0 6px 20px rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 210 } as const

/** Squares across or down a token covers: a number with − and + beside it. */
function SizeStepper({ value, label, disabled, onChange }: { value: number; label: string; disabled: boolean; onChange: (v: number) => void }): JSX.Element {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} title={`Squares ${label}`}>
      <button type="button" style={{ ...pill, fontSize: 11, padding: '1px 6px' }} onClick={() => onChange(value - 1)} disabled={disabled || value <= 1} aria-label={`Fewer squares ${label}`}>
        −
      </button>
      <span style={{ minWidth: 18, textAlign: 'center', color: 'var(--text-primary)' }}>{value}</span>
      <button type="button" style={{ ...pill, fontSize: 11, padding: '1px 6px' }} onClick={() => onChange(value + 1)} disabled={disabled || value >= MAX_TOKEN_SIZE} aria-label={`More squares ${label}`}>
        +
      </button>
    </span>
  )
}

const FACING_NAMES = ['North', 'North-east', 'East', 'South-east', 'South', 'South-west', 'West', 'North-west']

/** A curved arrow: turn left (-1) or right (1). */
function TurnIcon({ dir }: { dir: 1 | -1 }): JSX.Element {
  return (
    <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: dir === -1 ? 'scaleX(-1)' : undefined, display: 'block' }}>
      <path d="M3 9a5 5 0 1 0 2-5.5" />
      <path d="M2.5 1.5v3.5H6" transform="translate(16 0) scale(-1 1)" />
    </svg>
  )
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
