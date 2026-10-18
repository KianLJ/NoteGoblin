// The guided monster form (see guided.ts): a creature described with
// numbers and choices — hit dice, a Dexterity score, "a melee attack with
// a 1d8 slashing weapon" — written out as the statblock text the Codex,
// the encounter builder and the initiative tracker use, in the same wording
// as the SRD bestiary. Text the form can't rebuild exactly (an unusual
// speed line, "piercing from nonmagical attacks") is kept as written.

import type { AbilityId } from './schema'
import { parseDiceCodeSpan } from '../dice'

type Ability = AbilityId
const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']
const SHORT: Record<Ability, string> = { str: 'Str', dex: 'Dex', con: 'Con', int: 'Int', wis: 'Wis', cha: 'Cha' }

export const MONSTER_SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan']
export const HIT_DIE: Record<string, number> = { Tiny: 4, Small: 6, Medium: 8, Large: 10, Huge: 12, Gargantuan: 20 }
export const MONSTER_TYPES = ['aberration', 'beast', 'celestial', 'construct', 'dragon', 'elemental', 'fey', 'fiend', 'giant', 'humanoid', 'monstrosity', 'ooze', 'plant', 'undead']
export const CHALLENGE_RATINGS = ['0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, i) => String(i + 1))]
export const MONSTER_SKILLS: Array<{ id: string; name: string; ability: Ability }> = [
  { id: 'acrobatics', name: 'Acrobatics', ability: 'dex' },
  { id: 'animal-handling', name: 'Animal Handling', ability: 'wis' },
  { id: 'arcana', name: 'Arcana', ability: 'int' },
  { id: 'athletics', name: 'Athletics', ability: 'str' },
  { id: 'deception', name: 'Deception', ability: 'cha' },
  { id: 'history', name: 'History', ability: 'int' },
  { id: 'insight', name: 'Insight', ability: 'wis' },
  { id: 'intimidation', name: 'Intimidation', ability: 'cha' },
  { id: 'investigation', name: 'Investigation', ability: 'int' },
  { id: 'medicine', name: 'Medicine', ability: 'wis' },
  { id: 'nature', name: 'Nature', ability: 'int' },
  { id: 'perception', name: 'Perception', ability: 'wis' },
  { id: 'performance', name: 'Performance', ability: 'cha' },
  { id: 'persuasion', name: 'Persuasion', ability: 'cha' },
  { id: 'religion', name: 'Religion', ability: 'int' },
  { id: 'sleight-of-hand', name: 'Sleight of Hand', ability: 'dex' },
  { id: 'stealth', name: 'Stealth', ability: 'dex' },
  { id: 'survival', name: 'Survival', ability: 'wis' }
]
export const MONSTER_SENSES = ['blindsight', 'darkvision', 'tremorsense', 'truesight'] as const
export const MONSTER_SPEEDS = ['fly', 'swim', 'climb', 'burrow'] as const
export const MONSTER_BLOCKS = [
  { key: 'traits', label: 'Traits', singular: 'trait', hint: 'Always-on abilities, like Keen Smell or Pack Tactics.' },
  { key: 'actions', label: 'Actions', singular: 'action', hint: 'What it does on its turn: attacks, breath weapons, spells.' },
  { key: 'bonus_actions', label: 'Bonus actions', singular: 'bonus action', hint: 'Quick extras it can do on its turn.' },
  { key: 'reactions', label: 'Reactions', singular: 'reaction', hint: 'Things it does in response, like Parry.' },
  { key: 'legendary_actions', label: 'Legendary actions', singular: 'legendary action', hint: 'For boss monsters: actions it takes at the end of other creatures’ turns.' },
  { key: 'lair_actions', label: 'Lair actions', singular: 'lair action', hint: 'Things its lair does on initiative count 20.' }
] as const
export type MonsterBlockKey = (typeof MONSTER_BLOCKS)[number]['key']

const mod = (score: number): number => Math.floor((score - 10) / 2)
const signed = (n: number): string => (n >= 0 ? `+${n}` : `${n}`)
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** The proficiency bonus for a challenge rating (the DMG's table). */
export function proficiencyForCr(cr: string): number {
  const n = cr.includes('/') ? 0 : Number(cr) || 0
  return n < 5 ? 2 : Math.min(9, 3 + Math.floor((n - 5) / 4))
}

export interface MonsterAttack {
  kind: 'attack'
  range: 'melee' | 'ranged'
  ability: Ability
  /** Melee reach, or ranged normal / long range, in feet. */
  reach: number
  normal: number
  long: number
  dice: string
  damageType: string
  extraDice: string
  extraType: string
  /** Anything after the damage ("and the target is grappled (escape DC 13)."). */
  rider: string
}

export interface MonsterSave {
  kind: 'save'
  ability: Ability
  /** The ability its DC is worked out from. */
  dcAbility: Ability
  /** "each creature in a 15-foot cone". */
  targets: string
  dice: string
  damageType: string
  /** Half damage on a success (else none). */
  half: boolean
  rider: string
}

export interface MonsterBlock {
  name: string
  /** "Recharge 5–6", "1/Day", "Costs 2 Actions" — shown after the name. */
  usage: string
  /** Plain text when `roll` is null (or anything to say after it). */
  desc: string
  roll: MonsterAttack | MonsterSave | null
}

export interface MonsterAnswers {
  kind: 'monster'
  id: string
  name: string
  description: string
  extras: unknown[]
  size: string
  type: string
  alignment: string
  cr: string
  ac: number
  acNote: string
  hitDice: number
  walk: number
  speeds: Record<(typeof MONSTER_SPEEDS)[number], number>
  hover: boolean
  scores: Record<Ability, number>
  saves: Ability[]
  skills: Array<{ id: string; expertise: boolean }>
  initiativeProficient: boolean
  resistances: string[]
  immunities: string[]
  vulnerabilities: string[]
  conditionImmunities: string[]
  senses: Record<(typeof MONSTER_SENSES)[number], number>
  languages: string
  blocks: Record<MonsterBlockKey, MonsterBlock[]>
  /** Statblock lines kept as written because the form can't rebuild them exactly, by field. */
  custom: Partial<Record<CustomField, string>>
}

export type CustomField = 'ac' | 'hp' | 'speed' | 'saves' | 'skills' | 'senses' | 'initiative' | 'damage_resistances' | 'damage_immunities' | 'damage_vulnerabilities' | 'condition_immunities'

const emptyBlocks = (): Record<MonsterBlockKey, MonsterBlock[]> => ({ traits: [], actions: [], bonus_actions: [], reactions: [], legendary_actions: [], lair_actions: [] })

export function blankMonster(id: string): MonsterAnswers {
  return {
    kind: 'monster',
    id,
    name: '',
    description: '',
    extras: [],
    size: 'Medium',
    type: 'monstrosity',
    alignment: 'unaligned',
    cr: '1',
    ac: 13,
    acNote: 'natural armor',
    hitDice: 4,
    walk: 30,
    speeds: { fly: 0, swim: 0, climb: 0, burrow: 0 },
    hover: false,
    scores: { str: 14, dex: 12, con: 13, int: 6, wis: 10, cha: 8 },
    saves: [],
    skills: [],
    initiativeProficient: false,
    resistances: [],
    immunities: [],
    vulnerabilities: [],
    conditionImmunities: [],
    senses: { blindsight: 0, darkvision: 60, tremorsense: 0, truesight: 0 },
    languages: '',
    blocks: { ...emptyBlocks(), actions: [{ name: 'Bite', usage: '', desc: '', roll: blankAttack() }] },
    custom: {}
  }
}

export function blankAttack(): MonsterAttack {
  return { kind: 'attack', range: 'melee', ability: 'str', reach: 5, normal: 80, long: 320, dice: '1d8', damageType: 'piercing', extraDice: '', extraType: 'fire', rider: '' }
}

export function blankSave(): MonsterSave {
  return { kind: 'save', ability: 'dex', dcAbility: 'con', targets: 'each creature in a 15-foot cone', dice: '4d6', damageType: 'fire', half: true, rider: '' }
}

// --- Numbers ---------------------------------------------------------------

/**
 * A dice expression as an inline roll — `` `dice: 1d8 + 3` ``, which a
 * statblock shows as a button that rolls it (see renderer statblock.ts) —
 * when it's one the roller understands (one kind of standard die, plus a
 * flat bonus); anything else stays plain text.
 */
export function diceSpan(dice: string): string {
  return parseDiceCodeSpan(`dice: ${dice}`) ? `\`dice: ${dice}\`` : dice
}

/** The text with its inline rolls back to plain dice: "7 (`dice: 1d8 + 3`)" → "7 (1d8 + 3)". */
export function plainDice(text: string): string {
  return text.replace(/`dice:\s*([^`]+)`/g, '$1')
}

/** "22 (`dice: 4d8 + 4`)" — the dice roll when clicked in the statblock; plainDice() for showing it as text. */
export function hpText(a: Pick<MonsterAnswers, 'hitDice' | 'size' | 'scores'>): string {
  const die = HIT_DIE[a.size] ?? 8
  const n = Math.max(1, a.hitDice)
  const bonus = n * mod(a.scores.con)
  const avg = Math.max(1, Math.floor((n * (die + 1)) / 2) + bonus)
  return `${avg} (${diceSpan(`${n}d${die}${bonus ? ` ${bonus > 0 ? '+' : '-'} ${Math.abs(bonus)}` : ''}`)})`
}

/** Average of a dice expression plus a flat bonus, as the statblock shows it: "7 (`dice: 1d8 + 3`)", the dice an inline roll. */
export function averageText(dice: string, bonus: number): string {
  const m = /^\s*(\d+)d(\d+)\s*$/.exec(dice)
  if (!m) return bonus ? `${dice} ${bonus > 0 ? '+' : '-'} ${Math.abs(bonus)}` : dice
  const [count, sides] = [Number(m[1]), Number(m[2])]
  const avg = Math.max(1, Math.floor((count * (sides + 1)) / 2) + bonus)
  return `${avg} (${diceSpan(`${count}d${sides}${bonus ? ` ${bonus > 0 ? '+' : '-'} ${Math.abs(bonus)}` : ''}`)})`
}

export function attackBonus(a: MonsterAnswers, atk: MonsterAttack): number {
  return proficiencyForCr(a.cr) + mod(a.scores[atk.ability])
}

export function saveDc(a: MonsterAnswers, s: MonsterSave): number {
  return 8 + proficiencyForCr(a.cr) + mod(a.scores[s.dcAbility])
}

/** An action's text: "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 7 (1d8 + 3) slashing damage." */
export function blockText(a: MonsterAnswers, b: MonsterBlock): string {
  const r = b.roll
  const after = b.desc.trim() ? ` ${b.desc.trim()}` : ''
  if (!r) return b.desc
  if (r.kind === 'attack') {
    const where = r.range === 'melee' ? `reach ${r.reach} ft.` : `range ${r.normal}/${r.long} ft.`
    const extra = r.extraDice.trim() ? ` plus ${averageText(r.extraDice.trim(), 0)} ${r.extraType} damage` : ''
    const rider = r.rider.trim() ? (/^[.,]/.test(r.rider.trim()) ? r.rider.trim() : ` ${r.rider.trim()}`) : '.'
    return `${r.range === 'melee' ? 'Melee' : 'Ranged'} Weapon Attack: ${signed(attackBonus(a, r))} to hit, ${where}, one target. Hit: ${averageText(r.dice.trim(), mod(a.scores[r.ability]))} ${r.damageType} damage${extra}${rider === '.' ? '.' : rider}${after}`
  }
  const rider = r.rider.trim() ? ` ${r.rider.trim()}` : ''
  return `${cap(r.targets.trim() || 'each creature in the area')} must make a DC ${saveDc(a, r)} ${SAVE_NAME[r.ability]} saving throw, taking ${averageText(r.dice.trim(), 0)} ${r.damageType} damage on a failed save, or ${r.half ? 'half as much damage on a successful one' : 'no damage on a successful one'}.${rider}${after}`
}

const SAVE_NAME: Record<Ability, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }

const list = (xs: string[]): string => xs.map((x) => x.toLowerCase()).join(', ')

/** The statblock text fields these answers stand for. */
function textFields(a: MonsterAnswers): Record<CustomField, string> {
  const prof = proficiencyForCr(a.cr)
  const speedParts = [`${a.walk} ft.`, ...MONSTER_SPEEDS.filter((s) => a.speeds[s] > 0).map((s) => `${s} ${a.speeds[s]} ft.${s === 'fly' && a.hover ? ' (hover)' : ''}`)]
  const perception = a.skills.find((s) => s.id === 'perception')
  const passive = 10 + mod(a.scores.wis) + (perception ? prof * (perception.expertise ? 2 : 1) : 0)
  const init = mod(a.scores.dex) + (a.initiativeProficient ? prof : 0)
  return {
    ac: `${a.ac}${a.acNote.trim() ? ` (${a.acNote.trim()})` : ''}`,
    hp: hpText(a),
    speed: speedParts.join(', '),
    saves: a.saves.map((s) => `${SHORT[s]} ${signed(mod(a.scores[s]) + prof)}`).join(', '),
    skills: a.skills
      .map((s) => {
        const skill = MONSTER_SKILLS.find((x) => x.id === s.id)
        return skill ? `${skill.name} ${signed(mod(a.scores[skill.ability]) + prof * (s.expertise ? 2 : 1))}` : ''
      })
      .filter(Boolean)
      .join(', '),
    senses: [...MONSTER_SENSES.filter((s) => a.senses[s] > 0).map((s) => `${s} ${a.senses[s]} ft.`), `passive Perception ${passive}`].join(', '),
    initiative: `${signed(init)} (${10 + init})`,
    damage_resistances: list(a.resistances),
    damage_immunities: list(a.immunities),
    damage_vulnerabilities: list(a.vulnerabilities),
    condition_immunities: list(a.conditionImmunities)
  }
}

/** The pack monster entry (a statblock) for these answers. */
export function monsterToEntry(a: MonsterAnswers): Record<string, unknown> {
  const text = { ...textFields(a), ...a.custom }
  const out: Record<string, unknown> = {
    id: a.id,
    name: a.name.trim() || 'Untitled',
    description: a.description,
    size: a.size,
    type: a.type,
    alignment: a.alignment,
    ac: text.ac,
    initiative: text.initiative,
    hp: text.hp,
    speed: text.speed,
    ...Object.fromEntries(ABILITIES.map((s) => [s, String(a.scores[s])])),
    cr: a.cr
  }
  for (const k of ['saves', 'skills', 'damage_vulnerabilities', 'damage_resistances', 'damage_immunities', 'condition_immunities', 'senses'] as const) if (text[k]) out[k] = text[k]
  if (a.languages.trim()) out.languages = a.languages.trim()
  for (const b of MONSTER_BLOCKS) out[b.key] = a.blocks[b.key].map((x) => ({ name: `${x.name.trim() || cap(b.singular)}${x.usage.trim() ? ` (${x.usage.trim()})` : ''}`, desc: blockText(a, x) }))
  return out
}

// --- Reading a statblock back ---------------------------------------------

const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
const int = (v: unknown, fallback: number): number => {
  const n = Number.parseInt(str(v), 10)
  return Number.isFinite(n) ? n : fallback
}

const ATTACK_RE = /^(Melee|Ranged) Weapon Attack: [+-]\d+ to hit, (?:reach (\d+) ft\.|range (\d+)\/(\d+) ft\.), one target\. Hit: \d+ \((\d+d\d+)(?: [+-] \d+)?\) (\w+) damage(?: plus \d+ \((\d+d\d+)\) (\w+) damage)?(.*)$/s
const SAVE_RE = /^(.+?) must make a DC \d+ (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw, taking \d+ \((\d+d\d+)\) (\w+) damage on a failed save, or (half as much damage|no damage) on a successful one\.(.*)$/s

/** Reads a statblock (a pack monster entry) back into answers. */
export function entryToMonster(entry: Record<string, unknown>): MonsterAnswers {
  const a = blankMonster(str(entry.id) || 'untitled')
  a.name = str(entry.name)
  a.description = str(entry.description)
  a.size = MONSTER_SIZES.includes(str(entry.size)) ? str(entry.size) : 'Medium'
  a.type = str(entry.type) || 'monstrosity'
  a.alignment = str(entry.alignment) || 'unaligned'
  a.cr = str(entry.cr).split(' ')[0] || '1'
  for (const s of ABILITIES) a.scores[s] = int(entry[s], 10)
  const acm = /^(\d+)(?: \((.*)\))?$/.exec(str(entry.ac).trim())
  if (acm) {
    a.ac = Number(acm[1])
    a.acNote = acm[2] ?? ''
  }
  const hpm = /^\d+ \((\d+)d\d+/.exec(plainDice(str(entry.hp)))
  if (hpm) a.hitDice = Number(hpm[1])
  // Speeds.
  a.senses = { blindsight: 0, darkvision: 0, tremorsense: 0, truesight: 0 }
  for (const part of str(entry.speed).split(',').map((p) => p.trim())) {
    const walk = /^(\d+) ft\.$/.exec(part)
    const other = /^(fly|swim|climb|burrow) (\d+) ft\.( \(hover\))?$/.exec(part)
    if (walk) a.walk = Number(walk[1])
    else if (other) {
      a.speeds[other[1] as 'fly'] = Number(other[2])
      if (other[3]) a.hover = true
    }
  }
  a.saves = str(entry.saves)
    .split(',')
    .map((p) => (Object.keys(SHORT) as Ability[]).find((k) => p.trim().startsWith(SHORT[k] + ' ')))
    .filter((x): x is Ability => !!x)
  const prof = proficiencyForCr(a.cr)
  a.skills = str(entry.skills)
    .split(',')
    .map((p) => {
      const m = /^(.+?) ([+-]\d+)$/.exec(p.trim())
      const skill = m ? MONSTER_SKILLS.find((s) => s.name.toLowerCase() === m[1].toLowerCase()) : undefined
      if (!m || !skill) return null
      return { id: skill.id, expertise: Number(m[2]) >= mod(a.scores[skill.ability]) + 2 * prof }
    })
    .filter((x): x is { id: string; expertise: boolean } => !!x)
  for (const part of str(entry.senses).split(',').map((p) => p.trim())) {
    const m = /^(blindsight|darkvision|tremorsense|truesight) (\d+) ft\.$/.exec(part)
    if (m) a.senses[m[1] as 'darkvision'] = Number(m[2])
  }
  const initm = /^([+-]\d+)/.exec(str(entry.initiative))
  if (initm) a.initiativeProficient = Number(initm[1]) >= mod(a.scores.dex) + prof
  const words = (v: unknown): string[] => (str(v).trim() ? str(v).split(',').map((x) => x.trim().toLowerCase()) : [])
  a.resistances = words(entry.damage_resistances)
  a.immunities = words(entry.damage_immunities)
  a.vulnerabilities = words(entry.damage_vulnerabilities)
  a.conditionImmunities = words(entry.condition_immunities)
  a.languages = str(entry.languages)
  for (const b of MONSTER_BLOCKS) {
    const items = Array.isArray(entry[b.key]) ? (entry[b.key] as Array<Record<string, unknown>>) : []
    a.blocks[b.key] = items.map((x) => readBlock(a, str(x.name), str(x.desc)))
  }
  // Whatever doesn't come back out exactly as written stays as written.
  const rebuilt = textFields(a)
  const original: Record<CustomField, string> = {
    ac: str(entry.ac),
    hp: str(entry.hp),
    speed: str(entry.speed),
    saves: str(entry.saves),
    skills: str(entry.skills),
    senses: str(entry.senses),
    initiative: str(entry.initiative),
    damage_resistances: str(entry.damage_resistances),
    damage_immunities: str(entry.damage_immunities),
    damage_vulnerabilities: str(entry.damage_vulnerabilities),
    condition_immunities: str(entry.condition_immunities)
  }
  for (const k of Object.keys(original) as CustomField[]) {
    if (plainDice(original[k]) === plainDice(rebuilt[k])) continue
    // An empty initiative line on an older statblock is simply worked out from Dex.
    if (k === 'initiative' && !original[k]) continue
    a.custom[k] = original[k]
  }
  return a
}

function readBlock(a: MonsterAnswers, rawName: string, desc: string): MonsterBlock {
  const nm = /^(.*?) \(((?:Recharge|\d+\/Day|Costs|Recharges).*)\)$/.exec(rawName)
  const name = nm ? nm[1] : rawName
  const usage = nm ? nm[2] : ''
  // Statblocks from before inline rolls (and the SRD's) have plain dice — read and compare without them.
  const atk = ATTACK_RE.exec(plainDice(desc))
  if (atk) {
    const ranged = atk[1] === 'Ranged'
    const roll: MonsterAttack = {
      kind: 'attack',
      range: ranged ? 'ranged' : 'melee',
      ability: 'str',
      reach: atk[2] ? Number(atk[2]) : 5,
      normal: atk[3] ? Number(atk[3]) : 80,
      long: atk[4] ? Number(atk[4]) : 320,
      dice: atk[5],
      damageType: atk[6],
      extraDice: atk[7] ?? '',
      extraType: atk[8] ?? 'fire',
      rider: (atk[9] ?? '').trim() === '.' ? '' : (atk[9] ?? '').trim()
    }
    // Which ability makes the numbers come out as written (Str, else Dex, else keep the text).
    for (const ability of ['str', 'dex', ...ABILITIES] as Ability[]) {
      const block = { name, usage, desc: '', roll: { ...roll, ability } }
      if (plainDice(blockText(a, block)) === plainDice(desc)) return block
    }
  }
  const sv = SAVE_RE.exec(plainDice(desc))
  if (sv) {
    const ability = (Object.keys(SAVE_NAME) as Ability[]).find((k) => SAVE_NAME[k] === sv[2])!
    for (const dcAbility of ['con', ...ABILITIES] as Ability[]) {
      const block: MonsterBlock = { name, usage, desc: '', roll: { kind: 'save', ability, dcAbility, targets: sv[1].charAt(0).toLowerCase() + sv[1].slice(1), dice: sv[3], damageType: sv[4], half: sv[5] === 'half as much damage', rider: sv[6].trim() } }
      if (plainDice(blockText(a, block)) === plainDice(desc)) return block
    }
  }
  return { name, usage, desc, roll: null }
}

/** Plain lines for the preview: the numbers the form worked out. */
export function describeMonster(a: MonsterAnswers): string[] {
  const prof = proficiencyForCr(a.cr)
  return [`Proficiency bonus ${signed(prof)} (from challenge ${a.cr})`, `Hit points ${plainDice(hpText(a))} from ${a.hitDice} ${a.size} hit dice (d${HIT_DIE[a.size] ?? 8}) and its Constitution`]
}
