import { useContext, type ReactNode } from 'react'
import type { EntryKind } from '@shared/content/registry'
import type { AbilityId } from '@shared/content/schema'
import { OptionalCondition } from './conditions'
import { EffectsEditor, ResourceEditor, SpellcastingEditor } from './effects'
import {
  AbilityChips,
  AbilitySelect,
  AddButton,
  Advanced,
  Check,
  Field,
  FormulaInput,
  Grid,
  Group,
  IdInput,
  NumberInput,
  RowActions,
  ScopeContext,
  Select,
  TagsInput,
  TextArea,
  TextInput,
  arr,
  move,
  num,
  obj,
  str,
  withKey,
  withRequired,
  type Obj
} from './fields'
import { FeaturesEditor, LevelTable } from './levels'
import { VehicleEditor } from './vehicle'
import { renderStatblockHtml, type StatblockData } from '../../../statblock'
import { rollInlineDice } from '../../dice/inlineDice'

/** The form for one entry of any kind (monsters keep the JSON view — their statblock shape gets effects in phase 8). */
export function EntryForm({ kind, value, packId, onChange }: { kind: EntryKind; value: Obj; packId: string; onChange: (v: Obj) => void }): JSX.Element {
  switch (kind) {
    case 'classes':
      return <ClassForm value={value} onChange={onChange} />
    case 'subclasses':
      return <SubclassForm value={value} onChange={onChange} />
    case 'archetypes':
      return <ArchetypeForm value={value} packId={packId} onChange={onChange} />
    case 'species':
      return <SpeciesForm value={value} onChange={onChange} />
    case 'backgrounds':
      return <BackgroundForm value={value} onChange={onChange} />
    case 'feats':
      return <FeatForm value={value} onChange={onChange} />
    case 'optionLists':
      return <OptionListForm value={value} onChange={onChange} />
    case 'spells':
      return <SpellForm value={value} onChange={onChange} />
    case 'items':
      return <ItemForm value={value} onChange={onChange} />
    case 'monsters':
      return <MonsterForm value={value} onChange={onChange} />
    case 'vehicles':
      return (
        <>
          <Field label="Id" hint="How campaigns refer to it.">
            <IdInput value={str(value.id)} onChange={(v) => onChange(withRequired(value, 'id', v))} fromName={str(value.name)} />
          </Field>
          <VehicleEditor value={value} onChange={onChange} />
        </>
      )
  }
}

type FormProps = { value: Obj; onChange: (v: Obj) => void }

const columnsOf = (value: Obj): Array<{ id: string; label: string }> => arr<Obj>(value.columns).map((c) => ({ id: str(c.id), label: str(c.label) }))

/** Name, id, description, and the override / source citation every entry has. */
function Basics({ value, onChange, children }: FormProps & { children?: ReactNode }): JSX.Element {
  return (
    <Grid min={190}>
      <Field label="Name">
        <TextInput value={str(value.name)} onChange={(v) => onChange(withRequired(value, 'name', v))} />
      </Field>
      <Field label="Id" hint="How sheets and other entries refer to it.">
        <IdInput value={str(value.id)} onChange={(v) => onChange(withRequired(value, 'id', v))} fromName={str(value.name)} />
      </Field>
      {children}
      <Advanced>
        <Field label="Source" hint='A citation, e.g. "Homebrew Guide p. 42"'>
          <TextInput value={str(value.source)} onChange={(v) => onChange(withKey(value, 'source', v))} />
        </Field>
        <Field label="Replaces (override)" hint="An entry from a pack this builds on — this one takes its place and id.">
          <TextInput value={str(value.overrides)} onChange={(v) => onChange(withKey(value, 'overrides', v))} mono />
        </Field>
      </Advanced>
      <Field label="Description" wide>
        <TextArea value={str(value.description)} onChange={(v) => onChange(withKey(value, 'description', v))} rows={3} />
      </Field>
    </Grid>
  )
}

function Progression({ value, onChange, showProficiency }: FormProps & { showProficiency?: boolean }): JSX.Element {
  return (
    <Group title="Progression">
      <LevelTable
        columns={arr<Obj>(value.columns)}
        levels={arr<Obj>(value.levels)}
        showProficiency={showProficiency}
        onChange={({ columns, levels }) => onChange(withKey(withKey(value, 'columns', columns), 'levels', levels))}
      />
    </Group>
  )
}

function OptionalSpellcasting({ value, onChange }: FormProps): JSX.Element {
  const on = !!value.spellcasting
  return (
    <Group title={<Check checked={on} onChange={(v) => onChange(withKey(value, 'spellcasting', v ? { ability: 'int' } : undefined))} label="Spellcasting" />}>
      {on && <SpellcastingEditor value={obj(value.spellcasting)} onChange={(v) => onChange(withRequired(value, 'spellcasting', v))} />}
    </Group>
  )
}

function ClassForm({ value, onChange }: FormProps): JSX.Element {
  const set = (key: string, v: unknown): void => onChange(withKey(value, key, v))
  const skillChoice = value.skillChoice ? obj(value.skillChoice) : undefined
  return (
    <ScopeContext.Provider value={{ inClass: true, columns: columnsOf(value) }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <Basics value={value} onChange={onChange} />
        <Group title="Hit points and proficiencies">
          <Grid min={180}>
            <Field label="Hit die">
              <Select
                value={String(num(value.hitDie) ?? 8) as '8'}
                onChange={(v) => onChange(withRequired(value, 'hitDie', Number(v || 8)))}
                options={['4', '6', '8', '10', '12', '20'].map((d) => ({ value: d as '8', label: `d${d}` }))}
              />
            </Field>
            <Advanced>
              <Field label="HP at level 1" hint="Empty = the full hit die (+ CON)">
                <FormulaInput value={str(value.hpFirstLevel)} onChange={(v) => set('hpFirstLevel', v)} />
              </Field>
              <Field label="HP per later level" hint="Empty = the die's average (+ CON)">
                <FormulaInput value={str(value.hpPerLevel)} onChange={(v) => set('hpPerLevel', v)} />
              </Field>
            </Advanced>
            <Field label="Primary abilities">
              <AbilityChips value={arr<AbilityId>(value.primaryAbilities)} onChange={(v) => set('primaryAbilities', v)} />
            </Field>
            <Field label="Saving throws">
              <AbilityChips value={arr<AbilityId>(value.saves)} onChange={(v) => set('saves', v)} />
            </Field>
            <Field label="Armor">
              <TagsInput value={arr<string>(value.armorProficiencies)} onChange={(v) => set('armorProficiencies', v)} placeholder="light, medium, shield" />
            </Field>
            <Field label="Weapons">
              <TagsInput value={arr<string>(value.weaponProficiencies)} onChange={(v) => set('weaponProficiencies', v)} placeholder="simple, martial" />
            </Field>
            <Field label="Tools">
              <TagsInput value={arr<string>(value.toolProficiencies)} onChange={(v) => set('toolProficiencies', v)} />
            </Field>
            <Field label="Skill choices">
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <NumberInput
                  value={num(skillChoice?.count)}
                  onChange={(n) => set('skillChoice', n === undefined ? undefined : { from: [], ...skillChoice, count: n })}
                  min={0}
                  width={60}
                  placeholder="0"
                />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>from</span>
              </div>
            </Field>
            {skillChoice && (
              <Field label="Skills to choose from" wide>
                <TagsInput value={arr<string>(skillChoice.from)} onChange={(v) => set('skillChoice', { ...skillChoice, from: v })} list="skills" />
              </Field>
            )}
          </Grid>
        </Group>
        <Group title="Subclass and multiclassing" collapsible defaultOpen={false}>
          <Grid min={180}>
            <Field label="Subclass at level">
              <NumberInput value={num(value.subclassLevel)} onChange={(v) => set('subclassLevel', v)} min={1} placeholder="3" />
            </Field>
            <Field label="Called" hint='Instead of "Subclass"'>
              <TextInput value={str(value.subclassLabel)} onChange={(v) => set('subclassLabel', v)} placeholder="Subclass" />
            </Field>
            <Field label="Multiclassing">
              <Select value={(str(value.multiclass) || 'allowed') as 'allowed'} onChange={(v) => set('multiclass', v === 'never' ? 'never' : undefined)} options={[{ value: 'allowed', label: 'Allowed' }, { value: 'never', label: 'Never' }]} />
            </Field>
            <Advanced>
              <Field label="Proficiencies when multiclassed into" hint='"armor:light", "weapon:martial", "tool:…"'>
                <TagsInput value={arr<string>(value.multiclassProficiencies)} onChange={(v) => set('multiclassProficiencies', v)} />
              </Field>
            </Advanced>
          </Grid>
          <Advanced>
            <OptionalCondition label="Multiclass prerequisite" value={value.multiclassPrerequisite} onChange={(v) => set('multiclassPrerequisite', v)} />
          </Advanced>
        </Group>
        <OptionalSpellcasting value={value} onChange={onChange} />
        <Progression value={value} onChange={onChange} showProficiency />
      </div>
    </ScopeContext.Provider>
  )
}

function SubclassForm({ value, onChange }: FormProps): JSX.Element {
  return (
    <ScopeContext.Provider value={{ inClass: true, columns: columnsOf(value) }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <Basics value={value} onChange={onChange}>
          <Field label="Class">
            <TextInput value={str(value.classId)} onChange={(v) => onChange(withRequired(value, 'classId', v))} list="classes" />
          </Field>
        </Basics>
        <OptionalSpellcasting value={value} onChange={onChange} />
        <Progression value={value} onChange={onChange} />
      </div>
    </ScopeContext.Provider>
  )
}

function ArchetypeForm({ value, packId, onChange }: FormProps & { packId: string }): JSX.Element {
  const set = (key: string, v: unknown): void => onChange(withKey(value, key, v))
  const outer = useContext(ScopeContext)
  return (
    <ScopeContext.Provider value={{ ...outer, inClass: true, archetypeId: `${packId}:${str(value.id)}`, columns: columnsOf(value) }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <Basics value={value} onChange={onChange}>
          <Field label="Tags" hint="Choices offer archetypes by tag">
            <TagsInput value={arr<string>(value.tags)} onChange={(v) => set('tags', v)} list="archetypeTags" />
          </Field>
          <Field label="Features unlock by">
            <Select
              value={(str(value.levelBasis) || 'grantingClass') as 'grantingClass'}
              onChange={(v) => set('levelBasis', v === 'grantingClass' ? undefined : v)}
              options={[
                { value: 'grantingClass', label: 'The level of the class that grants it' },
                { value: 'highestClass', label: 'The highest class level' },
                { value: 'character', label: 'Character level' }
              ]}
            />
          </Field>
          <Check checked={value.unique !== false} onChange={(v) => set('unique', v ? undefined : false)} label="A character can only have it once" />
        </Basics>
        <OptionalCondition label="Prerequisite" value={value.prerequisite} onChange={(v) => set('prerequisite', v)} />
        <Progression value={value} onChange={onChange} />
      </div>
    </ScopeContext.Provider>
  )
}

function SpeciesForm({ value, onChange }: FormProps): JSX.Element {
  return (
    <ScopeContext.Provider value={{ inClass: false }}>
      <SpeciesFields value={value} onChange={onChange} />
    </ScopeContext.Provider>
  )
}

function SpeciesFields({ value, onChange }: FormProps): JSX.Element {
  const set = (key: string, v: unknown): void => onChange(withKey(value, key, v))
  const speed = obj(value.speed)
  const entries = Object.entries(speed)
  const setSpeed = (next: Array<[string, unknown]>): void => set('speed', next.length ? Object.fromEntries(next) : undefined)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <Basics value={value} onChange={onChange}>
        <Field label="Size">
          <TextInput value={str(value.size)} onChange={(v) => set('size', v)} placeholder="Medium" />
        </Field>
      </Basics>
      <Group title="Speeds">
        {entries.map(([kind, formula], i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <Grid min={140}>
                <Field label="Kind">
                  <TextInput value={kind} onChange={(k) => setSpeed(entries.map((e, j) => (j === i ? [k, e[1]] : e)))} placeholder="walk, fly, swim, climb" />
                </Field>
                <Field label="Feet">
                  <FormulaInput value={str(formula)} onChange={(f) => setSpeed(entries.map((e, j) => (j === i ? [e[0], f] : e)))} />
                </Field>
              </Grid>
            </div>
            <RowActions label="speed" onRemove={() => setSpeed(entries.filter((_, j) => j !== i))} />
          </div>
        ))}
        <AddButton onClick={() => setSpeed([...entries, [entries.some(([k]) => k === 'walk') ? 'fly' : 'walk', '30']])}>Speed</AddButton>
      </Group>
      <Group title="Traits">
        <FeaturesEditor value={arr<Obj>(value.traits)} onChange={(v) => set('traits', v)} addLabel="Trait" />
      </Group>
    </div>
  )
}

function BackgroundForm({ value, onChange }: FormProps): JSX.Element {
  return (
    <ScopeContext.Provider value={{ inClass: false }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <Basics value={value} onChange={onChange} />
        <Group title="Features">
          <FeaturesEditor value={arr<Obj>(value.features)} onChange={(v) => onChange(withKey(value, 'features', v))} />
        </Group>
      </div>
    </ScopeContext.Provider>
  )
}

function FeatForm({ value, onChange }: FormProps): JSX.Element {
  const set = (key: string, v: unknown): void => onChange(withKey(value, key, v))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <Basics value={value} onChange={onChange}>
        <Field label="Category" hint="Choices offer feats by category">
          <TextInput value={str(value.category)} onChange={(v) => set('category', v)} list="featCategories" placeholder="General" />
        </Field>
        <Field label="Prerequisite (as shown)">
          <TextInput value={str(value.prerequisiteText)} onChange={(v) => set('prerequisiteText', v)} placeholder="Strength 13 or higher" />
        </Field>
        <Check checked={!!value.repeatable} onChange={(v) => set('repeatable', v || undefined)} label="Can be taken more than once" />
      </Basics>
      <OptionalCondition label="Prerequisite (checked)" value={value.prerequisite} onChange={(v) => set('prerequisite', v)} />
      <Group title="Effects">
        <EffectsEditor value={arr<Obj>(value.effects)} onChange={(v) => set('effects', v)} />
      </Group>
    </div>
  )
}

function OptionListForm({ value, onChange }: FormProps): JSX.Element {
  const options = arr<Obj>(value.options)
  const setOptions = (next: Obj[]): void => onChange(withRequired(value, 'options', next))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <Basics value={value} onChange={onChange} />
      <Group title="Options">
        {options.map((o, i) => (
          <Group
            key={i}
            collapsible
            defaultOpen={!str(o.name)}
            title={
              <span>
                {str(o.name) || 'Unnamed'}
                {o.cost !== undefined && <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>{str(o.cost)} pt</span>}
              </span>
            }
            actions={
              <RowActions
                label="option"
                onUp={i > 0 ? () => setOptions(move(options, i, -1)) : undefined}
                onDown={i < options.length - 1 ? () => setOptions(move(options, i, 1)) : undefined}
                onRemove={() => setOptions(options.filter((_, j) => j !== i))}
              />
            }
          >
            <OptionEditor value={o} onChange={(v) => setOptions(options.map((x, j) => (j === i ? v : x)))} />
          </Group>
        ))}
        <AddButton onClick={() => setOptions([...options, { id: `option-${options.length + 1}`, name: '', description: '', effects: [] }])}>Option</AddButton>
      </Group>
    </div>
  )
}

function OptionEditor({ value, onChange }: FormProps): JSX.Element {
  const set = (key: string, v: unknown): void => onChange(withKey(value, key, v))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Grid min={170}>
        <Field label="Name">
          <TextInput value={str(value.name)} onChange={(v) => onChange(withRequired(value, 'name', v))} />
        </Field>
        <Field label="Id">
          <IdInput value={str(value.id)} onChange={(v) => onChange(withRequired(value, 'id', v))} fromName={str(value.name)} />
        </Field>
        <Field label="Point cost" hint="For point-buy choices (default 1)">
          <FormulaInput value={str(value.cost)} onChange={(v) => set('cost', v)} placeholder="1" />
        </Field>
        <Field label="Group" hint="Matches a choice's group limits">
          <TextInput value={str(value.group)} onChange={(v) => set('group', v)} mono />
        </Field>
        <Field label="Description" wide>
          <TextArea value={str(value.description)} onChange={(v) => set('description', v)} rows={2} />
        </Field>
      </Grid>
      <OptionalCondition label="Prerequisite" value={value.prerequisite} onChange={(v) => set('prerequisite', v)} />
      <Field label="Effects">
        <EffectsEditor value={arr<Obj>(value.effects)} onChange={(v) => set('effects', v)} />
      </Field>
    </div>
  )
}

function SpellForm({ value, onChange }: FormProps): JSX.Element {
  const set = (key: string, v: unknown): void => onChange(withKey(value, key, v))
  const text = (key: string, label: string, placeholder?: string): JSX.Element => (
    <Field label={label}>
      <TextInput value={str(value[key])} onChange={(v) => set(key, v)} placeholder={placeholder} />
    </Field>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <Basics value={value} onChange={onChange}>
        <Field label="Level" hint="0 = cantrip">
          <NumberInput value={num(value.level)} onChange={(v) => onChange(withRequired(value, 'level', v ?? 0))} min={0} max={20} />
        </Field>
        {text('school', 'School', 'Evocation')}
      </Basics>
      <Group title="Casting">
        <Grid min={160}>
          {text('castingTime', 'Casting time', '1 action')}
          {text('range', 'Range', '60 feet')}
          {text('components', 'Components', 'V, S, M')}
          {text('duration', 'Duration', 'Instantaneous')}
          <Check checked={!!value.concentration} onChange={(v) => set('concentration', v || undefined)} label="Concentration" />
          <Check checked={!!value.ritual} onChange={(v) => set('ritual', v || undefined)} label="Ritual" />
          <Field label="Spell lists" hint="Class ids whose list includes it">
            <TagsInput value={arr<string>(value.lists)} onChange={(v) => set('lists', v)} list="classes" />
          </Field>
        </Grid>
      </Group>
      <Group title="Rolls">
        <Grid min={160}>
          <Field label="Attack">
            <Select value={str(value.attackType) as 'melee'} onChange={(v) => set('attackType', v || undefined)} none="No attack roll" options={[{ value: 'melee', label: 'Melee spell attack' }, { value: 'ranged', label: 'Ranged spell attack' }]} />
          </Field>
          <Field label="Saving throw">
            <AbilitySelect value={str(value.saveAbility)} onChange={(v) => set('saveAbility', v || undefined)} none="None" />
          </Field>
          <Field label="Damage" hint="@slotLevel for upcasting">
            <FormulaInput value={str(value.damage)} onChange={(v) => set('damage', v)} dice />
          </Field>
          <Field label="Damage type">
            <TextInput value={str(value.damageType)} onChange={(v) => set('damageType', v)} list="damageTypes" />
          </Field>
          <Field label="Healing">
            <FormulaInput value={str(value.healing)} onChange={(v) => set('healing', v)} dice />
          </Field>
          <Field label="At higher levels" wide>
            <TextArea value={str(value.higherLevel)} onChange={(v) => set('higherLevel', v)} rows={2} />
          </Field>
        </Grid>
      </Group>
      <Group title="While active" collapsible defaultOpen={arr(value.effects).length > 0}>
        <EffectsEditor value={arr<Obj>(value.effects)} onChange={(v) => set('effects', v)} hint="Applied to the caster while the spell's toggle is on (Mage Armor's AC, a homebrew buff)." />
      </Group>
    </div>
  )
}

function ItemForm({ value, onChange }: FormProps): JSX.Element {
  const set = (key: string, v: unknown): void => onChange(withKey(value, key, v))
  const weapon = value.weapon ? obj(value.weapon) : undefined
  const armor = value.armor ? obj(value.armor) : undefined
  const setWeapon = (key: string, v: unknown, required = false): void => set('weapon', required ? withRequired(weapon ?? {}, key, v) : withKey(weapon ?? {}, key, v))
  const setArmor = (key: string, v: unknown, required = false): void => set('armor', required ? withRequired(armor ?? {}, key, v) : withKey(armor ?? {}, key, v))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <Basics value={value} onChange={onChange}>
        <Field label="Category">
          <TextInput value={str(value.category)} onChange={(v) => onChange(withRequired(value, 'category', v))} placeholder="Weapon, Armor, Wondrous Item…" />
        </Field>
        <Field label="Rarity">
          <TextInput value={str(value.rarity)} onChange={(v) => set('rarity', v)} placeholder="Uncommon" />
        </Field>
        <Field label="Cost">
          <TextInput value={str(value.cost)} onChange={(v) => set('cost', v)} placeholder="50 gp" />
        </Field>
        <Field label="Weight (lb)">
          <NumberInput value={num(value.weight)} onChange={(v) => set('weight', v)} min={0} />
        </Field>
        <Check checked={!!value.requiresAttunement} onChange={(v) => set('requiresAttunement', v || undefined)} label="Requires attunement" />
        <Advanced>
          <Field label="Effects apply when">
          <Select
            value={(str(value.effectsWhen) || 'equipped') as 'equipped'}
            onChange={(v) => set('effectsWhen', v === 'equipped' ? undefined : v)}
            options={[
              { value: 'equipped', label: 'Equipped' },
              { value: 'attuned', label: 'Attuned (and equipped)' },
              { value: 'carried', label: 'Carried' }
            ]}
          />
          </Field>
        </Advanced>
      </Basics>
      <Group title={<Check checked={!!weapon} onChange={(v) => set('weapon', v ? { category: 'simple', range: 'melee', damage: '1d6', damageType: 'bludgeoning' } : undefined)} label="Weapon" />}>
        {weapon && (
          <Grid min={150}>
            <Field label="Weapon category">
              <TextInput value={str(weapon.category)} onChange={(v) => setWeapon('category', v, true)} placeholder="simple, martial" />
            </Field>
            <Field label="Range">
              <Select value={str(weapon.range) as 'melee'} onChange={(v) => setWeapon('range', v || 'melee', true)} options={[{ value: 'melee', label: 'Melee' }, { value: 'ranged', label: 'Ranged' }]} />
            </Field>
            <Field label="Damage">
              <FormulaInput value={str(weapon.damage)} onChange={(v) => setWeapon('damage', v, true)} dice />
            </Field>
            <Field label="Damage type">
              <TextInput value={str(weapon.damageType)} onChange={(v) => setWeapon('damageType', v, true)} list="damageTypes" />
            </Field>
            <Advanced>
              <Field label="Versatile damage">
                <FormulaInput value={str(weapon.versatileDamage)} onChange={(v) => setWeapon('versatileDamage', v)} dice />
              </Field>
            </Advanced>
            <Field label="Properties">
              <TagsInput value={arr<string>(weapon.properties)} onChange={(v) => setWeapon('properties', v)} list="weaponProperties" />
            </Field>
            <Field label="Normal range (ft)">
              <NumberInput value={num(weapon.normalRange)} onChange={(v) => setWeapon('normalRange', v)} min={0} />
            </Field>
            <Field label="Long range (ft)">
              <NumberInput value={num(weapon.longRange)} onChange={(v) => setWeapon('longRange', v)} min={0} />
            </Field>
            <Advanced>
              <Field label="Mastery">
                <TextInput value={str(weapon.mastery)} onChange={(v) => setWeapon('mastery', v)} />
              </Field>
            </Advanced>
          </Grid>
        )}
      </Group>
      <Group title={<Check checked={!!armor} onChange={(v) => set('armor', v ? { category: 'light' } : undefined)} label="Armor" />}>
        {armor && (
          <>
            <Grid min={150}>
              <Field label="Armor category">
                <TextInput value={str(armor.category)} onChange={(v) => setArmor('category', v, true)} placeholder="light, medium, heavy, shield" />
              </Field>
              <Field label="Strength needed">
                <NumberInput value={num(armor.strengthRequirement)} onChange={(v) => setArmor('strengthRequirement', v)} min={0} />
              </Field>
              <Check checked={!!armor.stealthDisadvantage} onChange={(v) => setArmor('stealthDisadvantage', v || undefined)} label="Disadvantage on Stealth" />
            </Grid>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Its AC is an effect below — an AC formula (e.g. "13 + min(@dex.mod, 2)") or "Change a number: ac +2" for a shield.</span>
          </>
        )}
      </Group>
      <Group title={<Check checked={!!value.charges} onChange={(v) => set('charges', v ? { id: 'charges', name: 'Charges', max: '3', recharge: 'dawn' } : undefined)} label="Charges" />}>
        {!!value.charges && <ResourceEditor value={obj(value.charges)} onChange={(v) => onChange(withRequired(value, 'charges', v))} />}
      </Group>
      <Group title="Effects">
        <EffectsEditor value={arr<Obj>(value.effects)} onChange={(v) => set('effects', v)} />
      </Group>
    </div>
  )
}

const STAT_FIELDS: Array<[string, string, string]> = [
  ['size', 'Size', 'Medium'],
  ['type', 'Type', 'beast'],
  ['alignment', 'Alignment', 'unaligned'],
  ['ac', 'Armor Class', '13 (natural armor)'],
  ['initiative', 'Initiative', '+2 (12)'],
  ['hp', 'Hit Points', '22 (4d8 + 4)'],
  ['speed', 'Speed', '30 ft., climb 20 ft.'],
  ['cr', 'Challenge', '1/2']
]
const DETAIL_FIELDS: Array<[string, string]> = [
  ['saves', 'Saving throws'],
  ['skills', 'Skills'],
  ['damage_vulnerabilities', 'Damage vulnerabilities'],
  ['damage_resistances', 'Damage resistances'],
  ['damage_immunities', 'Damage immunities'],
  ['condition_immunities', 'Condition immunities'],
  ['senses', 'Senses'],
  ['languages', 'Languages']
]
const BLOCKS: Array<[string, string, string]> = [
  ['traits', 'Traits', 'Trait'],
  ['actions', 'Actions', 'Action'],
  ['bonus_actions', 'Bonus actions', 'Bonus action'],
  ['reactions', 'Reactions', 'Reaction'],
  ['legendary_actions', 'Legendary actions', 'Legendary action'],
  ['lair_actions', 'Lair actions', 'Lair action']
]

/** A creature as a statblock — the same shape a ```statblock note block and the SRD bestiary use — with a live preview. */
function MonsterForm({ value, onChange }: FormProps): JSX.Element {
  const set = (key: string, v: unknown): void => onChange(withKey(value, key, v))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-4)', alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <Grid min={170}>
          <Field label="Name">
            <TextInput value={str(value.name)} onChange={(v) => onChange(withRequired(value, 'name', v))} />
          </Field>
          <Field label="Id">
            <IdInput value={str(value.id)} onChange={(v) => onChange(withRequired(value, 'id', v))} fromName={str(value.name)} />
          </Field>
          {STAT_FIELDS.map(([key, label, placeholder]) => (
            <Field key={key} label={label}>
              <TextInput value={str(value[key])} onChange={(v) => set(key, v)} placeholder={placeholder} />
            </Field>
          ))}
        </Grid>
        <Group title="Ability scores">
          <Grid min={70}>
            {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((a) => (
              <Field key={a} label={a.toUpperCase()}>
                <TextInput value={str(value[a])} onChange={(v) => set(a, v)} placeholder="10" />
              </Field>
            ))}
          </Grid>
        </Group>
        <Group title="Details" collapsible defaultOpen={DETAIL_FIELDS.some(([k]) => !!value[k])}>
          <Grid min={200}>
            {DETAIL_FIELDS.map(([key, label]) => (
              <Field key={key} label={label}>
                <TextInput value={str(value[key])} onChange={(v) => set(key, v)} />
              </Field>
            ))}
          </Grid>
        </Group>
        {BLOCKS.map(([key, label, singular]) => {
          const list = arr<Obj>(value[key])
          const setList = (next: Obj[]): void => onChange(withRequired(value, key, next))
          return (
            <Group key={key} title={`${label}${list.length ? ` (${list.length})` : ''}`} collapsible defaultOpen={key === 'actions' || list.length > 0}>
              {list.map((entry, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <TextInput value={str(entry.name)} onChange={(v) => setList(list.map((x, j) => (j === i ? { ...x, name: v } : x)))} placeholder="Name" />
                    <TextArea
                      value={str(entry.desc)}
                      onChange={(v) => setList(list.map((x, j) => (j === i ? { ...x, desc: v } : x)))}
                      rows={2}
                      placeholder="Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 6 (1d8 + 2) slashing damage."
                    />
                  </div>
                  <RowActions
                    label={singular.toLowerCase()}
                    onUp={i > 0 ? () => setList(move(list, i, -1)) : undefined}
                    onDown={i < list.length - 1 ? () => setList(move(list, i, 1)) : undefined}
                    onRemove={() => setList(list.filter((_, j) => j !== i))}
                  />
                </div>
              ))}
              <AddButton onClick={() => setList([...list, { name: '', desc: '' }])}>{singular}</AddButton>
            </Group>
          )
        })}
      </div>
      <div className="gb-card" style={{ padding: 'var(--space-3)', position: 'sticky', top: 0 }}>
        <div className="gb-label">Preview</div>
        <div onClick={(e) => rollInlineDice(e, null)} dangerouslySetInnerHTML={{ __html: renderStatblockHtml(toStatblock(value), false) }} />
      </div>
    </div>
  )
}

/** The statblock fields of a monster entry (strings and the entry lists), for the renderer. */
function toStatblock(value: Obj): StatblockData {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) if (typeof v === 'string') out[k] = v
  for (const [key] of BLOCKS) out[key] = arr<Obj>(value[key]).map((e) => ({ name: str(e.name), desc: str(e.desc) }))
  return out as unknown as StatblockData
}
