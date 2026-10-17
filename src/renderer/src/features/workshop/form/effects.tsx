import { useContext, useState } from 'react'
import type { AbilityId } from '@shared/content/schema'
import { slugify } from '@shared/content/workshop'
import { AttackFilterEditor, OptionalCondition } from './conditions'
import {
  ABILITIES,
  AbilityChips,
  AbilitySelect,
  AddButton,
  Advanced,
  FormContext,
  ScopeContext,
  TargetPicker,
  useAdvanced,
  Check,
  Field,
  FormulaInput,
  Grid,
  Group,
  IdInput,
  NumberInput,
  RowActions,
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

// The effect builder: a list of effects, each picked by kind and filled in
// with that kind's fields, with an optional "only when" condition. Granted
// things (resources, actions, toggles, attacks, choices, companions,
// spellcasting) have their own editors, which nest effect lists of their own.

const EFFECT_KINDS = [
  { value: 'modify', label: 'Change a number' },
  { value: 'acFormula', label: 'AC formula' },
  { value: 'proficiency', label: 'Proficiency' },
  { value: 'rollMode', label: 'Advantage / disadvantage' },
  { value: 'damageRelation', label: 'Resistance / immunity' },
  { value: 'conditionImmunity', label: 'Condition immunity' },
  { value: 'damageReduction', label: 'Damage reduction' },
  { value: 'grantResource', label: 'Grant a resource' },
  { value: 'grantAction', label: 'Grant an action' },
  { value: 'grantToggle', label: 'Grant a toggle' },
  { value: 'grantAttack', label: 'Grant an attack' },
  { value: 'extraDamage', label: 'Extra damage on attacks' },
  { value: 'attackAbility', label: 'Attack with an ability' },
  { value: 'grantSpells', label: 'Grant spells' },
  { value: 'spellcasting', label: 'Spellcasting' },
  { value: 'grantChoice', label: 'Grant a choice' },
  { value: 'grantCompanion', label: 'Grant a companion' },
  { value: 'note', label: 'Note' }
] as const
type EffectKind = (typeof EFFECT_KINDS)[number]['value']

function blankAction(kind: EffectKind): Obj {
  switch (kind) {
    case 'modify':
      return { kind, target: 'ac', op: 'add', value: '1' }
    case 'acFormula':
      return { kind, label: '', formula: '10 + @dex.mod' }
    case 'proficiency':
      return { kind, category: 'skill', value: '' }
    case 'rollMode':
      return { kind, target: 'attack', mode: 'advantage' }
    case 'damageRelation':
      return { kind, damageType: '', relation: 'resistance' }
    case 'conditionImmunity':
      return { kind, conditionId: '' }
    case 'damageReduction':
      return { kind, amount: '@prof' }
    case 'grantResource':
      return { kind, resource: { id: '', name: '', max: '1', recharge: 'long' } }
    case 'grantAction':
      return { kind, action: { id: '', name: '', actionType: 'action' } }
    case 'grantToggle':
      return { kind, toggle: { id: '', name: '', effects: [] } }
    case 'grantAttack':
      return { kind, attack: { id: '', name: '', range: 'melee', abilities: ['str'], damage: '1d6', damageType: 'bludgeoning' } }
    case 'extraDamage':
      return { kind, damage: '1d6' }
    case 'attackAbility':
      return { kind, ability: 'str' }
    case 'grantSpells':
      return { kind, spellIds: [] }
    case 'spellcasting':
      return { kind, config: { ability: 'int' } }
    case 'grantChoice':
      return { kind, choice: { id: '', label: '', from: { kind: 'optionList', listId: '' } } }
    case 'grantCompanion':
      return { kind, companion: { id: '', name: '', ac: '12', hp: '10' } }
    case 'note':
      return { kind, text: '' }
  }
}

const sign = (v: string): string => (/^\s*[-+]/.test(v) ? v : `+${v}`)

/** A one-line summary of an effect, for its collapsed card. */
export function effectSummary(effect: Obj): string {
  const d = obj(effect.do)
  const named = (o: unknown, fallback: string): string => str(obj(o).name) || str(obj(o).label) || fallback
  let text: string
  switch (str(d.kind)) {
    case 'modify': {
      const op = str(d.op)
      const v = str(d.value)
      text = `${str(d.target)} ${op === 'add' ? sign(v) : op === 'set' ? `= ${v}` : op === 'multiply' ? `× ${v}` : op === 'atLeast' ? `≥ ${v}` : op === 'atMost' ? `≤ ${v}` : `→ ${v}`}`
      break
    }
    case 'acFormula':
      text = `AC = ${str(d.formula)}`
      break
    case 'proficiency':
      text = `${str(d.level) || 'proficient'}: ${str(d.category)} ${str(d.value)}`
      break
    case 'rollMode':
      text = `${str(d.mode)} on ${str(d.target)}`
      break
    case 'damageRelation':
      text = `${str(d.relation)} to ${str(d.damageType)}`
      break
    case 'conditionImmunity':
      text = `immune to ${str(d.conditionId)}`
      break
    case 'damageReduction':
      text = `reduce ${arr<string>(d.damageTypes).join(', ') || 'all'} damage by ${str(d.amount)}`
      break
    case 'grantResource':
      text = `Resource: ${named(d.resource, 'unnamed')}`
      break
    case 'grantAction':
      text = `Action: ${named(d.action, 'unnamed')}`
      break
    case 'grantToggle':
      text = `Toggle: ${named(d.toggle, 'unnamed')}`
      break
    case 'grantAttack':
      text = `Attack: ${named(d.attack, 'unnamed')}`
      break
    case 'extraDamage':
      text = `+${str(d.damage)} ${str(d.damageType)} damage`
      break
    case 'attackAbility':
      text = `attack with ${str(d.ability).toUpperCase()}`
      break
    case 'grantSpells':
      text = `Spells: ${arr<string>(d.spellIds).join(', ') || 'none yet'}`
      break
    case 'spellcasting':
      text = `Spellcasting (${str(obj(d.config).ability).toUpperCase()})`
      break
    case 'grantChoice':
      text = `Choice: ${named(d.choice, 'unnamed')}`
      break
    case 'grantCompanion':
      text = `Companion: ${named(d.companion, 'unnamed')}`
      break
    case 'note':
      text = `Note: ${str(d.text).slice(0, 60)}`
      break
    default:
      text = str(d.kind) || 'Effect'
  }
  return effect.when ? `${text} (conditional)` : text
}

interface Recipe {
  id: string
  label: string
  hint: string
  group: string
  make: () => Obj
  advanced?: boolean
}

/**
 * What people usually want an effect to do, in plain words — each one
 * starts a ready-filled effect that only needs its blanks filled in. The
 * full Kind list is still there on the effect itself.
 */
const RECIPES: Recipe[] = [
  { id: 'bonus', group: 'Numbers', label: 'A bonus to a number', hint: 'AC, HP, speed, a skill, a save, an ability score…', make: () => ({ do: { kind: 'modify', target: 'ac', op: 'add', value: '1' } }) },
  { id: 'ac', group: 'Numbers', label: 'A new way to work out AC', hint: 'Like Unarmored Defense: 10 + DEX + CON', make: () => ({ do: { kind: 'acFormula', label: 'Unarmored Defense', formula: '10 + @dex.mod + @con.mod' } }) },
  { id: 'proficiency', group: 'Numbers', label: 'Proficiency or expertise', hint: 'A skill, a save, armor, weapons, a tool or language', make: () => ({ do: { kind: 'proficiency', category: 'skill', value: '' } }) },
  { id: 'advantage', group: 'Numbers', label: 'Advantage or disadvantage', hint: 'On attacks, a skill, a save, initiative…', make: () => ({ do: { kind: 'rollMode', target: 'attack', mode: 'advantage' } }) },
  { id: 'resistance', group: 'Defence', label: 'Resistance or immunity to damage', hint: 'Half (or no) damage of one type', make: () => ({ do: { kind: 'damageRelation', damageType: 'fire', relation: 'resistance' } }) },
  { id: 'reduction', group: 'Defence', label: 'Take less damage from each hit', hint: 'A flat amount off every hit', make: () => ({ do: { kind: 'damageReduction', amount: '@prof' } }) },
  { id: 'conditionImmunity', group: 'Defence', label: "Can't be given a condition", hint: 'Charmed, frightened, poisoned…', make: () => ({ do: { kind: 'conditionImmunity', conditionId: 'charmed' } }) },
  { id: 'extraDamage', group: 'Attacks', label: 'Extra damage on hits', hint: '+1d6 fire on every attack, or only some', make: () => ({ do: { kind: 'extraDamage', damage: '1d6', damageType: 'fire' } }) },
  { id: 'attack', group: 'Attacks', label: 'A natural weapon or new attack', hint: 'Claws, a bite, a tail sweep', make: () => ({ do: { kind: 'grantAttack', attack: { id: '', name: '', range: 'melee', abilities: ['str'], damage: '1d6', damageType: 'slashing' } } }) },
  { id: 'resource', group: 'Abilities', label: 'A pool of points or limited uses', hint: 'Ki points, Rage uses, a mana pool — refills on a rest', make: () => ({ do: { kind: 'grantResource', resource: { id: '', name: '', max: '@prof', recharge: 'long', display: 'uses' } } }) },
  { id: 'action', group: 'Abilities', label: 'Something the character can do', hint: 'An action, bonus action or reaction — can cost points, roll, deal damage or heal', make: () => ({ do: { kind: 'grantAction', action: { id: '', name: '', actionType: 'action' } } }) },
  { id: 'toggle', group: 'Abilities', label: 'Something to switch on', hint: 'A stance, rage, aura or transformation with its own bonuses', make: () => ({ do: { kind: 'grantToggle', toggle: { id: '', name: '', effects: [] } } }) },
  { id: 'spells', group: 'Abilities', label: 'Always know some spells', hint: 'Spells granted for free', make: () => ({ do: { kind: 'grantSpells', spellIds: [] } }) },
  { id: 'companion', group: 'Abilities', label: 'A companion or summon', hint: 'A familiar, beast companion or summoned spirit with its own stats', make: () => ({ do: { kind: 'grantCompanion', companion: { id: '', name: '', ac: '12 + @prof', hp: '5 * @level' } } }) },
  { id: 'spellcasting', group: 'Abilities', label: 'Spellcasting', hint: 'Make the class cast spells', advanced: true, make: () => ({ do: { kind: 'spellcasting', config: { ability: 'int' } } }) },
  { id: 'chooseOption', group: 'Choices', label: 'Pick one from a list', hint: 'Fighting styles, invocations — options you write in an option list', make: () => ({ do: { kind: 'grantChoice', choice: { id: '', label: '', from: { kind: 'optionList', listId: '' } } } }) },
  {
    id: 'chooseAbility',
    group: 'Choices',
    label: '+1 to an ability of their choice',
    hint: 'The player picks which',
    make: () => ({ do: { kind: 'grantChoice', choice: { id: 'ability-increase', label: 'Ability Score Increase', from: { kind: 'abilities' }, onPick: [{ do: { kind: 'modify', target: 'ability.$pick.score', op: 'add', value: '1' } }] } } })
  },
  {
    id: 'chooseSkill',
    group: 'Choices',
    label: 'Proficiency in a skill of their choice',
    hint: 'The player picks which',
    make: () => ({ do: { kind: 'grantChoice', choice: { id: 'skill', label: 'Skill Proficiency', from: { kind: 'skills' }, onPick: [{ do: { kind: 'proficiency', category: 'skill', value: '$pick' } }] } } })
  },
  { id: 'chooseFeat', group: 'Choices', label: 'Pick a feat', hint: 'From a category of feats', make: () => ({ do: { kind: 'grantChoice', choice: { id: 'feat', label: 'Feat', from: { kind: 'feats', categories: ['General'] } } } }) },
  { id: 'chooseArchetype', group: 'Choices', label: 'Pick an archetype', hint: 'A bloodline, patron or tradition (by tag)', make: () => ({ do: { kind: 'grantChoice', choice: { id: 'archetype', label: '', from: { kind: 'archetypes', tags: [] } } } }) },
  { id: 'note', group: 'Other', label: 'A reminder on the sheet', hint: "For a rule the sheet can't calculate", make: () => ({ do: { kind: 'note', text: '' } }) }
]

/** "+ Effect": a menu of recipes, grouped. */
function RecipeMenu({ label, onPick }: { label: string; onPick: (effect: Obj) => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const advanced = useAdvanced()
  const recipes = RECIPES.filter((r) => advanced || !r.advanced)
  const groups = [...new Set(recipes.map((r) => r.group))]
  if (!open) return <AddButton onClick={() => setOpen(true)}>{label}</AddButton>
  return (
    <div className="gb-card" style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 8, borderColor: 'var(--accent)' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <strong style={{ flex: 1, fontSize: 12 }}>What should it do?</strong>
        <RowActions label="menu" onRemove={() => setOpen(false)} />
      </div>
      {groups.map((g) => (
        <div key={g}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{g}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 6 }}>
            {recipes
              .filter((r) => r.group === g)
              .map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="gb-card"
                  onClick={() => {
                    onPick(r.make())
                    setOpen(false)
                  }}
                  style={{ padding: '6px 8px', textAlign: 'left', cursor: 'pointer' }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{r.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.hint}</div>
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** A list of effects. New ones are added from a recipe menu and open straight away. */
export function EffectsEditor({ value, onChange, addLabel = 'Effect', hint }: { value: Obj[]; onChange: (v: Obj[]) => void; addLabel?: string; hint?: string }): JSX.Element {
  const [justAdded, setJustAdded] = useState<number | null>(null)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {hint && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{hint}</span>}
      {value.length === 0 && !hint && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No effects yet — it shows on the sheet with its description only.</span>}
      {value.map((effect, i) => (
        <Group
          key={`${i}:${justAdded === i ? 'new' : 'old'}`}
          collapsible
          defaultOpen={justAdded === i}
          title={<span style={{ fontWeight: 400 }}>{effectSummary(effect)}</span>}
          actions={
            <RowActions
              label="effect"
              onUp={i > 0 ? () => onChange(move(value, i, -1)) : undefined}
              onDown={i < value.length - 1 ? () => onChange(move(value, i, 1)) : undefined}
              onRemove={() => onChange(value.filter((_, j) => j !== i))}
            />
          }
        >
          <EffectEditor value={effect} onChange={(v) => onChange(value.map((x, j) => (j === i ? v : x)))} />
        </Group>
      ))}
      <RecipeMenu
        label={addLabel}
        onPick={(effect) => {
          onChange([...value, effect])
          setJustAdded(value.length)
        }}
      />
    </div>
  )
}

export function EffectEditor({ value, onChange }: { value: Obj; onChange: (v: Obj) => void }): JSX.Element {
  const d = obj(value.do)
  const kind = str(d.kind) as EffectKind
  const setDo = (next: Obj): void => onChange({ ...value, do: next })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Field label="Kind">
        <Select value={kind} onChange={(k) => k && setDo(blankAction(k))} options={EFFECT_KINDS.map((k) => ({ value: k.value, label: k.label }))} />
      </Field>
      <ActionBody kind={kind} value={d} onChange={setDo} />
      <OptionalCondition label="Only when…" value={value.when} onChange={(w) => onChange(withKey(value, 'when', w))} />
    </div>
  )
}

function ActionBody({ kind, value, onChange }: { kind: EffectKind; value: Obj; onChange: (v: Obj) => void }): JSX.Element | null {
  const { stats, rolls } = useContext(FormContext)
  const advanced = useAdvanced()
  const skillChoices = stats.filter((s) => s.group === 'Skills').map((s) => ({ ...s, value: s.value.slice('skill.'.length) }))
  const set = (key: string, v: unknown): void => onChange(withKey(value, key, v))
  const req = (key: string, v: unknown): void => onChange(withRequired(value, key, v))
  const appliesTo = (
    <Advanced>
      <Group title="Only for some attacks" collapsible defaultOpen={!!value.appliesTo}>
        <AttackFilterEditor value={value.appliesTo as Obj | undefined} onChange={(v) => set('appliesTo', v)} />
      </Group>
    </Advanced>
  )
  switch (kind) {
    case 'modify':
      return (
        <>
          <Grid min={160}>
            <Field label="Number">
              <TargetPicker value={str(value.target)} onChange={(v) => req('target', v)} choices={stats} placeholder="e.g. stat.output, resource.ki.max" />
            </Field>
            <Field label="How">
              <Select
                value={str(value.op) as 'add'}
                onChange={(v) => req('op', v || 'add')}
                options={[
                  { value: 'add', label: 'Add' },
                  { value: 'set', label: 'Set to (highest wins)' },
                  { value: 'multiply', label: 'Multiply by' },
                  { value: 'atLeast', label: 'At least' },
                  { value: 'atMost', label: 'At most' },
                  { value: 'transform', label: 'Transform (@value)' }
                ]}
              />
            </Field>
            <Field label="Value">
              <FormulaInput value={str(value.value)} onChange={(v) => req('value', v)} />
            </Field>
          </Grid>
          {str(value.target).startsWith('ability.') && (
            <Advanced>
              <Check checked={!!value.uncapped} onChange={(v) => set('uncapped', v || undefined)} label="Can go above the ability cap" />
            </Advanced>
          )}
          {str(value.target).startsWith('attack.') && appliesTo}
        </>
      )
    case 'acFormula':
      return (
        <Grid min={200}>
          <Field label="Label">
            <TextInput value={str(value.label)} onChange={(v) => req('label', v)} placeholder="Unarmored Defense" />
          </Field>
          <Field label="AC formula" hint="The highest AC formula the character qualifies for is used.">
            <FormulaInput value={str(value.formula)} onChange={(v) => req('formula', v)} />
          </Field>
        </Grid>
      )
    case 'proficiency': {
      const category = str(value.category)
      return (
        <Grid min={150}>
          <Field label="In">
            <Select
              value={category as 'skill'}
              onChange={(v) => req('category', v || 'skill')}
              options={['skill', 'save', 'weapon', 'armor', 'tool', 'language'].map((c) => ({ value: c as 'skill', label: c }))}
            />
          </Field>
          <Field label={category === 'save' ? 'Ability' : 'Which'} hint={advanced ? '"$pick" inside a choice\'s on-pick effects' : undefined}>
            {category === 'skill' ? (
              <TargetPicker value={str(value.value)} onChange={(v) => req('value', v)} choices={skillChoices} placeholder="skill id, or $pick" />
            ) : category === 'save' ? (
              <TargetPicker value={str(value.value)} onChange={(v) => req('value', v)} choices={ABILITIES.map((a) => ({ value: a.id, label: a.label, group: 'Abilities' }))} placeholder="$pick" />
            ) : (
              <TextInput value={str(value.value)} onChange={(v) => req('value', v)} placeholder={category === 'weapon' ? 'martial, longsword…' : category === 'armor' ? 'light, medium, heavy, shield' : category === 'language' ? 'Elvish' : "thieves' tools"} />
            )}
          </Field>
          {(category === 'skill' || category === 'save') && (
            <Field label="Level">
              <Select
                value={(str(value.level) || 'proficient') as 'proficient'}
                onChange={(v) => set('level', v && v !== 'proficient' ? v : undefined)}
                options={[
                  { value: 'proficient', label: 'Proficient' },
                  { value: 'half', label: 'Half' },
                  { value: 'expertise', label: 'Expertise' }
                ]}
              />
            </Field>
          )}
        </Grid>
      )
    }
    case 'rollMode':
      return (
        <>
          <Grid min={160}>
            <Field label="On">
              <TargetPicker value={str(value.target)} onChange={(v) => req('target', v)} choices={rolls} placeholder="e.g. skill:stealth" />
            </Field>
            <Field label="Mode">
              <Select value={str(value.mode) as 'advantage'} onChange={(v) => req('mode', v || 'advantage')} options={[{ value: 'advantage', label: 'Advantage' }, { value: 'disadvantage', label: 'Disadvantage' }]} />
            </Field>
          </Grid>
          {str(value.target) === 'attack' && appliesTo}
        </>
      )
    case 'damageRelation':
      return (
        <Grid min={160}>
          <Field label="Damage type">
            <TextInput value={str(value.damageType)} onChange={(v) => req('damageType', v)} list="damageTypes" />
          </Field>
          <Field label="Relation">
            <Select
              value={str(value.relation) as 'resistance'}
              onChange={(v) => req('relation', v || 'resistance')}
              options={[
                { value: 'resistance', label: 'Resistance' },
                { value: 'immunity', label: 'Immunity' },
                { value: 'vulnerability', label: 'Vulnerability' }
              ]}
            />
          </Field>
        </Grid>
      )
    case 'conditionImmunity':
      return (
        <Field label="Condition">
          <TextInput value={str(value.conditionId)} onChange={(v) => req('conditionId', v)} list="conditions" />
        </Field>
      )
    case 'damageReduction':
      return (
        <Grid min={160}>
          <Field label="Reduce each hit by">
            <FormulaInput value={str(value.amount)} onChange={(v) => req('amount', v)} />
          </Field>
          <Field label="Damage types" hint="Empty = all damage">
            <TagsInput value={arr<string>(value.damageTypes)} onChange={(v) => set('damageTypes', v)} list="damageTypes" />
          </Field>
          <Field label="Label">
            <TextInput value={str(value.label)} onChange={(v) => set('label', v)} />
          </Field>
        </Grid>
      )
    case 'grantResource':
      return <ResourceEditor value={obj(value.resource)} onChange={(v) => req('resource', v)} />
    case 'grantAction':
      return <ActionEditor value={obj(value.action)} onChange={(v) => req('action', v)} />
    case 'grantToggle':
      return <ToggleEditor value={obj(value.toggle)} onChange={(v) => req('toggle', v)} />
    case 'grantAttack':
      return <AttackEditor value={obj(value.attack)} onChange={(v) => req('attack', v)} />
    case 'extraDamage':
      return (
        <>
          <Grid min={160}>
            <Field label="Extra damage">
              <FormulaInput value={str(value.damage)} onChange={(v) => req('damage', v)} dice />
            </Field>
            <Field label="Damage type" hint="Empty = the attack's own type">
              <TextInput value={str(value.damageType)} onChange={(v) => set('damageType', v)} list="damageTypes" />
            </Field>
          </Grid>
          {appliesTo}
        </>
      )
    case 'attackAbility':
      return (
        <>
          <Field label="Ability" hint="Offered for the attack alongside its usual ones; the best is used.">
            <AbilitySelect value={str(value.ability)} onChange={(v) => req('ability', v || 'str')} />
          </Field>
          {appliesTo}
        </>
      )
    case 'grantSpells':
      return (
        <Grid min={160}>
          <Field label="Spells" wide>
            <TagsInput value={arr<string>(value.spellIds)} onChange={(v) => req('spellIds', v)} list="spells" placeholder="spell ids" />
          </Field>
          <Check checked={value.alwaysPrepared !== false} onChange={(v) => set('alwaysPrepared', v ? undefined : false)} label="Always prepared" />
          <Check checked={value.free !== false} onChange={(v) => set('free', v ? undefined : false)} label="Don't count against limits" />
          <Field label="Casting ability">
            <AbilitySelect value={str(value.ability)} onChange={(v) => set('ability', v || undefined)} none="The class's" />
          </Field>
        </Grid>
      )
    case 'spellcasting':
      return <SpellcastingEditor value={obj(value.config)} onChange={(v) => req('config', v)} />
    case 'grantChoice':
      return <ChoiceEditor value={obj(value.choice)} onChange={(v) => req('choice', v)} />
    case 'grantCompanion':
      return <CompanionEditor value={obj(value.companion)} onChange={(v) => req('companion', v)} />
    case 'note':
      return (
        <Field label="Shown on the sheet">
          <TextArea value={str(value.text)} onChange={(v) => req('text', v)} />
        </Field>
      )
  }
  return null
}

// --- granted things -----------------------------------------------------------

function NameIdDescription({ value, onChange, nameKey = 'name' }: { value: Obj; onChange: (v: Obj) => void; nameKey?: string }): JSX.Element {
  return (
    <>
      <Field label={nameKey === 'label' ? 'Label' : 'Name'}>
        <TextInput
          value={str(value[nameKey])}
          onChange={(v) => {
            // The id follows the name until someone sets it by hand.
            const id = str(value.id)
            const follows = !id || id === slugify(str(value[nameKey]))
            onChange({ ...withRequired(value, nameKey, v), ...(follows && v.trim() ? { id: slugify(v) } : {}) })
          }}
        />
      </Field>
      <Field label="Id">
        <IdInput value={str(value.id)} onChange={(v) => onChange(withRequired(value, 'id', v))} fromName={str(value[nameKey])} />
      </Field>
    </>
  )
}

function Description({ value, onChange }: { value: Obj; onChange: (v: Obj) => void }): JSX.Element {
  return (
    <Field label="Description" wide>
      <TextArea value={str(value.description)} onChange={(v) => onChange(withKey(value, 'description', v))} rows={2} />
    </Field>
  )
}

export function CostEditor({ label, value, onChange }: { label: string; value: unknown; onChange: (v: Obj | undefined) => void }): JSX.Element {
  const on = !!value && typeof value === 'object'
  const v = obj(value)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Check checked={on} onChange={(c) => onChange(c ? { resourceId: '', amount: '1' } : undefined)} label={label} />
      {on && (
        <Grid min={150}>
          <Field label="Resource">
            <TextInput value={str(v.resourceId)} onChange={(x) => onChange(withRequired(v, 'resourceId', x))} list="resources" />
          </Field>
          <Field label="Amount">
            <FormulaInput value={str(v.amount)} onChange={(x) => onChange(withKey(v, 'amount', x))} placeholder="1" />
          </Field>
        </Grid>
      )}
    </div>
  )
}

export function ResourceEditor({ value, onChange }: { value: Obj; onChange: (v: Obj) => void }): JSX.Element {
  const set = (key: string, v: unknown): void => onChange(withKey(value, key, v))
  const conditional = typeof value.recharge === 'object'
  return (
    <Grid min={170}>
      <NameIdDescription value={value} onChange={onChange} />
      <Field label="Maximum">
        <FormulaInput value={str(value.max)} onChange={(v) => onChange(withRequired(value, 'max', v))} />
      </Field>
      <Field label="Recharges on" hint={conditional ? 'Conditional — edit it in JSON' : undefined}>
        {conditional ? (
          <TextInput value="(conditional)" onChange={() => undefined} />
        ) : (
          <Select
            value={str(value.recharge) as 'long'}
            onChange={(v) => onChange(withRequired(value, 'recharge', v || 'long'))}
            options={[
              { value: 'short', label: 'Short or long rest' },
              { value: 'long', label: 'Long rest' },
              { value: 'dawn', label: 'Dawn' },
              { value: 'turn', label: 'Each turn' },
              { value: 'none', label: 'Never' }
            ]}
          />
        )}
      </Field>
      <Advanced>
        <Field label="Regains" hint="Empty = all of it">
          <FormulaInput value={str(value.regain)} onChange={(v) => set('regain', v)} />
        </Field>
      </Advanced>
      <Field label="Short rest gives back" hint="For long-rest pools">
        <FormulaInput value={str(value.shortRestRegain)} onChange={(v) => set('shortRestRegain', v)} />
      </Field>
      <Field label="Shown as">
        <Select value={str(value.display) as 'uses'} onChange={(v) => set('display', v || undefined)} none="Uses (boxes)" options={[{ value: 'pool', label: 'Pool (number)' }]} />
      </Field>
      <Advanced>
        <Field label="Used as">
          <TextInput value={str(value.actionType)} onChange={(v) => set('actionType', v)} list="actionTypes" placeholder="action, bonus, reaction…" />
        </Field>
      </Advanced>
      <Description value={value} onChange={onChange} />
    </Grid>
  )
}

export function ActionEditor({ value, onChange }: { value: Obj; onChange: (v: Obj) => void }): JSX.Element {
  const outer = useContext(ScopeContext)
  return (
    <ScopeContext.Provider value={{ ...outer, spend: !!value.spend }}>
      <ActionFields value={value} onChange={onChange} />
    </ScopeContext.Provider>
  )
}

function ActionFields({ value, onChange }: { value: Obj; onChange: (v: Obj) => void }): JSX.Element {
  const set = (key: string, v: unknown): void => onChange(withKey(value, key, v))
  const spend = value.spend ? obj(value.spend) : undefined
  const restores = arr<Obj>(value.restores)
  const formula = (key: string, label: string, dice?: boolean, hint?: string): JSX.Element => (
    <Field label={label} hint={hint}>
      <FormulaInput value={str(value[key])} onChange={(v) => set(key, v)} dice={dice} />
    </Field>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Grid min={170}>
        <NameIdDescription value={value} onChange={onChange} />
        <Field label="Takes">
          <TextInput value={str(value.actionType)} onChange={(v) => onChange(withRequired(value, 'actionType', v))} list="actionTypes" placeholder="action, bonus, reaction…" />
        </Field>
        <Advanced>
          <Field label="Turns on toggle">
            <TextInput value={str(value.activatesToggle)} onChange={(v) => set('activatesToggle', v)} list="toggles" />
          </Field>
        </Advanced>
        <Description value={value} onChange={onChange} />
      </Grid>
      <CostEditor label="Costs a fixed amount" value={value.cost} onChange={(v) => set('cost', v)} />
      <Check checked={!!spend} onChange={(c) => set('spend', c ? { resourceId: '', max: '1' } : undefined)} label="The player chooses how much to spend (@spent)" />
      {spend && (
        <Grid min={150}>
          <Field label="From resource">
            <TextInput value={str(spend.resourceId)} onChange={(v) => set('spend', withRequired(spend, 'resourceId', v))} list="resources" />
          </Field>
          <Field label="At least">
            <FormulaInput value={str(spend.min)} onChange={(v) => set('spend', withKey(spend, 'min', v))} placeholder="1" />
          </Field>
          <Field label="At most">
            <FormulaInput value={str(spend.max)} onChange={(v) => set('spend', withRequired(spend, 'max', v))} />
          </Field>
        </Grid>
      )}
      <Grid min={160}>
        {formula('attackBonus', 'Attack bonus')}
        {formula('saveDc', 'Save DC')}
        <Field label="Save ability">
          <AbilitySelect value={str(value.saveAbility)} onChange={(v) => set('saveAbility', v || undefined)} none="None" />
        </Field>
        {formula('damage', 'Damage', true)}
        <Field label="Damage type">
          <TextInput value={str(value.damageType)} onChange={(v) => set('damageType', v)} list="damageTypes" />
        </Field>
        {formula('healing', 'Healing', true)}
        {formula('tempHp', 'Temporary HP', true)}
        {formula('range', 'Range (ft)')}
        <Advanced>{formula('area', 'Area (ft)')}</Advanced>
        <Field label="Duration">
          <TextInput value={str(value.duration)} onChange={(v) => set('duration', v)} placeholder="1 minute" />
        </Field>
      </Grid>
      <Advanced>
      <Group title="Restores resource points" collapsible defaultOpen={restores.length > 0}>
        {restores.map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <Grid min={140}>
                <Field label="Resource">
                  <TextInput value={str(r.resourceId)} onChange={(v) => set('restores', restores.map((x, j) => (j === i ? withRequired(x, 'resourceId', v) : x)))} list="resources" />
                </Field>
                <Field label="Amount">
                  <FormulaInput value={str(r.amount)} onChange={(v) => set('restores', restores.map((x, j) => (j === i ? withRequired(x, 'amount', v) : x)))} dice />
                </Field>
                <Check checked={!!r.temporary} onChange={(v) => set('restores', restores.map((x, j) => (j === i ? withKey(x, 'temporary', v || undefined) : x)))} label="As temporary points" />
              </Grid>
            </div>
            <RowActions label="restore" onRemove={() => set('restores', restores.filter((_, j) => j !== i))} />
          </div>
        ))}
        <AddButton onClick={() => set('restores', [...restores, { resourceId: '', amount: '1' }])}>Restore</AddButton>
      </Group>
      </Advanced>
    </div>
  )
}

export function ToggleEditor({ value, onChange }: { value: Obj; onChange: (v: Obj) => void }): JSX.Element {
  const set = (key: string, v: unknown): void => onChange(withKey(value, key, v))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Grid min={170}>
        <NameIdDescription value={value} onChange={onChange} />
        <Field label="Turning it on takes">
          <TextInput value={str(value.actionType)} onChange={(v) => set('actionType', v)} list="actionTypes" />
        </Field>
        <Description value={value} onChange={onChange} />
      </Grid>
      <CostEditor label="Turning it on costs" value={value.cost} onChange={(v) => set('cost', v)} />
      <Group title="While it's on">
        <EffectsEditor value={arr<Obj>(value.effects)} onChange={(v) => set('effects', v)} />
      </Group>
    </div>
  )
}

export function AttackEditor({ value, onChange }: { value: Obj; onChange: (v: Obj) => void }): JSX.Element {
  const set = (key: string, v: unknown): void => onChange(withKey(value, key, v))
  return (
    <Grid min={170}>
      <NameIdDescription value={value} onChange={onChange} />
      <Field label="Range">
        <Select value={str(value.range) as 'melee'} onChange={(v) => onChange(withRequired(value, 'range', v || 'melee'))} options={[{ value: 'melee', label: 'Melee' }, { value: 'ranged', label: 'Ranged' }]} />
      </Field>
      <Field label="Abilities (best is used)">
        <AbilityChips value={arr<AbilityId>(value.abilities)} onChange={(v) => onChange(withRequired(value, 'abilities', v))} />
      </Field>
      <Field label="Damage">
        <FormulaInput value={str(value.damage)} onChange={(v) => onChange(withRequired(value, 'damage', v))} dice />
      </Field>
      <Field label="Damage type">
        <TextInput value={str(value.damageType)} onChange={(v) => onChange(withRequired(value, 'damageType', v))} list="damageTypes" />
      </Field>
      <Check checked={value.addAbilityToDamage !== false} onChange={(v) => set('addAbilityToDamage', v ? undefined : false)} label="Add the ability modifier to damage" />
      <Advanced>
        <Check checked={value.proficient !== false} onChange={(v) => set('proficient', v ? undefined : false)} label="Proficient" />
        <Field label="Replaces attack">
          <TextInput value={str(value.replaces)} onChange={(v) => set('replaces', v)} placeholder="unarmed-strike" />
        </Field>
      </Advanced>
      <Field label="Takes">
        <TextInput value={str(value.actionType)} onChange={(v) => set('actionType', v)} list="actionTypes" placeholder="action" />
      </Field>
      <Description value={value} onChange={onChange} />
    </Grid>
  )
}

const SOURCE_KINDS = [
  { value: 'optionList', label: 'An option list' },
  { value: 'feats', label: 'Feats' },
  { value: 'spells', label: 'Spells' },
  { value: 'abilities', label: 'Abilities' },
  { value: 'skills', label: 'Skills' },
  { value: 'archetypes', label: 'Archetypes' },
  { value: 'freeform', label: 'Typed by the player' }
] as const

export function ChoiceEditor({ value, onChange }: { value: Obj; onChange: (v: Obj) => void }): JSX.Element {
  const set = (key: string, v: unknown): void => onChange(withKey(value, key, v))
  const from = obj(value.from)
  const setFrom = (next: Obj): void => onChange(withRequired(value, 'from', next))
  const fromSet = (key: string, v: unknown): void => setFrom(withKey(from, key, v))
  const groups = arr<Obj>(value.groups)
  const kind = str(from.kind)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Grid min={170}>
        <NameIdDescription value={value} onChange={onChange} nameKey="label" />
        <Field label="Picks" hint="Empty = 1">
          <FormulaInput value={str(value.count)} onChange={(v) => set('count', v)} placeholder="1" />
        </Field>
        <Advanced>
          <Field label="Point budget" hint="Point-buy: options cost points instead">
            <FormulaInput value={str(value.budget)} onChange={(v) => set('budget', v)} placeholder="none" />
          </Field>
        </Advanced>
        <Check checked={!!value.allowRepeats} onChange={(v) => set('allowRepeats', v || undefined)} label="The same option can be picked more than once" />
        {!!value.allowRepeats && (
          <Advanced>
            <Field label="At most this many times">
              <NumberInput value={num(value.maxRepeats)} onChange={(v) => set('maxRepeats', v)} min={1} />
            </Field>
          </Advanced>
        )}
      </Grid>
      <Group title="Options come from">
        <Select value={kind as 'optionList'} onChange={(k) => k && setFrom({ kind: k, ...(k === 'optionList' ? { listId: '' } : {}) })} options={SOURCE_KINDS.map((k) => ({ value: k.value, label: k.label }))} />
        {kind === 'optionList' && (
          <Field label="Option list">
            <TextInput value={str(from.listId)} onChange={(v) => setFrom(withRequired(from, 'listId', v))} list="optionLists" />
          </Field>
        )}
        {kind === 'feats' && (
          <Grid min={160}>
            <Field label="Categories">
              <TagsInput value={arr<string>(from.categories)} onChange={(v) => fromSet('categories', v)} list="featCategories" placeholder="General, Fighting Style…" />
            </Field>
            <Field label="Only these feats">
              <TagsInput value={arr<string>(from.featIds)} onChange={(v) => fromSet('featIds', v)} list="feats" />
            </Field>
          </Grid>
        )}
        {kind === 'spells' && (
          <Grid min={150}>
            <Field label="Spell lists">
              <TagsInput value={arr<string>(from.lists)} onChange={(v) => fromSet('lists', v)} placeholder="wizard, cleric…" />
            </Field>
            <Field label="Lowest level">
              <NumberInput value={num(from.minLevel)} onChange={(v) => fromSet('minLevel', v)} min={0} />
            </Field>
            <Field label="Highest level">
              <FormulaInput value={str(from.maxLevel)} onChange={(v) => fromSet('maxLevel', v)} placeholder="any" />
            </Field>
            <Field label="Only these spells">
              <TagsInput value={arr<string>(from.spellIds)} onChange={(v) => fromSet('spellIds', v)} list="spells" />
            </Field>
          </Grid>
        )}
        {kind === 'abilities' && (
          <Field label="Which abilities" hint="None picked = all six">
            <AbilityChips value={arr<AbilityId>(from.abilities)} onChange={(v) => fromSet('abilities', v)} />
          </Field>
        )}
        {kind === 'skills' && (
          <Field label="Which skills" hint="Empty = all">
            <TagsInput value={arr<string>(from.skillIds)} onChange={(v) => fromSet('skillIds', v)} list="skills" />
          </Field>
        )}
        {kind === 'archetypes' && (
          <Grid min={160}>
            <Field label="With tags">
              <TagsInput value={arr<string>(from.tags)} onChange={(v) => fromSet('tags', v)} list="archetypeTags" />
            </Field>
            <Field label="Only these archetypes">
              <TagsInput value={arr<string>(from.archetypeIds)} onChange={(v) => fromSet('archetypeIds', v)} list="archetypes" />
            </Field>
          </Grid>
        )}
      </Group>
      {value.budget !== undefined && (
        <Group title="Point-buy group limits" collapsible defaultOpen={groups.length > 0}>
          {groups.map((g, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <Grid min={130}>
                  <Field label="Group id">
                    <TextInput value={str(g.id)} onChange={(v) => set('groups', groups.map((x, j) => (j === i ? withRequired(x, 'id', v) : x)))} mono />
                  </Field>
                  <Field label="Label">
                    <TextInput value={str(g.label)} onChange={(v) => set('groups', groups.map((x, j) => (j === i ? withRequired(x, 'label', v) : x)))} />
                  </Field>
                  <Field label="At most">
                    <FormulaInput value={str(g.max)} onChange={(v) => set('groups', groups.map((x, j) => (j === i ? withRequired(x, 'max', v) : x)))} />
                  </Field>
                </Grid>
              </div>
              <RowActions label="group" onRemove={() => set('groups', groups.filter((_, j) => j !== i))} />
            </div>
          ))}
          <AddButton onClick={() => set('groups', [...groups, { id: '', label: '', max: '1' }])}>Group</AddButton>
        </Group>
      )}
      <Group title="Each pick also…" collapsible defaultOpen={arr(value.onPick).length > 0}>
        <EffectsEditor value={arr<Obj>(value.onPick)} onChange={(v) => set('onPick', v)} hint={'"$pick" in any field is replaced by the picked option\'s id. Feats and option-list entries apply their own effects as well.'} />
      </Group>
    </div>
  )
}

export function CompanionEditor({ value, onChange }: { value: Obj; onChange: (v: Obj) => void }): JSX.Element {
  const set = (key: string, v: unknown): void => onChange(withKey(value, key, v))
  const abilities = obj(value.abilities)
  const attacks = arr<Obj>(value.attacks)
  const traits = arr<Obj>(value.traits)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Grid min={160}>
        <NameIdDescription value={value} onChange={onChange} />
        <Field label="Size">
          <TextInput value={str(value.size)} onChange={(v) => set('size', v)} placeholder="Medium" />
        </Field>
        <Field label="Type">
          <TextInput value={str(value.creatureType)} onChange={(v) => set('creatureType', v)} placeholder="Beast" />
        </Field>
        <Field label="Armor Class">
          <FormulaInput value={str(value.ac)} onChange={(v) => onChange(withRequired(value, 'ac', v))} />
        </Field>
        <Field label="Hit points" hint="@self.con.mod reads its own scores">
          <FormulaInput value={str(value.hp)} onChange={(v) => onChange(withRequired(value, 'hp', v))} />
        </Field>
        <Field label="Speed">
          <TextInput value={str(value.speed)} onChange={(v) => set('speed', v)} placeholder="40 ft" />
        </Field>
        <Advanced>
          <Field label="Extra states" hint="Besides summoned / dismissed / defeated">
            <TagsInput value={arr<string>(value.states)} onChange={(v) => set('states', v)} />
          </Field>
        </Advanced>
        <Description value={value} onChange={onChange} />
      </Grid>
      <Group title="Ability scores" collapsible defaultOpen={false}>
        <Grid min={110}>
          {ABILITIES.map((a) => (
            <Field key={a.id} label={a.label}>
              <FormulaInput value={str(abilities[a.id])} onChange={(v) => set('abilities', Object.keys(withKey(abilities, a.id, v)).length ? withKey(abilities, a.id, v) : undefined)} placeholder="10" />
            </Field>
          ))}
        </Grid>
      </Group>
      <Group title="Attacks" collapsible defaultOpen={attacks.length > 0}>
        {attacks.map((at, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <Grid min={130}>
                {(['name', 'bonus', 'damage', 'damageType', 'reach'] as const).map((key) => (
                  <Field key={key} label={{ name: 'Name', bonus: 'To hit', damage: 'Damage', damageType: 'Type', reach: 'Reach' }[key]}>
                    {key === 'bonus' || key === 'damage' ? (
                      <FormulaInput value={str(at[key])} onChange={(v) => set('attacks', attacks.map((x, j) => (j === i ? withRequired(x, key, v) : x)))} dice={key === 'damage'} />
                    ) : (
                      <TextInput
                        value={str(at[key])}
                        onChange={(v) => set('attacks', attacks.map((x, j) => (j === i ? (key === 'name' ? withRequired(x, key, v) : withKey(x, key, v)) : x)))}
                        list={key === 'damageType' ? 'damageTypes' : undefined}
                      />
                    )}
                  </Field>
                ))}
              </Grid>
            </div>
            <RowActions label="attack" onRemove={() => set('attacks', attacks.filter((_, j) => j !== i))} />
          </div>
        ))}
        <AddButton onClick={() => set('attacks', [...attacks, { name: 'Bite', bonus: '@self.str.mod + @prof', damage: '1d6 + @self.str.mod' }])}>Attack</AddButton>
      </Group>
      <Group title="Traits" collapsible defaultOpen={traits.length > 0}>
        {traits.map((t, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <TextInput value={str(t.name)} onChange={(v) => set('traits', traits.map((x, j) => (j === i ? withRequired(x, 'name', v) : x)))} placeholder="Trait name" />
              <TextArea value={str(t.description)} onChange={(v) => set('traits', traits.map((x, j) => (j === i ? withRequired(x, 'description', v) : x)))} rows={2} />
            </div>
            <RowActions label="trait" onRemove={() => set('traits', traits.filter((_, j) => j !== i))} />
          </div>
        ))}
        <AddButton onClick={() => set('traits', [...traits, { name: '', description: '' }])}>Trait</AddButton>
      </Group>
      <CostEditor label="Summoning costs" value={value.summonCost} onChange={(v) => set('summonCost', v)} />
    </div>
  )
}

export function SpellcastingEditor({ value, onChange }: { value: Obj; onChange: (v: Obj) => void }): JSX.Element {
  const set = (key: string, v: unknown): void => onChange(withKey(value, key, v))
  const slots = value.slots ? obj(value.slots) : undefined
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Grid min={160}>
        <Field label="Ability">
          <AbilitySelect value={str(value.ability)} onChange={(v) => onChange(withRequired(value, 'ability', v || 'int'))} />
        </Field>
        <Field label="Spell list" hint="Empty = the class's own id">
          <TextInput value={str(value.list)} onChange={(v) => set('list', v)} />
        </Field>
        <Field label="Prepared spells">
          <FormulaInput value={str(value.prepared)} onChange={(v) => set('prepared', v)} placeholder="max(1, @int.mod + @classLevel)" />
        </Field>
        <Field label="Known spells">
          <FormulaInput value={str(value.known)} onChange={(v) => set('known', v)} placeholder="@table.spellsKnown" />
        </Field>
        <Field label="Cantrips">
          <FormulaInput value={str(value.cantrips)} onChange={(v) => set('cantrips', v)} />
        </Field>
        <Check checked={!!value.ritualCasting} onChange={(v) => set('ritualCasting', v || undefined)} label="Ritual casting" />
        <Check checked={!!value.spellbook} onChange={(v) => set('spellbook', v || undefined)} label="Uses a spellbook" />
      </Grid>
      <Check checked={!!slots} onChange={(v) => set('slots', v ? { rows: Array.from({ length: 20 }, () => []) } : undefined)} label="Has spell slots" />
      {slots && <SlotGrid value={slots} onChange={(v) => set('slots', v)} />}
    </div>
  )
}

/** Spell slots by class level (rows) and spell level (columns). */
function SlotGrid({ value, onChange }: { value: Obj; onChange: (v: Obj) => void }): JSX.Element {
  const rows = arr<number[]>(value.rows)
  const width = Math.max(5, ...rows.map((r) => r.length))
  const [cols, setColsState] = useState(width)
  const setCols = (n: number): void => {
    setColsState(n)
    if (n < width) onChange({ ...value, rows: rows.map((r) => r.slice(0, n)) })
  }
  const setCell = (level: number, spellLevel: number, n: number | undefined): void => {
    const next = Array.from({ length: Math.max(rows.length, level) }, (_, i) => [...(rows[i] ?? [])])
    const row = next[level - 1]
    while (row.length < spellLevel) row.push(0)
    row[spellLevel - 1] = n ?? 0
    while (row.length && row[row.length - 1] === 0) row.pop()
    onChange({ ...value, rows: next })
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Grid min={160}>
        <Field label="Slot pool" hint="'standard' slots add up across classes; any other name is its own pool (e.g. pact)">
          <TextInput value={str(value.pool)} onChange={(v) => onChange(withKey(value, 'pool', v))} placeholder="standard" />
        </Field>
        <Field label="Spell levels shown">
          <NumberInput value={cols} onChange={(n) => n && setCols(Math.max(1, Math.min(9, n)))} min={1} max={9} />
        </Field>
      </Grid>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              <th style={th}>Lv</th>
              {Array.from({ length: cols }, (_, i) => (
                <th key={i} style={th}>
                  {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 20 }, (_, i) => i + 1).map((level) => (
              <tr key={level}>
                <td style={th}>{level}</td>
                {Array.from({ length: cols }, (_, j) => (
                  <td key={j} style={{ padding: 1 }}>
                    <input
                      className="gb-input"
                      type="number"
                      min={0}
                      value={rows[level - 1]?.[j] || ''}
                      onChange={(e) => setCell(level, j + 1, e.target.value === '' ? undefined : Number(e.target.value))}
                      style={{ width: 38, fontSize: 11, padding: '2px 3px', textAlign: 'center' }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const th = { padding: '2px 6px', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center' } as const
