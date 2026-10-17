import { useState } from 'react'
import { slugify, uniqueId } from '@shared/content/workshop'
import { EffectsEditor } from './effects'
import { AddButton, Field, Grid, Group, IdInput, RowActions, TextArea, TextInput, arr, move, str, withKey, withRequired, type Obj } from './fields'

/** A list of features (class features, species traits, background features): name, id, description and effects each. */
export function FeaturesEditor({ value, onChange, addLabel = 'Feature', defaultOpen }: { value: Obj[]; onChange: (v: Obj[]) => void; addLabel?: string; defaultOpen?: boolean }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {value.map((f, i) => (
        <Group
          key={i}
          collapsible
          defaultOpen={defaultOpen ?? !str(f.name)}
          title={
            <span>
              {str(f.name) || 'Unnamed'}
              {arr(f.effects).length > 0 && <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>{arr(f.effects).length} effect{arr(f.effects).length === 1 ? '' : 's'}</span>}
            </span>
          }
          actions={
            <RowActions
              label="feature"
              onUp={i > 0 ? () => onChange(move(value, i, -1)) : undefined}
              onDown={i < value.length - 1 ? () => onChange(move(value, i, 1)) : undefined}
              onRemove={() => onChange(value.filter((_, j) => j !== i))}
            />
          }
        >
          <FeatureEditor value={f} onChange={(v) => onChange(value.map((x, j) => (j === i ? v : x)))} />
        </Group>
      ))}
      <AddButton
        onClick={() => {
          const id = uniqueId('new-feature', value.map((f) => str(f.id)))
          onChange([...value, { id, name: '', description: '', effects: [] }])
        }}
      >
        {addLabel}
      </AddButton>
    </div>
  )
}

function FeatureEditor({ value, onChange }: { value: Obj; onChange: (v: Obj) => void }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Grid min={180}>
        <Field label="Name">
          <TextInput
            value={str(value.name)}
            onChange={(name) => {
              // A feature still on its placeholder id follows its name.
              const autoId = !str(value.id) || /^new-feature(-\d+)?$/.test(str(value.id))
              onChange({ ...withRequired(value, 'name', name), ...(autoId && name ? { id: slugify(name) } : {}) })
            }}
          />
        </Field>
        <Field label="Id" hint="Sheets store picks under it — avoid changing it once players use the pack.">
          <IdInput value={str(value.id)} onChange={(v) => onChange(withRequired(value, 'id', v))} fromName={str(value.name)} />
        </Field>
        <Field label="Description" wide>
          <TextArea value={str(value.description)} onChange={(v) => onChange(withKey(value, 'description', v))} rows={3} />
        </Field>
      </Grid>
      <Field label="Effects">
        <EffectsEditor value={arr<Obj>(value.effects)} onChange={(v) => onChange(withKey(value, 'effects', v))} />
      </Field>
    </div>
  )
}

/**
 * A class / subclass / archetype progression as a grid: one row per level,
 * the table columns (Rages, Martial Arts die, Mana…) as editable
 * cells, and each level's features. Clicking a level opens its features
 * underneath.
 */
export function LevelTable({
  columns,
  levels,
  onChange,
  showProficiency
}: {
  columns: Obj[]
  levels: Obj[]
  onChange: (next: { columns: Obj[]; levels: Obj[] }) => void
  showProficiency?: boolean
}): JSX.Element {
  const [selected, setSelected] = useState<number | null>(null)
  const featuresAt = (level: number): Obj[] => arr<Obj>(levels.find((l) => l.level === level)?.features)
  const setFeaturesAt = (level: number, features: Obj[]): void => {
    const others = levels.filter((l) => l.level !== level)
    const next = features.length ? [...others, { ...(levels.find((l) => l.level === level) ?? {}), level, features }] : others
    onChange({ columns, levels: next.sort((a, b) => Number(a.level) - Number(b.level)) })
  }
  const setColumns = (next: Obj[]): void => onChange({ columns: next, levels })
  const setCell = (ci: number, level: number, raw: string): void => {
    const col = columns[ci]
    const values = [...arr<number | string>(col.values)]
    while (values.length < level) values.push('')
    const t = raw.trim()
    values[level - 1] = t === '' ? '' : Number.isFinite(Number(t)) ? Number(t) : t
    while (values.length && values[values.length - 1] === '') values.pop()
    setColumns(columns.map((c, j) => (j === ci ? { ...c, values } : c)))
  }
  const maxLevel = Math.max(20, ...levels.map((l) => Number(l.level) || 0))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Group title="Table columns" collapsible defaultOpen={columns.length === 0}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Formulas read a column as @table.&lt;id&gt; — a number, or text like a die ("1d6").</span>
        {columns.map((c, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <Grid min={150}>
                <Field label="Label">
                  <TextInput value={str(c.label)} onChange={(v) => setColumns(columns.map((x, j) => (j === i ? withRequired(x, 'label', v) : x)))} />
                </Field>
                <Field label="Id">
                  <IdInput value={str(c.id)} onChange={(v) => setColumns(columns.map((x, j) => (j === i ? withRequired(x, 'id', v) : x)))} fromName={str(c.label)} />
                </Field>
              </Grid>
            </div>
            <RowActions label="column" onUp={i > 0 ? () => setColumns(move(columns, i, -1)) : undefined} onDown={i < columns.length - 1 ? () => setColumns(move(columns, i, 1)) : undefined} onRemove={() => setColumns(columns.filter((_, j) => j !== i))} />
          </div>
        ))}
        <AddButton onClick={() => setColumns([...columns, { id: uniqueId('column', columns.map((c) => str(c.id))), label: 'New Column', values: [] }])}>Column</AddButton>
      </Group>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 11 }}>
              <th style={cell}>Level</th>
              {showProficiency && <th style={cell}>PB</th>}
              {columns.map((c, i) => (
                <th key={i} style={cell}>
                  {str(c.label) || str(c.id)}
                </th>
              ))}
              <th style={{ ...cell, width: '100%' }}>Features</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxLevel }, (_, i) => i + 1).map((level) => {
              const features = featuresAt(level)
              const active = selected === level
              return (
                <tr key={level} style={{ background: active ? 'var(--accent-subtle)' : undefined, borderTop: '1px solid var(--border-subtle)' }}>
                  <td style={{ ...cell, fontWeight: 700 }}>{level}</td>
                  {showProficiency && <td style={{ ...cell, color: 'var(--text-muted)' }}>+{2 + Math.floor((level - 1) / 4)}</td>}
                  {columns.map((c, ci) => (
                    <td key={ci} style={{ padding: 1 }}>
                      <input
                        className="gb-input"
                        value={str(arr(c.values)[level - 1])}
                        onChange={(e) => setCell(ci, level, e.target.value)}
                        style={{ width: 62, fontSize: 11, padding: '2px 4px', textAlign: 'center' }}
                      />
                    </td>
                  ))}
                  <td style={cell}>
                    <button
                      type="button"
                      onClick={() => setSelected(active ? null : level)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', color: features.length ? 'var(--text-primary)' : 'var(--text-muted)', font: 'inherit', width: '100%' }}
                      title={active ? 'Close' : `Edit level ${level} features`}
                    >
                      {features.length ? features.map((f) => str(f.name) || 'Unnamed').join(', ') : active ? 'No features yet' : '—'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {selected !== null && (
        <Group title={`Level ${selected} features`} accent actions={<RowActions label="panel" onRemove={() => setSelected(null)} />}>
          <FeaturesEditor key={selected} value={featuresAt(selected)} onChange={(v) => setFeaturesAt(selected, v)} defaultOpen={false} />
        </Group>
      )}
    </div>
  )
}

const cell = { padding: '3px 6px', whiteSpace: 'nowrap' } as const
