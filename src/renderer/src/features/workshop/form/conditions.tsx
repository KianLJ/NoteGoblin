import {
  AbilityChips,
  AddButton,
  Check,
  Field,
  FormulaInput,
  Grid,
  NumberInput,
  RowActions,
  Select,
  TagsInput,
  TextInput,
  arr,
  num,
  obj,
  str,
  withKey,
  withRequired,
  type Obj
} from './fields'
import type { AbilityId } from '@shared/content/schema'

// Conditions ("only when…"), item filters and attack filters.

const CONDITION_KINDS = [
  { value: 'formula', label: 'A formula is true' },
  { value: 'level', label: 'Character level' },
  { value: 'classLevel', label: 'Class level' },
  { value: 'subclass', label: 'Has a subclass' },
  { value: 'toggle', label: 'A toggle is on' },
  { value: 'equipped', label: 'Has an item equipped' },
  { value: 'condition', label: 'Has a condition' },
  { value: 'hasEntry', label: 'Has a feat / option / entry' },
  { value: 'all', label: 'All of…' },
  { value: 'any', label: 'Any of…' },
  { value: 'not', label: 'Not…' }
] as const
type ConditionKind = (typeof CONDITION_KINDS)[number]['value']

function blankCondition(kind: ConditionKind): Obj {
  switch (kind) {
    case 'formula':
      return { kind, formula: '' }
    case 'level':
      return { kind, min: 1 }
    case 'classLevel':
      return { kind, classId: '', min: 1 }
    case 'subclass':
      return { kind, subclassId: '' }
    case 'toggle':
      return { kind, toggleId: '' }
    case 'equipped':
      return { kind, filter: {} }
    case 'condition':
      return { kind, conditionId: '' }
    case 'hasEntry':
      return { kind, entryId: '' }
    case 'all':
    case 'any':
      return { kind, of: [] }
    case 'not':
      return { kind, of: { kind: 'formula', formula: '' } }
  }
}

/** One condition, any kind — all / any / not nest further conditions. */
export function ConditionEditor({ value, onChange }: { value: Obj; onChange: (v: Obj) => void }): JSX.Element {
  const kind = str(value.kind) as ConditionKind
  const set = (key: string, v: unknown): void => onChange(withKey(value, key, v))
  const req = (key: string, v: unknown): void => onChange(withRequired(value, key, v))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Select value={kind} onChange={(k) => k && onChange(blankCondition(k))} options={CONDITION_KINDS.map((k) => ({ value: k.value, label: k.label }))} />
      {kind === 'formula' && <FormulaInput value={str(value.formula)} onChange={(v) => req('formula', v)} placeholder="e.g. @cha.score >= 16" />}
      {kind === 'level' && (
        <Grid min={120}>
          <Field label="At least">
            <NumberInput value={num(value.min)} onChange={(v) => set('min', v)} min={1} />
          </Field>
          <Field label="At most">
            <NumberInput value={num(value.max)} onChange={(v) => set('max', v)} min={1} />
          </Field>
        </Grid>
      )}
      {kind === 'classLevel' && (
        <Grid min={140}>
          <Field label="Class">
            <TextInput value={str(value.classId)} onChange={(v) => req('classId', v)} list="classes" />
          </Field>
          <Field label="At least level">
            <NumberInput value={num(value.min)} onChange={(v) => req('min', v ?? 1)} min={1} />
          </Field>
        </Grid>
      )}
      {kind === 'subclass' && <TextInput value={str(value.subclassId)} onChange={(v) => req('subclassId', v)} list="subclasses" placeholder="Subclass id" />}
      {kind === 'toggle' && <TextInput value={str(value.toggleId)} onChange={(v) => req('toggleId', v)} list="toggles" placeholder="Toggle id (or a spell id)" />}
      {kind === 'equipped' && <ItemFilterEditor value={obj(value.filter)} onChange={(v) => req('filter', v)} />}
      {kind === 'condition' && (
        <Grid min={140}>
          <Field label="Condition">
            <TextInput value={str(value.conditionId)} onChange={(v) => req('conditionId', v)} list="conditions" />
          </Field>
          <Field label="At least level">
            <NumberInput value={num(value.minLevel)} onChange={(v) => set('minLevel', v)} min={1} />
          </Field>
        </Grid>
      )}
      {kind === 'hasEntry' && <TextInput value={str(value.entryId)} onChange={(v) => req('entryId', v)} list="entries" placeholder="Entry id — a feat, an option (list/option), a species…" />}
      {(kind === 'all' || kind === 'any') && <ConditionList value={arr<Obj>(value.of)} onChange={(v) => req('of', v)} />}
      {kind === 'not' && (
        <div style={{ paddingLeft: 10, borderLeft: '2px solid var(--border-subtle)' }}>
          <ConditionEditor value={obj(value.of)} onChange={(v) => req('of', v)} />
        </div>
      )}
    </div>
  )
}

function ConditionList({ value, onChange }: { value: Obj[]; onChange: (v: Obj[]) => void }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 10, borderLeft: '2px solid var(--border-subtle)' }}>
      {value.map((c, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <ConditionEditor value={c} onChange={(v) => onChange(value.map((x, j) => (j === i ? v : x)))} />
          </div>
          <RowActions label="condition" onRemove={() => onChange(value.filter((_, j) => j !== i))} />
        </div>
      ))}
      <AddButton onClick={() => onChange([...value, blankCondition('formula')])}>Condition</AddButton>
    </div>
  )
}

/** An optional condition: a checkbox to turn it on, then the editor. */
export function OptionalCondition({ label, value, onChange }: { label: string; value: unknown; onChange: (v: Obj | undefined) => void }): JSX.Element {
  const on = !!value && typeof value === 'object'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Check checked={on} onChange={(v) => onChange(v ? blankCondition('formula') : undefined)} label={label} />
      {on && (
        <div style={{ paddingLeft: 10, borderLeft: '2px solid var(--accent)' }}>
          <ConditionEditor value={obj(value)} onChange={onChange} />
        </div>
      )}
    </div>
  )
}

export function ItemFilterEditor({ value, onChange }: { value: Obj; onChange: (v: Obj) => void }): JSX.Element {
  const tags = (key: string, label: string, list?: string, placeholder?: string): JSX.Element => (
    <Field label={label}>
      <TagsInput value={arr<string>(value[key])} onChange={(v) => onChange(withKey(value, key, v))} list={list} placeholder={placeholder} />
    </Field>
  )
  return (
    <Grid min={160}>
      {tags('armorCategories', 'Armor categories', undefined, 'light, medium, heavy, shield')}
      {tags('weaponCategories', 'Weapon categories', undefined, 'simple, martial')}
      {tags('properties', 'Weapon properties', 'weaponProperties', 'finesse, two-handed…')}
      {tags('categories', 'Item categories', undefined, 'Weapon, Armor…')}
      {tags('itemIds', 'Specific items', 'items')}
    </Grid>
  )
}

/** Narrows an attack modifier ("only melee weapon attacks", "attacks with this item"). */
export function AttackFilterEditor({ value, onChange }: { value: Obj | undefined; onChange: (v: Obj | undefined) => void }): JSX.Element {
  const v = value ?? {}
  const update = (next: Obj): void => onChange(Object.keys(next).length ? next : undefined)
  const kinds = arr<string>(v.kinds)
  return (
    <Grid min={160}>
      <Field label="Range">
        <Select value={str(v.range) as 'melee' | 'ranged' | ''} onChange={(r) => update(withKey(v, 'range', r || undefined))} none="Any" options={[{ value: 'melee', label: 'Melee' }, { value: 'ranged', label: 'Ranged' }]} />
      </Field>
      <Field label="Attack kinds">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['weapon', 'unarmed', 'granted', 'spell'] as const).map((k) => (
            <Check key={k} checked={kinds.includes(k)} onChange={(on) => update(withKey(v, 'kinds', on ? [...kinds, k] : kinds.filter((x) => x !== k)))} label={k} />
          ))}
        </div>
      </Field>
      <Field label="Using abilities">
        <AbilityChips value={arr<AbilityId>(v.abilities)} onChange={(a) => update(withKey(v, 'abilities', a))} />
      </Field>
      <Field label="Specific attacks">
        <TagsInput value={arr<string>(v.attackIds)} onChange={(a) => update(withKey(v, 'attackIds', a))} placeholder="attack ids" />
      </Field>
    </Grid>
  )
}
