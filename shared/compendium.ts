// The SRD (D&D's free/open ruleset) spell and equipment compendium — bundled
// locally as static JSON so it works fully offline, transformed from the
// open 5e-database project (github.com/5e-bits/5e-database, OGL-licensed
// SRD content) into a shape this app actually uses. Deliberately SRD-only:
// full spell/item text from other books (PHB, Xanathar's, DMG magic items)
// is copyrighted and isn't reproduced here — custom entries stay available
// everywhere this compendium is used, for anything outside SRD scope.

import spellsData from './data/srd-spells.json'
import equipmentData from './data/srd-equipment.json'
import magicItemsData from './data/srd-magic-items.json'
import spellSlotsData from './data/srd-spell-slots.json'
import spellsKnownData from './data/srd-spells-known.json'
import { CLASSES, abilityModifier, proficiencyBonus, type AbilityScores, type ClassLevel, type EquipmentItem } from './dnd5e'

export interface CompendiumSpell {
  id: string
  name: string
  level: number
  school: string
  castingTime: string
  range: string
  components: string
  duration: string
  concentration: boolean
  ritual: boolean
  classes: string[]
  description: string
  higherLevel?: string
  /** Present only for spells that require an attack roll (most spells are save-based or automatic and have neither) */
  attackType?: 'melee' | 'ranged'
}

export type EquipmentCategory = 'Weapon' | 'Armor' | 'Adventuring Gear' | 'Tools' | 'Mounts and Vehicles'

export interface CompendiumEquipment {
  id: string
  name: string
  category: EquipmentCategory
  cost: string
  weight?: number
  description?: string
  // Weapon-specific
  weaponCategory?: string
  weaponRange?: string
  damageDice?: string
  damageType?: string
  normalRange?: number
  longRange?: number
  properties?: string[]
  // Armor-specific
  armorCategory?: string
  armorClassBase?: number
  armorClassDexBonus?: boolean
  armorClassMaxBonus?: number
  strMinimum?: number
  stealthDisadvantage?: boolean
  // Tools / Adventuring Gear / Mounts & Vehicles
  toolCategory?: string
  gearCategory?: string
  vehicleCategory?: string
}

/** Rarity/category ("Potion", "Wondrous Items", "Ring", "Scroll", "Staff", "Wand", "Rod", plus magic Armor/Weapon/Ammunition) come straight from the SRD's own magic item list — the one part of the SRD that actually does cover consumables and magic gear (Potion of Healing, Spell Scroll, etc.), unlike the base Equipment list which is all mundane gear. */
export interface CompendiumMagicItem {
  id: string
  name: string
  category: string
  rarity: string
  description: string
}

export const SPELLS: CompendiumSpell[] = spellsData as CompendiumSpell[]
export const CANTRIPS: CompendiumSpell[] = SPELLS.filter((s) => s.level === 0)
export const EQUIPMENT: CompendiumEquipment[] = equipmentData as CompendiumEquipment[]
export const WEAPONS: CompendiumEquipment[] = EQUIPMENT.filter((e) => e.category === 'Weapon')
export const ARMOR: CompendiumEquipment[] = EQUIPMENT.filter((e) => e.category === 'Armor')
export const MAGIC_ITEMS: CompendiumMagicItem[] = magicItemsData as CompendiumMagicItem[]

const spellById = new Map(SPELLS.map((s) => [s.id, s]))
const equipmentById = new Map(EQUIPMENT.map((e) => [e.id, e]))
const magicItemById = new Map(MAGIC_ITEMS.map((m) => [m.id, m]))

export function getSpellById(id: string): CompendiumSpell | undefined {
  return spellById.get(id)
}

export function getEquipmentById(id: string): CompendiumEquipment | undefined {
  return equipmentById.get(id)
}

export function getMagicItemById(id: string): CompendiumMagicItem | undefined {
  return magicItemById.get(id)
}

export function searchMagicItems(query: string, limit = 30, pool: CompendiumMagicItem[] = MAGIC_ITEMS): CompendiumMagicItem[] {
  const q = query.trim().toLowerCase()
  const matches = q ? pool.filter((m) => m.name.toLowerCase().includes(q)) : pool
  return matches.slice(0, limit)
}

/** Filters the given pool (not just the first `limit` results — the earlier version limited before filtering, which meant a filtered pool like cantrips-only could come back with almost nothing if few of the first 30 array entries happened to be cantrips) then applies the limit. Defaults to the full spell list. */
export function searchSpells(query: string, limit = 30, pool: CompendiumSpell[] = SPELLS): CompendiumSpell[] {
  const q = query.trim().toLowerCase()
  const matches = q ? pool.filter((s) => s.name.toLowerCase().includes(q)) : pool
  return matches.slice(0, limit)
}

export function searchEquipment(pool: CompendiumEquipment[], query: string, limit = 30): CompendiumEquipment[] {
  const q = query.trim().toLowerCase()
  if (!q) return pool.slice(0, limit)
  return pool.filter((e) => e.name.toLowerCase().includes(q)).slice(0, limit)
}

type SpellSlotTable = Record<string, Record<string, number[]>>
const SPELL_SLOTS_BY_CLASS_LEVEL = spellSlotsData as SpellSlotTable

/**
 * Total spell slots per level (keys 1-9, only levels with at least one
 * slot present) for a character's classes, drawn from the official SRD
 * per-class-per-level tables — so slot counts are never hand-entered.
 *
 * Simplification: true multiclass spellcasting combines all your caster
 * levels into one shared table rather than summing each class's own
 * single-class progression; this sums instead, which is exact for the
 * common single-class case and an approximation for multiclass casters.
 * Warlock Pact Magic slots are unaffected by that simplification — they're
 * always separate/additive under the real rules too, which is exactly
 * what summing naturally does here.
 */
export function spellSlotsForClasses(classes: ClassLevel[]): Record<number, number> {
  const totals: Record<number, number> = {}
  for (const c of classes) {
    const cls = CLASSES.find((k) => k.name.toLowerCase() === c.className.toLowerCase())
    if (!cls) continue
    const row = SPELL_SLOTS_BY_CLASS_LEVEL[cls.id]?.[String(c.level)]
    if (!row) continue
    row.forEach((count, i) => {
      if (count > 0) totals[i + 1] = (totals[i + 1] ?? 0) + count
    })
  }
  return totals
}

type SpellsKnownTable = Record<string, Record<string, number>>
const SPELLS_KNOWN_BY_CLASS_LEVEL = spellsKnownData as SpellsKnownTable

/**
 * "Known" casters (Bard/Sorcerer/Warlock/Ranger) don't prepare spells daily
 * like Cleric/Druid/Wizard/Paladin do — instead the SRD caps how many
 * spells they can know at once, growing by level. Returns null if none of
 * the character's classes uses this system (prepared casters and
 * non-casters have no "known" cap; see preparedSpellLimit for their rule
 * instead). Multiclass known-casters sum each class's own cap at its own
 * level, the same simplification spellSlotsForClasses uses.
 */
export function knownSpellsLimit(classes: ClassLevel[]): number | null {
  let total = 0
  let isKnownCaster = false
  for (const c of classes) {
    const cls = CLASSES.find((k) => k.name.toLowerCase() === c.className.toLowerCase())
    if (!cls) continue
    const known = SPELLS_KNOWN_BY_CLASS_LEVEL[cls.id]?.[String(c.level)]
    if (known === undefined) continue
    isKnownCaster = true
    total += known
  }
  return isKnownCaster ? total : null
}

/**
 * AC from whatever's equipped, falling back to the base 10 + Dex unarmored
 * formula when nothing (or nothing recognized) is equipped. A shield adds
 * its bonus on top of body armor (or on top of unarmored AC) rather than
 * replacing it — that's how the SRD's own armorClassBase: 2 for Shield is
 * meant to be read; every other Armor-category item's armorClassBase is a
 * full replacement value, using armorClassMaxBonus to cap how much Dex
 * mod counts (e.g. medium armor's +2 cap) when armorClassDexBonus is set.
 * Only compendium-linked equipped items count — a custom "armor" has no
 * formula to draw from, so it's silently ignored here (its `equipped` flag
 * still displays fine in the Inventory UI, it just doesn't feed AC).
 */
export function computeArmorClassFromEquipment(equipment: EquipmentItem[], abilityScores: AbilityScores): number {
  const dexMod = abilityModifier(abilityScores.dex)
  const equipped = equipment.filter((e) => e.equipped && e.compendiumId).map((e) => getEquipmentById(e.compendiumId!)).filter((e): e is CompendiumEquipment => !!e && e.category === 'Armor')

  const shield = equipped.find((e) => e.armorCategory === 'Shield')
  const bodyArmor = equipped.find((e) => e.armorCategory !== 'Shield')

  let base: number
  if (bodyArmor) {
    const dexContribution = bodyArmor.armorClassDexBonus
      ? bodyArmor.armorClassMaxBonus != null
        ? Math.min(dexMod, bodyArmor.armorClassMaxBonus)
        : dexMod
      : 0
    base = (bodyArmor.armorClassBase ?? 10) + dexContribution
  } else {
    base = 10 + dexMod
  }

  return base + (shield?.armorClassBase ?? 0)
}

/** Which ability a weapon attack should use by default: Ranged weapons use Dex; Finesse weapons use whichever of Str/Dex is currently higher; everything else uses Str. Only a starting suggestion — the player can still override per-attack (e.g. a reach weapon build, or a feature that changes the rule). */
export function suggestedAttackAbility(weapon: CompendiumEquipment | undefined, abilityScores: AbilityScores): 'str' | 'dex' {
  if (!weapon) return 'str'
  if (weapon.weaponRange === 'Ranged') return 'dex'
  if (weapon.properties?.includes('Finesse')) {
    return abilityModifier(abilityScores.dex) > abilityModifier(abilityScores.str) ? 'dex' : 'str'
  }
  return 'str'
}

/** Weapon attack bonus = proficiency bonus + the chosen ability's modifier. Proficiency is assumed (there's no per-weapon-type proficiency tracking), which matches most characters' attacks — the one thing that's genuinely per-player is which ability governs the swing, which the caller supplies via `ability` (see suggestedAttackAbility for a sensible default). */
export function weaponAttackBonus(ability: 'str' | 'dex', abilityScores: AbilityScores, classes: ClassLevel[]): number {
  return proficiencyBonus(classes) + abilityModifier(abilityScores[ability])
}

export function spellLevelLabel(level: number): string {
  if (level === 0) return 'Cantrip'
  const suffix = level === 1 ? 'st' : level === 2 ? 'nd' : level === 3 ? 'rd' : 'th'
  return `${level}${suffix}-level`
}
