// Reads an SRD spell's rules text into the fields the sheet rolls with:
// its save or spell attack, damage dice and type, and healing — with
// upcasting ("increases by 1d6 for each slot level above 3rd") and cantrip
// scaling ("increases by 1d10 when you reach 5th level") as formulas, so
// the sheet can show the right dice for the slot and the character.
// The SRD text is regular enough that a handful of patterns cover it; a
// spell the patterns don't fit simply gets no roll fields (its text still
// says what it does).

import type { CompendiumSpell } from '../../compendium'
import type { AbilityId } from '../schema'

export interface SpellRollFields {
  attackType?: 'melee' | 'ranged'
  saveAbility?: AbilityId
  damage?: string
  damageType?: string
  healing?: string
}

const ABILITY: Record<string, AbilityId> = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' }
const DAMAGE_TYPES = 'acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder'

const SAVE_RE = /\b(strength|dexterity|constitution|intelligence|wisdom|charisma) saving throw/i
const ATTACK_RE = /\b(melee|ranged) spell attack/i
/** "8d6 fire damage", "1d4 + 1 force damage", "1d8 + your spellcasting ability modifier force damage". */
const DAMAGE_RE = new RegExp(String.raw`(\d+d\d+(?:\s*\+\s*\d+)?)(\s*\+\s*your spellcasting ability modifier)?\s+(${DAMAGE_TYPES})\s+damage`, 'i')
/** "force damage equal to 1d8 + your spellcasting ability modifier" (Spiritual Weapon). */
const DAMAGE_EQUAL_RE = new RegExp(String.raw`(${DAMAGE_TYPES})\s+damage equal to\s+(\d+d\d+)(\s*\+\s*your spellcasting ability modifier)?`, 'i')
/** "3d8 damage of the type you chose" (Chromatic Orb): dice with no fixed type. */
const ANY_TYPE_RE = /(\d+d\d+)\s+damage of the (?:type|chosen type)/i
const HEAL_DICE_RE = /regains?\s+(?:a number of\s+)?hit points equal to\s+(\d+d\d+)(\s*\+\s*your spellcasting ability modifier)?/i
const HEAL_FLAT_RE = /regains?\s+(\d+)\s+hit points/i
/** "…damage increases by 1d6 for each slot level above 3rd" / "for every two slot levels above 2nd" / "for each level above 2nd". */
const UPCAST_RE = /(damage|healing)[^.]*?increases by (\d+)d(\d+) for (each|every two) (?:spell )?(?:slot )?levels? above (?:the )?(\d+)/i
/** Spells whose SRD text the patterns misread, set by hand (Shatter's upcast sentence is garbled in the source). */
const OVERRIDES: Record<string, SpellRollFields> = { Shatter: { saveAbility: 'con', damage: '(3 + (@slotLevel - 2) * 1)d8', damageType: 'Thunder' } }
const CANTRIP_RE = /damage increases by (\d+)d(\d+) when you reach 5th level/i

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
const clean = (dice: string): string => dice.replace(/\s+/g, '').replace(/\+/g, ' + ')

interface Step {
  count: number
  sides: number
  everyTwo: boolean
}

const stepFrom = (up: RegExpExecArray): Step => ({ count: Number(up[2]), sides: Number(up[3]), everyTwo: up[4].toLowerCase() === 'every two' })

/** "8d6" at `level`, plus N more dice of the same size per slot level (or every two) above it → "(8 + (@slotLevel - 3) * 1)d6"; anything after the dice ("+ 1") is kept. */
function upcastDice(base: string, level: number, step: Step): string {
  const m = /^(\d+)d(\d+)(.*)$/.exec(base)
  if (!m || Number(m[2]) !== step.sides) return base
  const steps = step.everyTwo ? `floor((@slotLevel - ${level}) / 2)` : `(@slotLevel - ${level})`
  return `(${m[1]} + ${steps} * ${step.count})d${m[2]}${m[3]}`
}

/** A cantrip's dice at character levels 1 / 5 / 11 / 17: N more of the same die at each step. */
function cantripDice(base: string, step: Pick<Step, 'count' | 'sides'>): string {
  const m = /^(\d+)d(\d+)(.*)$/.exec(base)
  if (!m || Number(m[2]) !== step.sides) return base
  return `(${m[1]} + ${step.count} * ((@level >= 5) + (@level >= 11) + (@level >= 17)))d${m[2]}${m[3]}`
}

export function spellRollFields(spell: Pick<CompendiumSpell, 'name' | 'level' | 'description' | 'higherLevel' | 'attackType'>): SpellRollFields {
  if (OVERRIDES[spell.name]) return OVERRIDES[spell.name]
  const text = spell.description
  const higher = spell.higherLevel ?? ''
  const out: SpellRollFields = {}

  const attack = spell.attackType ?? (ATTACK_RE.exec(text)?.[1]?.toLowerCase() as 'melee' | 'ranged' | undefined)
  if (attack) out.attackType = attack
  else {
    const save = SAVE_RE.exec(text)
    if (save) out.saveAbility = ABILITY[save[1].toLowerCase()]
  }

  const typed = DAMAGE_RE.exec(text)
  const equal = typed ? null : DAMAGE_EQUAL_RE.exec(text)
  const untyped = typed || equal ? null : ANY_TYPE_RE.exec(text)
  const damage = typed
    ? { dice: typed[1], plusMod: !!typed[2], type: cap(typed[3]) }
    : equal
      ? { dice: equal[2], plusMod: !!equal[3], type: cap(equal[1]) }
      : untyped
        ? { dice: untyped[1], plusMod: false, type: '' }
        : null
  if (damage) {
    let dice = clean(damage.dice)
    const cantrip = spell.level === 0 ? (CANTRIP_RE.exec(text) ?? CANTRIP_RE.exec(higher)) : null
    const up = spell.level > 0 ? UPCAST_RE.exec(higher) : null
    if (cantrip) dice = cantripDice(dice, { count: Number(cantrip[1]), sides: Number(cantrip[2]) })
    else if (up && up[1].toLowerCase() === 'damage' && Number(up[5]) <= spell.level) dice = upcastDice(dice, Number(up[5]), stepFrom(up))
    out.damage = damage.plusMod ? `${dice} + @spell.mod` : dice
    if (damage.type) out.damageType = damage.type
  }

  const healDice = HEAL_DICE_RE.exec(text)
  const healFlat = healDice ? null : HEAL_FLAT_RE.exec(text)
  if (healDice) {
    const up = spell.level > 0 ? UPCAST_RE.exec(higher) : null
    let dice = clean(healDice[1])
    if (up && up[1].toLowerCase() === 'healing' && Number(up[5]) <= spell.level) dice = upcastDice(dice, Number(up[5]), stepFrom(up))
    out.healing = healDice[2] ? `${dice} + @spell.mod` : dice
  } else if (healFlat) out.healing = healFlat[1]

  return out
}
