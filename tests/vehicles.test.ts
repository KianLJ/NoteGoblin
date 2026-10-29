import { describe, expect, it } from 'vitest'
import { vehicleDefSchema } from '@shared/content/schema'
import { ammoLeft, crewKey, damageVehicle, gunnerFor, weaponAttackBonus, repairVehicle, resourceLeft, restVehicle, stationsFor, trackVehicle, vehicleCondition, vehiclesForPlayer } from '@shared/vehicles'

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

describe('gunners', () => {
  const def = vehicleDefSchema.parse({
    id: 'corvette',
    name: 'Corvette',
    hp: 60,
    ac: 14,
    stations: [{ id: 'gunnery', name: 'Gunnery', count: 2 }],
    weapons: [
      { id: 'rail-1', name: 'Light railgun', station: 'gunnery', damage: '2d10' },
      { id: 'rail-2', name: 'Light railgun', station: 'gunnery', damage: '2d10' },
      { id: 'missile', name: 'Missile rack', station: 'gunnery', damage: '3d6' },
      { id: 'fixed', name: 'Point defence', attackBonus: 4, damage: '1d6' },
      { id: 'flare', name: 'Flare', saveDc: 13, saveAbility: 'con', damage: '' }
    ]
  })
  const ship = (crew: Array<{ name: string; userId?: string; tier?: 'green' | 'trained' | 'veteran' | 'elite' }>) => ({ ...trackVehicle(def, { id: 'v1' }), crew: { gunnery: crew } })
  const sheets = (m: { userId?: string }) => (m.userId === 'u1' ? 6 : undefined)

  it('rolls with an NPC tier, or a character’s Dex + proficiency', () => {
    const v = ship([{ name: 'Vale', tier: 'veteran' }, { name: 'Elowen', userId: 'u1' }])
    expect(weaponAttackBonus(v, 'rail-1', sheets)).toBe(7)
    expect(weaponAttackBonus(v, 'rail-2', sheets)).toBe(6)
    expect(gunnerFor(v, 'missile')?.name).toBe('Vale')
  })

  it('uses the one picked, a weapon’s own bonus, nothing for a save, and the hired crew at an empty station', () => {
    const v = { ...ship([{ name: 'Vale', tier: 'green' }, { name: 'Mox', tier: 'elite' }]), gunners: { 'rail-1': 'npc:Mox' } }
    expect(weaponAttackBonus(v, 'rail-1', sheets)).toBe(9)
    expect(crewKey(gunnerFor(v, 'rail-1')!)).toBe('npc:Mox')
    expect(weaponAttackBonus(v, 'fixed', sheets)).toBe(4)
    expect(weaponAttackBonus(v, 'flare', sheets)).toBeUndefined()
    expect(weaponAttackBonus(ship([]), 'rail-1', sheets)).toBe(5)
    expect(weaponAttackBonus({ ...ship([]), crewTier: 'elite' }, 'rail-1', sheets)).toBe(9)
    expect(gunnerFor(ship([]), 'rail-1')?.name).toBe('Crew')
    expect(weaponAttackBonus(ship([{ name: 'Old hand' }]), 'rail-1', sheets)).toBe(5)
  })
})

describe('who is where', () => {
  it('puts a party member at one station at a time, or takes them off', async () => {
    const { placeCrew, trackVehicle } = await import('@shared/vehicles')
    const def = vehicleDefSchema.parse({ id: 's', name: 'S', hp: 10, stations: [{ id: 'helm', name: 'Helm' }, { id: 'gunnery', name: 'Gunnery' }] })
    const elowen = { name: 'Elowen', userId: 'u1', characterId: 'c1' }
    let v = placeCrew(trackVehicle(def, { id: 'v' }), elowen, 'helm')
    v = placeCrew(v, elowen, 'gunnery')
    expect(v.crew.helm).toEqual([])
    expect(v.crew.gunnery).toEqual([elowen])
    expect(placeCrew(v, elowen, null).crew.gunnery).toEqual([])
  })
})

describe('component hit points', () => {
  it('are a quarter of the hull, rounded up', async () => {
    const { componentMaxHp, componentHp, trackVehicle } = await import('@shared/vehicles')
    const def = vehicleDefSchema.parse({ id: 'd', name: 'D', hp: 61, components: [{ id: 'engines', name: 'Engines' }, { id: 'sails', name: 'Sails', hp: 7 }] })
    expect(componentMaxHp(def, def.components[0])).toBe(16)
    expect(componentMaxHp(def, def.components[1])).toBe(16)
    expect(componentHp(trackVehicle(def, { id: 'v' }), 'engines')).toBe(16)
  })

  it('follow a changed template: full stays full, hurt keeps its hit points', async () => {
    const { trackVehicle, updateFromTemplate } = await import('@shared/vehicles')
    const old = vehicleDefSchema.parse({ id: 'd', name: 'D', hp: 60, components: [{ id: 'engines', name: 'Engines', hp: 1 }, { id: 'bridge', name: 'Bridge', hp: 1 }] })
    const v = { ...trackVehicle(old, { id: 'v' }), def: old, hp: 40, components: { engines: 1, bridge: 0 } }
    const next = updateFromTemplate(v, vehicleDefSchema.parse({ ...old, components: [{ id: 'engines', name: 'Engines' }, { id: 'bridge', name: 'Bridge' }] }))
    expect(next.components).toEqual({ engines: 15, bridge: 0 })
    expect(next.hp).toBe(40)
  })
})

describe('following a template', () => {
  it('updates a vehicle when its pack entry changed, once', async () => {
    const { campaignVehiclesSchema, trackVehicle, withTemplates } = await import('@shared/vehicles')
    const old = vehicleDefSchema.parse({ id: 'd', name: 'D', hp: 60, components: [{ id: 'engines', name: 'Engines', hp: 1 }] })
    const doc = { vehicles: [trackVehicle(old, { id: 'v', templateId: 'p:d' })] }
    // The pack's entry as a pack holds it: no defaults filled in.
    const raw = { id: 'd', name: 'D', hp: 60, components: [{ id: 'engines', name: 'Engines' }] } as never
    const once = withTemplates(doc, () => raw)
    expect(once.vehicles[0].components.engines).toBe(15)
    // Saved and loaded again: nothing more to do.
    const reloaded = campaignVehiclesSchema.parse(JSON.parse(JSON.stringify(once)))
    expect(withTemplates(reloaded, () => raw)).toBe(reloaded)
    // Unchanged template: the same document.
    expect(withTemplates(doc, () => old)).toBe(doc)
  })
})

describe('a ship saved before components were a quarter of the hull', () => {
  it('gets them, even when its pack still has the old numbers', async () => {
    const { trackedVehicleSchema, withTemplates } = await import('@shared/vehicles')
    const oldPack = vehicleDefSchema.parse({ id: 'dreadnought', name: 'Dreadnought', hp: 800, components: [{ id: 'engines', name: 'Engines', hp: 1 }, { id: 'weapons', name: 'Weapons', hp: 1 }] })
    const saved = trackedVehicleSchema.parse({ id: 'v', templateId: 'red-rising:dreadnought', def: oldPack, hp: 800, components: { engines: 1, weapons: 0 } })
    const doc = { vehicles: [saved] }
    const fixed = withTemplates(doc, () => oldPack)
    expect(fixed.vehicles[0].components).toEqual({ engines: 200, weapons: 0 })
    expect(withTemplates(fixed, () => oldPack)).toBe(fixed)
  })
})

describe('a gun with a bonus of its own', () => {
  it('fires at it, unless the crew is set to fire it anyway', async () => {
    const { gunnerFor, trackVehicle, weaponAttackBonus } = await import('@shared/vehicles')
    const def = vehicleDefSchema.parse({ id: 'd', name: 'D', hp: 800, stations: [{ id: 'gunnery', name: 'Gunnery' }], weapons: [{ id: 'heavy-1', name: 'Heavy railgun', station: 'gunnery', damage: '4d10' }, { id: 'heavy-2', name: 'Heavy railgun', station: 'gunnery', attackBonus: 5, damage: '4d10' }] })
    const v = { ...trackVehicle(def, { id: 'v' }), crewTier: 'veteran' as const }
    expect(weaponAttackBonus(v, 'heavy-2', () => undefined)).toBe(5)
    const crewed = { ...v, crewFires: ['heavy-2'] }
    expect(weaponAttackBonus(crewed, 'heavy-2', () => undefined)).toBe(7)
    expect(gunnerFor(crewed, 'heavy-2')?.name).toBe('Crew')
  })
})
