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
  /** Station id → who's there: a character's id when it's a player character, else just a name. */
  crew: z.record(z.array(z.object({ name: z.string().min(1), characterId: z.string().optional(), userId: z.string().optional() }))).default({}),
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
export function trackVehicle(def: VehicleDef, opts: { id: string; templateId?: string; name?: string; party?: boolean }): TrackedVehicle {
  return trackedVehicleSchema.parse({
    id: opts.id,
    name: opts.name ?? def.name,
    templateId: opts.templateId,
    def,
    hp: def.hp,
    components: Object.fromEntries(def.components.map((c) => [c.id, c.hp])),
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
 * the vehicle unchanged when nothing happens.
 */
export function damageVehicle(v: TrackedVehicle, amount: number, componentId?: string): TrackedVehicle {
  if (amount <= 0) return v
  if (componentId) {
    const c = v.def.components.find((x) => x.id === componentId)
    if (!c || amount < c.threshold) return v
    const now = v.components[componentId] ?? c.hp
    return { ...v, components: { ...v.components, [componentId]: Math.max(0, now - amount) } }
  }
  if (amount < v.def.damageThreshold) return v
  const fromTemp = Math.min(v.tempHp, amount)
  return { ...v, tempHp: v.tempHp - fromTemp, hp: Math.max(0, v.hp - (amount - fromTemp)) }
}

/** Repairs (or heals a mount) — up to full, never past it. */
export function repairVehicle(v: TrackedVehicle, amount: number, componentId?: string): TrackedVehicle {
  if (amount <= 0) return v
  if (componentId) {
    const c = v.def.components.find((x) => x.id === componentId)
    if (!c) return v
    const now = v.components[componentId] ?? c.hp
    return { ...v, components: { ...v.components, [componentId]: Math.min(c.hp, now + amount) } }
  }
  return { ...v, hp: Math.min(v.def.hp, v.hp + amount) }
}

export function componentHp(v: TrackedVehicle, componentId: string): number {
  const c = v.def.components.find((x) => x.id === componentId)
  return v.components[componentId] ?? c?.hp ?? 0
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

/** "Unhurt" … "Wrecked" — how damaged an enemy vehicle looks to players who can't see its numbers. */
export function vehicleCondition(hp: number, max: number): string {
  if (hp <= 0) return 'Wrecked'
  const pct = hp / Math.max(1, max)
  if (pct >= 1) return 'Unhurt'
  if (pct > 0.5) return 'Damaged'
  if (pct > 0.25) return 'Badly damaged'
  return 'Barely holding together'
}
