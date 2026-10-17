import type { AbilityId } from '@shared/content/schema'
import { TERM_DEFAULTS } from '@shared/content/terms'
import { EffectsEditor } from './effects'
import {
  AbilityChips,
  AbilitySelect,
  AddButton,
  Check,
  Field,
  FormulaInput,
  Grid,
  Group,
  IdInput,
  NumberInput,
  RowActions,
  TextArea,
  TextInput,
  arr,
  useAdvanced,
  num,
  str,
  withKey,
  withRequired,
  type Obj
} from './fields'

type Column =
  | { key: string; label: string; type: 'text' | 'textarea'; required?: boolean; placeholder?: string }
  | { key: string; label: string; type: 'id' }
  | { key: string; label: string; type: 'number'; required?: boolean }
  | { key: string; label: string; type: 'formula'; required?: boolean; placeholder?: string }
  | { key: string; label: string; type: 'ability'; required?: boolean }
  | { key: string; label: string; type: 'abilities' }
  | { key: string; label: string; type: 'check'; defaultOn?: boolean }
  | { key: string; label: string; type: 'effects' }

interface ListSpec {
  /** Only shown in Advanced mode. */
  advanced?: boolean
  key: string
  title: string
  hint: string
  singular: string
  columns: Column[]
  blank: Obj
}

const id: Column = { key: 'id', label: 'Id', type: 'id' }
const name: Column = { key: 'name', label: 'Name', type: 'text', required: true }
const description: Column = { key: 'description', label: 'Description', type: 'textarea' }

const LISTS: ListSpec[] = [
  { key: 'skills', title: 'Skills', singular: 'skill', hint: 'Appear in every sheet\'s skills list; @skill.<id> in formulas.', columns: [name, id, { key: 'ability', label: 'Ability', type: 'ability', required: true }], blank: { id: '', name: '', ability: 'wis' } },
  { key: 'stats', title: 'Custom stats', singular: 'stat', hint: 'Numbers like "Sanity" or "Arcane Power" — @stat.<id>, changeable by effects.', columns: [name, id, { key: 'base', label: 'Base value', type: 'formula', placeholder: '0' }, { key: 'display', label: 'Show on the sheet', type: 'check', defaultOn: true }], blank: { id: '', name: '', base: '0' } },
  { key: 'counters', title: 'Counters', singular: 'counter', hint: 'Kept on the sheet by the player or DM (Renown, Corruption) — @counter.<id>.', columns: [name, id, { key: 'min', label: 'Minimum', type: 'number' }, { key: 'max', label: 'Maximum', type: 'formula', placeholder: 'none' }, { key: 'default', label: 'Starts at', type: 'number' }, description], blank: { id: '', name: '' } },
  { key: 'abilityAliases', title: 'Ability aliases', singular: 'alias', hint: '"Your channelling ability is Wisdom or Charisma" — @alias.<id>.mod.', columns: [name, id, { key: 'options', label: 'Can be', type: 'abilities' }, { key: 'default', label: 'Until picked', type: 'ability' }, description], blank: { id: '', name: '', options: ['wis', 'cha'] } },
  { key: 'damageTypes', title: 'Damage types', singular: 'damage type', hint: '', columns: [name, id], blank: { id: '', name: '' } },
  { key: 'conditions', title: 'Conditions', singular: 'condition', hint: 'Applied from the sheet; their effects apply while they do.', columns: [name, id, { key: 'maxLevel', label: 'Levels (like exhaustion)', type: 'number' }, description, { key: 'effects', label: 'Effects', type: 'effects' }], blank: { id: '', name: '', effects: [] } },
  { advanced: true, key: 'senses', title: 'Senses', singular: 'sense', hint: 'Beyond darkvision, blindsight, tremorsense and truesight — the range is the stat sense.<id>.', columns: [name, id], blank: { id: '', name: '' } },
  { advanced: true, key: 'actionTypes', title: 'Action types', singular: 'action type', hint: 'Besides action / bonus / reaction / free.', columns: [name, id], blank: { id: '', name: '' } },
  { advanced: true, key: 'weaponProperties', title: 'Weapon properties', singular: 'property', hint: '', columns: [name, id, description], blank: { id: '', name: '' } },
  { advanced: true, key: 'spellSchools', title: 'Spell schools', singular: 'school', hint: '', columns: [name, id], blank: { id: '', name: '' } },
  { advanced: true, key: 'currencies', title: 'Currencies', singular: 'currency', hint: 'valueInBase: how many of the base coin one is worth.', columns: [name, id, { key: 'valueInBase', label: 'Worth (base coins)', type: 'number', required: true }], blank: { id: '', name: '', valueInBase: 1 } }
]

/** The pack's vocabulary — every list as rows of fields. */
export function VocabularyForm({ value, onChange }: { value: Obj; onChange: (v: Obj) => void }): JSX.Element {
  const advanced = useAdvanced()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {LISTS.filter((spec) => advanced || !spec.advanced || arr(value[spec.key]).length > 0).map((spec) => {
        const rows = arr<Obj>(value[spec.key])
        const setRows = (next: Obj[]): void => onChange(withKey(value, spec.key, next))
        return (
          <Group key={spec.key} title={`${spec.title}${rows.length ? ` (${rows.length})` : ''}`} collapsible defaultOpen={rows.length > 0}>
            {spec.hint && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{spec.hint}</span>}
            {rows.map((row, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', borderTop: i ? '1px solid var(--border-subtle)' : undefined, paddingTop: i ? 6 : 0 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Grid min={150}>
                    {spec.columns.map((col) => (
                      <Cell key={col.key} col={col} row={row} onChange={(next) => setRows(rows.map((r, j) => (j === i ? next : r)))} />
                    ))}
                  </Grid>
                </div>
                <RowActions label={spec.singular} onRemove={() => setRows(rows.filter((_, j) => j !== i))} />
              </div>
            ))}
            <AddButton onClick={() => setRows([...rows, { ...spec.blank }])}>{spec.singular.charAt(0).toUpperCase() + spec.singular.slice(1)}</AddButton>
          </Group>
        )
      })}
    </div>
  )
}

function Cell({ col, row, onChange }: { col: Column; row: Obj; onChange: (v: Obj) => void }): JSX.Element {
  const set = (v: unknown, required?: boolean): void => onChange(required ? withRequired(row, col.key, v) : withKey(row, col.key, v))
  switch (col.type) {
    case 'id':
      return (
        <Field label={col.label}>
          <IdInput value={str(row.id)} onChange={(v) => set(v, true)} fromName={str(row.name)} />
        </Field>
      )
    case 'text':
      return (
        <Field label={col.label}>
          <TextInput value={str(row[col.key])} onChange={(v) => set(v, col.required)} placeholder={col.placeholder} />
        </Field>
      )
    case 'textarea':
      return (
        <Field label={col.label} wide>
          <TextArea value={str(row[col.key])} onChange={(v) => set(v)} rows={2} />
        </Field>
      )
    case 'number':
      return (
        <Field label={col.label}>
          <NumberInput value={num(row[col.key])} onChange={(v) => set(v, col.required)} />
        </Field>
      )
    case 'formula':
      return (
        <Field label={col.label}>
          <FormulaInput value={str(row[col.key])} onChange={(v) => set(v, col.required)} placeholder={col.placeholder} />
        </Field>
      )
    case 'ability':
      return (
        <Field label={col.label}>
          <AbilitySelect value={str(row[col.key])} onChange={(v) => set(v || undefined, col.required)} none={col.required ? undefined : 'None'} />
        </Field>
      )
    case 'abilities':
      return (
        <Field label={col.label}>
          <AbilityChips value={arr<AbilityId>(row[col.key])} onChange={(v) => onChange(withRequired(row, col.key, v))} />
        </Field>
      )
    case 'check': {
      const on = col.defaultOn ? row[col.key] !== false : !!row[col.key]
      return <Check checked={on} onChange={(v) => set(col.defaultOn ? (v ? undefined : false) : v || undefined)} label={col.label} />
    }
    case 'effects':
      return (
        <Field label={col.label} wide>
          <EffectsEditor value={arr<Obj>(row[col.key])} onChange={(v) => set(v)} />
        </Field>
      )
  }
}

// Every concept the app labels through terminology (shared/content/terms.ts), plus the abilities' names and short forms.
const TERM_KEYS = [
  ...Object.keys(TERM_DEFAULTS),
  ...['str', 'dex', 'con', 'int', 'wis', 'cha'].flatMap((a) => [`ability.${a}`, `ability.${a}.short`]),
  ...['cp', 'sp', 'ep', 'gp', 'pp'].map((c) => `currency.${c}`)
]

/** Renames: one row per concept key → the label this pack shows instead. */
export function TerminologyForm({ value, onChange }: { value: Obj; onChange: (v: Obj) => void }): JSX.Element {
  const entries = Object.entries(value)
  const setEntries = (next: Array<[string, unknown]>): void => onChange(Object.fromEntries(next))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <datalist id="wk-termKeys">
        {TERM_KEYS.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>
      {entries.map(([key, label], i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <Grid min={160}>
              <Field label="Concept">
                <TextInput value={key} onChange={(k) => setEntries(entries.map((e, j) => (j === i ? [k, e[1]] : e)))} list="termKeys" mono />
              </Field>
              <Field label="Shown as">
                <TextInput value={str(label)} onChange={(l) => setEntries(entries.map((e, j) => (j === i ? [e[0], l] : e)))} placeholder={TERM_DEFAULTS[key]} />
              </Field>
            </Grid>
          </div>
          <RowActions label="rename" onRemove={() => setEntries(entries.filter((_, j) => j !== i))} />
        </div>
      ))}
      <AddButton onClick={() => setEntries([...entries, [TERM_KEYS.find((k) => !(k in value)) ?? '', '']])}>Rename</AddButton>
      {entries.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{`Nothing renamed. E.g. "spellSlots" → "Mana Wells", "ability.cha" → "Presence".`}</span>}
    </div>
  )
}
