import type { CharacterSheet } from '@shared/ipc'
import { diceGroups } from '@shared/dice'
import { formatModifier } from '@shared/dnd5e'
import { weaponReady } from '@shared/shipCombat'
import { crewKey, fixedBonus, gunnerFor, vehicleName, type TrackedVehicle } from '@shared/vehicles'
import { gunnerBonusFromSheet } from './crewBonus'
import { StationActions } from './StationActions'

/**
 * A party member's own place aboard: for each vehicle they're on, the
 * station they're at, its actions, and the guns they fire — rolled with
 * their own numbers (Dexterity + proficiency for a gun). Nothing else on the
 * ship: the rest is the hired crew's, worked from the DM's panel.
 */
export function Aboard({
  vehicles,
  userId,
  character,
  round,
  rollCheck,
  rollDice,
  aimFrom,
  heading = false
}: {
  vehicles: TrackedVehicle[]
  userId: string
  /** Their character, for their bonuses. */
  character: CharacterSheet | null | undefined
  /** The fight's round (null: not started or not known), for guns cooling down. */
  round: number | null
  rollCheck: (label: string, modifier: number) => void
  rollDice: (expr: string, label: string) => void
  /** Firing at a target on the map (the DM's view of a vehicle in the fight); left out: just the rolls. */
  aimFrom?: (vehicleId: string, weaponId: string) => (() => void) | undefined
  /** Show an "Aboard" heading (when it isn't inside a titled block already). */
  heading?: boolean
}): JSX.Element | null {
  const me = `user:${userId}`
  const aboard = vehicles.filter((v) => Object.values(v.crew).some((people) => people.some((m) => crewKey(m) === me)))
  if (!aboard.length) return null
  const gunBonus = character ? gunnerBonusFromSheet(character) : undefined
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {heading && (
        <div className="gb-label" style={{ margin: 0 }}>
          Aboard
        </div>
      )}
      {aboard.map((v) => {
        const stations = v.def.stations.filter((s) => (v.crew[s.id] ?? []).some((m) => crewKey(m) === me))
        const mine = new Set(stations.map((s) => s.id))
        const guns = v.def.weapons.filter((w) => w.saveDc === undefined && (fixedBonus(v, w) !== undefined ? !!w.station && mine.has(w.station) : (() => {
          const g = gunnerFor(v, w.id)
          return !!g && crewKey(g) === me
        })()))
        return (
          <div key={v.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12 }}>
              <strong>{vehicleName(v)}</strong> <span style={{ color: 'var(--text-muted)' }}>· {stations.map((s) => s.name).join(', ')}</span>
            </span>
            {stations.map((s) => (
              <StationActions key={s.id} vehicle={v} station={s} sheets={(uid) => (uid === userId ? character : null)} onlyUserId={userId} rollCheck={rollCheck} />
            ))}
            {guns.map((w) => {
              const ready = weaponReady(v, w, round)
              const bonus = fixedBonus(v, w) ?? gunBonus
              const aim = aimFrom?.(v.id, w.id)
              return (
                <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {w.name}
                    {!ready.ok && <span style={{ display: 'block', fontSize: 11, color: 'var(--danger)' }}>{ready.why}</span>}
                  </span>
                  {aim && (
                    <button type="button" className="gs-chip" style={{ display: 'inline-flex', alignItems: 'center' }} disabled={!ready.ok || bonus === undefined} onClick={aim} title={`Fire the ${w.name} at a target on the map`} aria-label={`Fire the ${w.name} at a target`}>
                      <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden="true" style={{ display: 'block' }}>
                        <circle cx={8} cy={8} r={5.5} />
                        <path d="M8 1v3M8 12v3M1 8h3M12 8h3" />
                      </svg>
                    </button>
                  )}
                  {bonus !== undefined && (
                    <button type="button" className="gs-chip" disabled={!ready.ok} onClick={() => rollCheck(`${w.name} Attack`, bonus)} title={fixedBonus(v, w) !== undefined ? 'Roll the attack' : 'Roll the attack: Dexterity + proficiency'}>
                      {formatModifier(bonus)}
                    </button>
                  )}
                  {w.damage && diceGroups(w.damage) && (
                    <button type="button" className="gs-chip" onClick={() => rollDice(w.damage, `${w.name} Damage`)} title="Roll the damage">
                      {w.damage}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
