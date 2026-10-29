import { useState } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import type { VehicleDef } from '@shared/content/schema'
import { formatModifier } from '@shared/dnd5e'
import { stationCrew } from '@shared/shipCombat'
import { CREW_TIERS, crewKey, crewTier, peopleAt, placeCrew, shipCrew, type CrewMember, type CrewTier, type TrackedVehicle } from '@shared/vehicles'
import { isTestUser } from '@shared/battleMap'
import { XIcon } from '../../ui/icons'
import { crewLabel, gunnerBonusFromSheet } from './crewBonus'
import { HoverDetailCard } from '../player/HoverDetailCard'

const ABILITY_NAMES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' } as const

/**
 * A station's actions, each a button that rolls for whoever's acting there:
 * an NPC's tier bonus, or a character's modifier for the station's ability
 * plus proficiency. With more than one at the station, pick who's acting.
 * `onlyUserId`: a player, who acts only as themselves (where they sit);
 * `actAs`: someone rolling any station's actions with their own numbers
 * (a player in their Combat tab).
 */
export function StationActions({
  vehicle,
  station,
  sheets,
  onlyUserId,
  actAs,
  rollCheck
}: {
  vehicle: TrackedVehicle
  station: VehicleDef['stations'][number]
  /** Characters by user id, for a player character's bonus. */
  sheets: (userId: string) => CharacterSheet | null | undefined
  onlyUserId?: string | null
  actAs?: { member: CrewMember; sheet: CharacterSheet | null | undefined }
  rollCheck: (label: string, modifier: number) => void
}): JSX.Element | null {
  const crew = actAs
    ? [{ member: actAs.member, bonus: actAs.sheet ? gunnerBonusFromSheet(actAs.sheet, station.ability ?? 'dex') : undefined }]
    : stationCrew(vehicle, station.id, (m, ability) => {
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
      {station.actions.map((a) => {
        const rolls = a.roll && !!acting && acting.bonus !== undefined
        // How it works, on hover: what it does, who rolls, and where their bonus comes from.
        const tier = acting ? crewTier(acting.member) : null
        const fields = [
          { label: 'Station', value: station.name },
          ...(rolls
            ? [
                { label: 'Who rolls', value: acting!.member.name + (tier ? ` (${tier.name.toLowerCase()} crew)` : '') },
                { label: 'Roll', value: `d20 ${formatModifier(acting!.bonus!)}: ${tier ? `the ${tier.name.toLowerCase()} crew’s flat bonus` : `${ability} modifier + proficiency bonus`}` }
              ]
            : [{ label: 'Roll', value: a.roll ? 'Nobody here can roll it yet' : 'None: it just happens (tell the table)' }])
        ]
        return (
          <HoverDetailCard key={a.name} inline title={a.name} subtitle={`${station.name} action`} fields={fields} description={a.desc || 'No description yet. Add one to this station in the Workshop.'} width={280}>
            {rolls ? (
              <button type="button" className="gs-chip" onClick={() => rollCheck(`${a.name} (${acting!.member.name})`, acting!.bonus!)}>
                {a.name} {formatModifier(acting!.bonus!)}
              </button>
            ) : (
              <span className="gb-badge" style={{ fontSize: 11, cursor: 'help' }}>
                {a.name}
              </span>
            )}
          </HoverDetailCard>
        )
      })}
      {!crew.length && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Nobody here to act.</span>}
      {crew.length > 0 && acting.bonus === undefined && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{acting.member.name}’s sheet isn’t to hand.</span>}
    </div>
  )
}

/**
 * Every station on a vehicle: who's there (the party members put there, else
 * the hired crew), what it's for, and its actions to roll — for whoever's
 * acting (the DM picks), or with `actAs`'s own numbers (a player). With
 * `crewing` (the DM), this is also where the crew is set: the hired crew's
 * tier, and which party member sits where (one place each).
 */
export function StationList({
  vehicle,
  sheets,
  actAs,
  rollCheck,
  crewing
}: {
  vehicle: TrackedVehicle
  sheets: (userId: string) => CharacterSheet | null | undefined
  actAs?: { member: CrewMember; sheet: CharacterSheet | null | undefined }
  rollCheck: (label: string, modifier: number) => void
  crewing?: { party: Map<string, CharacterSheet>; onChange: (v: TrackedVehicle) => void }
}): JSX.Element {
  if (!vehicle.def.stations.length) return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>It has no crew stations.</span>
  const tier = CREW_TIERS.find((t) => t.id === vehicle.crewTier) ?? CREW_TIERS[1]
  // Everyone who could sit somewhere: the party (connected players and test players), as crew members.
  const party: CrewMember[] = crewing ? [...crewing.party.entries()].map(([userId, ch]) => ({ name: ch.name || 'Unnamed', characterId: ch.id, userId })) : []
  const stationOf = (m: CrewMember): string | null => Object.entries(vehicle.crew).find(([, people]) => people.some((x) => crewKey(x) === crewKey(m)))?.[0] ?? null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {crewing && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }} title="They work every station and fire every gun no party member is at">
          Hired crew
          <select className="gb-input" value={tier.id} onChange={(e) => crewing.onChange({ ...vehicle, crewTier: e.target.value as CrewTier })} style={{ flex: 1, fontSize: 12, padding: '2px 6px' }}>
            {CREW_TIERS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} {formatModifier(t.bonus)}
              </option>
            ))}
          </select>
        </label>
      )}
      {vehicle.def.stations.map((s) => {
        const people = peopleAt(vehicle, s.id)
        const here = people.length ? people.map((m) => crewLabel(m)).join(', ') : crewLabel(shipCrew(vehicle))
        const free = party.filter((m) => stationOf(m) !== s.id)
        return (
          <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 8, borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <strong style={{ fontSize: 13, flex: 1 }}>{s.name}</strong>
              {!crewing && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{here}</span>}
            </div>
            {crewing && (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                {people.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{crewLabel(shipCrew(vehicle))}</span>}
                {people.map((m) => (
                  <span key={crewKey(m)} className="gb-badge" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {crewLabel(m)}
                    <button type="button" onClick={() => crewing.onChange(placeCrew(vehicle, m, null))} title={`Take ${m.name} off ${s.name} (the hired crew cover it)`} style={{ background: 'none', border: 0, padding: 0, color: 'var(--text-muted)', cursor: 'pointer', display: 'inline-flex' }}>
                      <XIcon size={9} />
                    </button>
                  </span>
                ))}
                {free.length > 0 && (
                  <select
                    className="gb-input"
                    value=""
                    onChange={(e) => {
                      const m = free.find((x) => crewKey(x) === e.target.value)
                      if (m) crewing.onChange(placeCrew(vehicle, m, s.id))
                    }}
                    style={{ fontSize: 11, padding: '1px 4px' }}
                    aria-label={`Put a party member at ${s.name}`}
                  >
                    <option value="">+ Party member…</option>
                    {free.map((m) => (
                      <option key={crewKey(m)} value={crewKey(m)}>
                        {m.name}
                        {isTestUser(m.userId) ? ' (test)' : ''}
                        {stationOf(m) ? ` (from ${vehicle.def.stations.find((x) => x.id === stationOf(m))?.name ?? 'another station'})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
            {s.notes && !s.actions.length && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.notes}</span>}
            <StationActions vehicle={vehicle} station={s} sheets={sheets} actAs={actAs} rollCheck={rollCheck} />
          </div>
        )
      })}
      {crewing && party.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Party members appear here once they’ve joined your session with a character (or add test players from the Test players menu).</span>}
    </div>
  )
}
