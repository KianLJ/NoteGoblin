// The vehicle form — used by the guided "Make something" flow and the full
// pack editor alike, since a vehicle's fields are all plain (no effects to
// translate). See vehicleDefSchema in shared/content/schema.ts.
import type { ReactNode } from 'react'
import { slugify } from '@shared/content/workshop'
import { AddButton, Check, Field, Grid, Group, NumberInput, RowActions, Select, TextArea, TextInput, arr, move, num, str, withKey, withRequired, type Obj } from './fields'

export const VEHICLE_CATEGORIES = ['Mount', 'Land', 'Water', 'Air', 'Space']
const SIZES = ['Medium', 'Large', 'Huge', 'Gargantuan', 'Colossal']
const SPEED_MODES = ['walk', 'fly', 'swim', 'climb', 'burrow', 'sail', 'drive']
const RECHARGES: Array<{ value: 'none' | 'short' | 'long' | 'dawn'; label: string }> = [
  { value: 'none', label: 'Doesn’t recharge' },
  { value: 'short', label: 'Short or long rest' },
  { value: 'long', label: 'Long rest' },
  { value: 'dawn', label: 'At dawn' }
]
const SAVE_ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const
const ABILITY_DEFAULTS = { str: 10, dex: 10, con: 10, int: 2, wis: 10, cha: 5 }

/** An id for a new row from its name, not clashing with the others in the list. */
function rowId(name: string, list: Obj[], fallback: string): string {
  const base = slugify(name) || fallback
  const taken = new Set(list.map((x) => str(x.id)))
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  return id
}

/** A list section: rows with move/remove, and an add button. Rows renamed while their id still matches the old name follow the new name. */
function Rows({
  title,
  singular,
  list,
  onChange,
  blank,
  hint,
  children
}: {
  title: string
  singular: string
  list: Obj[]
  onChange: (next: Obj[]) => void
  blank: () => Obj
  hint?: string
  children: (row: Obj, set: (patch: Obj) => void) => ReactNode
}): JSX.Element {
  const setRow = (i: number, patch: Obj): void => {
    const row = list[i]
    const next = { ...row, ...patch }
    // Keep the id in step with the name until it's been used for something else.
    if ('name' in patch && str(row.id) === rowId(str(row.name), list.filter((_, j) => j !== i), singular.toLowerCase())) {
      next.id = rowId(str(patch.name), list.filter((_, j) => j !== i), singular.toLowerCase())
    }
    onChange(list.map((x, j) => (j === i ? next : x)))
  }
  return (
    <Group title={`${title}${list.length ? ` (${list.length})` : ''}`} collapsible defaultOpen={list.length > 0}>
      {hint && <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{hint}</p>}
      {list.map((row, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', paddingBottom: 8, borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>{children(row, (patch) => setRow(i, patch))}</div>
          <RowActions
            label={singular.toLowerCase()}
            onUp={i > 0 ? () => onChange(move(list, i, -1)) : undefined}
            onDown={i < list.length - 1 ? () => onChange(move(list, i, 1)) : undefined}
            onRemove={() => onChange(list.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      <AddButton onClick={() => onChange([...list, { ...blank(), id: rowId(singular, list, singular.toLowerCase()) }])}>{singular}</AddButton>
    </Group>
  )
}

/** Every field of a vehicle. `value` is the pack entry; `onChange` gets the whole new entry. */
export function VehicleEditor({ value, onChange, showName = true }: { value: Obj; onChange: (v: Obj) => void; showName?: boolean }): JSX.Element {
  const set = (key: string, v: unknown): void => onChange(withKey(value, key, v))
  const req = (key: string, v: unknown): void => onChange(withRequired(value, key, v))
  const list = (key: string): Obj[] => arr<Obj>(value[key])
  const setList = (key: string) => (next: Obj[]): void => set(key, next)
  const stations = list('stations')
  const abilities = value.abilities && typeof value.abilities === 'object' ? (value.abilities as Record<string, number>) : null
  const category = str(value.category) || 'Land'
  const customCategory = !VEHICLE_CATEGORIES.includes(category)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <Grid min={170}>
        {showName && (
          <Field label="Name">
            <TextInput value={str(value.name)} onChange={(v) => req('name', v)} placeholder="Corvette" />
          </Field>
        )}
        <Field label="Kind">
          <Select
            value={customCategory ? '__other' : category}
            onChange={(v) => req('category', v === '__other' ? 'Other' : v || 'Land')}
            options={[...VEHICLE_CATEGORIES.map((c) => ({ value: c, label: c })), { value: '__other', label: 'Something else…' }]}
          />
        </Field>
        {customCategory && (
          <Field label="Kind name">
            <TextInput value={category} onChange={(v) => req('category', v || 'Other')} placeholder="Mech, Airship…" />
          </Field>
        )}
        <Field label="Size">
          <Select value={str(value.size) || 'Large'} onChange={(v) => req('size', v || 'Large')} options={SIZES.map((s) => ({ value: s, label: s }))} />
        </Field>
        <Field label="Armor Class">
          <NumberInput value={num(value.ac)} onChange={(v) => req('ac', v ?? 10)} min={0} />
        </Field>
        <Field label="Hit points" hint="The hull, or the creature">
          <NumberInput value={num(value.hp)} onChange={(v) => req('hp', Math.max(1, v ?? 1))} min={1} />
        </Field>
        <Field label="Damage threshold" hint="Smaller hits do nothing (0: none)">
          <NumberInput value={num(value.damageThreshold)} onChange={(v) => set('damageThreshold', v || undefined)} min={0} />
        </Field>
        <Field label="Crew">
          <NumberInput value={num(value.crew)} onChange={(v) => set('crew', v || undefined)} min={0} />
        </Field>
        <Field label="Passengers">
          <NumberInput value={num(value.passengers)} onChange={(v) => set('passengers', v || undefined)} min={0} />
        </Field>
        <Field label="Cargo capacity">
          <TextInput value={str(value.cargo)} onChange={(v) => set('cargo', v)} placeholder="2 tons" />
        </Field>
        <Field label="Cost">
          <TextInput value={str(value.cost)} onChange={(v) => set('cost', v)} placeholder="20,000 gp" />
        </Field>
      </Grid>
      <Field label="Description">
        <TextArea value={str(value.description)} onChange={(v) => set('description', v)} rows={3} placeholder="What it looks like and what it’s for." />
      </Field>

      <Group title="Speeds">
        {list('speeds').map((sp, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <TextInput value={str(sp.mode)} onChange={(v) => set('speeds', list('speeds').map((x, j) => (j === i ? { ...x, mode: v } : x)))} list="vehicle-speed-modes" placeholder="fly" style={{ width: 120 }} />
            <TextInput value={str(sp.value)} onChange={(v) => set('speeds', list('speeds').map((x, j) => (j === i ? { ...x, value: v } : x)))} placeholder="60 ft., Warp 3, 8 mph" />
            <RowActions label="speed" onRemove={() => set('speeds', list('speeds').filter((_, j) => j !== i))} />
          </div>
        ))}
        <datalist id="vehicle-speed-modes">
          {SPEED_MODES.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <AddButton onClick={() => set('speeds', [...list('speeds'), { mode: list('speeds').length ? 'fly' : 'walk', value: '30 ft.' }])}>speed</AddButton>
      </Group>

      <Group title="Creature stats" collapsible defaultOpen={!!abilities}>
        <Check
          checked={!!abilities}
          onChange={(on) => set('abilities', on ? { ...ABILITY_DEFAULTS, str: 16, con: 14 } : undefined)}
          label="It’s a creature (a mount or beast of burden) with ability scores"
        />
        {abilities && (
          <Grid min={70}>
            {SAVE_ABILITIES.map((a) => (
              <Field key={a} label={a.toUpperCase()}>
                <NumberInput value={abilities[a]} onChange={(v) => req('abilities', { ...abilities, [a]: v ?? 10 })} min={1} max={30} />
              </Field>
            ))}
          </Grid>
        )}
      </Group>

      <Rows
        title="Components"
        singular="Component"
        list={list('components')}
        onChange={setList('components')}
        blank={() => ({ name: 'Component', hp: 30 })}
        hint="Parts that take damage on their own: engines, shields, sails, a weapons bay. Leave empty if the vehicle is just one hit point pool."
      >
        {(row, patch) => (
          <>
            <Grid min={110}>
              <Field label="Name">
                <TextInput value={str(row.name)} onChange={(v) => patch({ name: v })} placeholder="Engines" />
              </Field>
              <Field label="Hit points">
                <NumberInput value={num(row.hp)} onChange={(v) => patch({ hp: Math.max(1, v ?? 1) })} min={1} />
              </Field>
              <Field label="AC" hint="Blank: the vehicle’s">
                <NumberInput value={num(row.ac)} onChange={(v) => patch({ ac: v })} min={0} />
              </Field>
              <Field label="Threshold">
                <NumberInput value={num(row.threshold)} onChange={(v) => patch({ threshold: v ?? 0 })} min={0} />
              </Field>
            </Grid>
            <TextInput value={str(row.notes)} onChange={(v) => patch({ notes: v })} placeholder="At 0 hit points: the ship can’t move" />
          </>
        )}
      </Rows>

      <Rows title="Crew stations" singular="Station" list={stations} onChange={setList('stations')} blank={() => ({ name: 'Station', count: 1 })} hint="Where crew sit: Pilot, Gunner, Engineer. Weapons can be fired from a station.">
        {(row, patch) => (
          <Grid min={140}>
            <Field label="Name">
              <TextInput value={str(row.name)} onChange={(v) => patch({ name: v })} placeholder="Gunner" />
            </Field>
            <Field label="Crew it takes">
              <NumberInput value={num(row.count)} onChange={(v) => patch({ count: Math.max(1, v ?? 1) })} min={1} />
            </Field>
            <Field label="What it does">
              <TextInput value={str(row.notes)} onChange={(v) => patch({ notes: v })} placeholder="Fires the forward lasers" />
            </Field>
          </Grid>
        )}
      </Rows>

      <Rows title="Weapons" singular="Weapon" list={list('weapons')} onChange={setList('weapons')} blank={() => ({ name: 'Weapon', attackBonus: 5, damage: '2d10', damageType: 'Piercing' })}>
        {(row, patch) => {
          const usesSave = num(row.saveDc) !== undefined
          return (
            <>
              <Grid min={130}>
                <Field label="Name">
                  <TextInput value={str(row.name)} onChange={(v) => patch({ name: v })} placeholder="Ballista" />
                </Field>
                <Field label="Fired from">
                  <Select value={str(row.station)} onChange={(v) => patch({ station: v || undefined })} options={stations.map((st) => ({ value: str(st.id), label: str(st.name) }))} none="Any station" />
                </Field>
                <Field label="Hits with">
                  <Select
                    value={usesSave ? 'save' : 'attack'}
                    onChange={(v) => patch(v === 'save' ? { saveDc: 13, saveAbility: 'dex', attackBonus: undefined } : { attackBonus: 5, saveDc: undefined, saveAbility: undefined })}
                    options={[
                      { value: 'attack', label: 'An attack roll' },
                      { value: 'save', label: 'A saving throw' }
                    ]}
                  />
                </Field>
                {usesSave ? (
                  <>
                    <Field label="Save DC">
                      <NumberInput value={num(row.saveDc)} onChange={(v) => patch({ saveDc: v ?? 10 })} min={1} />
                    </Field>
                    <Field label="Save">
                      <Select value={str(row.saveAbility) as 'dex'} onChange={(v) => patch({ saveAbility: v || 'dex' })} options={SAVE_ABILITIES.map((a) => ({ value: a, label: a.toUpperCase() }))} />
                    </Field>
                  </>
                ) : (
                  <Field label="Attack bonus">
                    <NumberInput value={num(row.attackBonus)} onChange={(v) => patch({ attackBonus: v ?? 0 })} />
                  </Field>
                )}
                <Field label="Damage">
                  <TextInput value={str(row.damage)} onChange={(v) => patch({ damage: v })} placeholder="3d10" />
                </Field>
                <Field label="Damage type">
                  <TextInput value={str(row.damageType)} onChange={(v) => patch({ damageType: v })} placeholder="Piercing" />
                </Field>
                <Field label="Range">
                  <TextInput value={str(row.range)} onChange={(v) => patch({ range: v })} placeholder="120/480 ft." />
                </Field>
                <Field label="Ammo" hint="Blank: unlimited">
                  <NumberInput value={num(row.ammo)} onChange={(v) => patch({ ammo: v || undefined })} min={1} />
                </Field>
              </Grid>
              <TextInput value={str(row.notes)} onChange={(v) => patch({ notes: v })} placeholder="Takes a full round to reload" />
            </>
          )
        }}
      </Rows>

      <Rows title="Resources" singular="Resource" list={list('resources')} onChange={setList('resources')} blank={() => ({ name: 'Fuel', max: 10, recharge: 'none' })} hint="Anything that runs down: fuel, shield charges, oxygen, a mount’s stamina.">
        {(row, patch) => (
          <Grid min={140}>
            <Field label="Name">
              <TextInput value={str(row.name)} onChange={(v) => patch({ name: v })} placeholder="Shield charges" />
            </Field>
            <Field label="Most">
              <NumberInput value={num(row.max)} onChange={(v) => patch({ max: Math.max(1, v ?? 1) })} min={1} />
            </Field>
            <Field label="Comes back">
              <Select value={(str(row.recharge) || 'none') as 'none'} onChange={(v) => patch({ recharge: v || 'none' })} options={RECHARGES} />
            </Field>
          </Grid>
        )}
      </Rows>

      {(['traits', 'actions'] as const).map((key) => (
        <Rows
          key={key}
          title={key === 'traits' ? 'Traits' : 'Actions'}
          singular={key === 'traits' ? 'Trait' : 'Action'}
          list={list(key)}
          onChange={setList(key)}
          blank={() => ({ name: '', desc: '' })}
          hint={key === 'actions' ? 'Things the vehicle or its crew can do. Write `dice: 2d6` to make a roll clickable.' : undefined}
        >
          {(row, patch) => (
            <>
              <TextInput value={str(row.name)} onChange={(v) => patch({ name: v })} placeholder={key === 'traits' ? 'Sealed Hull' : 'Evasive Manoeuvre'} />
              <TextArea value={str(row.desc)} onChange={(v) => patch({ desc: v })} rows={2} />
            </>
          )}
        </Rows>
      ))}
    </div>
  )
}
