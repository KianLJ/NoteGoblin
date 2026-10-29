// Vehicles a campaign is tracking: copies of a pack's vehicle templates (see
// vehicleDefSchema in shared/content/schema.ts) with their own state — hull
// and component hit points, fuel and other resources, ammo, the crew at each
// station, cargo and notes. One document per campaign, DM-written and
// member-read like the calendar; enemy vehicles the DM hasn't revealed are
// stripped before players see the list.
import { z } from 'zod'
import { vehicleDefSchema, type VehicleDef } from './content/schema'

export const trackedVehicleSchema = z.object({
  id: z.string().min(1),
  /** Its own name ("The Wandering Star"); the template's is def.name. */
  name: z.string().default(''),
  /** The pack entry it was made from ("<packId>:<id>"), for "update from template". Absent for one made from scratch. */
  templateId: z.string().optional(),
  /** A copy of the template, so it keeps working if the pack is turned off, and the DM can tweak this one alone. */
  def: vehicleDefSchema,
  hp: z.number().int(),
  tempHp: z.number().int().min(0).default(0),
  /** Component id → current hit points. */
  components: z.record(z.number().int()).default({}),
  /** Resource id → amount used. */
  resourceUsed: z.record(z.number().int().min(0)).default({}),
  /** Weapon id → shots used. */
  ammoUsed: z.record(z.number().int().min(0)).default({}),
  /** Station id → who's there: a character's id when it's a player character, else a name and how good they are (an NPC). */
  crew: z
    .record(z.array(z.object({ name: z.string().min(1), characterId: z.string().optional(), userId: z.string().optional(), tier: z.enum(['green', 'trained', 'veteran', 'elite']).optional() })))
    .default({}),
  /** How good its hired crew is: whoever works a station (or fires a gun) no player character is assigned to rolls this tier's bonus. */
  crewTier: z.enum(['green', 'trained', 'veteran', 'elite']).default('trained'),
  /** Weapon id → the round it last fired (for a weapon that has to cool down). */
  fired: z.record(z.number().int()).default({}),
  /** Weapons with an attack bonus of their own that the crew fires anyway (the DM set the fixed bonus aside). */
  crewFires: z.array(z.string()).default([]),
  /** Weapons knocked offline (a critical hit), until repaired. */
  offline: z.array(z.string()).default([]),
  /** Weapon id → who fires it (a crewKey), when not the first free hand at its station. */
  gunners: z.record(z.string()).default({}),
  conditions: z.array(z.string()).default([]),
  cargo: z.array(z.object({ name: z.string().min(1), quantity: z.number().int().min(0).default(1) })).default([]),
  notes: z.string().default(''),
  /** The party's own vehicle: players see its exact hit points (an enemy's show only how hurt it looks). */
  party: z.boolean().default(true),
  /** Hidden from players until the DM reveals it (an ambush, a ship still out of sight). */
  hidden: z.boolean().default(false)
})
export type TrackedVehicle = z.infer<typeof trackedVehicleSchema>
export type CrewMember = TrackedVehicle['crew'][string][number]

export const campaignVehiclesSchema = z.object({ vehicles: z.array(trackedVehicleSchema).default([]) })
export type CampaignVehicles = z.infer<typeof campaignVehiclesSchema>

/** A new tracked vehicle from a template: everything at full. */
export function trackVehicle(template: VehicleDef, opts: { id: string; templateId?: string; name?: string; party?: boolean }): TrackedVehicle {
  const def = withoutComponentHp(template)
  return trackedVehicleSchema.parse({
    id: opts.id,
    name: opts.name ?? def.name,
    templateId: opts.templateId,
    def,
    hp: def.hp,
    components: Object.fromEntries(def.components.map((c) => [c.id, componentMaxHp(def, c)])),
    party: opts.party ?? true
  })
}

/** The vehicle's own name, else its template's. */
export function vehicleName(v: TrackedVehicle): string {
  return v.name.trim() || v.def.name
}

/**
 * Damage to the hull (componentId undefined) or one component. A hit below
 * the threshold does nothing (vehicle rules: a damage threshold ignores any
 * single hit under it); temporary hit points go first on the hull. Returns
 * the vehicle unchanged when nothing happens. `threshold`: the hull's
 * threshold for this hit, when it isn't the usual one (the side it struck).
 */
export function damageVehicle(v: TrackedVehicle, amount: number, componentId?: string, threshold = v.def.damageThreshold): TrackedVehicle {
  if (amount <= 0) return v
  if (componentId) {
    const c = v.def.components.find((x) => x.id === componentId)
    if (!c || amount < c.threshold) return v
    const now = v.components[componentId] ?? componentMaxHp(v.def, c)
    return { ...v, components: { ...v.components, [componentId]: Math.max(0, now - amount) } }
  }
  if (amount < threshold) return v
  const fromTemp = Math.min(v.tempHp, amount)
  return { ...v, tempHp: v.tempHp - fromTemp, hp: Math.max(0, v.hp - (amount - fromTemp)) }
}

/** Repairs (or heals a mount) — up to full, never past it. */
export function repairVehicle(v: TrackedVehicle, amount: number, componentId?: string): TrackedVehicle {
  if (amount <= 0) return v
  if (componentId) {
    const c = v.def.components.find((x) => x.id === componentId)
    if (!c) return v
    const now = v.components[componentId] ?? componentMaxHp(v.def, c)
    return { ...v, components: { ...v.components, [componentId]: Math.min(componentMaxHp(v.def, c), now + amount) } }
  }
  return { ...v, hp: Math.min(v.def.hp, v.hp + amount) }
}

/** A component's full hit points: a quarter of the vehicle's, rounded up. */
export function componentMaxHp(def: Pick<VehicleDef, 'hp'>, _c?: unknown): number {
  return Math.ceil(def.hp / 4)
}

/** What a component's full hit points were under a statblock from before they were always a quarter of the hull (its own number). */
const fullBefore = (def: Pick<VehicleDef, 'hp'>, c: Pick<VehicleDef['components'][number], 'hp'>): number => c.hp ?? componentMaxHp(def)

/** A statblock without per-component hit points (they're a quarter of the hull). */
function withoutComponentHp(def: VehicleDef): VehicleDef {
  return def.components.some((c) => c.hp !== undefined) ? { ...def, components: def.components.map(({ hp: _hp, ...c }) => c) } : def
}

export function componentHp(v: TrackedVehicle, componentId: string): number {
  const c = v.def.components.find((x) => x.id === componentId)
  return v.components[componentId] ?? (c ? componentMaxHp(v.def, c) : 0)
}

/** The same JSON whatever order its keys are in (to tell whether a template really changed). */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

/** Whether a vehicle's template (its pack entry) has changed since it was copied. */
export function templateChanged(v: TrackedVehicle, def: VehicleDef): boolean {
  return stableJson(def) !== stableJson(v.def)
}

/**
 * Every vehicle brought up to date: one made from a pack entry follows it
 * (the pack was updated: a homebrew tweak), and one saved when components
 * had hit points of their own gets a quarter of its hull for each (a
 * component that was at full stays at full). The same document when nothing
 * changed.
 */
export function withTemplates(doc: CampaignVehicles, templateOf: (templateId: string) => VehicleDef | undefined): CampaignVehicles {
  let changed = false
  const vehicles = doc.vehicles.map((v) => {
    const raw = v.templateId ? templateOf(v.templateId) : undefined
    // Read the way a saved vehicle's copy is (defaults filled in), so only a real change counts.
    const parsed = raw ? vehicleDefSchema.safeParse(raw) : null
    const def = withoutComponentHp(parsed?.success ? parsed.data : v.def)
    if (!templateChanged(v, def)) return v
    changed = true
    return updateFromTemplate(v, def)
  })
  return changed ? { vehicles } : doc
}

/**
 * A tracked vehicle brought up to date with its template (the pack entry it
 * was made from, changed since): the new statblock, keeping its damage — a
 * hull or component that was at full stays at (the new) full; one that was
 * hurt keeps its hit points, up to the new most.
 */
export function updateFromTemplate(v: TrackedVehicle, def: VehicleDef): TrackedVehicle {
  const hp = v.hp >= v.def.hp ? def.hp : Math.min(def.hp, v.hp)
  const components = Object.fromEntries(
    def.components.map((c) => {
      const was = v.def.components.find((x) => x.id === c.id)
      const now = v.components[c.id]
      const max = componentMaxHp(def, c)
      return [c.id, !was || now === undefined || now >= fullBefore(v.def, was) ? max : Math.min(max, now)]
    })
  )
  return { ...v, def, hp, components }
}

export function resourceLeft(v: TrackedVehicle, resourceId: string): number {
  const r = v.def.resources.find((x) => x.id === resourceId)
  return r ? Math.max(0, r.max - (v.resourceUsed[resourceId] ?? 0)) : 0
}

/** Ammo left for a weapon — null when it has no ammo limit. */
export function ammoLeft(v: TrackedVehicle, weaponId: string): number | null {
  const w = v.def.weapons.find((x) => x.id === weaponId)
  if (!w || w.ammo === undefined) return null
  return Math.max(0, w.ammo - (v.ammoUsed[weaponId] ?? 0))
}

/** Resources that come back on this rest (a short rest brings back short-rest ones; a long rest, dawn and long and short ones). */
export function restVehicle(v: TrackedVehicle, rest: 'short' | 'long'): TrackedVehicle {
  const back = (r: VehicleDef['resources'][number]): boolean => r.recharge === 'short' || (rest === 'long' && (r.recharge === 'long' || r.recharge === 'dawn'))
  const resourceUsed = Object.fromEntries(Object.entries(v.resourceUsed).filter(([id]) => !v.def.resources.some((r) => r.id === id && back(r))))
  return { ...v, resourceUsed }
}

/** The stations a player's character crews on this vehicle (by character id, falling back to the player's user id). */
export function stationsFor(v: TrackedVehicle, who: { characterIds: string[]; userId?: string | null }): string[] {
  return Object.entries(v.crew)
    .filter(([, people]) => people.some((p) => (p.characterId && who.characterIds.includes(p.characterId)) || (!!who.userId && p.userId === who.userId)))
    .map(([station]) => station)
}

/** What a player sees: hidden vehicles left out entirely. Everything else is shared — the panel shows an enemy's hit points only as how hurt it looks. */
export function vehiclesForPlayer(doc: CampaignVehicles): CampaignVehicles {
  return { vehicles: doc.vehicles.filter((v) => !v.hidden) }
}

/** How good an NPC crew member is, and the flat bonus they roll with (in place of an ability modifier and proficiency). */
export const CREW_TIERS = [
  { id: 'green', name: 'Green', bonus: 3 },
  { id: 'trained', name: 'Trained', bonus: 5 },
  { id: 'veteran', name: 'Veteran', bonus: 7 },
  { id: 'elite', name: 'Elite', bonus: 9 }
] as const
export type CrewTier = (typeof CREW_TIERS)[number]['id']

/** A crew member's tier (an NPC with none set counts as Trained); null for a player character. */
export function crewTier(m: CrewMember): (typeof CREW_TIERS)[number] | null {
  if (m.userId || m.characterId) return null
  return CREW_TIERS.find((t) => t.id === (m.tier ?? 'trained'))!
}

/** A weapon's own attack bonus, unless the DM has its crew fire it instead; undefined: whoever fires it rolls their bonus. */
export function fixedBonus(v: Pick<TrackedVehicle, 'crewFires'>, w: Pick<VehicleDef['weapons'][number], 'id' | 'attackBonus'>): number | undefined {
  return v.crewFires?.includes(w.id) ? undefined : w.attackBonus
}

/** Who someone at a station is, the same from one save to the next. */
export const crewKey = (m: CrewMember): string => (m.userId ? `user:${m.userId}` : m.characterId ? `char:${m.characterId}` : `npc:${m.name}`)

/** The ship's hired crew, as one stand-in: they work any station and fire any gun nobody else is assigned to, at the ship's crew tier. */
export function shipCrew(v: Pick<TrackedVehicle, 'crewTier'>): CrewMember {
  return { name: 'Crew', tier: v.crewTier ?? 'trained' }
}

/** Who's been put at a station (player characters, and any NPCs named there before the ship had one crew tier). */
export const peopleAt = (v: TrackedVehicle, stationId: string | undefined): CrewMember[] => (stationId ? (v.crew[stationId] ?? []) : Object.values(v.crew).flat())

/** Who can fire a weapon: whoever's at its station (anyone aboard, for a weapon with no station), then the hired crew. */
export function weaponCrew(v: TrackedVehicle, weaponId: string): CrewMember[] {
  const w = v.def.weapons.find((x) => x.id === weaponId)
  if (!w) return []
  return [...peopleAt(v, w.station), shipCrew(v)]
}

/**
 * Who fires a weapon: the one picked for it; else the people at its station
 * shared out in order (two gunners, three guns: the first, the second, the
 * first); else the hired crew.
 */
export function gunnerFor(v: TrackedVehicle, weaponId: string): CrewMember | null {
  const w = v.def.weapons.find((x) => x.id === weaponId)
  if (!w) return null
  const picked = v.gunners[weaponId]
  const chosen = picked ? weaponCrew(v, weaponId).find((m) => crewKey(m) === picked) : undefined
  if (chosen) return chosen
  const people = peopleAt(v, w.station)
  if (!people.length) return shipCrew(v)
  const same = v.def.weapons.filter((x) => (x.station ?? '') === (w.station ?? ''))
  return people[same.indexOf(w) % people.length]
}

/** Puts a party member at a station (or takes them off the ship, with null): one place each. */
export function placeCrew(v: TrackedVehicle, member: CrewMember, stationId: string | null): TrackedVehicle {
  const key = crewKey(member)
  const crew = Object.fromEntries(Object.entries(v.crew).map(([id, people]) => [id, people.filter((m) => crewKey(m) !== key)]))
  if (stationId) crew[stationId] = [...(crew[stationId] ?? []), member]
  return { ...v, crew }
}

/**
 * A weapon's attack bonus: its own, if it has one; else its gunner's — an
 * NPC's tier bonus, or a player character's Dexterity modifier plus
 * proficiency bonus (`characterBonus`, when their sheet is to hand).
 * Undefined: a save weapon, or nobody to fire it.
 */
export function weaponAttackBonus(v: TrackedVehicle, weaponId: string, characterBonus: (m: CrewMember) => number | undefined): number | undefined {
  const w = v.def.weapons.find((x) => x.id === weaponId)
  if (!w) return undefined
  const own = fixedBonus(v, w)
  if (own !== undefined) return own
  if (w.saveDc !== undefined) return undefined
  const m = gunnerFor(v, weaponId)
  if (!m) return undefined
  return crewTier(m)?.bonus ?? characterBonus(m)
}

/** "Unhurt" … "Wrecked" — how damaged an enemy vehicle looks to players who can't see its numbers. */
export function vehicleCondition(hp: number, max: number): string {
  if (hp <= 0) return 'Wrecked'
  const pct = hp / Math.max(1, max)
  if (pct >= 1) return 'Unhurt'
  if (pct > 0.5) return 'Damaged'
  if (pct > 0.25) return 'Badly damaged'
  return 'Barely holding together'
}
