import { describe, expect, it } from 'vitest'
import { vehicleDefSchema } from '@shared/content/schema'
import { canStand, emptyBattleMap, tokenH, tokenW, turnToken } from '@shared/battleMap'
import { applyCrit, arcOf, critTable, fireWeapon, firesInto, scaleDamage, sideStruck, squaresBetween, stationCrew, thresholdFor, weaponReach, weaponReady } from '@shared/shipCombat'
import { damageVehicle, trackVehicle } from '@shared/vehicles'

const def = vehicleDefSchema.parse({
  id: 'corvette',
  name: 'Corvette',
  hp: 60,
  ac: 14,
  damageThreshold: 1,
  thresholds: { fore: 5, flank: 3, aft: 1 },
  scale: 10,
  stations: [
    { id: 'helm', name: 'Helm', ability: 'dex', actions: [{ name: 'Evasive' }] },
    { id: 'gunnery', name: 'Gunnery', count: 2 }
  ],
  components: [
    { id: 'engines', name: 'Engines', hp: 1, crit: 1 },
    { id: 'weapons', name: 'Weapons', hp: 1, crit: 2 },
    { id: 'hull-plate', name: 'Hull plate', hp: 5 }
  ],
  weapons: [
    { id: 'rail', name: 'Light railgun', station: 'gunnery', damage: '2d10', range: '10 squares, fore or flank', arcs: ['fore', 'port', 'starboard'] },
    { id: 'heavy', name: 'Heavy railgun', station: 'gunnery', damage: '4d10', range: '20 squares', reach: 20, arcs: ['fore'], cooldown: 1 },
    { id: 'missile', name: 'Missiles', damage: '3d6', range: '120/480 ft.', ammo: 2 }
  ]
})
const w = (id: string) => def.weapons.find((x) => x.id === id)!

describe('arcs and range', () => {
  const ship = { x: 10, y: 10, size: 2, facing: 90 } // facing east, centre (11, 11)
  it('finds the arc a point is in, relative to where it faces', () => {
    expect(arcOf(ship, { x: 20, y: 11 })).toBe('fore')
    expect(arcOf(ship, { x: 0, y: 11 })).toBe('aft')
    expect(arcOf(ship, { x: 11, y: 20 })).toBe('starboard')
    expect(arcOf(ship, { x: 11, y: 0 })).toBe('port')
    expect(arcOf({ x: 0, y: 0, size: 1 }, { x: 5, y: 5 })).toBeNull()
  })
  it('lets a weapon fire only into its arcs (anywhere when it has none, or no facing)', () => {
    expect(firesInto(w('rail'), 'port')).toBe(true)
    expect(firesInto(w('rail'), 'aft')).toBe(false)
    expect(firesInto(w('missile'), 'aft')).toBe(true)
    expect(firesInto(w('heavy'), null)).toBe(true)
  })
  it('reads reach from the range text, or its own reach', () => {
    expect(weaponReach(w('rail'), 5)).toBe(10)
    expect(weaponReach(w('heavy'), 5)).toBe(20)
    expect(weaponReach(w('missile'), 5)).toBe(24)
  })
  it('counts squares between tokens edge to edge', () => {
    expect(squaresBetween({ x: 0, y: 0, size: 1 }, { x: 1, y: 0, size: 1 })).toBe(1)
    expect(squaresBetween({ x: 0, y: 0, size: 2 }, { x: 5, y: 3, size: 1 })).toBe(4)
  })
})

describe('hits on a ship', () => {
  const target = { x: 10, y: 10, size: 2, facing: 0 } // facing north
  it('strikes the side facing the shooter, with that side’s threshold', () => {
    expect(sideStruck(target, { x: 11, y: 0 })).toBe('fore')
    expect(sideStruck(target, { x: 11, y: 30 })).toBe('aft')
    expect(sideStruck(target, { x: 0, y: 11 })).toBe('flank')
    expect(thresholdFor(def, 'fore')).toBe(5)
    expect(thresholdFor(def, null)).toBe(1)
  })
  it('ignores a hit under the threshold it’s given', () => {
    const v = trackVehicle(def, { id: 'v' })
    expect(damageVehicle(v, 4, undefined, 5)).toBe(v)
    expect(damageVehicle(v, 4, undefined, 3).hp).toBe(56)
  })
  it('carries damage between ship and personal scale', () => {
    expect(scaleDamage(7, 10, 1)).toBe(70)
    expect(scaleDamage(25, 1, 10)).toBe(2)
    expect(scaleDamage(9, 10, 10)).toBe(9)
  })
})

describe('firing and cooling down', () => {
  it('waits out a cooldown, runs out of ammo, and stays offline until repaired', () => {
    let v = trackVehicle(def, { id: 'v' })
    v = fireWeapon(v, w('heavy'), 3)
    expect(weaponReady(v, w('heavy'), 4).ok).toBe(false)
    expect(weaponReady(v, w('heavy'), 5).ok).toBe(true)
    v = fireWeapon(fireWeapon(v, w('missile'), 3), w('missile'), 4)
    expect(weaponReady(v, w('missile'), 5)).toEqual({ ok: false, why: 'Out of ammo' })
    expect(weaponReady({ ...v, offline: ['rail'] }, w('rail'), 5).ok).toBe(false)
  })
})

describe('critical hits', () => {
  it('rolls on the numbered systems, knocking one out (and a weapon offline for the weapons system)', () => {
    expect(critTable(def).die).toBe(2)
    const v = trackVehicle(def, { id: 'v' })
    const engines = applyCrit(v, 1, 0)
    expect(engines.row?.id).toBe('engines')
    expect(engines.vehicle.components.engines).toBe(0)
    const weapons = applyCrit(v, 2, 0.99)
    expect(weapons.weapon?.id).toBe('missile')
    expect(weapons.vehicle.offline).toEqual(['missile'])
  })
})

describe('stations', () => {
  it('gives each crew member their bonus: a tier, or ability + proficiency', () => {
    const v = { ...trackVehicle(def, { id: 'v' }), crew: { helm: [{ name: 'Vale', tier: 'elite' as const }, { name: 'Elowen', userId: 'u1' }] } }
    const crew = stationCrew(v, 'helm', (m, ability) => (m.userId === 'u1' && ability === 'dex' ? 7 : undefined))
    expect(crew.map((x) => x.bonus)).toEqual([9, 7, 5])
    expect(crew[2].member.name).toBe('Crew')
  })
})

describe('long ships turning', () => {
  it('lies on its side facing east or west, turning about its middle', () => {
    const ship = { x: 10, y: 10, size: 2, h: 6, sized: true }
    const east = turnToken({ ...ship, facing: 0 }, 90)
    expect([tokenW(east), tokenH(east)]).toEqual([6, 2])
    expect([east.x, east.y]).toEqual([8, 12])
    const back = turnToken(east, 180)
    expect([tokenW(back), tokenH(back), back.x, back.y]).toEqual([2, 6, 10, 10])
    const map = { ...emptyBattleMap(), tokens: { ship: east } }
    expect(canStand(map, { x: 13, y: 14, size: 1 })).toBe(true)
    expect(canStand(map, { x: 13, y: 13, size: 1 })).toBe(false)
  })
})

describe('long ships on the diagonals', () => {
  it('stay upright facing north-west, north or north-east (and south-ish), and lie on their side east or west', () => {
    const ship = { x: 0, y: 0, size: 2, h: 6, sized: true }
    const lies = (facing: number) => tokenW({ ...ship, facing }) === 6
    expect([315, 0, 45, 135, 180, 225].map(lies)).toEqual([false, false, false, false, false, false])
    expect([90, 270, 60, 300].map(lies)).toEqual([true, true, true, true])
  })
})

describe('long ships keep lying the way they were through the diagonals', () => {
  it('stays on its side from east to north-east, and stands up only at north', () => {
    let ship = turnToken({ x: 10, y: 10, size: 2, h: 6, sized: true, facing: 0 }, 90)
    expect(tokenW(ship)).toBe(6)
    ship = turnToken(ship, 45)
    expect(tokenW(ship)).toBe(6)
    ship = turnToken(ship, 0)
    expect(tokenW(ship)).toBe(2)
    ship = turnToken(ship, 45)
    expect(tokenW(ship)).toBe(2)
    ship = turnToken(ship, 135)
    expect(tokenW(ship)).toBe(2)
    ship = turnToken(ship, 270)
    expect(tokenW(ship)).toBe(6)
    ship = turnToken(ship, 225)
    expect([tokenW(ship), ship.x, ship.y]).toEqual([6, 8, 12])
  })
})

describe('turning an odd-sized ship all the way round', () => {
  it('ends where it started', () => {
    const start = { x: 10, y: 10, size: 6, h: 7, sized: true, facing: 0 }
    let ship = start
    for (let turn = 0; turn < 3; turn++) for (let f = 45; f <= 360; f += 45) ship = turnToken(ship, f)
    expect([ship.x, ship.y, tokenW(ship), tokenH(ship)]).toEqual([10, 10, 6, 7])
    for (let f = 315; f >= 0; f -= 45) ship = turnToken(ship, f)
    expect([ship.x, ship.y]).toEqual([10, 10])
  })
})
