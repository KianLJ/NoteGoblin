// Dev-only: the character sheet on its own, with window.goblin stubbed, for
// checking its layout in a plain browser (see vite.sheet-preview.config.ts).
// Never imported by the app.
import React, { useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import type { CharacterSheet } from '@shared/ipc'
import { emptyCharacterSheet, type CharacterSheetData } from '@shared/dnd5e'
import { defaultCalendarConfig } from '@shared/calendar'
import { setActivePacks } from '@shared/content/sheet'
import { parsePack } from '@shared/content/validate'
import { srdPack } from '@shared/content/srd'
import { VehiclesPanel } from '../features/vehicles/VehiclesPanel'
import { VehicleEditor } from '../features/workshop/form/vehicle'
import { CombatView } from '../features/combat/CombatView'
import { PlayerCombatView } from '../features/combat/PlayerCombatView'
import { useBattleMapSync } from '../features/combat/useBattleMapSync'
import { useCombatSheetSync } from '../features/combat/useCombatSheetSync'
import { useTestPlayerSheets } from '../features/combat/useTestPlayerSheets'
import { getBattleMap, getEncounter, setBattleMap, setEncounter } from '../features/combat/encounterStore'
import { emptyCombatant, emptyInitiativeState, sanitizeForPlayer } from '@shared/encounter'
import { emptyBattleMap, hiddenCombatantIds, mapForPlayer } from '@shared/battleMap'
import { trackVehicle } from '@shared/vehicles'
import { vehicleDefSchema } from '@shared/content/schema'
import { CalendarPanel } from '../features/campaigns/CalendarPanel'
import { renderStatblockHtml, type StatblockData } from '../statblock'
import { blankAttack, blankMonster, blankSave, monsterToEntry } from '@shared/content/guidedMonster'
import { rollInlineDice } from '../features/dice/inlineDice'
import { RollAnimationOverlay } from '../features/dice/RollAnimationOverlay'
import { getDiceLog, subscribeDiceLog } from '../features/dice/diceLogStore'

/** The DM's side as the app shell runs it: the battle synced, and the party's sheets (test players' too) in the fight. */
function DmCombat(): JSX.Element {
  useBattleMapSync('camp', null)
  const tests = useTestPlayerSheets(true)
  const players = useMemo(() => new Map([['u1', sample], ...tests]), [tests])
  useCombatSheetSync(players, false)
  return <CombatView sessionId={null} campaignId="camp" playerCharacters={players} />
}

/** A drawn stone floor (70 pixels to a square, 20 by 12 squares), standing in for a map image. */
function demoFloor(): string {
  const c = document.createElement('canvas')
  c.width = 1400
  c.height = 840
  const g = c.getContext('2d')!
  g.fillStyle = '#5b5348'
  g.fillRect(0, 0, c.width, c.height)
  for (let x = 0; x < 20; x++)
    for (let y = 0; y < 12; y++) {
      g.fillStyle = (x + y) % 2 ? '#6a6154' : '#625a4e'
      g.fillRect(x * 70 + 2, y * 70 + 2, 66, 66)
    }
  g.fillStyle = '#2d6a8a'
  g.fillRect(15 * 70, 8 * 70, 4 * 70, 3 * 70)
  return c.toDataURL('image/png')
}

// &walls: a dark dungeon instead — two rooms with a closed door between, the party's torch, a brazier lighting the ogre's room.
if (new URLSearchParams(location.search).has('walls')) {
  const w = (id: string, ax: number, ay: number, bx: number, by: number, door = false) => ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, ...(door ? { door: true } : {}) })
  setBattleMap({
    ...emptyBattleMap(),
    ambient: 'dark',
    tokens: { pc: { x: 3, y: 7, size: 1, light: { bright: 20, dim: 20 } }, ogre: { x: 13, y: 7, size: 2 }, gob1: { x: 21, y: 13, size: 1 }, gob2: { x: 6, y: 10, size: 1 }, ship: { x: 20, y: 0, size: 4 } },
    walls: [w('a1', 1, 3, 10, 3), w('a2', 10, 3, 10, 7), w('door', 10, 7, 10, 9, true), w('a3', 10, 9, 10, 12), w('a4', 10, 12, 1, 12), w('a5', 1, 12, 1, 3), w('b1', 10, 3, 18, 3), w('b2', 18, 3, 18, 12), w('b3', 18, 12, 10, 12)],
    lights: [{ id: 'brazier', x: 15, y: 5, bright: 10, dim: 10 }],
    images: [{ id: 'floor', src: demoFloor(), x: 0, y: 2, w: 20, h: 12, naturalW: 1400, naturalH: 840 }]
  })
} else if (new URLSearchParams(location.search).has('playercombat')) {
  // ?playercombat: the DM's map laid out first (tokens placed, a goblin ambushing under fog), then shown as the player gets it.
  setBattleMap({
    ...emptyBattleMap(),
    tokens: { pc: { x: 3, y: 5, size: 1 }, ogre: { x: 12, y: 4, size: 2 }, gob1: { x: 20, y: 12, size: 1 }, gob2: { x: 14, y: 9, size: 1 }, ship: { x: 0, y: 0, size: 4 } },
    fog: [{ id: 'f', op: 'add', kind: 'rect', x: 17, y: 8, w: 7, h: 8 }],
    templates: [{ id: 't', kind: 'cone', origin: { x: 4, y: 5.5 }, toward: { x: 7, y: 5.5 }, sizeFt: 15 }]
  })
}

/** ?vehicles: the DM's Vehicles panel (300px, like the right panel) beside the Workshop's vehicle form. */
function VehiclesPreview(): JSX.Element {
  const [entry, setEntry] = useState<Record<string, unknown>>(demoVehicle)
  const players = new Map([['u1', { ...sample, id: 'c1' }]])
  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ width: 300, borderRight: '1px solid var(--border-subtle)', background: 'var(--bg-sunken)' }}>
        <VehiclesPanel sessionId={null} rollSessionId={null} campaignId="camp" readOnly={false} playerCharacters={players} onAddToInitiative={() => {}} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <VehicleEditor value={entry} onChange={setEntry} />
      </div>
    </div>
  )
}

/** ?statblock: a statblock with inline rolls, and the dice log underneath. */
function StatblockPreview(): JSX.Element {
  const [, bump] = useState(0)
  React.useEffect(() => subscribeDiceLog(() => bump((n) => n + 1)), [])
  const fromForm = new URLSearchParams(location.search).has('form')
  const html = fromForm
    ? renderStatblockHtml(
        monsterToEntry({
          ...blankMonster('drake'),
          name: 'Ember Drake (from the form)',
          hitDice: 10,
          blocks: {
            traits: [],
            actions: [
              { name: 'Bite', usage: '', desc: '', roll: { ...blankAttack(), dice: '2d6', damageType: 'piercing', extraDice: '1d6', extraType: 'fire' } },
              { name: 'Fire Breath', usage: 'Recharge 5–6', desc: '', roll: { ...blankSave(), dice: '8d6' } }
            ],
            bonus_actions: [],
            reactions: [],
            legendary_actions: [],
            lair_actions: []
          }
        }) as unknown as StatblockData,
        false
      )
    : renderStatblockHtml(
    {
      name: 'Ogre',
      size: 'Large',
      type: 'giant',
      ac: '11',
      hp: '68 (`dice: 8d10 + 24`)',
      speed: '40 ft.',
      str: '19',
      dex: '8',
      con: '16',
      int: '5',
      wis: '7',
      cha: '7',
      traits: [],
      reactions: [],
      legendary_actions: [],
      actions: [
        { name: 'Greatclub', desc: 'Melee Attack Roll: +6, reach 5 ft. Hit: 13 (`dice: 2d8 + 4`) Bludgeoning damage.' },
        { name: 'Javelin', desc: 'Ranged Attack Roll: +6, range 30/120 ft. Hit: 11 (`dice: 2d6 + 4`) Piercing damage.' }
      ]
    },
    false
  )
  return (
    <div style={{ padding: 24, maxWidth: 520 }}>
      <div className="gb-markdown" onClick={(e) => rollInlineDice(e, null)} dangerouslySetInnerHTML={{ __html: html }} />
      <div id="log" style={{ marginTop: 16, fontSize: 13 }}>
        {getDiceLog().map((r) => (
          <div key={r.id}>
            Rolled <b>{r.total}</b>
          </div>
        ))}
      </div>
    </div>
  )
}
import { CharacterSheetEditor } from '../features/player/CharacterSheetEditor'
import { applyFont, applyFontScale, getStoredFontId, getStoredFontScale, initTheme } from '../theme'
import '../styles/global.css'
import '../styles/primitives.css'

/**
 * Anything the sheet asks window.goblin for: callable (returns itself, so an
 * "unsubscribe" works) and awaitable (resolves to an empty success), at any
 * depth.
 */
function stub(): unknown {
  const fn = function () {
    return proxy
  }
  const proxy: unknown = new Proxy(fn, {
    get(_t, key) {
      if (key === 'then') return (resolve: (v: unknown) => void) => resolve({ ok: true, data: [] })
      return proxy
    },
    apply() {
      return proxy
    }
  })
  return proxy
}
// ?calendar shows the campaign calendar instead, backed by an in-memory sample calendar.
const sampleCalendar = {
  id: 'cal',
  campaignId: 'camp',
  createdAt: '',
  updatedAt: '',
  config: {
    ...defaultCalendarConfig(),
    name: 'Calendar of Harptos',
    dateFormat: '{weekday}, {day} {month}, {era}',
    weekdays: ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'].map((name) => ({ name, abbreviation: name.slice(0, 2) })),
    months: ['Hammer', 'Alturiak', 'Ches', 'Tarsakh', 'Mirtul', 'Kythorn', 'Flamerule', 'Eleasis', 'Eleint', 'Marpenoth', 'Uktar', 'Nightal'].map((name) => ({ name, length: 30 })),
    eras: [
      { id: 'e1', name: 'Dalereckoning', description: '', displayFormat: '{year} DR', startYear: 1 },
      { id: 'e2', name: 'Age of Humanity', description: '', displayFormat: '{year} DR (Age of Humanity)', startYear: 1000 }
    ],
    currentDate: { year: 1492, monthIndex: 2, day: 14 }
  }
}
const base = stub() as Record<string | symbol, unknown>
const calendarApi = {
  get: async () => ({ ok: true, data: sampleCalendar }),
  save: async (_id: string, config: typeof sampleCalendar.config) => {
    sampleCalendar.config = config
    return { ok: true, data: { ...sampleCalendar } }
  },
  remove: async () => ({ ok: true, data: null })
}
// ?vehicles: an in-memory campaign vehicle list.
let vehiclesDoc: { vehicles: unknown[] } = { vehicles: [] }
const vehiclesApi = {
  get: async () => ({ ok: true, data: vehiclesDoc }),
  save: async (_id: string, doc: { vehicles: unknown[] }) => {
    vehiclesDoc = doc
    return { ok: true, data: doc }
  }
}
// ?combat / ?playercombat: the battle map store, in memory; a player's moves are accepted as they'd be by the DM's app.
const noop = (): (() => void) => () => {}
const battleMapApi = {
  get: async () => ({ ok: true, data: { activeId: 'battle-1', battles: [{ id: 'battle-1', name: 'Battle map', encounterId: null, map: getBattleMap() }] } }),
  save: async () => ({ ok: true, data: undefined }),
  broadcast: async () => {},
  onPlayerMove: noop,
  fetch: async () => ({ ok: true, data: playerSide() }),
  fetchImage: async () => ({ ok: true, data: { imageId: null } }),
  moveToken: async () => ({ ok: true, data: undefined }),
  onUpdate: noop,
  onImage: noop,
  drag: async () => {},
  dragToken: async () => {},
  // Someone else's drag, for trying it out: window.fakeDrag('ogre', 13.4, 6.2) (null, null lets go).
  onDrag: (cb: (d: { sessionId: string | null; combatantId: string; x: number | null; y: number | null }) => void) => {
    ;(window as unknown as { fakeDrag: unknown }).fakeDrag = (combatantId: string, x: number | null, y: number | null) => cb({ sessionId: new URLSearchParams(location.search).has('playercombat') ? 's' : null, combatantId, x, y })
    return () => {}
  }
}
// The DM's own characters (for test players): just the sample.
const charactersApi = { list: async () => ({ ok: true, data: [sample] }), setPlayerHp: async () => {}, onHpFromDm: noop, onPlayerCharacterChanged: noop, getPlayerCharacter: async () => ({ ok: true, data: null }) }
const initiativeApi = { onUpdate: noop, broadcast: async () => {}, setMine: async () => {}, onPlayerInitiative: noop }
;(window as unknown as { goblin: unknown }).goblin = new Proxy(
  {},
  { get: (_t, key) => (key === 'calendar' ? calendarApi : key === 'vehicles' ? vehiclesApi : key === 'battleMap' ? battleMapApi : key === 'initiative' ? initiativeApi : key === 'characters' ? charactersApi : base[key]) }
)

// A demo pack with a starship, for the vehicles preview's "Add a vehicle".
const demoVehicle = {
  id: 'corvette',
  name: 'Corvette',
  category: 'Space',
  size: 'Gargantuan',
  speeds: [{ mode: 'fly', value: 'Warp 3' }],
  ac: 15,
  hp: 200,
  damageThreshold: 10,
  crew: 4,
  passengers: 6,
  cargo: '20 tons',
  components: [
    { id: 'shields', name: 'Shields', hp: 50, threshold: 5, notes: 'At 0 HP the hull takes every hit' },
    { id: 'engines', name: 'Engines', hp: 60, notes: 'At 0 HP the ship drifts' }
  ],
  stations: [
    { id: 'pilot', name: 'Pilot', notes: 'Flies the ship' },
    { id: 'gunner', name: 'Gunner', count: 2, notes: 'Fires the lasers' }
  ],
  weapons: [{ id: 'laser', name: 'Laser Battery', station: 'gunner', attackBonus: 7, damage: '4d10', damageType: 'Radiant', range: '1 mile', ammo: 6 }],
  resources: [
    { id: 'fuel', name: 'Fuel', max: 10, recharge: 'none' },
    { id: 'boost', name: 'Boost', max: 2, recharge: 'short' }
  ],
  actions: [{ name: 'Evasive Roll', desc: 'The pilot rolls `dice: 1d20 + 5` against the attacker; on a 15 or higher the attack misses.' }]
}
/** What the DM's app would send this player: the map without fogged tokens, and their view of the turn order. */
function playerSide(): { map: ReturnType<typeof mapForPlayer>; initiative: ReturnType<typeof sanitizeForPlayer> } {
  return { map: mapForPlayer(getBattleMap(), hiddenCombatantIds(getEncounter().combatants), { combatants: getEncounter().combatants, userId: 'u1' }), initiative: sanitizeForPlayer(getEncounter(), 'u1') }
}

// ?combat: a fight already set up — the sample character, an ogre, two goblins and the party's corvette.
if (new URLSearchParams(location.search).has('combat') || new URLSearchParams(location.search).has('playercombat')) {
  const ship = trackVehicle(vehicleDefSchema.parse(demoVehicle), { id: 'ship', name: 'The Wandering Star' })
  vehiclesDoc = { vehicles: [ship] }
  const mk = (id: string, name: string, kind: 'player' | 'monster' | 'vehicle', initiative: number, hp: number, ac: number, extra: Record<string, unknown> = {}) => ({ id, name, kind, initiative, maxHp: hp, currentHp: hp, ac, ...emptyCombatant(), ...extra })
  setEncounter({
    ...emptyInitiativeState(),
    combatants: [
      mk('pc', 'Elowen Brightwood', 'player', 19, 44, 14, { userId: 'u1', currentHp: 31, darkvision: 60 }),
      mk('ogre', 'Ogre', 'monster', 12, 68, 11, { monsterIndex: 'ogre' }),
      mk('gob1', 'Goblin', 'monster', 17, 7, 15, { monsterIndex: 'goblin' }),
      mk('gob2', 'Goblin', 'monster', 9, 7, 15, { monsterIndex: 'goblin', currentHp: 0 }),
      mk('ship', 'The Wandering Star', 'vehicle', 8, 200, 15, { vehicleId: 'ship', party: true, damageThreshold: 10 })
    ]
  })
}
if (new URLSearchParams(location.search).has('vehicles')) {
  setActivePacks([parsePack({ formatVersion: 1, id: 'demo', name: 'Demo', dependsOn: ['srd-5.2.1'], vehicles: [demoVehicle] }, [srdPack()])])
}

const sample: CharacterSheet = {
  ...emptyCharacterSheet(),
  id: 'preview',
  name: 'Elowen Brightwood',
  createdAt: '',
  updatedAt: '',
  race: 'Elf',
  raceLineageChoice: { raceId: 'elf', lineageName: 'High Elf', spellcastingAbility: 'wis' },
  background: 'Sage',
  alignment: 'Neutral Good',
  classes: [{ className: 'Ranger', level: 5, subclass: 'Hunter' }],
  experiencePoints: 6500,
  abilityScores: { str: 10, dex: 18, con: 14, int: 12, wis: 14, cha: 8 },
  skillProficiencies: { Stealth: 'proficient', Perception: 'proficient', Nature: 'proficient', Survival: 'expertise', Insight: 'proficient' },
  currentHp: 31,
  tempHp: 5,
  spellcastingAbility: 'wis',
  equipment: [
    { id: 'e1', name: 'Longbow', quantity: 1, weight: 2, notes: '', equipped: true, compendiumId: 'longbow' },
    { id: 'e2', name: 'Shortsword', quantity: 1, weight: 2, notes: '', equipped: true, compendiumId: 'shortsword' },
    { id: 'e3', name: 'Studded Leather', quantity: 1, weight: 13, notes: '', equipped: true, compendiumId: 'studded-leather' },
    { id: 'e4', name: 'Rations', quantity: 5, weight: 2, notes: '' }
  ],
  spells: [
    { id: 's1', name: 'Cure Wounds', level: 1, description: '', compendiumId: 'cure-wounds' },
    { id: 's2', name: 'Ensnaring Strike', level: 1, description: '', compendiumId: 'ensnaring-strike' },
    { id: 's3', name: 'Pass without Trace', level: 2, description: '', compendiumId: 'pass-without-trace' }
  ],
  currency: { cp: 7, sp: 30, ep: 0, gp: 12, pp: 0 }
}

function PlayerPreview(): JSX.Element {
  const [character, setCharacter] = useState<CharacterSheet>(sample)
  return <PlayerCombatView sessionId="s" character={character} onSaveCharacter={(patch) => setCharacter((c) => ({ ...c, ...patch }))} />
}

function Preview(): JSX.Element {
  const [character, setCharacter] = useState<CharacterSheet>(sample)
  return (
    <CharacterSheetEditor
      character={character}
      readOnly={new URLSearchParams(location.search).has('readonly')}
      onSave={(patch: Partial<CharacterSheetData> & { name?: string }) => setCharacter((c) => ({ ...c, ...patch, updatedAt: new Date().toISOString() }))}
    />
  )
}

initTheme()
applyFont(getStoredFontId())
applyFontScale(getStoredFontScale())
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {new URLSearchParams(location.search).has('combat') ? (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <DmCombat />
      </div>
    ) : new URLSearchParams(location.search).has('playercombat') ? (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <PlayerPreview />
      </div>
    ) : new URLSearchParams(location.search).has('vehicles') ? (
      <VehiclesPreview />
    ) : new URLSearchParams(location.search).has('statblock') ? (
      <StatblockPreview />
    ) : new URLSearchParams(location.search).has('calendar') ? (
      <div style={{ width: 360, height: '100vh', borderRight: '1px solid var(--border-subtle)' }}>
        <CalendarPanel sessionId={null} campaignId="camp" readOnly={false} />
      </div>
    ) : (
      <Preview />
    )}
    <RollAnimationOverlay />
  </React.StrictMode>
)
