import type { CharacterSheet } from './ipc'
import type { DerivedCharacter } from './content/engine'

/**
 * A character sheet as uploaded to the relay for the read-only web viewer
 * (relay/ serves it at /viewer/). The raw sheet travels as-is, alongside the
 * numbers the desktop's content engine derived from it: the viewer can't
 * derive them itself, since homebrew content packs only exist on the
 * desktop, and shipping the rules engine plus SRD data to a phone just to
 * re-run it would be wasteful anyway.
 */
export interface CloudCharacter {
  id: string
  name: string
  updatedAt: string
  /** One line for list views, e.g. "Hill Dwarf Cleric 5". */
  subtitle: string
  sheet: CharacterSheet
  derived: CloudDerived
}

/** The JSON-safe slice of DerivedCharacter the viewer actually shows. */
export interface CloudDerived {
  level: number
  proficiencyBonus: number
  armorClass: number
  maxHp: number
  initiative: number
  speeds: Record<string, number>
  abilities: DerivedCharacter['abilities']
  saves: Record<string, { bonus: number; proficiency?: string }>
  skills: { name: string; ability: string; bonus: number; passive: number; proficiency?: string }[]
  senses: { name: string; range: number }[]
  hitDice: { className: string; die: number; count: number }[]
  damageRelations: DerivedCharacter['damageRelations']
  conditionImmunities: string[]
  proficiencies: DerivedCharacter['proficiencies']
  spellcasting: { dc: number | null; attackBonus: number | null; slots: Record<string, Record<number, number>> }
  attacks: { name: string; range: string; attackBonus: number; damage: string; damageType: string; extraDamage: { damage: string; damageType?: string }[]; description?: string }[]
  resources: { name: string; max: number; used: number; recharge: string; description: string }[]
  features: { name: string; source: string; description: string; level?: number }[]
}

function classLine(sheet: CharacterSheet): string {
  return sheet.classes.map((c) => `${c.className}${c.subclass ? ` (${c.subclass})` : ''} ${c.level}`).join(' / ')
}

export function buildCloudCharacter(sheet: CharacterSheet, d: DerivedCharacter): CloudCharacter {
  return {
    id: sheet.id,
    name: sheet.name,
    updatedAt: sheet.updatedAt,
    subtitle: [sheet.race, classLine(sheet)].filter(Boolean).join(' '),
    sheet,
    derived: {
      level: d.level,
      proficiencyBonus: d.proficiencyBonus,
      armorClass: d.armorClass,
      maxHp: d.maxHp,
      initiative: d.initiative,
      speeds: d.speeds,
      abilities: d.abilities,
      saves: Object.fromEntries(Object.entries(d.saves).map(([id, s]) => [id, { bonus: s.bonus, proficiency: s.proficiency }])),
      skills: Object.values(d.skills).map((s) => ({ name: s.name, ability: s.ability, bonus: s.bonus, passive: s.passive, proficiency: s.proficiency })),
      senses: Object.values(d.senses),
      hitDice: d.hitDice.map((h) => ({ className: h.className, die: h.die, count: h.count })),
      damageRelations: d.damageRelations,
      conditionImmunities: d.conditionImmunities,
      proficiencies: d.proficiencies,
      spellcasting: { dc: d.spellcasting.dc, attackBonus: d.spellcasting.attackBonus, slots: d.spellcasting.slots },
      attacks: d.attacks.map((a) => ({
        name: a.name,
        range: a.range,
        attackBonus: a.attackBonus,
        damage: a.damage,
        damageType: a.damageType,
        extraDamage: a.extraDamage.map((x) => ({ damage: x.damage, damageType: x.damageType })),
        description: a.description
      })),
      resources: d.resources.map((r) => ({ name: r.name, max: r.max, used: r.used, recharge: r.recharge, description: r.description })),
      features: d.features.map((f) => ({ name: f.name, source: f.source, description: f.description, level: f.level }))
    }
  }
}
