// A vehicle template, read-only — a statblock-style card for the Workshop's
// preview and the campaign's "add a vehicle" list. The tracked version (hit
// points, crew, fuel) is TrackedVehicleCard in VehiclesPanel.tsx.
import { vehicleDefSchema, type VehicleDef } from '@shared/content/schema'
import { inlineTextHtml } from '../../markdown'

/** Any entry-shaped object as a full vehicle (defaults filled in) — null when it isn't one yet. */
export function asVehicle(entry: unknown): VehicleDef | null {
  const parsed = vehicleDefSchema.safeParse(entry)
  return parsed.success ? parsed.data : null
}

const mod = (score: number): string => {
  const m = Math.floor((score - 10) / 2)
  return m >= 0 ? `+${m}` : `${m}`
}

export function weaponLine(w: VehicleDef['weapons'][number], stations: VehicleDef['stations']): string {
  const hit = w.saveDc !== undefined ? `DC ${w.saveDc} ${(w.saveAbility ?? 'dex').toUpperCase()} save` : w.attackBonus !== undefined ? `${w.attackBonus >= 0 ? '+' : ''}${w.attackBonus} to hit` : ''
  const station = w.station ? stations.find((s) => s.id === w.station)?.name : undefined
  return [hit, w.range && `range ${w.range}`, w.damage && `${w.damage}${w.damageType ? ` ${w.damageType.toLowerCase()}` : ''}`, w.ammo !== undefined && `${w.ammo} shots`, station && `fired by the ${station}`].filter(Boolean).join(' · ')
}

export function VehicleCard({ vehicle }: { vehicle: VehicleDef }): JSX.Element {
  const v = vehicle
  const line = (label: string, value: string | number | undefined): JSX.Element | null =>
    value === undefined || value === '' || value === 0 ? null : (
      <div className="gb-statblock-line">
        <strong>{label}</strong> {value}
      </div>
    )
  const section = (title: string, rows: Array<{ name: string; text: string }>): JSX.Element | null =>
    rows.length === 0 ? null : (
      <>
        <h4 className="gb-statblock-section">{title}</h4>
        {rows.map((r, i) => (
          <div key={i} className="gb-statblock-entry">
            <span className="gb-statblock-entry-name">{r.name}.</span> <span dangerouslySetInnerHTML={{ __html: inlineTextHtml(r.text) }} />
          </div>
        ))}
      </>
    )
  return (
    <div className="gb-statblock">
      <div className="gb-statblock-name">{v.name || 'Unnamed vehicle'}</div>
      <div className="gb-statblock-subtitle">
        {v.size} {v.category.toLowerCase()} vehicle
        {v.cost ? ` · ${v.cost}` : ''}
      </div>
      <hr className="gb-statblock-rule" />
      {line('Armor Class', v.ac)}
      {line('Hit Points', `${v.hp}${v.damageThreshold ? `; damage threshold ${v.damageThreshold}` : ''}`)}
      {line('Speed', v.speeds.map((s) => (s.mode === 'walk' ? s.value : `${s.mode} ${s.value}`)).join(', '))}
      {line('Crew', v.crew || undefined)}
      {line('Passengers', v.passengers || undefined)}
      {line('Cargo', v.cargo)}
      {v.abilities && (
        <>
          <hr className="gb-statblock-rule" />
          <table className="gb-statblock-abilities">
            <thead>
              <tr>
                {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((a) => (
                  <th key={a}>{a.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((a) => (
                  <td key={a}>
                    {v.abilities![a]} ({mod(v.abilities![a])})
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </>
      )}
      {v.description && <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '8px 0 0' }}>{v.description}</p>}
      {section(
        'Components',
        v.components.map((c) => ({ name: c.name, text: [`AC ${c.ac ?? v.ac}`, `${c.hp} hit points`, c.threshold ? `threshold ${c.threshold}` : '', c.notes].filter(Boolean).join('; ') }))
      )}
      {section(
        'Crew stations',
        v.stations.map((s) => ({ name: s.name, text: [s.count > 1 ? `${s.count} crew` : '1 crew', s.notes].filter(Boolean).join('; ') }))
      )}
      {section('Weapons', v.weapons.map((w) => ({ name: w.name, text: [weaponLine(w, v.stations), w.notes].filter(Boolean).join('. ') })))}
      {section('Resources', v.resources.map((r) => ({ name: r.name, text: `${r.max}${r.recharge === 'none' ? '' : r.recharge === 'dawn' ? ', back at dawn' : r.recharge === 'long' ? ', back on a long rest' : ', back on a short or long rest'}` })))}
      {section('Traits', v.traits.map((t) => ({ name: t.name, text: t.desc })))}
      {section('Actions', v.actions.map((t) => ({ name: t.name, text: t.desc })))}
    </div>
  )
}
