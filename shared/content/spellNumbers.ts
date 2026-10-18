// A spell's numbers for one character at one slot level: its spell attack
// bonus or save DC, and its damage or healing dice with upcasting, cantrip
// scaling and the spellcasting modifier worked out (from the spell's
// formulas — see srd/spellRolls.ts for the SRD's).

import type { DerivedCharacter } from './engine'
import type { AbilityId, SpellDef } from './schema'

export interface SpellNumbers {
  attackBonus?: number
  saveDc?: number
  saveAbility?: AbilityId
  damage?: string
  damageType?: string
  healing?: string
}

export function spellNumbers(derived: DerivedCharacter, spell: Pick<SpellDef, 'level' | 'attackType' | 'saveAbility' | 'damage' | 'damageType' | 'healing'>, slotLevel = spell.level): SpellNumbers {
  const out: SpellNumbers = {}
  if (spell.attackType && derived.spellcasting.attackBonus !== null) out.attackBonus = derived.spellcasting.attackBonus
  if (spell.saveAbility) {
    out.saveAbility = spell.saveAbility
    if (derived.spellcasting.dc !== null) out.saveDc = derived.spellcasting.dc
  }
  const roll = (formula: string | undefined): string | undefined => {
    if (!formula || !derived.evaluate) return undefined
    const r = derived.evaluate({ formula, spellLevel: Math.max(spell.level, slotLevel) })
    return r.ok ? (r.dice ?? String(r.value)) : undefined
  }
  const damage = roll(spell.damage)
  if (damage) {
    out.damage = damage
    if (spell.damageType) out.damageType = spell.damageType
  }
  const healing = roll(spell.healing)
  if (healing) out.healing = healing
  return out
}

/** "8d6", "3d10 + 4", "1d4 + 1": one kind of die plus a flat amount, for rolling; null for anything else. */
export function splitDice(dice: string): { count: number; sides: number; flat: number } | null {
  const m = /^\s*(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?\s*$/.exec(dice)
  if (!m) return null
  return { count: Number(m[1]), sides: Number(m[2]), flat: m[3] ? (m[3] === '-' ? -1 : 1) * Number(m[4]) : 0 }
}
