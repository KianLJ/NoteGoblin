import { useState, type ReactNode } from 'react'
import type { AbilityId } from '@shared/content/schema'
import {
  ABILITY_LABELS,
  BENEFIT_CHOICES,
  CASTING_TIMES,
  CONDITIONS,
  DAMAGE_TYPES,
  FEAT_CATEGORIES,
  ITEM_TYPES,
  MOVE_MODES,
  RARITIES,
  SENSES,
  SIZES,
  SPELL_SCHOOLS,
  WEAPON_MASTERIES,
  WEAPON_PROPERTIES,
  describeBenefit,
  type ArmorAnswers,
  type Benefit,
  type BenefitType,
  type Charges,
  type FeatAnswers,
  type GuidedAnswers,
  type MagicItemAnswers,
  type SpeciesAnswers,
  type SpeciesTrait,
  type SpellAnswers,
  type WeaponAnswers
} from '@shared/content/guided'
import type { TargetChoice } from '@shared/content/workshop'
import { slugify, uniqueId } from '@shared/content/workshop'
import { PickerWindow, type PickOption } from '../../player/PickerWindow'
import { MonsterForm } from './MonsterForm'
import { VehicleEditor } from '../form/vehicle'
import { AddButton, Check, Field, Grid, Group, NumberInput, RowActions, Select, TagsInput, TargetPicker, TextArea, TextInput, move } from '../form/fields'

/** What the guided forms pick from: the skills, spells, class spell lists and rolls the character sheet knows about. */
export interface GuidedSources {
  skills: Array<{ id: string; name: string }>
  spells: PickOption[]
  spellName: (id: string) => string
  classLists: Array<{ id: string; name: string }>
  rolls: TargetChoice[]
}

const ABILITY_OPTIONS = (Object.keys(ABILITY_LABELS) as AbilityId[]).map((a) => ({ value: a, label: ABILITY_LABELS[a] }))
const opts = (xs: string[]): Array<{ value: string; label: string }> => xs.map((x) => ({ value: x, label: x }))
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** The form for one kind of guided thing. */
export function GuidedForm({ answers, onChange, sources }: { answers: GuidedAnswers; onChange: (a: GuidedAnswers) => void; sources: GuidedSources }): JSX.Element {
  switch (answers.kind) {
    case 'magicItem':
      return <MagicItemForm a={answers} set={(f) => onChange({ ...answers, ...f })} sources={sources} />
    case 'weapon':
      return <WeaponForm a={answers} set={(f) => onChange({ ...answers, ...f })} sources={sources} />
    case 'armor':
      return <ArmorForm a={answers} set={(f) => onChange({ ...answers, ...f })} sources={sources} />
    case 'spell':
      return <SpellForm a={answers} set={(f) => onChange({ ...answers, ...f })} sources={sources} />
    case 'feat':
      return <FeatForm a={answers} set={(f) => onChange({ ...answers, ...f })} sources={sources} />
    case 'species':
      return <SpeciesForm a={answers} set={(f) => onChange({ ...answers, ...f })} sources={sources} />
    case 'monster':
      return <MonsterForm a={answers} set={(f) => onChange({ ...answers, ...f })} />
    case 'vehicle':
      return (
        <VehicleEditor
          value={{ ...answers.entry, name: answers.name, description: answers.description }}
          onChange={(v) => {
            const { name, description, ...entry } = v
            onChange({ ...answers, name: typeof name === 'string' ? name : '', description: typeof description === 'string' ? description : '', entry })
          }}
        />
      )
  }
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }): JSX.Element {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 14, fontFamily: 'var(--font-display)' }}>{title}</h3>
        {hint && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{hint}</p>}
      </div>
      {children}
    </section>
  )
}

export function NameAndText({ a, set, placeholder }: { a: GuidedAnswers; set: (f: { name?: string; description?: string }) => void; placeholder: string }): JSX.Element {
  return (
    <Section title="The basics">
      <Field label="Name">
        <TextInput value={a.name} onChange={(name) => set({ name })} placeholder={placeholder} style={{ fontSize: 14 }} />
      </Field>
      <Field label="Description" hint="What players read in the Codex and on their sheet.">
        <TextArea value={a.description} onChange={(description) => set({ description })} rows={4} placeholder="Describe it the way a rulebook would." />
      </Field>
    </Section>
  )
}

/** A row of toggle chips (several can be on). */
export function Chips({ options, value, onChange }: { options: Array<{ id: string; label: string }>; value: string[]; onChange: (v: string[]) => void }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {options.map((o) => {
        const on = value.some((v) => v.toLowerCase() === o.id.toLowerCase())
        return (
          <button
            key={o.id}
            type="button"
            className={`gb-btn ${on ? 'gb-btn--primary' : 'gb-btn--secondary'}`}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v.toLowerCase() !== o.id.toLowerCase()) : [...value, o.id])}
            style={{ fontSize: 11, padding: '2px 8px' }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function Bonus({ value, onChange, label = 'Bonus' }: { value: number; onChange: (n: number) => void; label?: string }): JSX.Element {
  return (
    <Field label={label}>
      <Select value={String(value)} onChange={(v) => onChange(Number(v || 0))} options={['1', '2', '3', '4', '5'].map((n) => ({ value: n, label: `+${n}` }))} />
    </Field>
  )
}

function RarityAndAttunement({ rarity, attunement, set, plainLabel }: { rarity: string; attunement: boolean; set: (f: { rarity?: string; attunement?: boolean }) => void; plainLabel?: string }): JSX.Element {
  return (
    <Grid min={160}>
      <Field label="Rarity" hint={plainLabel}>
        <Select value={rarity} onChange={(v) => set({ rarity: v || 'Uncommon' })} options={opts(RARITIES)} />
      </Field>
      <Field label="Attunement">
        <Check checked={attunement} onChange={(v) => set({ attunement: v })} label="Requires attunement" />
      </Field>
    </Grid>
  )
}

// --- Benefits ---------------------------------------------------------------

const REPEATABLE: BenefitType[] = ['abilityBonus', 'abilitySet', 'moveSpeed', 'sense', 'advantage', 'proficiency', 'note']

/** The checklist of common benefits: tick one and its settings appear under it. */
export function BenefitsEditor({ value, onChange, sources, title = 'What it does', hint }: { value: Benefit[]; onChange: (v: Benefit[]) => void; sources: GuidedSources; title?: string; hint?: string }): JSX.Element {
  const has = (t: BenefitType): boolean => value.some((b) => b.type === t)
  const toggle = (t: BenefitType, on: boolean): void => {
    const blank = BENEFIT_CHOICES.find((c) => c.type === t)!.blank
    onChange(on ? [...value, structuredClone(blank)] : value.filter((b) => b.type !== t))
  }
  const names = { skill: (id: string) => sources.skills.find((s) => s.id === id)?.name ?? id, spell: sources.spellName }
  return (
    <Section title={title} hint={hint ?? 'Tick everything it does. Anything unusual can go under "Something else", or be built later in the full editor.'}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '4px 12px' }}>
        {BENEFIT_CHOICES.map((c) => (
          <Check key={c.type} checked={has(c.type)} onChange={(on) => toggle(c.type, on)} label={c.label} />
        ))}
      </div>
      {BENEFIT_CHOICES.filter((c) => has(c.type)).map((c) => {
        const ofType = value.map((b, i) => ({ b, i })).filter((x) => x.b.type === c.type)
        return (
          <Group key={c.type} title={c.label} actions={REPEATABLE.includes(c.type) ? <AddButton onClick={() => onChange([...value, structuredClone(c.blank)])}>Another</AddButton> : undefined}>
            {ofType.map(({ b, i }) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <BenefitSettings value={b} onChange={(nb) => onChange(value.map((x, j) => (j === i ? nb : x)))} sources={sources} />
                  {describeBenefit(b, names) && <span style={{ fontSize: 11, color: 'var(--accent)' }}>{describeBenefit(b, names)}</span>}
                </div>
                {ofType.length > 1 && <RowActions label="this one" onRemove={() => onChange(value.filter((_, j) => j !== i))} />}
              </div>
            ))}
          </Group>
        )
      })}
    </Section>
  )
}

function BenefitSettings({ value: b, onChange, sources }: { value: Benefit; onChange: (b: Benefit) => void; sources: GuidedSources }): JSX.Element {
  const [picking, setPicking] = useState(false)
  switch (b.type) {
    case 'ac':
    case 'allSaves':
    case 'initiative':
    case 'spellPower':
      return (
        <Grid min={120}>
          <Bonus value={b.amount} onChange={(amount) => onChange({ ...b, amount })} />
        </Grid>
      )
    case 'abilityBonus':
      return (
        <Grid min={140}>
          <Field label="Ability">
            <Select value={b.ability} onChange={(v) => onChange({ ...b, ability: (v || 'str') as AbilityId })} options={ABILITY_OPTIONS} />
          </Field>
          <Bonus value={b.amount} onChange={(amount) => onChange({ ...b, amount })} />
        </Grid>
      )
    case 'abilitySet':
      return (
        <Grid min={140}>
          <Field label="Ability">
            <Select value={b.ability} onChange={(v) => onChange({ ...b, ability: (v || 'str') as AbilityId })} options={ABILITY_OPTIONS} />
          </Field>
          <Field label="Becomes">
            <NumberInput value={b.score} min={1} max={30} onChange={(v) => onChange({ ...b, score: v ?? 19 })} />
          </Field>
        </Grid>
      )
    case 'walkSpeed':
      return (
        <Grid min={140}>
          <Field label="Extra feet">
            <NumberInput value={b.amount} min={5} onChange={(v) => onChange({ ...b, amount: v ?? 10 })} />
          </Field>
        </Grid>
      )
    case 'moveSpeed':
      return (
        <Grid min={140}>
          <Field label="Kind">
            <Select value={b.mode} onChange={(v) => onChange({ ...b, mode: (v || 'fly') as typeof b.mode })} options={MOVE_MODES.map((m) => ({ value: m.id, label: m.label }))} />
          </Field>
          <Field label="Speed">
            <Check checked={b.feet === 0} onChange={(on) => onChange({ ...b, feet: on ? 0 : 30 })} label="Same as walking speed" />
          </Field>
          {b.feet !== 0 && (
            <Field label="Feet">
              <NumberInput value={b.feet} min={5} onChange={(v) => onChange({ ...b, feet: v ?? 30 })} />
            </Field>
          )}
        </Grid>
      )
    case 'sense':
      return (
        <Grid min={140}>
          <Field label="Sense">
            <Select value={b.sense} onChange={(v) => onChange({ ...b, sense: v || 'darkvision' })} options={SENSES.map((s) => ({ value: s.id, label: s.label }))} />
          </Field>
          <Field label="Range (feet)">
            <NumberInput value={b.feet} min={5} onChange={(v) => onChange({ ...b, feet: v ?? 60 })} />
          </Field>
        </Grid>
      )
    case 'damage':
      return (
        <>
          <Grid min={160}>
            <Field label="Kind">
              <Select value={b.relation} onChange={(v) => onChange({ ...b, relation: (v || 'resistance') as typeof b.relation })} options={[{ value: 'resistance', label: 'Resistance (half damage)' }, { value: 'immunity', label: 'Immunity (no damage)' }]} />
            </Field>
          </Grid>
          <Chips options={DAMAGE_TYPES.map((t) => ({ id: t.toLowerCase(), label: t }))} value={b.damageTypes} onChange={(damageTypes) => onChange({ ...b, damageTypes })} />
        </>
      )
    case 'conditionImmunity':
      return <Chips options={CONDITIONS.map((c) => ({ id: c, label: cap(c) }))} value={b.conditions} onChange={(conditions) => onChange({ ...b, conditions })} />
    case 'advantage':
      return (
        <Field label="On which roll?">
          <TargetPicker value={b.target} onChange={(target) => onChange({ ...b, target })} choices={sources.rolls} />
        </Field>
      )
    case 'skills':
      return (
        <>
          <Chips options={sources.skills.map((s) => ({ id: s.id, label: s.name }))} value={b.skills} onChange={(skills) => onChange({ ...b, skills })} />
          <Check checked={b.expertise} onChange={(expertise) => onChange({ ...b, expertise })} label="Expertise (double proficiency)" />
        </>
      )
    case 'proficiency':
      return (
        <Grid min={160}>
          <Field label="Kind">
            <Select
              value={b.category}
              onChange={(v) => onChange({ ...b, category: (v || 'language') as typeof b.category })}
              options={[
                { value: 'language', label: 'Languages' },
                { value: 'tool', label: 'Tools' },
                { value: 'weapon', label: 'Weapons' },
                { value: 'armor', label: 'Armour' }
              ]}
            />
          </Field>
          <Field label={b.category === 'language' ? 'Languages' : 'Which'} hint="Type one and press Enter." wide>
            <TagsInput value={b.values} onChange={(values) => onChange({ ...b, values })} placeholder={b.category === 'language' ? 'Draconic' : b.category === 'tool' ? "Smith's Tools" : b.category === 'weapon' ? 'martial' : 'heavy'} />
          </Field>
        </Grid>
      )
    case 'hp':
      return (
        <Grid min={140}>
          <Field label="Hit points">
            <NumberInput value={b.amount} min={1} onChange={(v) => onChange({ ...b, amount: v ?? 1 })} />
          </Field>
          <Field label="How">
            <Check checked={b.perLevel} onChange={(perLevel) => onChange({ ...b, perLevel })} label="For every level" />
          </Field>
        </Grid>
      )
    case 'spells':
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          {b.spellIds.map((id) => (
            <span key={id} className="gb-badge" style={{ fontSize: 11 }}>
              {sources.spellName(id)}
            </span>
          ))}
          <button type="button" className="gb-btn gb-btn--secondary" onClick={() => setPicking(true)} style={{ fontSize: 11, padding: '2px 8px' }}>
            {b.spellIds.length ? 'Change spells' : 'Choose spells'}
          </button>
          {picking && <PickerWindow title="Spells it lets you cast" options={sources.spells} picks={b.spellIds} mode="multi" max={20} onChange={(spellIds) => onChange({ ...b, spellIds })} onClose={() => setPicking(false)} />}
        </div>
      )
    case 'note':
      return <TextArea value={b.text} onChange={(text) => onChange({ ...b, text })} rows={2} placeholder="Once per day, you can…" />
  }
}

function ChargesEditor({ value, onChange }: { value: Charges | null; onChange: (c: Charges | null) => void }): JSX.Element {
  return (
    <Section title="Charges" hint="For wands, staffs and anything with limited uses — the sheet tracks them.">
      <Check checked={!!value} onChange={(on) => onChange(on ? { count: 3, recharge: 'dawn', regain: '1d3' } : null)} label="It has charges" />
      {value && (
        <Grid min={150}>
          <Field label="How many">
            <NumberInput value={value.count} min={1} onChange={(v) => onChange({ ...value, count: v ?? 1 })} />
          </Field>
          <Field label="They come back">
            <Select
              value={value.recharge}
              onChange={(v) => onChange({ ...value, recharge: (v || 'dawn') as Charges['recharge'] })}
              options={[
                { value: 'dawn', label: 'At dawn' },
                { value: 'long', label: 'On a long rest' },
                { value: 'short', label: 'On a short or long rest' },
                { value: 'none', label: 'Never (used up)' }
              ]}
            />
          </Field>
          {value.recharge !== 'none' && (
            <Field label="How many come back" hint="Dice like 1d6 + 1, or blank for all.">
              <TextInput value={value.regain} onChange={(regain) => onChange({ ...value, regain })} placeholder="all" />
            </Field>
          )}
        </Grid>
      )}
    </Section>
  )
}

// --- Kinds --------------------------------------------------------------------

function MagicItemForm({ a, set, sources }: { a: MagicItemAnswers; set: (f: Partial<MagicItemAnswers>) => void; sources: GuidedSources }): JSX.Element {
  return (
    <>
      <NameAndText a={a} set={set} placeholder="Cloak of Embers" />
      <Section title="What kind of item">
        <Grid min={160}>
          <Field label="Type">
            <Select value={ITEM_TYPES.includes(a.itemType) ? a.itemType : ''} onChange={(v) => set({ itemType: v || a.itemType })} options={opts(ITEM_TYPES)} none={ITEM_TYPES.includes(a.itemType) ? undefined : a.itemType} />
          </Field>
          <Field label="Its benefits work while">
            <Select
              value={a.activeWhen}
              onChange={(v) => set({ activeWhen: (v || 'equipped') as MagicItemAnswers['activeWhen'] })}
              options={[
                { value: 'equipped', label: a.attunement ? 'Attuned and worn or held' : 'Worn or held' },
                { value: 'carried', label: 'Just carried' }
              ]}
            />
          </Field>
        </Grid>
        <RarityAndAttunement rarity={a.rarity} attunement={a.attunement} set={set} />
      </Section>
      <BenefitsEditor value={a.benefits} onChange={(benefits) => set({ benefits })} sources={sources} />
      <ChargesEditor value={a.charges} onChange={(charges) => set({ charges })} />
    </>
  )
}

function WeaponForm({ a, set, sources }: { a: WeaponAnswers; set: (f: Partial<WeaponAnswers>) => void; sources: GuidedSources }): JSX.Element {
  const thrown = a.properties.includes('Thrown')
  return (
    <>
      <NameAndText a={a} set={set} placeholder="Flame Tongue" />
      <Section title="The weapon" hint="How it hits before any magic.">
        <Grid min={150}>
          <Field label="Kind">
            <Select value={a.martial ? 'martial' : 'simple'} onChange={(v) => set({ martial: v === 'martial' })} options={[{ value: 'simple', label: 'Simple weapon' }, { value: 'martial', label: 'Martial weapon' }]} />
          </Field>
          <Field label="Used in">
            <Select value={a.ranged ? 'ranged' : 'melee'} onChange={(v) => set({ ranged: v === 'ranged' })} options={[{ value: 'melee', label: 'Melee' }, { value: 'ranged', label: 'Ranged' }]} />
          </Field>
          <Field label="Damage dice">
            <TextInput value={a.damage} onChange={(damage) => set({ damage })} placeholder="1d8" />
          </Field>
          <Field label="Damage type">
            <Select value={a.damageType} onChange={(v) => set({ damageType: v || 'Slashing' })} options={opts(DAMAGE_TYPES)} />
          </Field>
        </Grid>
        <Field label="Properties">
          <Chips options={WEAPON_PROPERTIES.map((p) => ({ id: p, label: p }))} value={a.properties} onChange={(properties) => set({ properties })} />
        </Field>
        <Grid min={150}>
          <Field label="Mastery" hint="Used by characters with Weapon Mastery for it.">
            <Select value={a.mastery} onChange={(v) => set({ mastery: v })} options={WEAPON_MASTERIES.map((m) => ({ value: m, label: m }))} none="None" />
          </Field>
        </Grid>
        <Grid min={150}>
          {a.properties.includes('Versatile') && (
            <Field label="Two-handed damage">
              <TextInput value={a.versatileDamage} onChange={(versatileDamage) => set({ versatileDamage })} placeholder="1d10" />
            </Field>
          )}
          {(a.ranged || thrown) && (
            <>
              <Field label="Normal range (ft.)">
                <NumberInput value={a.normalRange ?? undefined} onChange={(v) => set({ normalRange: v ?? null })} placeholder="80" />
              </Field>
              <Field label="Long range (ft.)">
                <NumberInput value={a.longRange ?? undefined} onChange={(v) => set({ longRange: v ?? null })} placeholder="320" />
              </Field>
            </>
          )}
        </Grid>
      </Section>
      <Section title="Magic" hint="Leave the bonus at none for a plain weapon.">
        <Grid min={150}>
          <Field label="Bonus to attack and damage">
            <Select value={String(a.magicBonus)} onChange={(v) => set({ magicBonus: Number(v || 0) })} options={['0', '1', '2', '3'].map((n) => ({ value: n, label: n === '0' ? 'None' : `+${n}` }))} />
          </Field>
        </Grid>
        <Check checked={!!a.extraDamage} onChange={(on) => set({ extraDamage: on ? { dice: '1d6', damageType: 'Fire' } : null })} label="Deals extra damage on a hit" />
        {a.extraDamage && (
          <Grid min={150}>
            <Field label="Extra dice">
              <TextInput value={a.extraDamage.dice} onChange={(dice) => set({ extraDamage: { ...a.extraDamage!, dice } })} placeholder="2d6" />
            </Field>
            <Field label="Type">
              <Select value={a.extraDamage.damageType} onChange={(v) => set({ extraDamage: { ...a.extraDamage!, damageType: v || 'Fire' } })} options={opts(DAMAGE_TYPES)} />
            </Field>
          </Grid>
        )}
        <RarityAndAttunement rarity={a.rarity} attunement={a.attunement} set={set} plainLabel="Ignored for a plain weapon." />
      </Section>
      <BenefitsEditor value={a.benefits} onChange={(benefits) => set({ benefits })} sources={sources} title="Anything else it does" hint="Benefits for whoever wields it, beyond the attack itself." />
      <ChargesEditor value={a.charges} onChange={(charges) => set({ charges })} />
      <CostAndWeight cost={a.cost} weight={a.weight} set={set} />
    </>
  )
}

function CostAndWeight({ cost, weight, set }: { cost: string; weight: number | null; set: (f: { cost?: string; weight?: number | null }) => void }): JSX.Element {
  return (
    <Section title="Cost and weight" hint="Optional.">
      <Grid min={150}>
        <Field label="Cost">
          <TextInput value={cost} onChange={(c) => set({ cost: c })} placeholder="50 gp" />
        </Field>
        <Field label="Weight (lb.)">
          <NumberInput value={weight ?? undefined} min={0} onChange={(v) => set({ weight: v ?? null })} />
        </Field>
      </Grid>
    </Section>
  )
}

function ArmorForm({ a, set, sources }: { a: ArmorAnswers; set: (f: Partial<ArmorAnswers>) => void; sources: GuidedSources }): JSX.Element {
  const shield = a.armorType === 'shield'
  return (
    <>
      <NameAndText a={a} set={set} placeholder="Emberplate" />
      <Section title="The armour">
        <Grid min={160}>
          <Field label="Type" hint={a.armorType === 'light' ? 'Adds the full Dexterity modifier.' : a.armorType === 'medium' ? 'Adds Dexterity, up to +2.' : a.armorType === 'heavy' ? 'No Dexterity bonus.' : 'Added on top of armour.'}>
            <Select
              value={a.armorType}
              onChange={(v) => {
                const armorType = (v || 'medium') as ArmorAnswers['armorType']
                set({ armorType, baseAc: armorType === 'shield' ? 2 : armorType === 'light' ? 11 : armorType === 'medium' ? 14 : 18 })
              }}
              options={[
                { value: 'light', label: 'Light armour' },
                { value: 'medium', label: 'Medium armour' },
                { value: 'heavy', label: 'Heavy armour' },
                { value: 'shield', label: 'Shield' }
              ]}
            />
          </Field>
          <Field label={shield ? 'Armor Class bonus' : 'Base Armor Class'}>
            <NumberInput value={a.baseAc} min={0} max={30} onChange={(v) => set({ baseAc: v ?? (shield ? 2 : 10) })} />
          </Field>
          <Field label="Magic bonus">
            <Select value={String(a.magicBonus)} onChange={(v) => set({ magicBonus: Number(v || 0) })} options={['0', '1', '2', '3'].map((n) => ({ value: n, label: n === '0' ? 'None' : `+${n}` }))} />
          </Field>
        </Grid>
        {!shield && (
          <Grid min={160}>
            <Field label="Strength needed" hint="Slower by 10 ft. below it.">
              <NumberInput value={a.strength ?? undefined} min={1} max={30} placeholder="None" onChange={(v) => set({ strength: v ?? null })} />
            </Field>
            <Field label="Stealth">
              <Check checked={a.stealthDisadvantage} onChange={(stealthDisadvantage) => set({ stealthDisadvantage })} label="Disadvantage on Stealth" />
            </Field>
          </Grid>
        )}
        <RarityAndAttunement rarity={a.rarity} attunement={a.attunement} set={set} plainLabel="Ignored for plain armour." />
      </Section>
      <BenefitsEditor value={a.benefits} onChange={(benefits) => set({ benefits })} sources={sources} title="Anything else it does" hint="Benefits while it's worn, beyond Armor Class." />
      <CostAndWeight cost={a.cost} weight={a.weight} set={set} />
    </>
  )
}

function SpellForm({ a, set, sources }: { a: SpellAnswers; set: (f: Partial<SpellAnswers>) => void; sources: GuidedSources }): JSX.Element {
  const cantrip = a.level === 0
  return (
    <>
      <NameAndText a={a} set={set} placeholder="Cinder Bolt" />
      <Section title="Casting">
        <Grid min={150}>
          <Field label="Level">
            <Select value={String(a.level)} onChange={(v) => set({ level: Number(v || 0) })} options={Array.from({ length: 10 }, (_, i) => ({ value: String(i), label: i === 0 ? 'Cantrip' : `Level ${i}` }))} />
          </Field>
          <Field label="School">
            <Select value={a.school} onChange={(v) => set({ school: v })} options={opts(SPELL_SCHOOLS)} none="None" />
          </Field>
          <Field label="Casting time">
            <TextInput value={a.castingTime} onChange={(castingTime) => set({ castingTime })} list="guided-casting" placeholder="1 action" />
          </Field>
          <Field label="Range">
            <TextInput value={a.range} onChange={(range) => set({ range })} placeholder="60 feet" />
          </Field>
          <Field label="Duration">
            <TextInput value={a.duration} onChange={(duration) => set({ duration })} placeholder="Instantaneous" />
          </Field>
        </Grid>
        <datalist id="wk-guided-casting">
          {CASTING_TIMES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Check checked={a.verbal} onChange={(verbal) => set({ verbal })} label="Verbal" />
          <Check checked={a.somatic} onChange={(somatic) => set({ somatic })} label="Somatic" />
          <Check checked={!!a.material} onChange={(on) => set({ material: on ? 'a pinch of ash' : '' })} label="Material" />
          <Check checked={a.concentration} onChange={(concentration) => set({ concentration })} label="Concentration" />
          <Check checked={a.ritual} onChange={(ritual) => set({ ritual })} label="Ritual" />
        </div>
        {!!a.material && (
          <Field label="Material component">
            <TextInput value={a.material} onChange={(material) => set({ material })} />
          </Field>
        )}
        <Field label="Who can learn it" hint="The classes whose spell list it's on.">
          <Chips options={sources.classLists.map((c) => ({ id: c.id, label: c.name }))} value={a.lists} onChange={(lists) => set({ lists })} />
        </Field>
      </Section>
      <Section title="What it does" hint="The sheet shows the roll; the description covers everything else.">
        <Grid min={170}>
          <Field label="It hits with">
            <Select
              value={a.delivery}
              onChange={(v) => set({ delivery: (v || 'none') as SpellAnswers['delivery'] })}
              options={[
                { value: 'attack', label: 'A spell attack' },
                { value: 'save', label: 'A saving throw' },
                { value: 'none', label: 'Neither (it just happens)' }
              ]}
            />
          </Field>
          {a.delivery === 'attack' && (
            <Field label="Attack">
              <Select value={a.attackRange} onChange={(v) => set({ attackRange: (v || 'ranged') as SpellAnswers['attackRange'] })} options={[{ value: 'ranged', label: 'Ranged' }, { value: 'melee', label: 'Melee' }]} />
            </Field>
          )}
          {a.delivery === 'save' && (
            <Field label="Saving throw">
              <Select value={a.saveAbility} onChange={(v) => set({ saveAbility: (v || 'dex') as AbilityId })} options={ABILITY_OPTIONS} />
            </Field>
          )}
        </Grid>
        <Grid min={150}>
          <Field label="Damage dice" hint="Blank for none.">
            <TextInput value={a.damage} onChange={(damage) => set({ damage })} placeholder="8d6" />
          </Field>
          {a.damage.trim() && (
            <Field label="Damage type">
              <Select value={a.damageType} onChange={(v) => set({ damageType: v || 'Fire' })} options={opts(DAMAGE_TYPES)} />
            </Field>
          )}
          <Field label="Healing dice" hint="Blank for none.">
            <TextInput value={a.healing} onChange={(healing) => set({ healing })} placeholder="2d8" />
          </Field>
        </Grid>
        {a.healing.trim() && <Check checked={a.healingAddsModifier} onChange={(healingAddsModifier) => set({ healingAddsModifier })} label="Healing adds the caster's spellcasting modifier" />}
        {cantrip ? (
          a.damage.trim() && <Check checked={a.cantripScaling} onChange={(cantripScaling) => set({ cantripScaling })} label="More dice at levels 5, 11 and 17 (like Fire Bolt)" />
        ) : (
          (a.damage.trim() || a.healing.trim()) && (
            <Grid min={150}>
              <Field label="Extra dice per higher slot" hint="Blank if casting it higher doesn't add dice.">
                <TextInput value={a.upcastDice} onChange={(upcastDice) => set({ upcastDice })} placeholder="1d6" />
              </Field>
            </Grid>
          )
        )}
        {!cantrip && (
          <Field label="At higher levels (optional text)">
            <TextArea value={a.higherLevel} onChange={(higherLevel) => set({ higherLevel })} rows={2} placeholder="When you cast this spell using a spell slot of level 4 or higher…" />
          </Field>
        )}
      </Section>
    </>
  )
}

function FeatForm({ a, set, sources }: { a: FeatAnswers; set: (f: Partial<FeatAnswers>) => void; sources: GuidedSources }): JSX.Element {
  return (
    <>
      <NameAndText a={a} set={set} placeholder="Fireheart" />
      <Section title="Who can take it">
        <Grid min={160}>
          <Field label="Kind of feat" hint={a.category === 'Origin' ? 'Backgrounds grant these at level 1.' : a.category === 'Epic Boon' ? 'Taken at level 19+.' : undefined}>
            <Select value={FEAT_CATEGORIES.includes(a.category) ? a.category : ''} onChange={(v) => set({ category: v || a.category, ...(v === 'Origin' ? { minLevel: null } : v === 'Epic Boon' ? { minLevel: 19 } : {}) })} options={opts(FEAT_CATEGORIES)} none={FEAT_CATEGORIES.includes(a.category) ? undefined : a.category} />
          </Field>
          <Field label="Minimum level">
            <NumberInput value={a.minLevel ?? undefined} min={1} max={20} placeholder="Any" onChange={(v) => set({ minLevel: v ?? null })} />
          </Field>
          <Field label="Other requirements (text)">
            <TextInput value={a.prerequisiteText} onChange={(prerequisiteText) => set({ prerequisiteText })} placeholder="Strength 13+" />
          </Field>
        </Grid>
        <Check checked={a.repeatable} onChange={(repeatable) => set({ repeatable })} label="Can be taken more than once" />
      </Section>
      <Section title="Ability score increase" hint="Most 2024 feats give +1 to one ability score.">
        <Check checked={!!a.abilityIncrease} onChange={(on) => set({ abilityIncrease: on ? { abilities: ['str', 'dex', 'con', 'int', 'wis', 'cha'], amount: 1 } : null })} label="The player raises an ability score" />
        {a.abilityIncrease && (
          <>
            <Field label="Which they can pick from">
              <Chips options={ABILITY_OPTIONS.map((o) => ({ id: o.value, label: o.label }))} value={a.abilityIncrease.abilities} onChange={(abilities) => set({ abilityIncrease: { ...a.abilityIncrease!, abilities: abilities as AbilityId[] } })} />
            </Field>
            <Grid min={120}>
              <Bonus value={a.abilityIncrease.amount} onChange={(amount) => set({ abilityIncrease: { ...a.abilityIncrease!, amount } })} label="By" />
            </Grid>
          </>
        )}
      </Section>
      <BenefitsEditor value={a.benefits} onChange={(benefits) => set({ benefits })} sources={sources} />
    </>
  )
}

function SpeciesForm({ a, set, sources }: { a: SpeciesAnswers; set: (f: Partial<SpeciesAnswers>) => void; sources: GuidedSources }): JSX.Element {
  const setTrait = (i: number, t: SpeciesTrait): void => set({ traits: a.traits.map((x, j) => (j === i ? t : x)) })
  return (
    <>
      <NameAndText a={a} set={set} placeholder="Cinderfolk" />
      <Section title="Body">
        <Grid min={150}>
          <Field label="Size">
            <Select value={a.size} onChange={(v) => set({ size: v || 'Medium' })} options={opts(SIZES)} />
          </Field>
          <Field label="Walking speed (ft.)">
            <NumberInput value={a.speed} min={0} onChange={(v) => set({ speed: v ?? 30 })} />
          </Field>
          <Field label="Darkvision (ft.)" hint="0 for none.">
            <NumberInput value={a.darkvision} min={0} onChange={(v) => set({ darkvision: v ?? 0 })} />
          </Field>
        </Grid>
      </Section>
      <Section title="Traits" hint="Each trait has a name and description players read, and can tick what it does on the sheet.">
        {a.traits.map((t, i) => (
          <Group
            key={i}
            title={t.name || `Trait ${i + 1}`}
            actions={<RowActions label="trait" onUp={i > 0 ? () => set({ traits: move(a.traits, i, -1) }) : undefined} onDown={i < a.traits.length - 1 ? () => set({ traits: move(a.traits, i, 1) }) : undefined} onRemove={() => set({ traits: a.traits.filter((_, j) => j !== i) })} />}
          >
            <Field label="Name">
              <TextInput value={t.name} onChange={(name) => setTrait(i, { ...t, name })} placeholder="Ashen Hide" />
            </Field>
            <Field label="Description">
              <TextArea value={t.description} onChange={(description) => setTrait(i, { ...t, description })} rows={2} />
            </Field>
            <BenefitsEditor value={t.benefits} onChange={(benefits) => setTrait(i, { ...t, benefits })} sources={sources} title="What it does" hint="Leave all unticked if it's described in words only." />
          </Group>
        ))}
        <AddButton
          onClick={() =>
            set({
              traits: [
                ...a.traits,
                {
                  id: uniqueId(
                    `trait-${a.traits.length + 1}`,
                    a.traits.map((t) => t.id)
                  ),
                  name: '',
                  description: '',
                  benefits: [],
                  extras: []
                }
              ]
            })
          }
        >
          Add a trait
        </AddButton>
      </Section>
    </>
  )
}

/** A trait id from its name once it has one (kept stable after the first save). */
export function traitIdsFromNames(a: GuidedAnswers): GuidedAnswers {
  if (a.kind !== 'species') return a
  const taken: string[] = []
  return {
    ...a,
    traits: a.traits.map((t) => {
      const id = /^trait-\d+$/.test(t.id) && t.name.trim() ? uniqueId(slugify(t.name), taken) : t.id
      taken.push(id)
      return { ...t, id }
    })
  }
}
