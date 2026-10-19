import { describe, expect, it } from 'vitest'
import { vehicleDefSchema } from '@shared/content/schema'
import { ammoLeft, damageVehicle, repairVehicle, resourceLeft, restVehicle, stationsFor, trackVehicle, vehicleCondition, vehiclesForPlayer } from '@shared/vehicles'

const corvette = vehicleDefSchema.parse({
  id: 'corvette',
  name: 'Corvette',
  category: 'Space',
  size: 'Gargantuan',
  speeds: [{ mode: 'fly', value: 'Warp 3' }],
  ac: 15,
  hp: 200,
  damageThreshold: 10,
  crew: 4,
  components: [{ id: 'shields', name: 'Shields', hp: 50, threshold: 5 }],
  stations: [{ id: 'pilot', name: 'Pilot' }, { id: 'gunner', name: 'Gunner', count: 2 }],
  weapons: [{ id: 'laser', name: 'Laser Battery', station: 'gunner', attackBonus: 7, damage: '4d10', damageType: 'Radiant', range: '1 mile', ammo: 6 }],
  resources: [
    { id: 'fuel', name: 'Fuel', max: 10, recharge: 'none' },
    { id: 'boost', name: 'Boost', max: 2, recharge: 'short' }
  ]
})

describe('tracked vehicles', () => {
  it('starts at full from its template', () => {
    const v = trackVehicle(corvette, { id: 'v1', templateId: 'pack:corvette', name: 'The Wandering Star' })
    expect([v.hp, v.components.shields, resourceLeft(v, 'fuel'), ammoLeft(v, 'laser')]).toEqual([200, 50, 10, 6])
  })

  it('ignores a hit under the damage threshold, and takes temp HP first', () => {
    const v = trackVehicle(corvette, { id: 'v1' })
    expect(damageVehicle(v, 9).hp).toBe(200)
    expect(damageVehicle({ ...v, tempHp: 5 }, 12)).toMatchObject({ hp: 193, tempHp: 0 })
    expect(damageVehicle(v, 4, 'shields').components.shields).toBe(50)
    expect(damageVehicle(v, 60, 'shields').components.shields).toBe(0)
  })

  it('repairs up to full and no further', () => {
    const v = damageVehicle(trackVehicle(corvette, { id: 'v1' }), 30)
    expect(repairVehicle(v, 100).hp).toBe(200)
  })

  it('brings back only the resources that recharge on that rest', () => {
    const v = { ...trackVehicle(corvette, { id: 'v1' }), resourceUsed: { fuel: 4, boost: 2 } }
    expect(restVehicle(v, 'short').resourceUsed).toEqual({ fuel: 4 })
  })

  it('knows which stations a character crews, and hides hidden vehicles from players', () => {
    const v = { ...trackVehicle(corvette, { id: 'v1' }), crew: { gunner: [{ name: 'Goren', characterId: 'c1' }], pilot: [{ name: 'Lio', userId: 'u2' }] } }
    expect(stationsFor(v, { characterIds: ['c1'] })).toEqual(['gunner'])
    expect(stationsFor(v, { characterIds: [], userId: 'u2' })).toEqual(['pilot'])
    const hidden = { ...trackVehicle(corvette, { id: 'v2' }), hidden: true }
    expect(vehiclesForPlayer({ vehicles: [v, hidden] }).vehicles.map((x) => x.id)).toEqual(['v1'])
  })

  it('describes damage without numbers', () => {
    expect([200, 150, 60, 20, 0].map((hp) => vehicleCondition(hp, 200))).toEqual(['Unhurt', 'Damaged', 'Badly damaged', 'Barely holding together', 'Wrecked'])
  })
})

describe('vehicles in the Workshop', () => {
  it('saves from the guided form into a valid pack and reads back unchanged', async () => {
    const { answersToEntry, blankAnswers, entryToAnswers, guidedKindFor } = await import('@shared/content/guided')
    const { validatePack } = await import('@shared/content/validate')
    const { srdPack } = await import('@shared/content/srd')
    const a = { ...blankAnswers('vehicle', 'skiff'), name: 'Skiff' } as Extract<ReturnType<typeof blankAnswers>, { kind: 'vehicle' }>
    const withWeapon = { ...a, entry: { ...a.entry, stations: [{ id: 'gunner', name: 'Gunner' }], weapons: [{ id: 'harpoon', name: 'Harpoon', station: 'gunner', attackBonus: 5, damage: '2d8', damageType: 'Piercing' }] } }
    const entry = answersToEntry(withWeapon)
    const result = validatePack({ formatVersion: 1, id: 'test', name: 'Test', dependsOn: ['srd-5.2.1'], vehicles: [entry] }, [srdPack()])
    expect(result.ok).toBe(true)
    expect(guidedKindFor('vehicles', entry)).toBe('vehicle')
    expect(answersToEntry(entryToAnswers('vehicle', entry))).toEqual(entry)
  })
})

describe('vehicles in initiative', () => {
  it('shows players the party ship’s real hit points, and an enemy ship only as an injury level', async () => {
    const { emptyCombatant, emptyInitiativeState, sanitizeForPlayer } = await import('@shared/encounter')
    const ship = (id: string, party: boolean) => ({ id, name: id, kind: 'vehicle' as const, initiative: 10, maxHp: 200, currentHp: 120, ac: 15, vehicleId: id, party, ...emptyCombatant() })
    const seen = sanitizeForPlayer({ ...emptyInitiativeState(), combatants: [ship('ours', true), ship('theirs', false)] }, 'u1').combatants
    const ours = seen.find((c) => c.id === 'ours')!
    const theirs = seen.find((c) => c.id === 'theirs')!
    expect([ours.currentHp, ours.maxHp, ours.initiative]).toEqual([120, 200, 10])
    expect([theirs.currentHp, theirs.maxHp, theirs.initiative]).toEqual([null, null, null])
  })
})
