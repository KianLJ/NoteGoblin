import { CONDITIONS, DAMAGE_TYPES } from '@shared/content/guided'
import {
  CHALLENGE_RATINGS,
  HIT_DIE,
  MONSTER_BLOCKS,
  MONSTER_SENSES,
  MONSTER_SIZES,
  MONSTER_SKILLS,
  MONSTER_SPEEDS,
  MONSTER_TYPES,
  blankAttack,
  blankSave,
  blockText,
  hpText,
  plainDice,
  proficiencyForCr,
  type CustomField,
  type MonsterAnswers,
  type MonsterBlock,
  type MonsterBlockKey
} from '@shared/content/guidedMonster'
import type { AbilityId } from '@shared/content/schema'
import { AddButton, Check, Field, Grid, Group, NumberInput, RowActions, Select, TextArea, TextInput, move } from '../form/fields'
import { Chips, NameAndText, Section } from './GuidedForms'

const ABILITIES: Array<{ value: AbilityId; label: string }> = [
  { value: 'str', label: 'Strength' },
  { value: 'dex', label: 'Dexterity' },
  { value: 'con', label: 'Constitution' },
  { value: 'int', label: 'Intelligence' },
  { value: 'wis', label: 'Wisdom' },
  { value: 'cha', label: 'Charisma' }
]
const DAMAGE = DAMAGE_TYPES.map((t) => ({ id: t.toLowerCase(), label: t }))
const DAMAGE_OPTIONS = DAMAGE_TYPES.map((t) => ({ value: t.toLowerCase(), label: t }))
const USAGES = ['Recharge 5–6', 'Recharge 6', '1/Day', '2/Day', '3/Day', 'Costs 2 Actions', 'Costs 3 Actions']
const FIELD_NAMES: Record<CustomField, string> = {
  ac: 'Armor Class',
  hp: 'Hit Points',
  speed: 'Speed',
  saves: 'Saving throws',
  skills: 'Skills',
  senses: 'Senses',
  initiative: 'Initiative',
  damage_resistances: 'Damage resistances',
  damage_immunities: 'Damage immunities',
  damage_vulnerabilities: 'Damage vulnerabilities',
  condition_immunities: 'Condition immunities'
}
const mod = (score: number): string => {
  const m = Math.floor((score - 10) / 2)
  return m >= 0 ? `+${m}` : `${m}`
}
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** A creature described with numbers and choices; the statblock text is written for you. */
export function MonsterForm({ a, set }: { a: MonsterAnswers; set: (f: Partial<MonsterAnswers>) => void }): JSX.Element {
  const prof = proficiencyForCr(a.cr)
  const custom = Object.keys(a.custom) as CustomField[]
  const setBlocks = (key: MonsterBlockKey, list: MonsterBlock[]): void => set({ blocks: { ...a.blocks, [key]: list } })
  return (
    <>
      <NameAndText a={a} set={set} placeholder="Ember Drake" />
      <Section title="What it is">
        <Grid min={150}>
          <Field label="Size" hint={`Hit dice: d${HIT_DIE[a.size] ?? 8}`}>
            <Select value={a.size} onChange={(v) => set({ size: v || 'Medium' })} options={MONSTER_SIZES.map((s) => ({ value: s, label: s }))} />
          </Field>
          <Field label="Type">
            <TextInput value={a.type} onChange={(type) => set({ type })} list="guided-monster-types" placeholder="dragon" />
          </Field>
          <Field label="Alignment">
            <TextInput value={a.alignment} onChange={(alignment) => set({ alignment })} placeholder="chaotic evil" />
          </Field>
          <Field label="Challenge" hint={`Proficiency bonus +${prof}`}>
            <Select value={a.cr} onChange={(v) => set({ cr: v || '1' })} options={CHALLENGE_RATINGS.map((c) => ({ value: c, label: `CR ${c}` }))} />
          </Field>
        </Grid>
        <datalist id="wk-guided-monster-types">
          {MONSTER_TYPES.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </Section>

      <Section title="Ability scores">
        <Grid min={90}>
          {ABILITIES.map((x) => (
            <Field key={x.value} label={`${x.label} (${mod(a.scores[x.value])})`}>
              <NumberInput value={a.scores[x.value]} min={1} max={30} onChange={(v) => set({ scores: { ...a.scores, [x.value]: v ?? 10 } })} />
            </Field>
          ))}
        </Grid>
      </Section>

      <Section title="Toughness" hint="Hit points are worked out from the hit dice, its size and its Constitution.">
        <Grid min={150}>
          <Field label="Armor Class">
            <NumberInput value={a.ac} min={1} max={30} onChange={(v) => set({ ac: v ?? 10 })} />
          </Field>
          <Field label="Armour (optional)">
            <TextInput value={a.acNote} onChange={(acNote) => set({ acNote })} placeholder="natural armor" />
          </Field>
          <Field label="Hit dice" hint={`= ${plainDice(hpText(a))} hit points`}>
            <NumberInput value={a.hitDice} min={1} max={60} onChange={(v) => set({ hitDice: v ?? 1 })} />
          </Field>
        </Grid>
        <Field label="Resistant to (half damage)">
          <Chips options={DAMAGE} value={a.resistances} onChange={(resistances) => set({ resistances })} />
        </Field>
        <Field label="Immune to (no damage)">
          <Chips options={DAMAGE} value={a.immunities} onChange={(immunities) => set({ immunities })} />
        </Field>
        <Field label="Vulnerable to (double damage)">
          <Chips options={DAMAGE} value={a.vulnerabilities} onChange={(vulnerabilities) => set({ vulnerabilities })} />
        </Field>
        <Field label="Can't be">
          <Chips options={CONDITIONS.map((c) => ({ id: c, label: cap(c) }))} value={a.conditionImmunities} onChange={(conditionImmunities) => set({ conditionImmunities })} />
        </Field>
      </Section>

      <Section title="Movement, senses and languages">
        <Grid min={120}>
          <Field label="Walking (ft.)">
            <NumberInput value={a.walk} min={0} onChange={(v) => set({ walk: v ?? 0 })} />
          </Field>
          {MONSTER_SPEEDS.map((s) => (
            <Field key={s} label={`${cap(s === 'fly' ? 'flying' : s === 'swim' ? 'swimming' : s === 'climb' ? 'climbing' : 'burrowing')} (ft.)`}>
              <NumberInput value={a.speeds[s] || undefined} min={0} placeholder="None" onChange={(v) => set({ speeds: { ...a.speeds, [s]: v ?? 0 } })} />
            </Field>
          ))}
        </Grid>
        {a.speeds.fly > 0 && <Check checked={a.hover} onChange={(hover) => set({ hover })} label="Hovers (doesn't fall if knocked prone)" />}
        <Grid min={120}>
          {MONSTER_SENSES.map((s) => (
            <Field key={s} label={`${cap(s)} (ft.)`}>
              <NumberInput value={a.senses[s] || undefined} min={0} placeholder="None" onChange={(v) => set({ senses: { ...a.senses, [s]: v ?? 0 } })} />
            </Field>
          ))}
        </Grid>
        <Field label="Languages">
          <TextInput value={a.languages} onChange={(languages) => set({ languages })} placeholder="Common, Draconic" />
        </Field>
      </Section>

      <Section title="What it's good at" hint={`Proficient rolls add its proficiency bonus (+${prof}).`}>
        <Field label="Saving throws">
          <Chips options={ABILITIES.map((x) => ({ id: x.value, label: x.label }))} value={a.saves} onChange={(v) => set({ saves: v as AbilityId[] })} />
        </Field>
        <Field label="Skills">
          <Chips
            options={MONSTER_SKILLS.map((s) => ({ id: s.id, label: s.name }))}
            value={a.skills.map((s) => s.id)}
            onChange={(ids) => set({ skills: ids.map((id) => a.skills.find((s) => s.id === id) ?? { id, expertise: false }) })}
          />
        </Field>
        {a.skills.length > 0 && (
          <Field label="Expertise (double proficiency)">
            <Chips
              options={a.skills.map((s) => ({ id: s.id, label: MONSTER_SKILLS.find((x) => x.id === s.id)?.name ?? s.id }))}
              value={a.skills.filter((s) => s.expertise).map((s) => s.id)}
              onChange={(ids) => set({ skills: a.skills.map((s) => ({ ...s, expertise: ids.includes(s.id) })) })}
            />
          </Field>
        )}
        <Check checked={a.initiativeProficient} onChange={(initiativeProficient) => set({ initiativeProficient })} label="Adds its proficiency bonus to initiative (quick, alert creatures)" />
      </Section>

      {custom.length > 0 && (
        <Section title="Lines kept as written" hint="These came from the full editor or an imported statblock in a form this page can't rebuild exactly. Edit them here, or have them worked out from the choices above instead.">
          {custom.map((k) => (
            <Field key={k} label={FIELD_NAMES[k]}>
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
                  <TextInput value={a.custom[k] ?? ''} onChange={(v) => set({ custom: { ...a.custom, [k]: v } })} style={{ flex: 1 }} />
                </div>
                <button
                  type="button"
                  className="gb-btn gb-btn--secondary"
                  style={{ fontSize: 11, padding: '2px 8px', flexShrink: 0 }}
                  onClick={() => {
                    const next = { ...a.custom }
                    delete next[k]
                    set({ custom: next })
                  }}
                >
                  Work it out instead
                </button>
              </div>
            </Field>
          ))}
        </Section>
      )}

      {MONSTER_BLOCKS.map((b) => {
        const list = a.blocks[b.key]
        return (
          <Section key={b.key} title={b.label} hint={b.hint}>
            {list.map((x, i) => (
              <BlockEditor
                key={i}
                a={a}
                value={x}
                label={b.singular}
                onChange={(nx) => setBlocks(b.key, list.map((y, j) => (j === i ? nx : y)))}
                onUp={i > 0 ? () => setBlocks(b.key, move(list, i, -1)) : undefined}
                onDown={i < list.length - 1 ? () => setBlocks(b.key, move(list, i, 1)) : undefined}
                onRemove={() => setBlocks(b.key, list.filter((_, j) => j !== i))}
              />
            ))}
            <AddButton onClick={() => setBlocks(b.key, [...list, { name: '', usage: '', desc: '', roll: b.key === 'actions' || b.key === 'bonus_actions' ? blankAttack() : null }])}>Add {/^[aeiou]/.test(b.singular) ? 'an' : 'a'} {b.singular}</AddButton>
          </Section>
        )
      })}
      <datalist id="wk-guided-usages">
        {USAGES.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
    </>
  )
}

function BlockEditor({
  a,
  value: x,
  label,
  onChange,
  onUp,
  onDown,
  onRemove
}: {
  a: MonsterAnswers
  value: MonsterBlock
  label: string
  onChange: (b: MonsterBlock) => void
  onUp?: () => void
  onDown?: () => void
  onRemove: () => void
}): JSX.Element {
  const r = x.roll
  const text = blockText(a, x)
  return (
    <Group title={x.name || cap(label)} actions={<RowActions label={label} onUp={onUp} onDown={onDown} onRemove={onRemove} />}>
      <Grid min={160}>
        <Field label="Name">
          <TextInput value={x.name} onChange={(name) => onChange({ ...x, name })} placeholder={label === 'trait' ? 'Keen Smell' : 'Bite'} />
        </Field>
        <Field label="Limited use (optional)">
          <TextInput value={x.usage} onChange={(usage) => onChange({ ...x, usage })} list="guided-usages" placeholder="Recharge 5–6" />
        </Field>
        <Field label="It's">
          <Select
            value={r ? r.kind : 'words'}
            onChange={(v) => onChange({ ...x, roll: v === 'attack' ? blankAttack() : v === 'save' ? blankSave() : null })}
            options={[
              { value: 'attack', label: 'An attack' },
              { value: 'save', label: 'A saving throw' },
              { value: 'words', label: 'Described in words' }
            ]}
          />
        </Field>
      </Grid>
      {r?.kind === 'attack' && (
        <Grid min={130}>
          <Field label="Attack">
            <Select value={r.range} onChange={(v) => onChange({ ...x, roll: { ...r, range: v === 'ranged' ? 'ranged' : 'melee', ability: v === 'ranged' ? 'dex' : r.ability } })} options={[{ value: 'melee', label: 'Melee' }, { value: 'ranged', label: 'Ranged' }]} />
          </Field>
          <Field label="Uses">
            <Select value={r.ability} onChange={(v) => onChange({ ...x, roll: { ...r, ability: (v || 'str') as AbilityId } })} options={ABILITIES} />
          </Field>
          {r.range === 'melee' ? (
            <Field label="Reach (ft.)">
              <NumberInput value={r.reach} min={5} onChange={(v) => onChange({ ...x, roll: { ...r, reach: v ?? 5 } })} />
            </Field>
          ) : (
            <>
              <Field label="Range (ft.)">
                <NumberInput value={r.normal} min={5} onChange={(v) => onChange({ ...x, roll: { ...r, normal: v ?? 80 } })} />
              </Field>
              <Field label="Long range (ft.)">
                <NumberInput value={r.long} min={5} onChange={(v) => onChange({ ...x, roll: { ...r, long: v ?? 320 } })} />
              </Field>
            </>
          )}
          <Field label="Damage dice">
            <TextInput value={r.dice} onChange={(dice) => onChange({ ...x, roll: { ...r, dice } })} placeholder="1d8" />
          </Field>
          <Field label="Damage type">
            <Select value={r.damageType} onChange={(v) => onChange({ ...x, roll: { ...r, damageType: v || 'slashing' } })} options={DAMAGE_OPTIONS} />
          </Field>
          <Field label="Extra dice (optional)">
            <TextInput value={r.extraDice} onChange={(extraDice) => onChange({ ...x, roll: { ...r, extraDice } })} placeholder="1d6" />
          </Field>
          {r.extraDice.trim() && (
            <Field label="Extra type">
              <Select value={r.extraType} onChange={(v) => onChange({ ...x, roll: { ...r, extraType: v || 'fire' } })} options={DAMAGE_OPTIONS} />
            </Field>
          )}
          <Field label="And on a hit (optional)" wide>
            <TextInput value={r.rider} onChange={(rider) => onChange({ ...x, roll: { ...r, rider } })} placeholder="and the target is grappled (escape DC 14)." />
          </Field>
        </Grid>
      )}
      {r?.kind === 'save' && (
        <Grid min={140}>
          <Field label="Who" wide>
            <TextInput value={r.targets} onChange={(targets) => onChange({ ...x, roll: { ...r, targets } })} placeholder="each creature in a 15-foot cone" />
          </Field>
          <Field label="Saving throw">
            <Select value={r.ability} onChange={(v) => onChange({ ...x, roll: { ...r, ability: (v || 'dex') as AbilityId } })} options={ABILITIES} />
          </Field>
          <Field label="DC worked out from">
            <Select value={r.dcAbility} onChange={(v) => onChange({ ...x, roll: { ...r, dcAbility: (v || 'con') as AbilityId } })} options={ABILITIES} />
          </Field>
          <Field label="Damage dice">
            <TextInput value={r.dice} onChange={(dice) => onChange({ ...x, roll: { ...r, dice } })} placeholder="8d6" />
          </Field>
          <Field label="Damage type">
            <Select value={r.damageType} onChange={(v) => onChange({ ...x, roll: { ...r, damageType: v || 'fire' } })} options={DAMAGE_OPTIONS} />
          </Field>
          <Field label="On a success">
            <Check checked={r.half} onChange={(half) => onChange({ ...x, roll: { ...r, half } })} label="Half damage" />
          </Field>
          <Field label="And on a failure (optional)" wide>
            <TextInput value={r.rider} onChange={(rider) => onChange({ ...x, roll: { ...r, rider } })} placeholder="A creature that fails is also knocked prone." />
          </Field>
        </Grid>
      )}
      <Field label={r ? 'More text after it (optional)' : 'Description'}>
        <TextArea value={x.desc} onChange={(desc) => onChange({ ...x, desc })} rows={r ? 1 : 3} placeholder={r ? '' : 'The creature has advantage on Wisdom (Perception) checks that rely on smell.'} />
      </Field>
      {r && text && <span style={{ fontSize: 11, color: 'var(--accent)' }}>{text}</span>}
    </Group>
  )
}
