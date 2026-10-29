import { useState } from 'react'
import { componentHp, componentMaxHp, vehicleCondition, type TrackedVehicle } from '@shared/vehicles'

/**
 * A vehicle's components (engines, weapons, sails…), each with a small bar
 * of its hit points. The DM can knock them down or patch them up a point at
 * a time, or click the number to type it; at 0 a component is out, and what
 * that means is shown. Players see how hurt each one looks on an enemy.
 */
export function ComponentHealth({ vehicle: v, readOnly = false, showNumbers = true, onChange }: { vehicle: TrackedVehicle; readOnly?: boolean; showNumbers?: boolean; onChange?: (v: TrackedVehicle) => void }): JSX.Element | null {
  const [editing, setEditing] = useState<string | null>(null)
  if (!v.def.components.length) return null
  const set = (id: string, max: number, hp: number): void => onChange?.({ ...v, components: { ...v.components, [id]: Math.max(0, Math.min(max, Math.round(hp))) } })
  const canEdit = !readOnly && !!onChange
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {v.def.components.map((c) => {
        const hp = componentHp(v, c.id)
        const max = componentMaxHp(v.def, c)
        const out = hp <= 0
        const pct = hp / Math.max(1, max)
        const colour = out ? 'var(--danger)' : pct > 0.5 ? 'var(--success)' : pct > 0.25 ? 'var(--accent)' : 'var(--danger)'
        return (
          <div key={c.id} title={c.notes || undefined} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: out ? 'var(--danger)' : undefined }}>
                {c.crit !== undefined && (
                  <span style={{ color: 'var(--text-muted)', fontSize: 10, marginRight: 4 }} title={`Critical hit table: ${c.crit}`}>
                    {c.crit}
                  </span>
                )}
                {c.name}
                {out ? ' (out)' : ''}
              </span>
              {canEdit && (
                <button type="button" className="gs-chip" style={step} disabled={out} onClick={() => set(c.id, max, hp - 1)} aria-label={`Damage ${c.name}`} title="1 damage">
                  −
                </button>
              )}
              {canEdit && editing === c.id ? (
                <input
                  className="gb-input"
                  type="number"
                  autoFocus
                  min={0}
                  max={max}
                  defaultValue={hp}
                  onBlur={(e) => {
                    set(c.id, max, Number(e.target.value) || 0)
                    setEditing(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') setEditing(null)
                  }}
                  style={{ width: 46, fontSize: 11, padding: '1px 4px', textAlign: 'center' }}
                  aria-label={`${c.name} hit points`}
                />
              ) : (
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setEditing(c.id)}
                  title={canEdit ? 'Click to type its hit points' : undefined}
                  style={{ minWidth: 40, background: 'none', border: 0, padding: 0, font: 'inherit', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', cursor: canEdit ? 'text' : 'default' }}
                >
                  {showNumbers ? `${hp}/${max}` : vehicleCondition(hp, max)}
                </button>
              )}
              {canEdit && (
                <button type="button" className="gs-chip" style={step} disabled={hp >= max} onClick={() => set(c.id, max, hp + 1)} aria-label={`Repair ${c.name}`} title="Repair 1">
                  +
                </button>
              )}
            </div>
            {showNumbers && (
              <div style={{ height: 4, borderRadius: 9, background: 'var(--bg-sunken)', overflow: 'hidden' }} aria-hidden="true">
                <div style={{ width: `${Math.max(0, pct) * 100}%`, height: '100%', background: colour }} />
              </div>
            )}
            {out && c.notes && <div style={{ fontSize: 11, color: 'var(--danger)' }}>{c.notes}</div>}
          </div>
        )
      })}
    </div>
  )
}

const step = { padding: '0 6px', fontSize: 11, lineHeight: '16px' } as const
