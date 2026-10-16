// The one entry point the app uses to get a character sheet's derived
// numbers: today's CharacterSheetData → legacySheetToBuild → deriveCharacter.
// Every tab, the initiative tracker and the force-roll prompt read from
// this instead of the old effective*/compute* helpers, so the sheet shows
// exactly what the content engine calculates (docs/homebrew-engine.md,
// phase 3).

import { abilityModifier, type Ability, type AbilityScores, type CharacterSheetData, type SkillName } from '../dnd5e'
import { ABILITY_IDS, deriveCharacter, type CharacterBuild, type DerivedCharacter, type RollMode } from './engine'
import { legacySheetToBuild } from './legacy'
import { buildRegistry, type Registry } from './registry'
import type { ContentPack } from './schema'
import { skillId } from './srd/common'

export interface DerivedSheet {
  derived: DerivedCharacter
  build: CharacterBuild
  registry: Registry
}

// Building a registry is the expensive part, and the pack list only changes
// when a sheet gains or loses an unrecognised class name — key the cache on
// that instead of on pack object identity (the adapter generates a fresh
// homebrew pack object every call).
const registryCache = new Map<string, Registry>()

function registryFor(packs: ContentPack[]): Registry {
  const key = packs.map((p) => (p.id === 'legacy-homebrew' ? `${p.id}:${p.classes.map((c) => c.name).join('|')}` : p.id)).join(',')
  let registry = registryCache.get(key)
  if (!registry) {
    if (registryCache.size > 50) registryCache.clear()
    registry = buildRegistry(packs)
    registryCache.set(key, registry)
  }
  return registry
}

const derivedCache = new WeakMap<CharacterSheetData, DerivedSheet>()

/** Derived numbers for a sheet. Cached per sheet object, so calling it repeatedly for the same (unchanged) sheet is free. */
export function deriveSheet(sheet: CharacterSheetData): DerivedSheet {
  const cached = derivedCache.get(sheet)
  if (cached) return cached
  const { build, packs } = legacySheetToBuild(sheet)
  const registry = registryFor(packs)
  const result = { derived: deriveCharacter(build, registry), build, registry }
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
