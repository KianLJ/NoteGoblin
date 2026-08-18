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
import subclassesData from './data/srd-subclasses.json'
import subclassFeaturesData from './data/srd-subclass-features.json'
import featsData from './data/srd-feats.json'
import {
  ABILITIES,
  CLASSES,
  CLASS_RESOURCES,
  abilityModifier,
  activeAsiSlotChoices,
  activeFeatIds,
  proficiencyBonus,
  type Ability,
  type AbilityScores,
  type AsiSlotChoice,
  type CharacterSheetData,
  type ClassLevel,
  type EquipmentItem,
  type SkillName,
  type Spell
} from './dnd5e'

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

/** One SRD subclass — the SRD only defines a single subclass per class (Berserker, Life, Champion, etc.), not the full official roster, since the rest is PHB/other-book content that isn't open. */
export interface CompendiumSubclass {
  id: string
  name: string
  classId: string
  /** Short flavor blurb from the SRD, shown above the feature list — not full rules text. */
  flavor?: string
}

/** One mechanical feature a subclass grants at a specific level — real SRD rules text, used to fill in the generic "Path Feature"/"Archetype Feature" placeholders in dnd5e.ts's CLASS_LEVEL_FEATURES once a character has actually chosen that subclass. */
export interface CompendiumSubclassFeature {
  classId: string
  subclassId: string
  level: number
  name: string
  desc: string
}

/**
 * A structured, mechanical effect a feat grants — this is what makes taking
 * a feat actually change the sheet's numbers (ability scores, skills,
 * saves, speed) instead of just adding a paragraph of text to Class
 * Features.
 *
 * `abilityScore` is a fixed bump (always the same ability) — folded live
 * into every derived stat via effectiveAbilityScores, same as an ASI.
 * `abilityScoreChoice` is a player-choice bump (e.g. Grappler's "Strength
 * or Dexterity") — it can't be resolved generically like `abilityScore`
 * can, so FeaturesTab.tsx's AsiSlotChooser prompts for the choice and
 * stores it as `chosenAbility` on the resolved AsiSlotChoice record (see
 * shared/dnd5e.ts); effectiveAbilityScores reads that record to apply it,
 * the same as a flat ASI, live every render (never baked into the base
 * abilityScores directly).
 *
 * `note` is for a real rules effect that isn't a number change (e.g.
 * advantage on grapple attacks, rerolling a damage die) — it still
 * surfaces as a highlighted callout on the sheet, just not as a stat bump.
 * Most SRD feat benefits are like this: situational combat/exploration
 * behavior a static character sheet can't safely automate, not a flat
 * modifier.
 */
export type FeatEffect =
  | { kind: 'abilityScore'; ability: Ability; amount: number }
  | { kind: 'abilityScoreChoice'; amount: number; options: Ability[] }
  | { kind: 'skillProficiency'; skill: SkillName }
  | { kind: 'savingThrowProficiency'; ability: Ability }
  | { kind: 'speed'; amount: number }
  | { kind: 'note'; text: string }
  | { kind: 'skillAdvantage'; skill: SkillName }
  | { kind: 'skillDisadvantage'; skill: SkillName }
  | { kind: 'abilityCheckAdvantage'; ability: Ability }
  | { kind: 'abilityCheckDisadvantage'; ability: Ability }
  | { kind: 'savingThrowAdvantage'; ability: Ability }
  | { kind: 'savingThrowDisadvantage'; ability: Ability }
  | { kind: 'attackAdvantage' }
  | { kind: 'attackDisadvantage' }
  | { kind: 'initiativeAdvantage' }
  | { kind: 'initiativeDisadvantage' }
  | { kind: 'armorClass'; amount: number }
  /**
   * "Choose N cantrips and M spells of level `spellLevel` from these
   * classes' spell lists" — Magic Initiate's whole mechanical effect.
   * Resolved via a dedicated chooser (MagicInitiateChooser in
   * AsiChoosers.tsx) instead of the generic ASI/feat flow, since it needs
   * to pick an actual spellcasting ability (stored on the owning
   * AsiSlotChoice's `chosenAbility`) and specific spells (stored on
   * `chosenSpellIds`) rather than a single named option. The chosen spells
   * get written directly into character.spells (marked `free: true`) so
   * they're fully real — castable, shown in Spells/Attacks — not just a
   * flavor note the player has to remember to act on by hand.
   */
  | { kind: 'spellChoice'; classes: string[]; cantripCount: number; spellLevel: number; spellCount: number }

/**
 * A feat, sourced from the SRD 5.2.1 (Creative Commons Attribution 4.0 —
 * see the app's About/attribution notice). This is the SRD's actual,
 * complete feat list — 4 Origin, 2 General, 4 Fighting Style, 7 Epic Boon
 * — not the full Player's Handbook roster (Alert-adjacent PHB feats like
 * Lucky, Sharpshooter, War Caster, etc. are separate PHB-exclusive content
 * and aren't reproduced here). `prerequisiteAbility`, when present, is
 * checked against the character's ability scores before offering the feat
 * at an Ability Score Improvement slot (see FeaturesTab.tsx). `effects`
 * is what actually gets applied to the sheet (see
 * effectiveAbilityScores/effectiveSkillProficiencies/etc. below) — more
 * feats can be added to srd-feats.json with their own `effects` array
 * without touching any code.
 */
export interface CompendiumFeat {
  id: string
  name: string
  category: 'Origin' | 'General' | 'Fighting Style' | 'Epic Boon'
  prerequisite?: string
  prerequisiteAbility?: { ability: Ability; minimum: number }
  /** A numeric character-level floor (General feats need 4+, Epic Boons need 19+) — checked separately from prerequisiteAbility since it's a different kind of gate (total character level, not an ability score). */
  minLevel?: number
  repeatable?: boolean
  desc: string
  effects?: FeatEffect[]
}

export const SUBCLASSES: CompendiumSubclass[] = subclassesData as CompendiumSubclass[]
export const SUBCLASS_FEATURES: CompendiumSubclassFeature[] = subclassFeaturesData as CompendiumSubclassFeature[]
export const FEATS: CompendiumFeat[] = featsData as CompendiumFeat[]

function resolveFeatEffects(featIds: string[]): FeatEffect[] {
  return featIds.flatMap((id) => FEATS.find((f) => f.id === id)?.effects ?? [])
}

/**
 * Ability scores with every *active* Ability Score Improvement — a flat
 * `kind: 'ability'` slot, or a `kind: 'feat'` slot whose feat has a fixed
 * `abilityScore` effect or a resolved `abilityScoreChoice` (via the slot's
 * own `chosenAbility`) — added on top of the base sheet values. Pass this
 * (never the raw `character.abilityScores`) into any derived-stat
 * calculation, so a level-4 ASI or a feat that boosts an ability actually
 * cascades into skills, saves, AC, spell DC, attack bonus, everywhere. The
 * base scores themselves stay untouched — this is a read-only view for
 * computing with, not what an ability score input field should be bound to.
 * "Active" means the owning class is still at or above the slot's level —
 * see activeAsiSlotChoices in shared/dnd5e.ts — so lowering a class's level
 * automatically drops whatever that slot granted.
 */
const ABILITY_SCORE_CAP = 20

export function effectiveAbilityScores(base: AbilityScores, classes: ClassLevel[], asiSlotChoices: AsiSlotChoice[]): AbilityScores {
  const result = { ...base }
  // Epic Boon feats are the SRD's explicit exception to the usual 20 cap —
  // tracked separately and added back in after capping everything else, so
  // an Epic Boon can push an already-capped 20 up further, but an ordinary
  // ASI/feat increase never can (regardless of which order they were taken
  // in — capping first, then adding Epic Boon bonuses, sidesteps any
  // order-dependence a running per-increment cap would have).
  const epicBoonBonus: Partial<Record<Ability, number>> = {}

  for (const slot of activeAsiSlotChoices(classes, asiSlotChoices)) {
    if (slot.kind === 'ability' && slot.abilityIncreases) {
      for (const [ability, amount] of Object.entries(slot.abilityIncreases) as [Ability, number][]) {
        result[ability] += amount
      }
    } else if (slot.kind === 'feat' && slot.chosenAbility) {
      const feat = FEATS.find((f) => f.id === slot.featId)
      const choice = feat?.effects?.find((e): e is Extract<FeatEffect, { kind: 'abilityScoreChoice' }> => e.kind === 'abilityScoreChoice')
      if (choice) {
        if (feat?.category === 'Epic Boon') epicBoonBonus[slot.chosenAbility] = (epicBoonBonus[slot.chosenAbility] ?? 0) + choice.amount
        else result[slot.chosenAbility] += choice.amount
      }
    }
  }
  for (const effect of resolveFeatEffects(activeFeatIds(classes, asiSlotChoices))) {
    if (effect.kind === 'abilityScore') result[effect.ability] += effect.amount
  }
  for (const { id } of ABILITIES) result[id] = Math.min(ABILITY_SCORE_CAP, result[id])
  for (const [ability, amount] of Object.entries(epicBoonBonus) as [Ability, number][]) result[ability] += amount
  // Barbarian's 20th-level capstone, Primal Champion — +4 Str and +4 Con, to a max of 24. Its own separate,
  // higher cap (not the usual 20) is why this is applied after the general cap above rather than folded into
  // the same loop, same idea as the Epic Boon exception just above it.
  if (classes.some((c) => c.className.toLowerCase() === 'barbarian' && c.level >= 20)) {
    result.str = Math.min(24, result.str + 4)
    result.con = Math.min(24, result.con + 4)
  }
  return result
}

/** Skill proficiencies with every taken feat's `skillProficiency` effects unioned in (a feat only ever grants proficiency, never expertise, so an existing 'expertise' entry is left alone). */
export function effectiveSkillProficiencies(
  base: Partial<Record<SkillName, 'proficient' | 'expertise'>>,
  featIds: string[]
): Partial<Record<SkillName, 'proficient' | 'expertise'>> {
  const result = { ...base }
  for (const effect of resolveFeatEffects(featIds)) {
    if (effect.kind === 'skillProficiency' && !result[effect.skill]) result[effect.skill] = 'proficient'
  }
  return result
}

/** Saving throw proficiencies with every taken feat's `savingThrowProficiency` effects unioned in. */
export function effectiveSavingThrowProficiencies(base: Ability[], featIds: string[]): Ability[] {
  const granted = resolveFeatEffects(featIds)
    .filter((e): e is Extract<FeatEffect, { kind: 'savingThrowProficiency' }> => e.kind === 'savingThrowProficiency')
    .map((e) => e.ability)
  return [...new Set([...base, ...granted])]
}

/** Total speed bonus (in feet) granted by taken feats — add to computeSpeed's result. */
export function featSpeedBonus(featIds: string[]): number {
  return resolveFeatEffects(featIds)
    .filter((e): e is Extract<FeatEffect, { kind: 'speed' }> => e.kind === 'speed')
    .reduce((sum, e) => sum + e.amount, 0)
}

/**
 * What "activating" a class resource (character.activeBuffs — see
 * CLASS_RESOURCES/resourceUsed) actually changes on the sheet while it's
 * on, keyed by ClassResourceDef.id. Rage is the flagship (and, in the core
 * SRD resource set, the only) case that's a genuine ongoing buff rather
 * than an instant effect (Second Wind heals now, Lay on Hands heals now,
 * Divine Smite triggers on a hit) — but the shape here is generic, so a
 * homebrew/future resource with similar "toggle on for a bonus" semantics
 * only needs an entry here, not new plumbing.
 */
const BUFF_EFFECTS: Record<
  string,
  {
    abilityCheckAdvantage?: Ability[]
    savingThrowAdvantage?: Ability[]
    resistances?: string[]
    /** Extra melee damage while active, as a function of the buff-granting class's own level (e.g. Rage's +2/+3/+4 ladder). */
    meleeDamageBonus?: (classLevel: number) => number
    /** Blanket advantage on this character's own attack rolls while active — Reckless Attack's half of its trade-off (the other half, attacks against you also having advantage, is a DM-facing condition a static sheet can't enforce, so it's surfaced as descriptive text only). */
    attackAdvantage?: boolean
  }
> = {
  'barbarian-rage': {
    abilityCheckAdvantage: ['str'],
    savingThrowAdvantage: ['str'],
    resistances: ['Bludgeoning', 'Piercing', 'Slashing'],
    meleeDamageBonus: (level) => (level >= 16 ? 4 : level >= 9 ? 3 : 2)
  },
  'barbarian-reckless-attack': {
    attackAdvantage: true
  }
}

/** Whether this class resource has an "activate for a buff" entry at all (see BUFF_EFFECTS) — gates whether FeaturesTab.tsx shows an Activate/End button on its card instead of just a uses/pool tracker. */
export function isActivatableResource(resourceId: string): boolean {
  return resourceId in BUFF_EFFECTS
}

/** The resource id's owning class's own level (e.g. barbarian level, for 'barbarian-rage') — resolved from CLASS_RESOURCES so BUFF_EFFECTS' level-scaled bonuses (Rage's damage ladder) read the right class, not just the highest/first one on a multiclass character. */
function ownerClassLevel(resourceId: string, classes: ClassLevel[]): number {
  for (const c of classes) {
    const cls = CLASSES.find((k) => k.name.toLowerCase() === c.className.toLowerCase())
    if (cls && (CLASS_RESOURCES[cls.id] ?? []).some((r) => r.id === resourceId)) return c.level
  }
  return 0
}

/** Every damage type currently resisted purely from an active buff (Rage) — kept separate from character.damageResistances since it's conditional on the buff staying on, not a permanent trait to store. */
export function activeBuffResistances(activeBuffs: string[]): string[] {
  return [...new Set(activeBuffs.flatMap((id) => BUFF_EFFECTS[id]?.resistances ?? []))]
}

/** Bonus melee damage from any currently-active buff (Rage) — add to a Str-based melee weapon attack's damage. */
export function activeBuffMeleeDamageBonus(activeBuffs: string[], classes: ClassLevel[]): number {
  return activeBuffs.reduce((sum, id) => {
    const bonus = BUFF_EFFECTS[id]?.meleeDamageBonus
    return bonus ? sum + bonus(ownerClassLevel(id, classes)) : sum
  }, 0)
}

/**
 * Every skill currently under advantage or disadvantage — from a feat's
 * `skillAdvantage`/`skillDisadvantage` effect, or (the one built-in source
 * right now) Stealth disadvantage from equipped armor with the SRD's
 * stealthDisadvantage flag set. Surfaced as a small green "A" / red "D" tag
 * next to the skill in Overview. If a skill somehow ends up with both, they
 * cancel out per the 5e rule (advantage and disadvantage together = neither) —
 * that skill is simply left out of the result.
 */
export function effectiveSkillAdvantage(
  featIds: string[],
  equipment: EquipmentItem[]
): Partial<Record<SkillName, 'advantage' | 'disadvantage'>> {
  const result: Partial<Record<SkillName, 'advantage' | 'disadvantage'>> = {}
  const advantaged = new Set<SkillName>()
  const disadvantaged = new Set<SkillName>()
  for (const effect of resolveFeatEffects(featIds)) {
    if (effect.kind === 'skillAdvantage') advantaged.add(effect.skill)
    else if (effect.kind === 'skillDisadvantage') disadvantaged.add(effect.skill)
  }
  if (armorStealthDisadvantage(equipment)) disadvantaged.add('Stealth')
  for (const skill of advantaged) if (!disadvantaged.has(skill)) result[skill] = 'advantage'
  for (const skill of disadvantaged) if (!advantaged.has(skill)) result[skill] = 'disadvantage'
  return result
}

/** Same idea as effectiveSkillAdvantage, but for the six ability checks (e.g. a feat granting advantage on Strength checks, or Rage's Strength-check advantage while active) rather than the eighteen skills. */
export function effectiveAbilityCheckAdvantage(featIds: string[], activeBuffs: string[] = []): Partial<Record<Ability, 'advantage' | 'disadvantage'>> {
  const result: Partial<Record<Ability, 'advantage' | 'disadvantage'>> = {}
  const advantaged = new Set<Ability>()
  const disadvantaged = new Set<Ability>()
  for (const effect of resolveFeatEffects(featIds)) {
    if (effect.kind === 'abilityCheckAdvantage') advantaged.add(effect.ability)
    else if (effect.kind === 'abilityCheckDisadvantage') disadvantaged.add(effect.ability)
  }
  for (const id of activeBuffs) for (const a of BUFF_EFFECTS[id]?.abilityCheckAdvantage ?? []) advantaged.add(a)
  for (const a of advantaged) if (!disadvantaged.has(a)) result[a] = 'advantage'
  for (const a of disadvantaged) if (!advantaged.has(a)) result[a] = 'disadvantage'
  return result
}

/** Same idea as effectiveSkillAdvantage, but for the six saving throws (including Rage's Strength-save advantage while active). */
export function effectiveSavingThrowAdvantage(featIds: string[], activeBuffs: string[] = []): Partial<Record<Ability, 'advantage' | 'disadvantage'>> {
  const result: Partial<Record<Ability, 'advantage' | 'disadvantage'>> = {}
  const advantaged = new Set<Ability>()
  const disadvantaged = new Set<Ability>()
  for (const effect of resolveFeatEffects(featIds)) {
    if (effect.kind === 'savingThrowAdvantage') advantaged.add(effect.ability)
    else if (effect.kind === 'savingThrowDisadvantage') disadvantaged.add(effect.ability)
  }
  for (const id of activeBuffs) for (const a of BUFF_EFFECTS[id]?.savingThrowAdvantage ?? []) advantaged.add(a)
  for (const a of advantaged) if (!disadvantaged.has(a)) result[a] = 'advantage'
  for (const a of disadvantaged) if (!advantaged.has(a)) result[a] = 'disadvantage'
  return result
}

/** A blanket advantage/disadvantage on every attack roll (not tied to a specific weapon/ability) — from a feat, or a currently-active toggle feature/buff (Reckless Attack, Rage doesn't grant this one). Cancels out the same way as the other advantage aggregators if something somehow granted both. */
export function effectiveAttackAdvantage(featIds: string[], activeBuffs: string[] = []): 'advantage' | 'disadvantage' | undefined {
  let advantaged = false
  let disadvantaged = false
  for (const effect of resolveFeatEffects(featIds)) {
    if (effect.kind === 'attackAdvantage') advantaged = true
    else if (effect.kind === 'attackDisadvantage') disadvantaged = true
  }
  for (const id of activeBuffs) if (BUFF_EFFECTS[id]?.attackAdvantage) advantaged = true
  if (advantaged === disadvantaged) return undefined
  return advantaged ? 'advantage' : 'disadvantage'
}

/** Advantage/disadvantage on Initiative rolls specifically (distinct from a blanket Dex-check advantage) — e.g. a feat like the SRD's Alert, if it granted advantage instead of a flat proficiency-bonus add. */
export function effectiveInitiativeAdvantage(featIds: string[]): 'advantage' | 'disadvantage' | undefined {
  let advantaged = false
  let disadvantaged = false
  for (const effect of resolveFeatEffects(featIds)) {
    if (effect.kind === 'initiativeAdvantage') advantaged = true
    else if (effect.kind === 'initiativeDisadvantage') disadvantaged = true
  }
  if (advantaged === disadvantaged) return undefined
  return advantaged ? 'advantage' : 'disadvantage'
}

/** Flat, unconditional AC bonus from taken feats/features — add to computeArmorClassFromEquipment's result. The Defense fighting style is deliberately not modeled through this: its +1 only applies while actually wearing body armor, so computeArmorClassFromEquipment checks for it directly instead of through a flat sum that can't express that condition. */
export function featArmorClassBonus(featIds: string[]): number {
  return resolveFeatEffects(featIds)
    .filter((e): e is Extract<FeatEffect, { kind: 'armorClass' }> => e.kind === 'armorClass')
    .reduce((sum, e) => sum + e.amount, 0)
}

/** Non-numeric rules effects from taken feats (e.g. Grappler's grapple-attack advantage) — surfaced as callouts near Feats on the sheet, not folded into any number. */
export function featNotes(featIds: string[]): { featName: string; text: string }[] {
  const result: { featName: string; text: string }[] = []
  for (const id of featIds) {
    const feat = FEATS.find((f) => f.id === id)
    if (!feat) continue
    for (const effect of feat.effects ?? []) {
      if (effect.kind === 'note') result.push({ featName: feat.name, text: effect.text })
    }
  }
  return result
}

export function subclassesForClass(classId: string): CompendiumSubclass[] {
  return SUBCLASSES.filter((s) => s.classId === classId)
}

/** Real subclass feature content for one class+subclass, levels in `(fromLevel, toLevel]` — used by FeaturesTab.tsx to render a class's subclass-feature cards up to its current level. */
export function subclassFeaturesForLevelUp(
  classId: string,
  subclassId: string,
  fromLevel: number,
  toLevel: number
): CompendiumSubclassFeature[] {
  return SUBCLASS_FEATURES.filter(
    (f) => f.classId === classId && f.subclassId === subclassId && f.level > fromLevel && f.level <= toLevel
  )
}

/** One option within a subclass feature that actually requires a player pick (e.g. Draconic Bloodline's dragon ancestor, Circle of the Land's terrain). `label` is the part after the colon (e.g. "Black - Acid Damage"); `name`/`desc` are the option's own full SRD entry. */
export interface SubclassFeatureOption {
  name: string
  label: string
  desc: string
}

/** A subclass feature at one level that's either a single fixed entry (`kind: 'single'`) or a set of mutually-exclusive named options the player must choose between (`kind: 'choice'`) — some SRD subclass features (Draconic Bloodline's ancestor, Circle of the Land's terrain, a Ranger archetype's sub-features) are written as one entry per option rather than one entry with an embedded choice, so FeaturesTab.tsx needs this grouping to know a pick is required instead of just listing every option as if the character had all of them. */
export type GroupedSubclassFeature =
  | { kind: 'single'; feature: CompendiumSubclassFeature }
  | { kind: 'choice'; level: number; baseName: string; intro?: string; options: SubclassFeatureOption[] }

/**
 * Groups subclassFeaturesForLevelUp's flat rows by (level, name-before-colon).
 * A group with only one row is a normal single feature. A group with 2+ rows
 * is a choice: an entry with no colon in its name (if present) is flavor
 * text shared by every option, not itself a pick; every colon-suffixed entry
 * is one selectable option.
 *
 * "Channel Divinity: X" is the one recurring exception to that heuristic —
 * the SRD writes each Channel Divinity option a subclass grants (Preserve
 * Life, Sacred Weapon, Turn the Unholy, ...) as its own "Channel Divinity:
 * <name>" row, but they're all separately, permanently granted (you pick
 * which one to use each time you activate Channel Divinity, not once at
 * character-build time) — not a Dragon-Ancestor-style mutually exclusive
 * pick. Grouping Devotion's two ("Sacred Weapon" and "Turn the Unholy") by
 * the shared "Channel Divinity" prefix was turning them into exactly that
 * kind of forced either/or choice, silently hiding whichever one wasn't
 * picked. Keying by the *full* name instead guarantees each becomes its own
 * single-row group.
 */
export function groupedSubclassFeaturesForLevelUp(
  classId: string,
  subclassId: string,
  fromLevel: number,
  toLevel: number
): GroupedSubclassFeature[] {
  const flat = subclassFeaturesForLevelUp(classId, subclassId, fromLevel, toLevel)
  const groups = new Map<string, CompendiumSubclassFeature[]>()
  for (const f of flat) {
    const baseName = f.name.split(':')[0].trim()
    const key = baseName === 'Channel Divinity' ? `${f.level}:${f.name}` : `${f.level}:${baseName}`
    const list = groups.get(key) ?? []
    list.push(f)
    groups.set(key, list)
  }
  const result: GroupedSubclassFeature[] = []
  for (const list of groups.values()) {
    if (list.length === 1) {
      result.push({ kind: 'single', feature: list[0] })
      continue
    }
    const intro = list.find((f) => !f.name.includes(':'))
    const options = list
      .filter((f) => f.name.includes(':'))
      .map((f) => ({ name: f.name, label: f.name.split(':').slice(1).join(':').trim(), desc: f.desc }))
    result.push({ kind: 'choice', level: list[0].level, baseName: list[0].name.split(':')[0].trim(), intro: intro?.desc, options })
  }
  return result.sort((a, b) => (a.kind === 'single' ? a.feature.level : a.level) - (b.kind === 'single' ? b.feature.level : b.level))
}

/** True if the character's ability scores meet this feat's prerequisite (always true for a feat with none). `characterLevel` is the ASI slot's level (see FeaturesTab.tsx's AsiSlotChooser) — omit it to skip the level check. */
export function meetsFeatPrerequisite(feat: CompendiumFeat, abilityScores: AbilityScores, characterLevel?: number): boolean {
  if (feat.prerequisiteAbility && abilityScores[feat.prerequisiteAbility.ability] < feat.prerequisiteAbility.minimum) return false
  if (feat.minLevel && characterLevel !== undefined && characterLevel < feat.minLevel) return false
  return true
}

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

/**
 * Builds the full save patch for resolving an ASI-or-feat slot — shared by
 * FeaturesTab.tsx (where the slot lives permanently) and LevelUpPopup.tsx
 * (the level-up shortcut), which used to each have their own copy of this;
 * the popup's copy was a plain `onSave({ asiSlotChoices: [...] })` with none
 * of the feat side-effects below, so choosing Magic Initiate there silently
 * skipped granting its spells and enabling spellcasting. A feat with a
 * `spellChoice` effect (Magic Initiate) needs two extra side effects beyond
 * recording the choice itself: its picked spells become real, castable
 * entries on character.spells (marked `free` so they don't eat into the
 * class's normal known/prepared cap), and if the character had no
 * spellcasting ability at all yet, this is what turns it on automatically.
 */
export function buildAsiSlotResolutionPatch(
  character: { spells: Spell[]; spellcastingAbility: Ability | null; asiSlotChoices: AsiSlotChoice[] },
  entry: Omit<AsiSlotChoice, 'id'>
): Partial<CharacterSheetData> {
  const patch: Partial<CharacterSheetData> = { asiSlotChoices: [...character.asiSlotChoices, { id: crypto.randomUUID(), ...entry }] }
  if (entry.kind === 'feat' && entry.chosenSpellIds?.length) {
    const known = new Set(character.spells.map((s) => s.compendiumId).filter(Boolean))
    const granted: Spell[] = entry.chosenSpellIds
      .filter((id) => !known.has(id))
      .map((id) => getSpellById(id))
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map((s) => ({ id: crypto.randomUUID(), name: s.name, level: s.level, description: '', actionType: 'action', compendiumId: s.id, free: true }))
    patch.spells = [...character.spells, ...granted]
    if (!character.spellcastingAbility && entry.chosenAbility) patch.spellcastingAbility = entry.chosenAbility
  }
  return patch
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
/** Raw per-level spell slot row (index 0 = 1st-level slots, ... index 8 = 9th-level slots) for one class at one level, straight from the SRD table — used by ClassTableTab.tsx to project the full 1-20 progression, not just the character's current level. Empty array for a non-caster or an unrecognized class. */
export function spellSlotsForClassLevel(classId: string, level: number): number[] {
  return SPELL_SLOTS_BY_CLASS_LEVEL[classId]?.[String(level)] ?? []
}

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
/** Spells known at one level for one "known"-caster class (see knownSpellsLimit above for why this only applies to Bard/Sorcerer/Warlock/Ranger) — null if this class/level isn't in the table (non-caster, or a level with no cap). Used by ClassTableTab.tsx to project the full progression. */
export function spellsKnownForClassLevel(classId: string, level: number): number | null {
  return SPELLS_KNOWN_BY_CLASS_LEVEL[classId]?.[String(level)] ?? null
}

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

/** Cantrips known at 1st level, per class — grows by 1 at 4th level and again at 10th (every SRD cantrip-using class follows this same three-tier shape). Paladin and Ranger aren't listed since neither gets cantrips. */
const CANTRIPS_KNOWN_AT_LEVEL_1: Record<string, number> = {
  bard: 2,
  cleric: 3,
  druid: 2,
  sorcerer: 4,
  warlock: 2,
  wizard: 3
}

/** Same shape as knownSpellsLimit, but for cantrips — which every cantrip-using class caps separately from its leveled "spells known"/prepared limit. */
export function cantripsKnownLimit(classes: ClassLevel[]): number | null {
  let total = 0
  let isCantripCaster = false
  for (const c of classes) {
    const cls = CLASSES.find((k) => k.name.toLowerCase() === c.className.toLowerCase())
    if (!cls) continue
    const base = CANTRIPS_KNOWN_AT_LEVEL_1[cls.id]
    if (base === undefined) continue
    isCantripCaster = true
    total += base + (c.level >= 10 ? 2 : c.level >= 4 ? 1 : 0)
  }
  return isCantripCaster ? total : null
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
 *
 * On top of that: any flat, unconditional AC-boosting feat (featArmorClassBonus)
 * always applies, and the Defense fighting style's +1 applies only while
 * actual body armor (Light/Medium/Heavy, not just a shield) is equipped —
 * checked directly here since a flat sum can't express that condition.
 *
 * Barbarian's and Monk's Unarmored Defense are also handled directly here
 * (rather than through a flat sum) since they're conditional the same way
 * Defense is: only while wearing no body armor at all (a shield is still
 * fine for Barbarian, but Monk's version also requires no shield). Passing
 * `classes` lets this add the character's Con (Barbarian) or Wis (Monk)
 * modifier in place of the plain 10 base — if somehow multiclassed into
 * both, the better of the two applies, matching how you'd actually play it.
 */
export function computeArmorClassFromEquipment(
  equipment: EquipmentItem[],
  abilityScores: AbilityScores,
  featIds: string[] = [],
  classes: ClassLevel[] = []
): number {
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
    const hasBarbarian = classes.some((c) => c.className.toLowerCase() === 'barbarian')
    const hasMonk = classes.some((c) => c.className.toLowerCase() === 'monk')
    const barbarianAc = hasBarbarian ? 10 + dexMod + abilityModifier(abilityScores.con) : null
    const monkAc = hasMonk && !shield ? 10 + dexMod + abilityModifier(abilityScores.wis) : null
    base = Math.max(10 + dexMod, barbarianAc ?? -Infinity, monkAc ?? -Infinity)
  }

  const defenseBonus = bodyArmor && featIds.includes('defense') ? 1 : 0
  return base + (shield?.armorClassBase ?? 0) + defenseBonus + featArmorClassBonus(featIds)
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

/**
 * Every currently-equipped weapon, paired with its compendium data — this is
 * what actually populates the Combat tab's Attacks list now, instead of a
 * separate "add a weapon attack" step. Equip the weapon in Inventory and it
 * shows up here automatically; unequip it there and it disappears from here
 * the same way, matching the rest of the sheet's "derived, not stored"
 * features. A custom (non-compendium) attack is unaffected — those stay in
 * character.attacks and are added/edited directly on the Combat tab, since
 * there's no compendium entry to equip for them.
 */
export function weaponAttacksFromEquipment(equipment: EquipmentItem[]): Array<{ item: EquipmentItem; weapon: CompendiumEquipment }> {
  const result: Array<{ item: EquipmentItem; weapon: CompendiumEquipment }> = []
  for (const item of equipment) {
    if (!item.equipped || !item.compendiumId) continue
    const weapon = getEquipmentById(item.compendiumId)
    if (weapon?.category === 'Weapon') result.push({ item, weapon })
  }
  return result
}

/** Every character can always make an unarmed strike — 1 bludgeoning damage, Strength-based, no equipment required (SRD 2014 rule). Not stored, not removable, just always present on the Combat tab alongside whatever's equipped. */
export const UNARMED_STRIKE = {
  name: 'Unarmed Strike',
  damage: '1',
  damageType: 'Bludgeoning',
  description: 'Instead of using a weapon to make a melee weapon attack, you can use an unarmed strike: a punch, kick, headbutt, or similar forceful blow. On a hit, an unarmed strike deals bludgeoning damage equal to 1 + your Strength modifier.'
} as const

/**
 * -10 ft. per the SRD's "wearing armor you lack the Strength for" rule —
 * only ever from *equipped* armor, and only armor that actually has a
 * strMinimum (light/medium armor never do).
 */
export function armorSpeedPenalty(equipment: EquipmentItem[], abilityScores: AbilityScores): number {
  const equippedArmor = equipment.filter((i) => i.equipped && i.compendiumId).map((i) => getEquipmentById(i.compendiumId!))
  const underStrength = equippedArmor.some((a) => a?.category === 'Armor' && a.strMinimum && abilityScores.str < a.strMinimum)
  return underStrength ? -10 : 0
}

/** Monk's Unarmored Movement speed bonus ladder — +10 ft at 2nd level, growing to +30 ft by 18th. Requires no armor AND no shield equipped (unlike Barbarian/Monk's Unarmored Defense, which only cares about body armor for the Barbarian). */
function monkUnarmoredMovementBonus(level: number, equipment: EquipmentItem[]): number {
  const wearingAnyArmorOrShield = equipment.some((i) => i.equipped && i.compendiumId && getEquipmentById(i.compendiumId)?.category === 'Armor')
  if (wearingAnyArmorOrShield) return 0
  if (level >= 18) return 30
  if (level >= 14) return 25
  if (level >= 10) return 20
  if (level >= 6) return 15
  if (level >= 2) return 10
  return 0
}

/** Every class feature that adds a flat speed bonus, summed — currently just Monk's Unarmored Movement, but kept as its own aggregator (parallel to featSpeedBonus/armorSpeedPenalty) so a future class feature with the same shape only needs a branch here, not a new call site in OverviewTab.tsx. */
export function classFeatureSpeedBonus(classes: ClassLevel[], equipment: EquipmentItem[]): number {
  let bonus = 0
  for (const c of classes) {
    if (c.className.toLowerCase() === 'monk') bonus += monkUnarmoredMovementBonus(c.level, equipment)
  }
  return bonus
}

/** True if any currently-equipped armor imposes Stealth disadvantage — surfaced as a small "D" tag on the Stealth skill row in Overview. */
export function armorStealthDisadvantage(equipment: EquipmentItem[]): boolean {
  return equipment
    .filter((i) => i.equipped && i.compendiumId)
    .map((i) => getEquipmentById(i.compendiumId!))
    .some((a) => a?.category === 'Armor' && a.stealthDisadvantage)
}

/**
 * A single, simplified default gear package per class — the SRD actually
 * offers a choice of 2-4 equivalent packages (e.g. a Fighter picks chain
 * mail OR leather armor + a longbow), which this doesn't model; it seeds one
 * reasonable option so a new character isn't starting with an empty
 * inventory, and every item is fully editable/removable afterward like
 * anything else on the Inventory tab.
 */
const STARTING_EQUIPMENT: Record<string, { id: string; quantity: number; equip?: boolean }[]> = {
  barbarian: [
    { id: 'greataxe', quantity: 1, equip: true },
    { id: 'handaxe', quantity: 2 },
    { id: 'explorers-pack', quantity: 1 }
  ],
  bard: [
    { id: 'rapier', quantity: 1, equip: true },
    { id: 'leather-armor', quantity: 1, equip: true },
    { id: 'dagger', quantity: 1 },
    { id: 'lute', quantity: 1 },
    { id: 'diplomats-pack', quantity: 1 }
  ],
  cleric: [
    { id: 'mace', quantity: 1, equip: true },
    { id: 'scale-mail', quantity: 1, equip: true },
    { id: 'shield', quantity: 1, equip: true },
    { id: 'priests-pack', quantity: 1 }
  ],
  druid: [
    { id: 'scimitar', quantity: 1, equip: true },
    { id: 'leather-armor', quantity: 1, equip: true },
    { id: 'shield', quantity: 1, equip: true },
    { id: 'explorers-pack', quantity: 1 }
  ],
  fighter: [
    { id: 'chain-mail', quantity: 1, equip: true },
    { id: 'longsword', quantity: 1, equip: true },
    { id: 'shield', quantity: 1, equip: true },
    { id: 'longbow', quantity: 1 },
    { id: 'arrow', quantity: 20 },
    { id: 'explorers-pack', quantity: 1 }
  ],
  monk: [
    { id: 'shortsword', quantity: 1, equip: true },
    { id: 'dart', quantity: 10 },
    { id: 'dungeoneers-pack', quantity: 1 }
  ],
  paladin: [
    { id: 'longsword', quantity: 1, equip: true },
    { id: 'shield', quantity: 1, equip: true },
    { id: 'chain-mail', quantity: 1, equip: true },
    { id: 'priests-pack', quantity: 1 }
  ],
  ranger: [
    { id: 'longbow', quantity: 1, equip: true },
    { id: 'arrow', quantity: 20 },
    { id: 'shortsword', quantity: 2, equip: true },
    { id: 'leather-armor', quantity: 1, equip: true },
    { id: 'explorers-pack', quantity: 1 }
  ],
  rogue: [
    { id: 'rapier', quantity: 1, equip: true },
    { id: 'shortbow', quantity: 1 },
    { id: 'arrow', quantity: 20 },
    { id: 'leather-armor', quantity: 1, equip: true },
    { id: 'thieves-tools', quantity: 1 },
    { id: 'burglars-pack', quantity: 1 }
  ],
  sorcerer: [
    { id: 'dagger', quantity: 2, equip: true },
    { id: 'component-pouch', quantity: 1 },
    { id: 'explorers-pack', quantity: 1 }
  ],
  warlock: [
    { id: 'crossbow-light', quantity: 1, equip: true },
    { id: 'crossbow-bolt', quantity: 20 },
    { id: 'component-pouch', quantity: 1 },
    { id: 'leather-armor', quantity: 1, equip: true },
    { id: 'dagger', quantity: 2 },
    { id: 'scholars-pack', quantity: 1 }
  ],
  wizard: [
    { id: 'quarterstaff', quantity: 1, equip: true },
    { id: 'component-pouch', quantity: 1 },
    { id: 'spellbook', quantity: 1 },
    { id: 'scholars-pack', quantity: 1 }
  ]
}

/** Builds EquipmentItem rows for a class's default starting gear (see STARTING_EQUIPMENT) — used by the character creation wizard so a new character isn't starting empty-handed. Unrecognized classId returns []. */
export function startingEquipmentFor(classId: string): EquipmentItem[] {
  const pkg = STARTING_EQUIPMENT[classId] ?? []
  return pkg
    .map(({ id, quantity, equip }): EquipmentItem | null => {
      const item = getEquipmentById(id)
      if (!item) return null
      return { id: crypto.randomUUID(), name: item.name, quantity, weight: item.weight ?? 0, notes: '', compendiumId: item.id, equipped: !!equip }
    })
    .filter((i): i is EquipmentItem => !!i)
}

/** A cantrip that deals damage, whether via an attack roll (attackType set — Fire Bolt) or a saving throw (no attackType, but the description names a damage die and type — Acid Splash, Poison Spray). Broader than just `attackType` so the Combat tab's Attacks list reads as "offensive cantrips", matching how a player actually thinks about them, rather than strictly "requires an attack roll" per the SRD's own narrower rules distinction. */
const DAMAGE_DICE_PATTERN = /\d+d\d+\s+\w+\s+damage/i
export function spellDealsDamage(spell: CompendiumSpell): boolean {
  return !!spell.attackType || DAMAGE_DICE_PATTERN.test(spell.description)
}

/**
 * SRD 2014 Circle of the Land spells — one of the "always have these
 * prepared" spell lists granted at 3rd/5th/7th/9th level once a terrain is
 * chosen (see the "Circle of the Land: <Terrain>" choice in
 * srd-subclass-features.json, resolved the same way Draconic Bloodline's
 * dragon ancestor is). Every spell named here already exists in
 * srd-spells.json. Not itself consumed automatically anywhere — see
 * FeaturesTab.tsx's CircleSpellsGrant, which surfaces an explicit "+ Add"
 * once a threshold level is reached and the terrain is known, writing the
 * matching Spell rows (marked `free: true`) into character.spells.
 */
export const CIRCLE_OF_THE_LAND_SPELLS: Record<string, Record<number, string[]>> = {
  Arctic: { 3: ['hold-person', 'spike-growth'], 5: ['sleet-storm', 'slow'], 7: ['freedom-of-movement', 'ice-storm'], 9: ['commune-with-nature', 'cone-of-cold'] },
  Coast: { 3: ['mirror-image', 'misty-step'], 5: ['water-breathing', 'water-walk'], 7: ['control-water', 'freedom-of-movement'], 9: ['conjure-elemental', 'scrying'] },
  Desert: { 3: ['blur', 'silence'], 5: ['create-food-and-water', 'protection-from-energy'], 7: ['blight', 'hallucinatory-terrain'], 9: ['insect-plague', 'wall-of-stone'] },
  Forest: { 3: ['barkskin', 'spider-climb'], 5: ['call-lightning', 'plant-growth'], 7: ['divination', 'freedom-of-movement'], 9: ['commune-with-nature', 'tree-stride'] },
  Grassland: { 3: ['invisibility', 'pass-without-trace'], 5: ['daylight', 'haste'], 7: ['divination', 'freedom-of-movement'], 9: ['dream', 'insect-plague'] },
  Mountain: { 3: ['spider-climb', 'spike-growth'], 5: ['lightning-bolt', 'meld-into-stone'], 7: ['stone-shape', 'stoneskin'], 9: ['passwall', 'wall-of-stone'] },
  Swamp: { 3: ['acid-arrow', 'web'], 5: ['stinking-cloud', 'water-walk'], 7: ['freedom-of-movement', 'locate-creature'], 9: ['insect-plague', 'scrying'] }
}

/** Every circle-spell level threshold (3/5/7/9) reached at `level` for the given terrain, each with its two granted spell ids — used by FeaturesTab.tsx to know which "+ Add Circle Spells" prompts (or resolved chips) to show. */
export function circleSpellLevelsUpToLevel(terrain: string, level: number): Array<{ level: number; spellIds: string[] }> {
  const byLevel = CIRCLE_OF_THE_LAND_SPELLS[terrain]
  if (!byLevel) return []
  return Object.entries(byLevel)
    .map(([lvl, spellIds]) => ({ level: Number(lvl), spellIds }))
    .filter((entry) => entry.level <= level)
    .sort((a, b) => a.level - b.level)
}

export function spellLevelLabel(level: number): string {
  if (level === 0) return 'Cantrip'
  const suffix = level === 1 ? 'st' : level === 2 ? 'nd' : level === 3 ? 'rd' : 'th'
  return `${level}${suffix}-level`
}
