// Vehicles fighting on the battle map: which arc a target is in, how far a
// weapon reaches, which side a shot strikes (and so which damage threshold
// counts), damage between ship and personal scale, weapons cooling down,
// and the critical-hit table. Pure rules — the Combat tab and the Vehicles
// tab do the rolling.
import { tokenCentre, tokenH, tokenW, type MapToken, type Pt } from './battleMap'
import type { VehicleArc, VehicleDef } from './content/schema'
import { crewTier, type CrewMember, type TrackedVehicle } from './vehicles'

type Weapon = VehicleDef['weapons'][number]

/** Degrees clockwise from the top of the map, from one point toward another. */
export function bearing(from: Pt, to: Pt): number {
  return ((Math.atan2(to.x - from.x, -(to.y - from.y)) * 180) / Math.PI + 360) % 360
}

/** An angle turned to -180…180. */
const relative = (deg: number): number => ((((deg + 180) % 360) + 360) % 360) - 180

/** Which arc of a token (facing set) a point is in; null when it doesn't face anywhere. Exactly on a corner counts as fore or aft. */
export function arcOf(t: MapToken, p: Pt): VehicleArc | null {
  if (t.facing === undefined) return null
  const r = relative(bearing(tokenCentre(t), p) - t.facing)
  if (Math.abs(r) <= 45) return 'fore'
  if (Math.abs(r) >= 135) return 'aft'
  return r > 0 ? 'starboard' : 'port'
}

export const ARC_NAMES: Record<VehicleArc, string> = { fore: 'Fore', aft: 'Aft', port: 'Port', starboard: 'Starboard' }

/** Whether a weapon can fire into an arc (one with no arcs set fires anywhere, as does a vehicle with no facing). */
export function firesInto(w: Weapon, arc: VehicleArc | null): boolean {
  return !w.arcs?.length || arc === null || w.arcs.includes(arc)
}

/** How far a weapon reaches on the map, in squares: its own reach, else read from its range ("20 squares", "120 ft.", "1 mile", "30/120 ft."); null: no limit known. */
export function weaponReach(w: Weapon, feetPerCell: number): number | null {
  if (w.reach !== undefined) return w.reach
  const text = w.range.toLowerCase()
  const squares = /(\d+(?:\.\d+)?)\s*(?:squares?|hexes|hex|sq\b)/.exec(text)
  if (squares) return Number(squares[1])
  const feet = /(\d+(?:\.\d+)?)(?:\s*\/\s*\d+)?\s*(?:ft|feet|foot)/.exec(text)
  if (feet) return Number(feet[1]) / feetPerCell
  const miles = /(\d+(?:\.\d+)?)\s*miles?/.exec(text)
  if (miles) return (Number(miles[1]) * 5280) / feetPerCell
  return null
}

/** Squares between two tokens, the 5e way (diagonals count as one), edge to edge: 1 when they're next to each other. */
export function squaresBetween(a: MapToken, b: MapToken): number {
  const gap = (a0: number, a1: number, b0: number, b1: number): number => Math.max(0, b0 - a1, a0 - b1)
  return Math.max(gap(a.x, a.x + tokenW(a), b.x, b.x + tokenW(b)), gap(a.y, a.y + tokenH(a), b.y, b.y + tokenH(b))) + 1
}

/** Which side of a target a shot from `from` strikes: its bow, a flank, or its stern; null when it doesn't face anywhere. */
export function sideStruck(target: MapToken, from: Pt): 'fore' | 'flank' | 'aft' | null {
  const arc = arcOf(target, from)
  return arc === null ? null : arc === 'port' || arc === 'starboard' ? 'flank' : arc
}

/** The damage threshold that counts for a hit on this side (the vehicle's own when the side isn't known or it has one threshold). */
export function thresholdFor(def: VehicleDef, side: 'fore' | 'flank' | 'aft' | null): number {
  return side && def.thresholds ? def.thresholds[side] : def.damageThreshold
}

/**
 * Damage carried from one scale to another: a ship's (scale 10) weapon hits a
 * person for ten times as much; a person's hit on a ship does a tenth
 * (rounded down). Scale 1 is a person's.
 */
export function scaleDamage(amount: number, fromScale = 1, toScale = 1): number {
  return Math.floor((amount * fromScale) / toScale)
}

/** Whether a weapon can fire this round: not knocked offline, not cooling down, not out of ammo. Why not, if it can't. */
export function weaponReady(v: TrackedVehicle, w: Weapon, round: number | null): { ok: true } | { ok: false; why: string } {
  if (v.offline.includes(w.id)) return { ok: false, why: 'Offline (a critical hit) until it’s repaired' }
  if (w.ammo !== undefined && (v.ammoUsed[w.id] ?? 0) >= w.ammo) return { ok: false, why: 'Out of ammo' }
  const last = v.fired[w.id]
  if (w.cooldown && round !== null && last !== undefined && last <= round && round - last <= w.cooldown) {
    const next = last + w.cooldown + 1
    return { ok: false, why: `Cooling down: fires again in round ${next}` }
  }
  return { ok: true }
}

/** A weapon fired this round: a shot spent, and when it fired (for its cooldown). */
export function fireWeapon(v: TrackedVehicle, w: Weapon, round: number | null): TrackedVehicle {
  return {
    ...v,
    ...(w.ammo !== undefined ? { ammoUsed: { ...v.ammoUsed, [w.id]: Math.min(w.ammo, (v.ammoUsed[w.id] ?? 0) + 1) } } : {}),
    ...(w.cooldown && round !== null ? { fired: { ...v.fired, [w.id]: round } } : {})
  }
}

/** The vehicle's critical-hit table: its components with a number, in order, and the die to roll (the highest number). */
export function critTable(def: VehicleDef): { die: number; rows: Array<VehicleDef['components'][number] & { crit: number }> } {
  const rows = def.components.filter((c): c is VehicleDef['components'][number] & { crit: number } => c.crit !== undefined).sort((a, b) => a.crit - b.crit)
  return { die: rows.length ? Math.max(...rows.map((r) => r.crit)) : 0, rows }
}

/**
 * A critical hit landing on the system that came up: it's knocked out (0 hit
 * points). If it's the weapons system, one of the vehicle's weapons (picked
 * with `pick`, 0 ≤ pick < 1) goes offline too. The table row, for its notes.
 */
export function applyCrit(v: TrackedVehicle, roll: number, pick: number): { vehicle: TrackedVehicle; row: VehicleDef['components'][number] | null; weapon: Weapon | null } {
  const row = critTable(v.def).rows.find((r) => r.crit === roll) ?? null
  if (!row) return { vehicle: v, row: null, weapon: null }
  let next: TrackedVehicle = { ...v, components: { ...v.components, [row.id]: 0 } }
  let weapon: Weapon | null = null
  if (/weapon/i.test(row.id) || /weapon/i.test(row.name)) {
    const online = v.def.weapons.filter((w) => !v.offline.includes(w.id))
    weapon = online.length ? online[Math.min(online.length - 1, Math.floor(pick * online.length))] : null
    if (weapon) next = { ...next, offline: [...next.offline, weapon.id] }
  }
  return { vehicle: next, row, weapon }
}

/** Who's at a station, and the bonus each rolls with there: an NPC's tier, or a character's modifier (the station's ability, Dexterity by default) plus proficiency. */
export function stationCrew(v: TrackedVehicle, stationId: string, characterBonus: (m: CrewMember, ability: NonNullable<VehicleDef['stations'][number]['ability']>) => number | undefined): Array<{ member: CrewMember; bonus: number | undefined }> {
  const station = v.def.stations.find((s) => s.id === stationId)
  return (v.crew[stationId] ?? []).map((member) => ({ member, bonus: crewTier(member)?.bonus ?? characterBonus(member, station?.ability ?? 'dex') }))
}
