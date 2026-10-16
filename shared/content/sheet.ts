// The one entry point the app uses to get a character sheet's derived
// numbers: CharacterSheetData → normalizeSheet (format v2 ids) →
// legacySheetToBuild → deriveCharacter. Every tab, the initiative tracker
// and the force-roll prompt read from this instead of the old
// effective*/compute* helpers, so the sheet shows exactly what the content
// engine calculates (docs/homebrew-engine.md, phases 3–4).

import { abilityModifier, type Ability, type AbilityScores, type CharacterSheetData, type SkillName, type Spell } from '../dnd5e'
import { ABILITY_IDS, deriveCharacter, type CharacterBuild, type DerivedCharacter, type RollMode } from './engine'
import { legacySheetToBuild } from './legacy'
import { normalizeSheet, registryForPacks } from './migrate'
import type { Registry } from './registry'
import { SRD_PACK_ID, skillId } from './srd/common'

export interface DerivedSheet {
  derived: DerivedCharacter
  build: CharacterBuild
  registry: Registry
}

const derivedCache = new WeakMap<CharacterSheetData, DerivedSheet>()

/**
 * Derived numbers for a sheet. Cached per sheet object, so calling it
 * repeatedly for the same (unchanged) sheet is free. Normalizes first, so a
 * sheet from an older app version (or a DM's copy of one) derives the same
 * as a migrated one; the adapter's workarounds (e.g. a class from a pack
 * that isn't enabled) are added to the diagnostics.
 */
export function deriveSheet(sheet: CharacterSheetData): DerivedSheet {
  const cached = derivedCache.get(sheet)
  if (cached) return cached
  const { build, packs, warnings } = legacySheetToBuild(normalizeSheet(sheet))
  const registry = registryForPacks(packs)
  const derived = deriveCharacter(build, registry)
  for (const message of warnings) derived.diagnostics.push({ severity: 'warning', message })
  const result = { derived, build, registry }
  derivedCache.set(sheet, result)
  return result
}

// ---------------------------------------------------------------------------
// Small readers so callers can keep using the legacy keys (skill display
// names, ability ids) they already have.

export function effectiveScores(derived: DerivedCharacter): AbilityScores {
  const scores = {} as AbilityScores
  for (const a of ABILITY_IDS) scores[a] = derived.abilities[a].score
  return scores
}

export function abilityMod(derived: DerivedCharacter, ability: Ability): number {
  return derived.abilities[ability]?.mod ?? abilityModifier(10)
}

export function skillOf(derived: DerivedCharacter, skill: SkillName): DerivedCharacter['skills'][string] | undefined {
  return derived.skills[skillId(skill)]
}

/** Proficient/expertise as the sheet's skill dots show it (half proficiency isn't shown as a dot). */
export function skillProficiencyOf(derived: DerivedCharacter, skill: SkillName): 'proficient' | 'expertise' | undefined {
  const p = skillOf(derived, skill)?.proficiency
  return p === 'proficient' || p === 'expertise' ? p : undefined
}

export function skillModeOf(derived: DerivedCharacter, skill: SkillName): RollMode | undefined {
  return skillOf(derived, skill)?.mode
}

/** Resource ids that refill on this rest. A long rest refills short- and dawn-recharge resources too. */
export function resourcesRefilledBy(derived: DerivedCharacter, rest: 'short' | 'long'): string[] {
  const kinds = rest === 'short' ? ['short'] : ['short', 'long', 'dawn']
  return derived.resources.filter((r) => kinds.includes(r.recharge)).map((r) => r.id)
}

/** A spell the character knows, as the spell lists show it: one stored on the sheet, or one the engine grants on its own. */
export type KnownSpell = Spell & { grantedBy?: string }

/**
 * Every spell the character has: the ones stored on the sheet, plus spells
 * the content engine grants that aren't stored (Circle Spells, a lineage's
 * spells, a homebrew feature) — those are marked with `grantedBy` and an id
 * of "granted:<spell id>". The Spells tab and the Actions/Reactions lists
 * all read this, so a granted Fire Bolt shows (and casts) everywhere.
 */
export function knownSpells(stored: Spell[], { derived, registry }: Pick<DerivedSheet, 'derived' | 'registry'>): KnownSpell[] {
  const storedIds = new Set(stored.map((s) => s.compendiumId).filter(Boolean))
  const granted: KnownSpell[] = []
  for (const g of derived.spellcasting.granted) {
    const isSrd = g.spellId.startsWith(`${SRD_PACK_ID}:`)
    const localId = g.spellId.slice(g.spellId.indexOf(':') + 1)
    const def = registry.get('spells', g.spellId)?.def
    if (!def || (isSrd && storedIds.has(localId)) || granted.some((x) => x.id === `granted:${g.spellId}`)) continue
    granted.push({
      id: `granted:${g.spellId}`,
      name: def.name,
      level: def.level,
      description: def.description,
      school: def.school,
      castingTime: def.castingTime,
      range: def.range,
      components: def.components,
      duration: def.duration,
      concentration: def.concentration,
      ritual: def.ritual,
      ...(def.higherLevel ? { higherLevel: def.higherLevel } : {}),
      ...(isSrd ? { compendiumId: localId } : {}),
      free: true,
      grantedBy: g.source
    })
  }
  return [...stored, ...granted]
}
