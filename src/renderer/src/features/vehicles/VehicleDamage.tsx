import { useState } from 'react'
import { componentHp, componentMaxHp, damageVehicle, repairVehicle, type TrackedVehicle } from '@shared/vehicles'

/**
 * Damaging or repairing a vehicle in one place: type the amount once, then
 * hit the hull or any component with − (damage) or + (repair). A hit under
 * the hull's (or a component's) threshold does nothing, and says so. Click a
 * number to type it exactly.
 */
export function VehicleDamage({ vehicle: v, onChange, onHint, readOnly = false }: { vehicle: TrackedVehicle; onChange?: (v: TrackedVehicle) => void; onHint?: (text: string) => void; /** Just the bars and numbers (a player looking at the party's ship). */ readOnly?: boolean }): JSX.Element {
  const [amount, setAmount] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  // A hit that was too small to count, said right here (not just in the map's hint bar).
  const [shrugged, setShrugged] = useState<string | null>(null)
  const n = Math.max(1, Math.round(Number(amount)) || 1)
  const rows: Array<{ id: string | null; name: string; hp: number; max: number; threshold: number; notes: string }> = [
    { id: null, name: 'Hull', hp: v.hp, max: v.def.hp, threshold: v.def.damageThreshold, notes: '' },
    ...v.def.components.map((c) => ({ id: c.id, name: c.name, hp: componentHp(v, c.id), max: componentMaxHp(v.def, c), threshold: c.threshold, notes: c.notes }))
  ]

  const hit = (id: string | null, name: string, threshold: number): void => {
    const next = damageVehicle(v, n, id ?? undefined)
    if (next === v) {
      const text = `${n} is under the ${name.toLowerCase()}’s threshold of ${threshold}, so it does nothing. Type ${threshold} or more, or click its hit points to set them.`
      setShrugged(text)
      onHint?.(text)
    } else {
      setShrugged(null)
      onChange?.(next)
    }
  }
  const mend = (id: string | null): void => {
    setShrugged(null)
    onChange?.(repairVehicle(v, n, id ?? undefined))
  }
  const setExact = (id: string | null, max: number, value: number): void => {
    const hp = Math.max(0, Math.min(max, Math.round(value)))
    onChange?.(id ? { ...v, components: { ...v.components, [id]: hp } } : { ...v, hp })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {!readOnly && (
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
          Amount
          <input
            className="gb-input"
            type="number"
            min={1}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
              setShrugged(null)
            }} placeholder="1" style={{ width: 64, fontSize: 13, padding: '2px 6px' }} aria-label="Damage or repair amount" />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>then − to damage, + to repair</span>
        </label>
      )}
      {shrugged && <div style={{ fontSize: 11, color: 'var(--danger)' }}>{shrugged}</div>}
      {rows.map((r) => {
        const key = r.id ?? 'hull'
        const out = r.hp <= 0
        const pct = r.hp / Math.max(1, r.max)
        const colour = out ? 'var(--danger)' : pct > 0.5 ? 'var(--success)' : pct > 0.25 ? 'var(--accent)' : 'var(--danger)'
        return (
          <div key={key} title={r.notes || (r.threshold ? `Hits under ${r.threshold} do nothing` : undefined)} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: r.id ? 400 : 700, color: out ? 'var(--danger)' : undefined }}>
                {r.name}
                {out ? (r.id ? ' (out)' : ' (wrecked)') : ''}
                {r.threshold ? <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 10 }}> · threshold {r.threshold}</span> : null}
              </span>
              {!readOnly && (
              <button type="button" className="gs-chip" style={step} disabled={out} onClick={() => hit(r.id, r.name, r.threshold)} aria-label={`Damage the ${r.name}`} title={`${n} damage`}>
                −
              </button>
              )}
              {editing === key && !readOnly ? (
                <input
                  className="gb-input"
                  type="number"
                  autoFocus
                  min={0}
                  max={r.max}
                  defaultValue={r.hp}
                  onBlur={(e) => {
                    setExact(r.id, r.max, Number(e.target.value) || 0)
                    setEditing(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') setEditing(null)
                  }}
                  style={{ width: 64, fontSize: 11, padding: '1px 4px', textAlign: 'center' }}
                  aria-label={`${r.name} hit points`}
                />
              ) : (
                <button type="button" disabled={readOnly} onClick={() => setEditing(key)} title={readOnly ? undefined : 'Click to type its hit points'} style={{ minWidth: 64, background: 'none', border: 0, padding: 0, font: 'inherit', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', cursor: readOnly ? 'default' : 'text' }}>
                  {r.hp}/{r.max}
                </button>
              )}
              {!readOnly && (
                <button type="button" className="gs-chip" style={step} disabled={r.hp >= r.max} onClick={() => mend(r.id)} aria-label={`Repair the ${r.name}`} title={`Repair ${n}`}>
                  +
                </button>
              )}
            </div>
            <div style={{ height: r.id ? 4 : 6, borderRadius: 9, background: 'var(--bg-sunken)', overflow: 'hidden' }} aria-hidden="true">
              <div style={{ width: `${Math.max(0, pct) * 100}%`, height: '100%', background: colour }} />
            </div>
            {out && r.notes && <div style={{ fontSize: 11, color: 'var(--danger)' }}>{r.notes}</div>}
          </div>
        )
      })}
    </div>
  )
}

const step = { padding: '0 7px', fontSize: 12, lineHeight: '18px' } as const
