import { useState } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import type { VehicleDef } from '@shared/content/schema'
import { formatModifier } from '@shared/dnd5e'
import { stationCrew } from '@shared/shipCombat'
import { crewKey, type TrackedVehicle } from '@shared/vehicles'
import { crewLabel, gunnerBonusFromSheet } from './crewBonus'

const ABILITY_NAMES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' } as const

/**
 * A station's actions, each a button that rolls for whoever's acting there:
 * an NPC's tier bonus, or a character's modifier for the station's ability
 * plus proficiency. With more than one at the station, pick who's acting.
 * `onlyUserId`: a player, who acts only as themselves.
 */
export function StationActions({
  vehicle,
  station,
  sheets,
  onlyUserId,
  rollCheck
}: {
  vehicle: TrackedVehicle
  station: VehicleDef['stations'][number]
  /** Characters by user id, for a player character's bonus. */
  sheets: (userId: string) => CharacterSheet | null | undefined
  onlyUserId?: string | null
  rollCheck: (label: string, modifier: number) => void
}): JSX.Element | null {
  const crew = stationCrew(vehicle, station.id, (m, ability) => {
    const sheet = m.userId ? sheets(m.userId) : null
    return sheet ? gunnerBonusFromSheet(sheet, ability) : undefined
  }).filter((x) => !onlyUserId || x.member.userId === onlyUserId)
  const [actingKey, setActingKey] = useState<string | null>(null)
  if (!station.actions.length || (onlyUserId && !crew.length)) return null
  const acting = crew.find((x) => crewKey(x.member) === actingKey) ?? crew[0]
  const ability = ABILITY_NAMES[station.ability ?? 'dex']
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
      {crew.length > 1 && (
        <select className="gb-input" value={crewKey(acting.member)} onChange={(e) => setActingKey(e.target.value)} style={{ fontSize: 11, padding: '1px 4px' }} aria-label={`Who acts at ${station.name}`}>
          {crew.map((x) => (
            <option key={crewKey(x.member)} value={crewKey(x.member)}>
              {crewLabel(x.member)}
            </option>
          ))}
        </select>
      )}
      {station.actions.map((a) =>
        a.roll && acting && acting.bonus !== undefined ? (
          <button
            key={a.name}
            type="button"
            className="gs-chip"
            onClick={() => rollCheck(`${a.name} (${acting.member.name})`, acting.bonus!)}
            title={`${a.desc ? `${a.desc}\n\n` : ''}${acting.member.name} rolls ${formatModifier(acting.bonus)} (${acting.member.userId ? `${ability} + proficiency` : 'their tier'})`}
          >
            {a.name} {formatModifier(acting.bonus)}
          </button>
        ) : (
          <span key={a.name} className="gb-badge" style={{ fontSize: 11 }} title={a.desc || undefined}>
            {a.name}
          </span>
        )
      )}
      {!crew.length && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Nobody here to act.</span>}
      {crew.length > 0 && acting.bonus === undefined && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{acting.member.name}’s sheet isn’t to hand.</span>}
    </div>
  )
}
