import { useEffect, useRef, useState } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import type { BattleMap } from '@shared/battleMap'
import { tokenCentre } from '@shared/battleMap'
import { diceGroups, type DieSides } from '@shared/dice'
import { withCombatantHp, type Combatant, type InitiativeState } from '@shared/encounter'
import { ARC_NAMES, applyCrit, arcOf, critTable, fireWeapon, firesInto, scaleDamage, sideStruck, squaresBetween, thresholdFor, weaponReach, weaponReady } from '@shared/shipCombat'
import { crewKey, crewTier, damageVehicle, gunnerFor, vehicleName, weaponCrew, type CampaignVehicles, type CrewMember, type TrackedVehicle } from '@shared/vehicles'
import { queuePendingCheck, queuePendingDamage } from '../dice/rollAnimationStore'
import { gunnerBonusFromSheet } from '../vehicles/crewBonus'

/** A vehicle's weapon being aimed: who's firing it, and which weapon. */
export interface Aim {
  shooterId: string
  weaponId: string
  /** Who fires it (a crewKey), when not the one picked for it. */
  gunnerKey?: string
}

interface Deps {
  sessionId: string | null
  rollerId: string
  encounter: InitiativeState
  setEncounter: (fn: (s: InitiativeState) => InitiativeState) => void
  map: BattleMap
  vehicles: { doc: CampaignVehicles; save: (doc: CampaignVehicles) => Promise<boolean> }
  playerCharacters: Map<string, CharacterSheet>
  /** Damage to a creature (a player's goes through their sheet). */
  damageCreature: (c: Combatant, amount: number) => void
  setHint: (text: string) => void
}

const DIE_SIDES = [4, 6, 8, 10, 12, 20, 100]

/**
 * Firing a vehicle's weapons on the battle map: pick a weapon, click a
 * target. Its arc and reach are checked; the attack rolls against the
 * target's AC; a hit rolls damage (dice doubled on a critical hit), carried
 * between ship and personal scale, against the threshold of the side it
 * struck; a critical hit on a vehicle then rolls its critical-hit table.
 * Everything waits on the dice popup, so it reads the latest state when each
 * roll lands.
 */
export function useShipFire(deps: Deps): {
  aim: Aim | null
  startAim: (shooterId: string, weaponId: string, gunnerKey?: string) => void
  cancelAim: () => void
  aimAt: (targetId: string) => void
  /** Rolled from the side panel (no target): it still spends a shot and starts its cooldown. */
  markFired: (vehicleId: string, weaponId: string) => void
} {
  const [aim, setAim] = useState<Aim | null>(null)
  const latest = useRef(deps)
  latest.current = deps

  // Escape stops aiming.
  useEffect(() => {
    if (!aim) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setAim(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aim])

  const round = (): number | null => (latest.current.encounter.turnIndex >= 0 ? latest.current.encounter.round : null)
  const vehicleOf = (c: Combatant | undefined): TrackedVehicle | undefined => (c?.kind === 'vehicle' ? latest.current.vehicles.doc.vehicles.find((v) => v.id === c.vehicleId) : undefined)
  const combatant = (id: string): Combatant | undefined => latest.current.encounter.combatants.find((c) => c.id === id)
  const saveVehicle = (next: TrackedVehicle): void => {
    const { vehicles } = latest.current
    void vehicles.save({ vehicles: vehicles.doc.vehicles.map((v) => (v.id === next.id ? next : v)) })
  }
  const characterBonus = (m: CrewMember): number | undefined => {
    const sheet = m.userId ? latest.current.playerCharacters.get(m.userId) : undefined
    return sheet ? gunnerBonusFromSheet(sheet) : undefined
  }

  function markFired(vehicleId: string, weaponId: string): void {
    const v = latest.current.vehicles.doc.vehicles.find((x) => x.id === vehicleId)
    const w = v?.def.weapons.find((x) => x.id === weaponId)
    if (v && w) saveVehicle(fireWeapon(v, w, round()))
  }

  function startAim(shooterId: string, weaponId: string, gunnerKey?: string): void {
    const v = vehicleOf(combatant(shooterId))
    const w = v?.def.weapons.find((x) => x.id === weaponId)
    if (!v || !w) return
    const ready = weaponReady(v, w, round())
    if (!ready.ok) return latest.current.setHint(`${w.name}: ${ready.why}.`)
    if (!latest.current.map.tokens[shooterId]) return latest.current.setHint(`${vehicleName(v)} isn’t on the map.`)
    setAim({ shooterId, weaponId, ...(gunnerKey ? { gunnerKey } : {}) })
    latest.current.setHint(`Aiming the ${w.name}: click a target. Esc, or a click anywhere else, stops aiming.`)
  }

  function aimAt(targetId: string): void {
    if (!aim) return
    const { map, setHint, sessionId, rollerId } = latest.current
    const shooter = combatant(aim.shooterId)
    const target = combatant(targetId)
    const v = vehicleOf(shooter)
    const w = v?.def.weapons.find((x) => x.id === aim.weaponId)
    const from = map.tokens[aim.shooterId]
    const to = map.tokens[targetId]
    if (!shooter || !target || !v || !w || !from || !to) return setAim(null)
    // In its arc, and in reach?
    const arc = arcOf(from, tokenCentre(to))
    if (!firesInto(w, arc)) return setHint(`${target.name} is off the ${ARC_NAMES[arc!].toLowerCase()} — the ${w.name} fires ${w.arcs!.map((a) => ARC_NAMES[a].toLowerCase()).join(' or ')}. Pick another target, or Esc.`)
    const reach = weaponReach(w, map.feetPerCell)
    const dist = squaresBetween(from, to)
    if (reach !== null && dist > reach) return setHint(`${target.name} is ${dist} squares away — the ${w.name} reaches ${reach}. Pick another target, or Esc.`)
    setAim(null)
    saveVehicle(fireWeapon(v, w, round()))

    const ship = vehicleName(v)
    const gunner = (aim.gunnerKey ? weaponCrew(v, w.id).find((m) => crewKey(m) === aim.gunnerKey) : undefined) ?? gunnerFor(v, w.id)
    const bonus = w.attackBonus ?? (w.saveDc !== undefined || !gunner ? undefined : (crewTier(gunner)?.bonus ?? characterBonus(gunner)))
    const shooterCentre = tokenCentre(from)
    const dice = diceGroups(w.damage)
    const damage = (crit: boolean): void => {
      if (!dice) return setHint(`The ${w.name} has no damage to roll.`)
      const groups = crit ? dice.groups.map((g) => ({ ...g, count: g.count * 2 })) : dice.groups
      queuePendingDamage({ label: `${w.name} Damage${crit ? ' (critical)' : ''}`, groups, modifier: dice.modifier, sessionId, rollerId, rollerName: ship, onRolled: (total) => land(total, crit) })
    }
    // A hit lands: on a vehicle, against the threshold of the side it struck (and its critical-hit table); on a creature, carried to its scale.
    const land = (rolled: number, crit: boolean): void => {
      const now = latest.current
      const t = now.encounter.combatants.find((c) => c.id === targetId)
      if (!t) return
      const tv = vehicleOf(t)
      if (!tv) {
        const amount = scaleDamage(rolled, v.def.scale ?? 1, 1)
        now.damageCreature(t, amount)
        return now.setHint(`${w.name} hits ${t.name} for ${amount}${(v.def.scale ?? 1) > 1 ? ` (${rolled} at ship scale)` : ''}.`)
      }
      const side = sideStruck(now.map.tokens[targetId] ?? to, shooterCentre)
      const threshold = Math.max(0, thresholdFor(tv.def, side) - (w.pierce ?? 0))
      const amount = scaleDamage(rolled, v.def.scale ?? 1, tv.def.scale ?? 1)
      const after = damageVehicle(tv, amount, undefined, threshold)
      const where = side ? ` the ${side === 'fore' ? 'bow' : side === 'aft' ? 'stern' : 'flank'} of` : ''
      if (after === tv) now.setHint(`${w.name} hits${where} ${vehicleName(tv)} for ${amount}, under its threshold of ${threshold}: no damage.`)
      else {
        now.setEncounter((s) => withCombatantHp(s, t.id, after.hp))
        saveVehicle(after)
        now.setHint(`${w.name} hits${where} ${vehicleName(tv)} for ${amount} (threshold ${threshold}): ${after.hp}/${tv.def.hp} left.`)
      }
      if (crit && after !== tv) rollCrit(after)
    }
    const rollCrit = (tv: TrackedVehicle): void => {
      const { die } = critTable(tv.def)
      if (!die) return
      const apply = (roll: number): void => {
        const current = latest.current.vehicles.doc.vehicles.find((x) => x.id === tv.id) ?? tv
        const { vehicle, row, weapon } = applyCrit(current, roll, Math.random())
        if (!row) return
        saveVehicle(vehicle)
        latest.current.setHint(`Critical hit on ${vehicleName(tv)}: ${row.name}${weapon ? ` (${weapon.name} offline)` : ''}. ${row.notes}`)
      }
      if (DIE_SIDES.includes(die)) queuePendingDamage({ label: `${vehicleName(tv)} Critical System`, groups: [{ sides: die as DieSides, count: 1 }], modifier: 0, sessionId, rollerId, rollerName: ship, onRolled: apply })
      else apply(1 + Math.floor(Math.random() * die))
    }

    if (w.saveDc !== undefined) {
      setHint(`${target.name} makes a DC ${w.saveDc} ${(w.saveAbility ?? 'dex').toUpperCase()} saving throw. Roll the damage, then apply it from their panel.`)
      if (dice) queuePendingDamage({ label: `${w.name} Damage`, groups: dice.groups, modifier: dice.modifier, sessionId, rollerId, rollerName: ship })
      return
    }
    if (bonus === undefined) {
      setHint(gunner ? `${gunner.name}’s sheet isn’t to hand, so there’s no attack bonus — roll it yourself.` : `Nobody’s at the ${w.name}’s station to fire it. Put crew there under Initiative → Vehicles.`)
      return
    }
    queuePendingCheck({
      label: `${w.name} Attack`,
      modifier: bonus,
      advantage: 'normal',
      dc: target.ac,
      sessionId,
      rollerId,
      rollerName: gunner ? `${ship} (${gunner.name})` : ship,
      onRolled: ({ total, natural }) => {
        if (natural === 'fumble' || (natural !== 'crit' && total < target.ac)) return latest.current.setHint(`${w.name} misses ${target.name} (${total} against AC ${target.ac}).`)
        latest.current.setHint(`${w.name} hits ${target.name}${natural === 'crit' ? ' — a critical hit' : ''}! Roll the damage.`)
        damage(natural === 'crit')
      }
    })
    setHint(`${gunner?.name ?? ship} fires the ${w.name} at ${target.name} (AC ${target.ac}): roll the attack.`)
  }

  return { aim, startAim, cancelAim: () => setAim(null), aimAt, markFired }
}
