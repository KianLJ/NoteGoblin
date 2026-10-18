// The Workshop's guided "Make something" forms: D&D-worded answers (a
// rarity, "+1 to attack and damage", a checklist of benefits) turned into
// pack entries, and pack entries read back into those answers so a guided
// thing can be reopened. Anything an entry has that the guided form can't
// show (an effect built in the full editor) rides along untouched as
// `extras`. Pure — shared by the Workshop UI and its tests.

import type { DerivedCharacter } from './engine'
import type { AbilityId } from './schema'
import type { EntryKind } from './registry'
import { blankMonster, describeMonster, entryToMonster, monsterToEntry, type MonsterAnswers } from './guidedMonster'
import { entriesOf, slugify, uniqueId, withEntries, type PackDraft } from './workshop'

export type { MonsterAnswers } from './guidedMonster'

export type GuidedKind = 'magicItem' | 'weapon' | 'armor' | 'spell' | 'feat' | 'species' | 'monster'

/** The "What do you want to make?" cards, in order. */
export const GUIDED_KINDS: Array<{ kind: GuidedKind; entryKind: EntryKind; title: string; hint: string }> = [
  { kind: 'magicItem', entryKind: 'items', title: 'Magic item', hint: 'A ring, cloak, wand or other wondrous thing' },
  { kind: 'weapon', entryKind: 'items', title: 'Weapon', hint: 'A sword, bow or anything you attack with' },
  { kind: 'armor', entryKind: 'items', title: 'Armour or shield', hint: 'Something worn for protection' },
  { kind: 'spell', entryKind: 'spells', title: 'Spell', hint: 'A cantrip or levelled spell for your casters' },
  { kind: 'feat', entryKind: 'feats', title: 'Feat', hint: 'A special talent taken at a level-up or from a background' },
  { kind: 'species', entryKind: 'species', title: 'Species', hint: 'A playable people, with their size, speed and traits' },
  { kind: 'monster', entryKind: 'monsters', title: 'Monster', hint: 'A creature for the DM, with a full statblock' }
]

export const ABILITY_LABELS: Record<AbilityId, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }
const ABILITIES = Object.keys(ABILITY_LABELS) as AbilityId[]

export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact']
export const ITEM_TYPES = ['Wondrous Item', 'Ring', 'Wand', 'Staff', 'Rod', 'Potion', 'Scroll', 'Amulet', 'Cloak', 'Boots', 'Gloves', 'Belt', 'Helm']
export const DAMAGE_TYPES = ['Acid', 'Bludgeoning', 'Cold', 'Fire', 'Force', 'Lightning', 'Necrotic', 'Piercing', 'Poison', 'Psychic', 'Radiant', 'Slashing', 'Thunder']
export const CONDITIONS = ['blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'grappled', 'incapacitated', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious']
export const WEAPON_PROPERTIES = ['Ammunition', 'Finesse', 'Heavy', 'Light', 'Loading', 'Reach', 'Thrown', 'Two-Handed', 'Versatile']
/** The 2024 weapon mastery properties. */
export const WEAPON_MASTERIES = ['Cleave', 'Graze', 'Nick', 'Push', 'Sap', 'Slow', 'Topple', 'Vex']
export const SPELL_SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation']
export const CASTING_TIMES = ['1 action', '1 bonus action', '1 reaction', '1 minute', '10 minutes', '1 hour']
export const FEAT_CATEGORIES = ['Origin', 'General', 'Fighting Style', 'Epic Boon']
export const SIZES = ['Tiny', 'Small', 'Medium', 'Large']
export const SENSES = [
  { id: 'darkvision', label: 'Darkvision' },
  { id: 'blindsight', label: 'Blindsight' },
  { id: 'tremorsense', label: 'Tremorsense' },
  { id: 'truesight', label: 'Truesight' }
]
export const MOVE_MODES = [
  { id: 'fly', label: 'Flying' },
  { id: 'swim', label: 'Swimming' },
  { id: 'climb', label: 'Climbing' },
  { id: 'burrow', label: 'Burrowing' }
] as const

// ---------------------------------------------------------------------------
// Benefits — the checklist magic items, feats and species traits share

export type Benefit =
  | { type: 'ac'; amount: number }
  | { type: 'allSaves'; amount: number }
  | { type: 'abilityBonus'; ability: AbilityId; amount: number }
  | { type: 'abilitySet'; ability: AbilityId; score: number }
  | { type: 'walkSpeed'; amount: number }
  /** feet 0 = equal to walking speed. */
  | { type: 'moveSpeed'; mode: 'fly' | 'swim' | 'climb' | 'burrow'; feet: number }
  | { type: 'sense'; sense: string; feet: number }
  | { type: 'damage'; relation: 'resistance' | 'immunity'; damageTypes: string[] }
  | { type: 'conditionImmunity'; conditions: string[] }
  | { type: 'advantage'; target: string }
  | { type: 'skills'; skills: string[]; expertise: boolean }
  | { type: 'proficiency'; category: 'weapon' | 'armor' | 'tool' | 'language'; values: string[] }
  | { type: 'hp'; amount: number; perLevel: boolean }
  | { type: 'initiative'; amount: number }
  | { type: 'spellPower'; amount: number }
  | { type: 'spells'; spellIds: string[] }
  | { type: 'note'; text: string }

export type BenefitType = Benefit['type']

/** The checklist, in the order it's offered, with what each one adds when ticked. */
export const BENEFIT_CHOICES: Array<{ type: BenefitType; label: string; blank: Benefit }> = [
  { type: 'ac', label: 'Bonus to Armor Class', blank: { type: 'ac', amount: 1 } },
  { type: 'allSaves', label: 'Bonus to all saving throws', blank: { type: 'allSaves', amount: 1 } },
  { type: 'abilityBonus', label: 'Raise an ability score', blank: { type: 'abilityBonus', ability: 'str', amount: 2 } },
  { type: 'abilitySet', label: 'Set an ability score (like a Belt of Giant Strength)', blank: { type: 'abilitySet', ability: 'str', score: 19 } },
  { type: 'walkSpeed', label: 'Faster walking speed', blank: { type: 'walkSpeed', amount: 10 } },
  { type: 'moveSpeed', label: 'Fly, swim, climb or burrow', blank: { type: 'moveSpeed', mode: 'fly', feet: 0 } },
  { type: 'sense', label: 'Darkvision or another sense', blank: { type: 'sense', sense: 'darkvision', feet: 60 } },
  { type: 'damage', label: 'Resistance or immunity to damage', blank: { type: 'damage', relation: 'resistance', damageTypes: [] } },
  { type: 'conditionImmunity', label: 'Immunity to conditions', blank: { type: 'conditionImmunity', conditions: [] } },
  { type: 'advantage', label: 'Advantage on a roll', blank: { type: 'advantage', target: 'initiative' } },
  { type: 'skills', label: 'Skill proficiency or expertise', blank: { type: 'skills', skills: [], expertise: false } },
  { type: 'proficiency', label: 'Weapon, armour, tool or language proficiency', blank: { type: 'proficiency', category: 'language', values: [] } },
  { type: 'hp', label: 'Extra hit points', blank: { type: 'hp', amount: 1, perLevel: true } },
  { type: 'initiative', label: 'Bonus to initiative', blank: { type: 'initiative', amount: 2 } },
  { type: 'spellPower', label: 'Bonus to spell attacks and save DC', blank: { type: 'spellPower', amount: 1 } },
  { type: 'spells', label: 'Lets you cast spells', blank: { type: 'spells', spellIds: [] } },
  { type: 'note', label: 'Something else (described in words)', blank: { type: 'note', text: '' } }
]

type Eff = { when?: unknown; do: Record<string, unknown> }
const mod = (target: string, value: string | number, op = 'add', extra: Record<string, unknown> = {}): Eff => ({ do: { kind: 'modify', target, op, value: String(value), ...extra } })

/** A benefit's effects (nothing for one that isn't filled in yet). */
export function benefitEffects(b: Benefit): Eff[] {
  switch (b.type) {
    case 'ac':
      return [mod('ac', b.amount)]
    case 'allSaves':
      return ABILITIES.map((a) => mod(`save.${a}`, b.amount))
    case 'abilityBonus':
      return [mod(`ability.${b.ability}.score`, b.amount)]
    case 'abilitySet':
      return [mod(`ability.${b.ability}.score`, b.score, 'atLeast')]
    case 'walkSpeed':
      return [mod('speed.walk', b.amount)]
    case 'moveSpeed':
      return [mod(`speed.${b.mode}`, b.feet > 0 ? b.feet : '@speed.walk', 'set')]
    case 'sense':
      return b.feet > 0 ? [mod(`sense.${b.sense}`, b.feet, 'set')] : []
    case 'damage':
      return b.damageTypes.map((damageType) => ({ do: { kind: 'damageRelation', damageType, relation: b.relation } }))
    case 'conditionImmunity':
      return b.conditions.map((conditionId) => ({ do: { kind: 'conditionImmunity', conditionId } }))
    case 'advantage':
      return [{ do: { kind: 'rollMode', target: b.target, mode: 'advantage' } }]
    case 'skills':
      return b.skills.map((value) => ({ do: { kind: 'proficiency', category: 'skill', value, ...(b.expertise ? { level: 'expertise' } : {}) } }))
    case 'proficiency':
      return b.values.filter((v) => v.trim()).map((value) => ({ do: { kind: 'proficiency', category: b.category, value: value.trim() } }))
    case 'hp':
      return [mod('hp.max', b.perLevel ? (b.amount === 1 ? '@level' : `@level * ${b.amount}`) : b.amount)]
    case 'initiative':
      return [mod('initiative', b.amount)]
    case 'spellPower':
      return [mod('spell.attack', b.amount), mod('spell.dc', b.amount)]
    case 'spells':
      return b.spellIds.length ? [{ do: { kind: 'grantSpells', spellIds: b.spellIds, free: true, alwaysPrepared: true } }] : []
    case 'note':
      return b.text.trim() ? [{ do: { kind: 'note', text: b.text.trim() } }] : []
  }
}

export function benefitsToEffects(benefits: Benefit[]): Eff[] {
  return benefits.flatMap(benefitEffects)
}

const num = (v: unknown): number | null => (typeof v === 'string' && /^-?\d+$/.test(v.trim()) ? Number(v) : typeof v === 'number' ? v : null)

/**
 * Reads effects back into benefits. An effect the checklist can't show (a
 * condition on it, or a kind it doesn't offer) goes to `extras`, which the
 * guided form keeps as they are.
 */
export function effectsToBenefits(effects: unknown[]): { benefits: Benefit[]; extras: unknown[] } {
  const benefits: Benefit[] = []
  const extras: unknown[] = []
  const list = effects.filter((e): e is Eff => !!e && typeof e === 'object' && !!(e as Eff).do && typeof (e as Eff).do === 'object')
  extras.push(...effects.filter((e) => !list.includes(e as Eff)))
  const used = new Set<Eff>()
  const plain = list.filter((e) => e.when === undefined)
  extras.push(...list.filter((e) => e.when !== undefined))
  // Benefits come back in the order their first effect appears, so a round trip doesn't shuffle the checklist.
  const at = new Map<Benefit, number>()
  const place = (b: Benefit, e: Eff): void => {
    if (!at.has(b)) at.set(b, plain.indexOf(e))
  }

  // Grouped ones first: all six saves, spell attack + DC, and lists of damage types / conditions / skills / proficiencies.
  const saveMods = ABILITIES.map((a) => plain.find((e) => e.do.kind === 'modify' && e.do.target === `save.${a}` && e.do.op === 'add' && !used.has(e)))
  if (saveMods.every(Boolean) && new Set(saveMods.map((e) => e!.do.value)).size === 1 && num(saveMods[0]!.do.value) !== null) {
    saveMods.forEach((e) => used.add(e!))
    const b: Benefit = { type: 'allSaves', amount: num(saveMods[0]!.do.value)! }
    benefits.push(b)
    place(b, saveMods[0]!)
  }
  const spellAttack = plain.find((e) => e.do.kind === 'modify' && e.do.target === 'spell.attack' && e.do.op === 'add')
  const spellDc = plain.find((e) => e.do.kind === 'modify' && e.do.target === 'spell.dc' && e.do.op === 'add')
  if (spellAttack && spellDc && spellAttack.do.value === spellDc.do.value && num(spellAttack.do.value) !== null) {
    used.add(spellAttack).add(spellDc)
    const b: Benefit = { type: 'spellPower', amount: num(spellAttack.do.value)! }
    benefits.push(b)
    place(b, spellAttack)
  }

  for (const e of plain) {
    if (used.has(e)) continue
    const d = e.do
    const n = num(d.value)
    const take = (b: Benefit): void => {
      used.add(e)
      benefits.push(b)
      place(b, e)
    }
    if (d.kind === 'modify' && !d.appliesTo && !d.uncapped) {
      const target = String(d.target)
      const ability = /^ability\.(str|dex|con|int|wis|cha)\.score$/.exec(target)?.[1] as AbilityId | undefined
      if (target === 'ac' && d.op === 'add' && n !== null) take({ type: 'ac', amount: n })
      else if (ability && d.op === 'add' && n !== null) take({ type: 'abilityBonus', ability, amount: n })
      else if (ability && d.op === 'atLeast' && n !== null) take({ type: 'abilitySet', ability, score: n })
      else if (target === 'speed.walk' && d.op === 'add' && n !== null) take({ type: 'walkSpeed', amount: n })
      else if (/^speed\.(fly|swim|climb|burrow)$/.test(target) && d.op === 'set' && (n !== null || d.value === '@speed.walk'))
        take({ type: 'moveSpeed', mode: target.split('.')[1] as 'fly', feet: n ?? 0 })
      else if (target.startsWith('sense.') && d.op === 'set' && n !== null) take({ type: 'sense', sense: target.slice(6), feet: n })
      else if (target === 'hp.max' && d.op === 'add') {
        const per = /^@level(?:\s*\*\s*(\d+))?$/.exec(String(d.value).trim())
        if (per) take({ type: 'hp', amount: per[1] ? Number(per[1]) : 1, perLevel: true })
        else if (n !== null) take({ type: 'hp', amount: n, perLevel: false })
      } else if (target === 'initiative' && d.op === 'add' && n !== null) take({ type: 'initiative', amount: n })
    } else if (d.kind === 'damageRelation' && (d.relation === 'resistance' || d.relation === 'immunity')) {
      const same = benefits.find((b): b is Extract<Benefit, { type: 'damage' }> => b.type === 'damage' && b.relation === d.relation)
      used.add(e)
      if (same) same.damageTypes.push(String(d.damageType))
      else take({ type: 'damage', relation: d.relation, damageTypes: [String(d.damageType)] })
    } else if (d.kind === 'conditionImmunity') {
      const same = benefits.find((b): b is Extract<Benefit, { type: 'conditionImmunity' }> => b.type === 'conditionImmunity')
      used.add(e)
      if (same) same.conditions.push(String(d.conditionId))
      else take({ type: 'conditionImmunity', conditions: [String(d.conditionId)] })
    } else if (d.kind === 'rollMode' && d.mode === 'advantage' && !d.appliesTo) take({ type: 'advantage', target: String(d.target) })
    else if (d.kind === 'proficiency' && d.category === 'skill' && (d.level === undefined || d.level === 'expertise')) {
      const expertise = d.level === 'expertise'
      const same = benefits.find((b): b is Extract<Benefit, { type: 'skills' }> => b.type === 'skills' && b.expertise === expertise)
      used.add(e)
      if (same) same.skills.push(String(d.value))
      else take({ type: 'skills', skills: [String(d.value)], expertise })
    } else if (d.kind === 'proficiency' && ['weapon', 'armor', 'tool', 'language'].includes(String(d.category)) && d.level === undefined) {
      const category = d.category as 'weapon'
      const same = benefits.find((b): b is Extract<Benefit, { type: 'proficiency' }> => b.type === 'proficiency' && b.category === category)
      used.add(e)
      if (same) same.values.push(String(d.value))
      else take({ type: 'proficiency', category, values: [String(d.value)] })
    } else if (d.kind === 'grantSpells' && d.free === true && d.alwaysPrepared === true && !d.ability && Array.isArray(d.spellIds)) take({ type: 'spells', spellIds: d.spellIds.map(String) })
    else if (d.kind === 'note' && typeof d.text === 'string') take({ type: 'note', text: d.text })
  }
  extras.push(...plain.filter((e) => !used.has(e)))
  return { benefits: benefits.sort((a, b) => (at.get(a) ?? 0) - (at.get(b) ?? 0)), extras }
}

/** What a benefit does, in a short line ("+1 to Armor Class", "Resistance to fire and cold damage"). */
export function describeBenefit(b: Benefit, names: { skill?: (id: string) => string; spell?: (id: string) => string } = {}): string {
  const signed = (n: number): string => (n >= 0 ? `+${n}` : `${n}`)
  const and = (xs: string[]): string => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
  switch (b.type) {
    case 'ac':
      return `${signed(b.amount)} to Armor Class`
    case 'allSaves':
      return `${signed(b.amount)} to all saving throws`
    case 'abilityBonus':
      return `${signed(b.amount)} to ${ABILITY_LABELS[b.ability]} (up to 20)`
    case 'abilitySet':
      return `${ABILITY_LABELS[b.ability]} becomes ${b.score} (if it isn't already higher)`
    case 'walkSpeed':
      return `${signed(b.amount)} ft. walking speed`
    case 'moveSpeed': {
      const mode = MOVE_MODES.find((m) => m.id === b.mode)?.label ?? b.mode
      return `${mode} speed ${b.feet > 0 ? `of ${b.feet} ft.` : 'equal to walking speed'}`
    }
    case 'sense':
      return `${SENSES.find((s) => s.id === b.sense)?.label ?? b.sense} ${b.feet} ft.`
    case 'damage':
      return b.damageTypes.length ? `${b.relation === 'immunity' ? 'Immunity' : 'Resistance'} to ${and(b.damageTypes.map((t) => t.toLowerCase()))} damage` : ''
    case 'conditionImmunity':
      return b.conditions.length ? `Can't be ${and(b.conditions)}` : ''
    case 'advantage':
      return `Advantage on ${rollLabel(b.target, names.skill)}`
    case 'skills':
      return b.skills.length ? `${b.expertise ? 'Expertise' : 'Proficiency'} in ${and(b.skills.map((s) => names.skill?.(s) ?? s))}` : ''
    case 'proficiency': {
      const values = b.values.filter((v) => v.trim())
      if (!values.length) return ''
      return b.category === 'language' ? `Speaks ${and(values)}` : `Proficiency with ${and(values)}${b.category === 'armor' ? ' armour' : ''}`
    }
    case 'hp':
      return b.perLevel ? `+${b.amount} hit point${b.amount === 1 ? '' : 's'} per level` : `+${b.amount} hit points`
    case 'initiative':
      return `${signed(b.amount)} to initiative`
    case 'spellPower':
      return `${signed(b.amount)} to spell attack rolls and spell save DC`
    case 'spells':
      return b.spellIds.length ? `Can cast ${and(b.spellIds.map((s) => names.spell?.(s) ?? s))}` : ''
    case 'note':
      return b.text.trim()
  }
}

function rollLabel(target: string, skill?: (id: string) => string): string {
  if (target === 'attack') return 'attack rolls'
  if (target === 'initiative') return 'initiative'
  if (target === 'deathSave') return 'death saving throws'
  const [kind, id] = target.split(':')
  if (kind === 'check') return `${ABILITY_LABELS[id as AbilityId] ?? id} checks`
  if (kind === 'save') return `${ABILITY_LABELS[id as AbilityId] ?? id} saving throws`
  if (kind === 'skill') return `${skill?.(id) ?? id} checks`
  return target
}

// ---------------------------------------------------------------------------
// Answers per kind

interface Common {
  id: string
  name: string
  description: string
  /** Effects (and, for species, traits) the guided form can't show — kept as they are. */
  extras: unknown[]
}

export interface Charges {
  count: number
  recharge: 'dawn' | 'long' | 'short' | 'none'
  /** How many come back ("1d6 + 1"); blank = all of them. */
  regain: string
}

export interface MagicItemAnswers extends Common {
  kind: 'magicItem'
  itemType: string
  rarity: string
  attunement: boolean
  /** When the benefits apply: while worn/held (equipped), attuned, or just carried. */
  activeWhen: 'equipped' | 'attuned' | 'carried'
  benefits: Benefit[]
  charges: Charges | null
}

export interface WeaponAnswers extends Common {
  kind: 'weapon'
  rarity: string
  attunement: boolean
  martial: boolean
  ranged: boolean
  damage: string
  damageType: string
  versatileDamage: string
  properties: string[]
  /** Its mastery property (Sap, Topple…), '' for none. */
  mastery: string
  normalRange: number | null
  longRange: number | null
  /** +0 (plain) to +3. */
  magicBonus: number
  /** Extra damage on every hit ("1d6 fire"). */
  extraDamage: { dice: string; damageType: string } | null
  benefits: Benefit[]
  charges: Charges | null
  cost: string
  weight: number | null
}

export interface ArmorAnswers extends Common {
  kind: 'armor'
  rarity: string
  attunement: boolean
  armorType: 'light' | 'medium' | 'heavy' | 'shield'
  /** Base AC (light/medium/heavy) or the bonus a shield gives. */
  baseAc: number
  magicBonus: number
  strength: number | null
  stealthDisadvantage: boolean
  benefits: Benefit[]
  cost: string
  weight: number | null
}

export interface SpellAnswers extends Common {
  kind: 'spell'
  level: number
  school: string
  castingTime: string
  range: string
  verbal: boolean
  somatic: boolean
  material: string
  duration: string
  concentration: boolean
  ritual: boolean
  lists: string[]
  /** How it hits: a spell attack, a saving throw, or neither. */
  delivery: 'attack' | 'save' | 'none'
  attackRange: 'melee' | 'ranged'
  saveAbility: AbilityId
  /** Damage dice at its base level ("8d6"), blank for none. */
  damage: string
  damageType: string
  /** Extra dice per slot level above its own ("1d6"), blank for none; for cantrips, whether it grows at levels 5, 11 and 17. */
  upcastDice: string
  cantripScaling: boolean
  healing: string
  healingAddsModifier: boolean
  higherLevel: string
}

export interface FeatAnswers extends Common {
  kind: 'feat'
  category: string
  prerequisiteText: string
  minLevel: number | null
  repeatable: boolean
  /** "Increase one of these by N". */
  abilityIncrease: { abilities: AbilityId[]; amount: number } | null
  benefits: Benefit[]
}

export interface SpeciesTrait {
  id: string
  name: string
  description: string
  benefits: Benefit[]
  extras: unknown[]
}

export interface SpeciesAnswers extends Common {
  kind: 'species'
  size: string
  speed: number
  darkvision: number
  traits: SpeciesTrait[]
  /** Speeds besides walking that the full editor set on the species itself (kept as they are). */
  otherSpeeds: Record<string, string>
}

export type GuidedAnswers = MagicItemAnswers | WeaponAnswers | ArmorAnswers | SpellAnswers | FeatAnswers | SpeciesAnswers | MonsterAnswers

export function entryKindOf(kind: GuidedKind): EntryKind {
  return GUIDED_KINDS.find((k) => k.kind === kind)!.entryKind
}

/** Fresh answers for a new thing of this kind. */
export function blankAnswers(kind: GuidedKind, id: string): GuidedAnswers {
  const base = { id, name: '', description: '', extras: [] }
  switch (kind) {
    case 'magicItem':
      return { ...base, kind, itemType: 'Wondrous Item', rarity: 'Uncommon', attunement: false, activeWhen: 'equipped', benefits: [], charges: null }
    case 'weapon':
      return {
        ...base,
        kind,
        rarity: 'Uncommon',
        attunement: false,
        martial: true,
        ranged: false,
        damage: '1d8',
        damageType: 'Slashing',
        versatileDamage: '',
        properties: [],
        mastery: '',
        normalRange: null,
        longRange: null,
        magicBonus: 1,
        extraDamage: null,
        benefits: [],
        charges: null,
        cost: '',
        weight: null
      }
    case 'armor':
      return { ...base, kind, rarity: 'Uncommon', attunement: false, armorType: 'medium', baseAc: 14, magicBonus: 1, strength: null, stealthDisadvantage: false, benefits: [], cost: '', weight: null }
    case 'spell':
      return {
        ...base,
        kind,
        level: 1,
        school: 'Evocation',
        castingTime: '1 action',
        range: '60 feet',
        verbal: true,
        somatic: true,
        material: '',
        duration: 'Instantaneous',
        concentration: false,
        ritual: false,
        lists: [],
        delivery: 'save',
        attackRange: 'ranged',
        saveAbility: 'dex',
        damage: '',
        damageType: 'Fire',
        upcastDice: '',
        cantripScaling: true,
        healing: '',
        healingAddsModifier: true,
        higherLevel: ''
      }
    case 'feat':
      return { ...base, kind, category: 'General', prerequisiteText: '', minLevel: 4, repeatable: false, abilityIncrease: null, benefits: [] }
    case 'species':
      return { ...base, kind, size: 'Medium', speed: 30, darkvision: 0, traits: [], otherSpeeds: {} }
    case 'monster':
      return blankMonster(id)
  }
}

/** Which guided form an existing entry opens in (null: it's a kind the guided forms don't make). */
export function guidedKindFor(entryKind: EntryKind, entry: Record<string, unknown>): GuidedKind | null {
  if (entryKind === 'items') return entry.weapon ? 'weapon' : entry.armor ? 'armor' : 'magicItem'
  if (entryKind === 'spells') return 'spell'
  if (entryKind === 'feats') return 'feat'
  if (entryKind === 'species') return 'species'
  if (entryKind === 'monsters') return 'monster'
  return null
}

const BONUS_ATTACK = (id: string, target: 'attack.bonus' | 'attack.damage', n: number): Eff => mod(target, n, 'add', { appliesTo: { item: { itemIds: [id] } } })

function chargesDef(c: Charges): Record<string, unknown> {
  return { id: 'charges', name: 'Charges', max: String(c.count), recharge: c.recharge, ...(c.regain.trim() && c.recharge !== 'none' ? { regain: c.regain.trim() } : {}) }
}

function readCharges(v: unknown): Charges | null {
  if (!v || typeof v !== 'object') return null
  const c = v as Record<string, unknown>
  const count = num(c.max)
  const recharge = typeof c.recharge === 'string' && ['dawn', 'long', 'short', 'none'].includes(c.recharge) ? (c.recharge as Charges['recharge']) : 'dawn'
  return { count: count ?? 1, recharge, regain: typeof c.regain === 'string' ? c.regain : '' }
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const optNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const cleanDice = (s: string): string => s.replace(/\s+/g, '').replace(/\+/g, ' + ').replace(/(?<=\d)-/g, ' - ')

/** The caster's spellcasting modifier, as a formula reference. */
const SPELL_MOD = '@spell.mod'

/** The pack entry these answers stand for. */
export function answersToEntry(a: GuidedAnswers): Record<string, unknown> {
  const base = { id: a.id, name: a.name.trim() || 'Untitled', description: a.description }
  switch (a.kind) {
    case 'monster':
      return monsterToEntry(a)
    case 'magicItem': {
      return {
        ...base,
        category: a.itemType,
        rarity: a.rarity,
        requiresAttunement: a.attunement,
        effectsWhen: a.attunement && a.activeWhen === 'equipped' ? 'attuned' : a.activeWhen,
        ...(a.charges ? { charges: chargesDef(a.charges) } : {}),
        effects: [...benefitsToEffects(a.benefits), ...a.extras]
      }
    }
    case 'weapon': {
      const properties = a.properties.filter((p) => p !== 'Versatile' || a.versatileDamage.trim())
      const effects: Eff[] = []
      if (a.magicBonus) effects.push(BONUS_ATTACK(a.id, 'attack.bonus', a.magicBonus), BONUS_ATTACK(a.id, 'attack.damage', a.magicBonus))
      if (a.extraDamage && a.extraDamage.dice.trim()) effects.push({ do: { kind: 'extraDamage', damage: cleanDice(a.extraDamage.dice), damageType: a.extraDamage.damageType, appliesTo: { item: { itemIds: [a.id] } } } })
      const magic = a.magicBonus > 0 || effects.length > 0 || a.benefits.length > 0 || !!a.charges
      return {
        ...base,
        category: 'Weapon',
        ...(magic ? { rarity: a.rarity } : {}),
        ...(a.cost.trim() ? { cost: a.cost.trim() } : {}),
        ...(a.weight !== null ? { weight: a.weight } : {}),
        requiresAttunement: a.attunement,
        effectsWhen: a.attunement ? 'attuned' : 'equipped',
        weapon: {
          category: a.martial ? 'martial' : 'simple',
          range: a.ranged ? 'ranged' : 'melee',
          damage: cleanDice(a.damage) || '1',
          damageType: a.damageType,
          ...(a.versatileDamage.trim() && properties.includes('Versatile') ? { versatileDamage: cleanDice(a.versatileDamage) } : {}),
          properties,
          ...(a.mastery ? { mastery: a.mastery } : {}),
          ...(a.normalRange !== null && (a.ranged || properties.includes('Thrown')) ? { normalRange: a.normalRange } : {}),
          ...(a.longRange !== null && (a.ranged || properties.includes('Thrown')) ? { longRange: a.longRange } : {})
        },
        ...(a.charges ? { charges: chargesDef(a.charges) } : {}),
        effects: [...effects, ...benefitsToEffects(a.benefits), ...a.extras]
      }
    }
    case 'armor': {
      const effects: Eff[] = []
      if (a.armorType === 'shield') effects.push(mod('ac', a.baseAc + a.magicBonus))
      else {
        const dex = a.armorType === 'light' ? ' + @dex.mod' : a.armorType === 'medium' ? ' + min(@dex.mod, 2)' : ''
        effects.push({ do: { kind: 'acFormula', label: a.name.trim() || 'Armour', formula: `${a.baseAc}${dex}` } })
        if (a.magicBonus) effects.push(mod('ac', a.magicBonus))
      }
      if (a.strength) effects.push({ when: { kind: 'formula', formula: `@str.score < ${a.strength}` }, do: { kind: 'modify', target: 'speed.walk', op: 'add', value: '-10' } })
      if (a.stealthDisadvantage) effects.push({ do: { kind: 'rollMode', target: 'skill:stealth', mode: 'disadvantage' } })
      const magic = a.magicBonus > 0 || a.benefits.length > 0
      return {
        ...base,
        category: 'Armor',
        ...(magic ? { rarity: a.rarity } : {}),
        ...(a.cost.trim() ? { cost: a.cost.trim() } : {}),
        ...(a.weight !== null ? { weight: a.weight } : {}),
        requiresAttunement: a.attunement,
        effectsWhen: a.attunement ? 'attuned' : 'equipped',
        armor: { category: a.armorType, ...(a.strength ? { strengthRequirement: a.strength } : {}), stealthDisadvantage: a.stealthDisadvantage },
        effects: [...effects, ...benefitsToEffects(a.benefits), ...a.extras]
      }
    }
    case 'spell': {
      const components = [a.verbal && 'V', a.somatic && 'S', a.material.trim() && `M (${a.material.trim()})`].filter(Boolean).join(', ')
      return {
        ...base,
        level: a.level,
        school: a.school,
        castingTime: a.castingTime,
        range: a.range,
        components,
        duration: a.duration,
        concentration: a.concentration,
        ritual: a.ritual,
        lists: a.lists,
        ...(a.higherLevel.trim() ? { higherLevel: a.higherLevel.trim() } : {}),
        ...(a.delivery === 'attack' ? { attackType: a.attackRange } : {}),
        ...(a.delivery === 'save' ? { saveAbility: a.saveAbility } : {}),
        ...(a.damage.trim() ? { damage: spellDice(a.damage, a.level, a.upcastDice, a.cantripScaling), damageType: a.damageType } : {}),
        ...(a.healing.trim() ? { healing: `${spellDice(a.healing, a.level, a.upcastDice, false)}${a.healingAddsModifier ? ` + ${SPELL_MOD}` : ''}` } : {}),
        effects: a.extras
      }
    }
    case 'feat': {
      const effects: unknown[] = []
      if (a.abilityIncrease && a.abilityIncrease.abilities.length) {
        const { abilities, amount } = a.abilityIncrease
        effects.push({
          do: {
            kind: 'grantChoice',
            choice: {
              id: 'ability',
              label: 'Ability Score Increase',
              from: { kind: 'abilities', ...(abilities.length < ABILITIES.length ? { abilities } : {}) },
              onPick: [{ do: { kind: 'modify', target: 'ability.$pick.score', op: 'add', value: String(amount) } }]
            }
          }
        })
      }
      return {
        ...base,
        category: a.category,
        ...(a.minLevel ? { prerequisite: { kind: 'level', min: a.minLevel } } : {}),
        ...(a.prerequisiteText.trim() || a.minLevel ? { prerequisiteText: a.prerequisiteText.trim() || `Level ${a.minLevel}+` } : {}),
        repeatable: a.repeatable,
        effects: [...effects, ...benefitsToEffects(a.benefits), ...a.extras]
      }
    }
    case 'species': {
      const traits: unknown[] = []
      if (a.darkvision > 0) traits.push({ id: 'darkvision', name: 'Darkvision', description: `You can see in dim light within ${a.darkvision} feet of you as if it were bright light, and in darkness as if it were dim light.`, effects: [mod('sense.darkvision', a.darkvision, 'set')] })
      for (const t of a.traits) traits.push({ id: t.id, name: t.name.trim() || 'Trait', description: t.description, effects: [...benefitsToEffects(t.benefits), ...t.extras] })
      return { ...base, size: a.size, speed: { ...a.otherSpeeds, walk: String(a.speed) }, traits: [...traits, ...a.extras] }
    }
  }
}

/** "8d6" at level 3 with "1d6" per level above → "(8 + (@slotLevel - 3) * 1)d6"; cantrips grow at 5, 11 and 17. */
export function spellDice(dice: string, level: number, upcast: string, cantripScaling: boolean): string {
  const clean = cleanDice(dice)
  const m = /^(\d+)d(\d+)(.*)$/.exec(clean)
  if (!m) return clean
  const [, count, sides, rest] = m
  if (level === 0 && cantripScaling) return `(${count} * (1 + floor((@level + 1) / 6)))d${sides}${rest}`
  const up = /^(\d+)d(\d+)$/.exec(cleanDice(upcast))
  if (level > 0 && up && up[2] === sides) return `(${count} + (@slotLevel - ${level}) * ${up[1]})d${sides}${rest}`
  return clean
}

/** The reverse of spellDice: the base dice, the per-level dice, and whether a cantrip scales. */
export function readSpellDice(formula: string, level: number): { dice: string; upcast: string; cantripScaling: boolean } {
  const cantrip = /^\((\d+) \* \(1 \+ floor\(\(@level \+ 1\) \/ 6\)\)\)d(\d+)(.*)$/.exec(formula)
  if (cantrip) return { dice: `${cantrip[1]}d${cantrip[2]}${cantrip[3]}`, upcast: '', cantripScaling: true }
  const up = /^\((\d+) \+ \(@slotLevel - (\d+)\) \* (\d+)\)d(\d+)(.*)$/.exec(formula)
  if (up && Number(up[2]) === level) return { dice: `${up[1]}d${up[4]}${up[5]}`, upcast: `${up[3]}d${up[4]}`, cantripScaling: false }
  return { dice: formula, upcast: '', cantripScaling: false }
}

const isItemBonus = (e: Eff, id: string, target: string): boolean => {
  const ids = (e.do.appliesTo as { item?: { itemIds?: unknown[] } } | undefined)?.item?.itemIds
  return e.when === undefined && e.do.kind === 'modify' && e.do.target === target && e.do.op === 'add' && Array.isArray(ids) && ids.length === 1 && ids[0] === id && Object.keys(e.do.appliesTo as object).length === 1
}

/** Reads a pack entry back into the guided form's answers. */
export function entryToAnswers(kind: GuidedKind, entry: Record<string, unknown>): GuidedAnswers {
  const id = str(entry.id, 'untitled')
  const blank = blankAnswers(kind, id)
  const common = { id, name: str(entry.name), description: str(entry.description) }
  const effects = Array.isArray(entry.effects) ? (entry.effects as unknown[]) : []
  switch (kind) {
    case 'monster':
      return entryToMonster(entry)
    case 'magicItem': {
      const { benefits, extras } = effectsToBenefits(effects)
      const when = str(entry.effectsWhen, 'equipped')
      return {
        ...(blank as MagicItemAnswers),
        ...common,
        itemType: str(entry.category, 'Wondrous Item'),
        rarity: str(entry.rarity, 'Uncommon'),
        attunement: entry.requiresAttunement === true,
        activeWhen: when === 'attuned' && entry.requiresAttunement === true ? 'equipped' : (when as MagicItemAnswers['activeWhen']),
        charges: readCharges(entry.charges),
        benefits,
        extras
      }
    }
    case 'weapon': {
      const w = (entry.weapon ?? {}) as Record<string, unknown>
      let rest = effects as Eff[]
      const bonus = rest.find((e) => isItemBonus(e, id, 'attack.bonus'))
      const dmg = rest.find((e) => isItemBonus(e, id, 'attack.damage'))
      let magicBonus = 0
      if (bonus && dmg && bonus.do.value === dmg.do.value && num(bonus.do.value) !== null) {
        magicBonus = num(bonus.do.value)!
        rest = rest.filter((e) => e !== bonus && e !== dmg)
      }
      const extra = rest.find((e) => {
        const ids = (e.do?.appliesTo as { item?: { itemIds?: unknown[] } } | undefined)?.item?.itemIds
        return e.when === undefined && e.do?.kind === 'extraDamage' && Array.isArray(ids) && ids[0] === id && typeof e.do.damageType === 'string'
      })
      if (extra) rest = rest.filter((e) => e !== extra)
      const { benefits, extras } = effectsToBenefits(rest)
      return {
        ...(blank as WeaponAnswers),
        ...common,
        rarity: str(entry.rarity, 'Uncommon'),
        attunement: entry.requiresAttunement === true,
        martial: str(w.category, 'martial').toLowerCase() !== 'simple',
        ranged: w.range === 'ranged',
        damage: str(w.damage, '1d8'),
        damageType: str(w.damageType, 'Slashing'),
        versatileDamage: str(w.versatileDamage),
        properties: Array.isArray(w.properties) ? w.properties.map(String) : [],
        mastery: str(w.mastery),
        normalRange: optNum(w.normalRange),
        longRange: optNum(w.longRange),
        magicBonus,
        extraDamage: extra ? { dice: String(extra.do.damage), damageType: String(extra.do.damageType) } : null,
        charges: readCharges(entry.charges),
        cost: str(entry.cost),
        weight: optNum(entry.weight),
        benefits,
        extras
      }
    }
    case 'armor': {
      const ar = (entry.armor ?? {}) as Record<string, unknown>
      const armorType = (['light', 'medium', 'heavy', 'shield'].includes(str(ar.category).toLowerCase()) ? str(ar.category).toLowerCase() : 'medium') as ArmorAnswers['armorType']
      let rest = effects as Eff[]
      let baseAc = (blank as ArmorAnswers).baseAc
      let magicBonus = 0
      if (armorType === 'shield') {
        const ac = rest.find((e) => e.when === undefined && e.do?.kind === 'modify' && e.do.target === 'ac' && e.do.op === 'add' && num(e.do.value) !== null)
        if (ac) {
          const total = num(ac.do.value)!
          baseAc = Math.min(total, 2)
          magicBonus = total - baseAc
          rest = rest.filter((e) => e !== ac)
        }
      } else {
        const formula = rest.find((e) => e.when === undefined && e.do?.kind === 'acFormula' && /^\d+( \+ (@dex\.mod|min\(@dex\.mod, 2\)))?$/.test(String(e.do.formula)))
        if (formula) {
          baseAc = Number(/^\d+/.exec(String(formula.do.formula))![0])
          rest = rest.filter((e) => e !== formula)
          const plus = rest.find((e) => e.when === undefined && e.do?.kind === 'modify' && e.do.target === 'ac' && e.do.op === 'add' && num(e.do.value) !== null)
          if (plus) {
            magicBonus = num(plus.do.value)!
            rest = rest.filter((e) => e !== plus)
          }
        }
      }
      const strength = typeof ar.strengthRequirement === 'number' ? ar.strengthRequirement : null
      if (strength) rest = rest.filter((e) => !(e.when && JSON.stringify(e.when) === JSON.stringify({ kind: 'formula', formula: `@str.score < ${strength}` }) && e.do?.target === 'speed.walk'))
      if (ar.stealthDisadvantage === true) rest = rest.filter((e) => !(e.when === undefined && e.do?.kind === 'rollMode' && e.do.target === 'skill:stealth' && e.do.mode === 'disadvantage'))
      const { benefits, extras } = effectsToBenefits(rest)
      return {
        ...(blank as ArmorAnswers),
        ...common,
        rarity: str(entry.rarity, 'Uncommon'),
        attunement: entry.requiresAttunement === true,
        armorType,
        baseAc,
        magicBonus,
        strength,
        stealthDisadvantage: ar.stealthDisadvantage === true,
        cost: str(entry.cost),
        weight: optNum(entry.weight),
        benefits,
        extras
      }
    }
    case 'spell': {
      const level = typeof entry.level === 'number' ? entry.level : 1
      const comps = str(entry.components)
      const material = /M\s*\(([^)]*)\)/.exec(comps)?.[1] ?? (/\bM\b/.test(comps) ? 'a material component' : '')
      const dmg = typeof entry.damage === 'string' ? readSpellDice(entry.damage, level) : null
      const healRaw = typeof entry.healing === 'string' ? entry.healing : ''
      const healingAddsModifier = healRaw.endsWith(` + ${SPELL_MOD}`)
      const heal = healRaw ? readSpellDice(healingAddsModifier ? healRaw.slice(0, -(` + ${SPELL_MOD}`.length)) : healRaw, level) : null
      return {
        ...(blank as SpellAnswers),
        ...common,
        level,
        school: str(entry.school),
        castingTime: str(entry.castingTime, '1 action'),
        range: str(entry.range),
        verbal: /\bV\b/.test(comps),
        somatic: /\bS\b/.test(comps),
        material,
        duration: str(entry.duration, 'Instantaneous'),
        concentration: entry.concentration === true,
        ritual: entry.ritual === true,
        lists: Array.isArray(entry.lists) ? entry.lists.map(String) : [],
        delivery: entry.attackType ? 'attack' : entry.saveAbility ? 'save' : 'none',
        attackRange: entry.attackType === 'melee' ? 'melee' : 'ranged',
        saveAbility: (typeof entry.saveAbility === 'string' ? entry.saveAbility : 'dex') as AbilityId,
        damage: dmg?.dice ?? '',
        damageType: str(entry.damageType, 'Fire'),
        upcastDice: dmg?.upcast || heal?.upcast || '',
        cantripScaling: level === 0 ? (dmg ? dmg.cantripScaling : true) : false,
        healing: heal?.dice ?? '',
        healingAddsModifier: healRaw ? healingAddsModifier : true,
        higherLevel: str(entry.higherLevel),
        extras: effects
      }
    }
    case 'feat': {
      let rest = effects as Eff[]
      let abilityIncrease: FeatAnswers['abilityIncrease'] = null
      const asi = rest.find((e) => {
        const c = e.do?.choice as Record<string, unknown> | undefined
        const onPick = c?.onPick as Eff[] | undefined
        return (
          e.when === undefined &&
          e.do?.kind === 'grantChoice' &&
          c?.id === 'ability' &&
          (c.from as { kind?: string })?.kind === 'abilities' &&
          c.count === undefined &&
          onPick?.length === 1 &&
          onPick[0].do.target === 'ability.$pick.score' &&
          onPick[0].do.op === 'add' &&
          !onPick[0].do.uncapped &&
          num(onPick[0].do.value) !== null
        )
      })
      if (asi) {
        const c = asi.do.choice as { from: { abilities?: AbilityId[] }; onPick: Eff[] }
        abilityIncrease = { abilities: c.from.abilities ?? [...ABILITIES], amount: num(c.onPick[0].do.value)! }
        rest = rest.filter((e) => e !== asi)
      }
      const { benefits, extras } = effectsToBenefits(rest)
      const prereq = entry.prerequisite as { kind?: string; min?: number; max?: number } | undefined
      const simpleLevel = prereq?.kind === 'level' && typeof prereq.min === 'number' && prereq.max === undefined
      const prerequisiteText = str(entry.prerequisiteText)
      return {
        ...(blank as FeatAnswers),
        ...common,
        category: str(entry.category, 'General'),
        prerequisiteText: simpleLevel && prerequisiteText === `Level ${prereq!.min}+` ? '' : prerequisiteText,
        minLevel: simpleLevel ? prereq!.min! : null,
        repeatable: entry.repeatable === true,
        abilityIncrease,
        benefits,
        // A prerequisite the form can't show (an ability score, a class) stays on the entry — see mergeIntoEntry.
        extras
      }
    }
    case 'species': {
      const speed = (entry.speed ?? {}) as Record<string, unknown>
      const traitsIn = Array.isArray(entry.traits) ? (entry.traits as Array<Record<string, unknown>>) : []
      let darkvision = 0
      const traits: SpeciesTrait[] = []
      const extras: unknown[] = []
      for (const t of traitsIn) {
        const effs = Array.isArray(t.effects) ? (t.effects as Eff[]) : []
        if (t.id === 'darkvision' && effs.length === 1 && effs[0].do?.kind === 'modify' && effs[0].do.target === 'sense.darkvision' && num(effs[0].do.value) !== null && /^You can see in dim light within \d+ feet/.test(str(t.description))) {
          darkvision = num(effs[0].do.value)!
          continue
        }
        if (typeof t.id !== 'string') {
          extras.push(t)
          continue
        }
        const read = effectsToBenefits(effs)
        traits.push({ id: t.id, name: str(t.name), description: str(t.description), benefits: read.benefits, extras: read.extras })
      }
      const { walk, ...otherSpeeds } = speed
      return {
        ...(blank as SpeciesAnswers),
        ...common,
        size: str(entry.size, 'Medium'),
        speed: num(walk) ?? 30,
        darkvision,
        traits,
        otherSpeeds: Object.fromEntries(Object.entries(otherSpeeds).map(([k, v]) => [k, String(v)])),
        extras
      }
    }
  }
}

/**
 * The entry for these answers, keeping every field of `original` the guided
 * form doesn't manage (a source citation, an override, a feat's ability
 * prerequisite) — so reopening and saving never loses full-editor work.
 */
export function mergeIntoEntry(a: GuidedAnswers, original: Record<string, unknown> | undefined): Record<string, unknown> {
  const built = answersToEntry(a)
  if (!original) return built
  const managed = MANAGED_FIELDS[a.kind]
  const kept = Object.fromEntries(Object.entries(original).filter(([k]) => !managed.includes(k)))
  // A feat prerequisite the form can't show (not a plain level) stays.
  if (a.kind === 'feat' && a.minLevel === null && original.prerequisite) kept.prerequisite = original.prerequisite
  return { ...kept, ...built }
}

const ITEM_FIELDS = ['id', 'name', 'description', 'category', 'rarity', 'requiresAttunement', 'effectsWhen', 'charges', 'effects', 'cost', 'weight', 'weapon', 'armor']
const MANAGED_FIELDS: Record<GuidedKind, string[]> = {
  magicItem: ITEM_FIELDS,
  weapon: ITEM_FIELDS,
  armor: ITEM_FIELDS,
  spell: ['id', 'name', 'description', 'level', 'school', 'castingTime', 'range', 'components', 'duration', 'concentration', 'ritual', 'lists', 'higherLevel', 'attackType', 'saveAbility', 'damage', 'damageType', 'healing', 'effects'],
  feat: ['id', 'name', 'description', 'category', 'prerequisite', 'prerequisiteText', 'repeatable', 'effects'],
  species: ['id', 'name', 'description', 'size', 'speed', 'traits'],
  // A statblock's every field: a line cleared in the form must go, not linger from the original.
  monster: [
    'id',
    'name',
    'description',
    'size',
    'type',
    'alignment',
    'ac',
    'initiative',
    'hp',
    'speed',
    'str',
    'dex',
    'con',
    'int',
    'wis',
    'cha',
    'saves',
    'skills',
    'damage_vulnerabilities',
    'damage_resistances',
    'damage_immunities',
    'condition_immunities',
    'senses',
    'languages',
    'cr',
    'traits',
    'actions',
    'bonus_actions',
    'reactions',
    'legendary_actions',
    'lair_actions'
  ]
}

/** Plain-English lines for what these answers do on a character sheet — the preview card's "What it does". */
export function describeAnswers(a: GuidedAnswers, names: { skill?: (id: string) => string; spell?: (id: string) => string } = {}): string[] {
  const lines: string[] = []
  const benefitLines = (bs: Benefit[]): string[] => bs.map((b) => describeBenefit(b, names)).filter(Boolean)
  switch (a.kind) {
    case 'magicItem':
      lines.push(...benefitLines(a.benefits))
      if (a.charges) lines.push(chargesLine(a.charges))
      break
    case 'weapon':
      if (a.magicBonus) lines.push(`+${a.magicBonus} to attack and damage rolls`)
      if (a.extraDamage?.dice.trim()) lines.push(`+${cleanDice(a.extraDamage.dice)} ${a.extraDamage.damageType.toLowerCase()} damage on a hit`)
      lines.push(...benefitLines(a.benefits))
      if (a.charges) lines.push(chargesLine(a.charges))
      break
    case 'armor':
      if (a.magicBonus) lines.push(`+${a.magicBonus} to Armor Class on top of the ${a.armorType === 'shield' ? 'shield' : 'armour'}'s own`)
      lines.push(...benefitLines(a.benefits))
      break
    case 'feat':
      if (a.abilityIncrease?.abilities.length) {
        const n = a.abilityIncrease.abilities
        lines.push(`+${a.abilityIncrease.amount} to ${n.length === ABILITIES.length ? 'one ability score of your choice' : n.length === 1 ? ABILITY_LABELS[n[0]] : `your choice of ${n.map((x) => ABILITY_LABELS[x]).join(' or ')}`} (up to 20)`)
      }
      lines.push(...benefitLines(a.benefits))
      break
    case 'monster':
      lines.push(...describeMonster(a))
      break
    case 'species':
      if (a.darkvision) lines.push(`Darkvision ${a.darkvision} ft.`)
      for (const t of a.traits) lines.push(...benefitLines(t.benefits))
      break
    case 'spell': {
      const dice = a.damage.trim() ? `${cleanDice(a.damage)} ${a.damageType.toLowerCase()} damage` : ''
      if (a.delivery === 'attack' && dice) lines.push(`${a.attackRange === 'melee' ? 'Melee' : 'Ranged'} spell attack: ${dice}`)
      else if (a.delivery === 'save' && dice) lines.push(`${ABILITY_LABELS[a.saveAbility]} saving throw: ${dice}`)
      else if (dice) lines.push(dice.charAt(0).toUpperCase() + dice.slice(1))
      if (a.healing.trim()) lines.push(`Heals ${cleanDice(a.healing)}${a.healingAddsModifier ? ' + your spellcasting modifier' : ''}`)
      if (a.level === 0 && a.cantripScaling && a.damage.trim()) lines.push('Damage grows at levels 5, 11 and 17')
      if (a.level > 0 && a.upcastDice.trim()) lines.push(`+${cleanDice(a.upcastDice)} for each slot level above ${a.level}`)
      break
    }
  }
  return lines
}

function chargesLine(c: Charges): string {
  const when = c.recharge === 'dawn' ? 'at dawn' : c.recharge === 'long' ? 'on a long rest' : c.recharge === 'short' ? 'on a short or long rest' : ''
  return `${c.count} charge${c.count === 1 ? '' : 's'}${when ? `, ${c.regain.trim() ? `regains ${c.regain.trim()}` : 'all come back'} ${when}` : ''}`
}

// ---------------------------------------------------------------------------
// The implicit "My Homebrew" pack guided things are saved into

export const MY_HOMEBREW_ID = 'my-homebrew'
export const MY_HOMEBREW_NAME = 'My Homebrew'

/** The id these answers save under: the one they have, or (for something new) one made from its name that the pack doesn't use yet. */
export function finalId(a: GuidedAnswers, draft: PackDraft, originalId: string | null): string {
  if (originalId) return originalId
  const taken = entriesOf(draft, entryKindOf(a.kind)).map((e) => String(e.id ?? ''))
  return uniqueId(slugify(a.name.trim() || 'untitled'), taken)
}

/**
 * The draft with these answers saved into it — replacing the entry they
 * were opened from (`originalId`), or added as a new one — and the answers
 * as saved (with their final id).
 */
export function placeAnswers(draft: PackDraft, answers: GuidedAnswers, originalId: string | null): { draft: PackDraft; answers: GuidedAnswers } {
  const kind = entryKindOf(answers.kind)
  const id = finalId(answers, draft, originalId)
  const withId = { ...answers, id } as GuidedAnswers
  const list = entriesOf(draft, kind)
  const index = originalId ? list.findIndex((e) => e.id === originalId) : -1
  const entry = mergeIntoEntry(withId, index >= 0 ? list[index] : undefined)
  const next = index >= 0 ? list.map((e, i) => (i === index ? entry : e)) : [...list, entry]
  return { draft: withEntries(draft, kind, next), answers: withId }
}

/** The draft without the entry of this kind with this id. */
export function removeGuidedEntry(draft: PackDraft, kind: GuidedKind, id: string): PackDraft {
  const entryKind = entryKindOf(kind)
  return withEntries(
    draft,
    entryKind,
    entriesOf(draft, entryKind).filter((e) => e.id !== id)
  )
}

/** Every entry in a pack the guided forms can open, newest last. */
export function guidedEntries(draft: PackDraft): Array<{ kind: GuidedKind; entryKind: EntryKind; entry: Record<string, unknown> }> {
  const out: Array<{ kind: GuidedKind; entryKind: EntryKind; entry: Record<string, unknown> }> = []
  for (const entryKind of ['items', 'spells', 'feats', 'species', 'monsters'] as EntryKind[]) {
    for (const entry of entriesOf(draft, entryKind)) {
      const kind = guidedKindFor(entryKind, entry)
      if (kind) out.push({ kind, entryKind, entry })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// "Try it on a character" — what changed on the sheet, in words

const signedNum = (n: number): string => (n >= 0 ? `+${n}` : `${n}`)

/** The differences between a character without and with the new thing, as short lines ("Armor Class 12 → 13"). */
export function describeChanges(before: DerivedCharacter, after: DerivedCharacter): string[] {
  const out: string[] = []
  const change = (label: string, a: number | string, b: number | string): void => {
    if (a !== b) out.push(`${label}: ${a} → ${b}`)
  }
  change('Armor Class', before.armorClass, after.armorClass)
  change('Max hit points', before.maxHp, after.maxHp)
  change('Initiative', signedNum(before.initiative), signedNum(after.initiative))
  if (after.initiativeMode && after.initiativeMode !== before.initiativeMode) out.push(`${cap1(after.initiativeMode)} on initiative`)
  for (const a of ABILITIES) change(ABILITY_LABELS[a], before.abilities[a].score, after.abilities[a].score)
  for (const a of ABILITIES) {
    change(`${ABILITY_LABELS[a]} saving throw`, signedNum(before.saves[a].bonus), signedNum(after.saves[a].bonus))
    if (after.saves[a].mode && after.saves[a].mode !== before.saves[a].mode) out.push(`${cap1(after.saves[a].mode!)} on ${ABILITY_LABELS[a]} saving throws`)
  }
  for (const [id, s] of Object.entries(after.skills)) {
    const was = before.skills[id]
    if (!was) continue
    if (s.bonus !== was.bonus) out.push(`${s.name}: ${signedNum(was.bonus)} → ${signedNum(s.bonus)}`)
    if (s.mode && s.mode !== was.mode) out.push(`${cap1(s.mode)} on ${s.name} checks`)
  }
  const speedName: Record<string, string> = { walk: 'Walking', fly: 'Flying', swim: 'Swimming', climb: 'Climbing', burrow: 'Burrowing' }
  for (const [mode, feet] of Object.entries(after.speeds)) change(`${speedName[mode] ?? cap1(mode)} speed`, `${before.speeds[mode] ?? 0} ft.`, `${feet} ft.`)
  for (const [id, s] of Object.entries(after.senses)) change(s.name, before.senses[id] ? `${before.senses[id].range} ft.` : 'none', `${s.range} ft.`)
  const added = (a: string[], b: string[]): string[] => b.filter((x) => !a.includes(x))
  const r = added(before.damageRelations.resistances, after.damageRelations.resistances)
  if (r.length) out.push(`Resistant to ${r.join(', ')} damage`)
  const im = added(before.damageRelations.immunities, after.damageRelations.immunities)
  if (im.length) out.push(`Immune to ${im.join(', ')} damage`)
  const ci = added(before.conditionImmunities, after.conditionImmunities)
  if (ci.length) out.push(`Can't be ${ci.join(', ')}`)
  for (const k of ['weapon', 'armor', 'tool', 'language'] as const) {
    const p = added(before.proficiencies[k], after.proficiencies[k])
    if (p.length) out.push(`${k === 'language' ? 'Speaks' : `${cap1(k === 'armor' ? 'armour' : k)} proficiency:`} ${p.join(', ')}`)
  }
  change('Spell save DC', before.spellcasting.dc ?? '—', after.spellcasting.dc ?? '—')
  change('Spell attack', before.spellcasting.attackBonus === null ? '—' : signedNum(before.spellcasting.attackBonus), after.spellcasting.attackBonus === null ? '—' : signedNum(after.spellcasting.attackBonus))
  const spells = after.spellcasting.granted.filter((g) => !before.spellcasting.granted.some((x) => x.spellId === g.spellId))
  if (spells.length) out.push(`Can cast ${spells.map((s) => s.name).join(', ')}`)
  for (const atk of after.attacks) {
    const was = before.attacks.find((x) => x.id === atk.id)
    const text = `${signedNum(atk.attackBonus)} to hit, ${atk.damage} ${atk.damageType.toLowerCase()}${atk.extraDamage.map((x) => ` + ${x.damage} ${(x.damageType ?? '').toLowerCase()}`).join('')}`
    if (!was) out.push(`New attack — ${atk.name}: ${text}`)
    else if (was.attackBonus !== atk.attackBonus || was.damage !== atk.damage || was.extraDamage.length !== atk.extraDamage.length) out.push(`${atk.name}: ${text}`)
  }
  for (const res of after.resources) if (!before.resources.some((x) => x.id === res.id)) out.push(`${res.name}: ${res.max}`)
  for (const c of after.choices) if (!before.choices.some((x) => x.key === c.key)) out.push(`Asks the player to choose: ${c.label}`)
  for (const n of after.notes) if (!before.notes.some((x) => x.text === n.text)) out.push(n.text)
  return out
}

const cap1 = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** A spell's roll at each slot level it can be cast with (cantrips: at character levels 1, 5, 11, 17), worked out for a caster. */
export function spellRolls(evaluate: (probe: { formula: string; spellLevel?: number }) => { ok: true; value: number; dice?: string } | { ok: false; error: string }, formula: string, level: number): Array<{ label: string; value: string }> {
  const show = (r: ReturnType<typeof evaluate>): string => (r.ok ? (r.dice ?? String(r.value)) : r.error)
  if (level === 0) return [{ label: 'This character', value: show(evaluate({ formula, spellLevel: 0 })) }]
  return Array.from({ length: 10 - level }, (_, i) => ({ label: `Level ${level + i} slot`, value: show(evaluate({ formula, spellLevel: level + i })) }))
}
