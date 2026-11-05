// The one entry point the app uses to get a character sheet's derived
// numbers: CharacterSheetData → normalizeSheet (format v2 ids) →
// legacySheetToBuild → deriveCharacter, with whichever content packs are
// active. Every tab, the initiative tracker and the force-roll prompt read
// from this instead of the old effective*/compute* helpers, so the sheet
// shows exactly what the content engine calculates (docs/homebrew-engine.md,
// phases 3–5).

import { abilityModifier, type Ability, type AbilityScores, type CharacterSheetData, type SkillName, type Spell } from '../dnd5e'
import { ABILITY_IDS, deriveCharacter, type CharacterBuild, type DerivedCharacter, type RollMode } from './engine'
import { legacySheetToBuild } from './legacy'
import { normalizeSheet, registryForPacks } from './migrate'
import type { Registry } from './registry'
import type { ContentPack, SpellDef } from './schema'
import { srdPack } from './srd'
import { packKey } from './packKey'
import { SRD_PACK_ID, skillId } from './srd/common'

export interface DerivedSheet {
  derived: DerivedCharacter
  build: CharacterBuild
  registry: Registry
}

// ---------------------------------------------------------------------------
// Active content packs, and each character's own
//
// Which homebrew packs apply right now, on top of the SRD: inside a campaign
// (DM hosting it, a joined session, or an offline snapshot) exactly the
// packs the DM enabled; outside one, the whole personal library. That's what
// the Codex, encounter tools and a sheet from before per-character packs use.
//
// A character sheet uses its own packs (sheet.packIds), taken from the pack
// pool: every pack this device can use (the library, plus the open
// campaign's). So two characters never mix packs, whatever's active. The
// renderer sets both (see usePacks.ts); everything that derives a sheet
// reads them, so no caller has to thread packs through.

let activePacks: ContentPack[] = []
let activeOnlyKey = ''
let packPool: ContentPack[] = []
let poolKey = ''
let activeKey = ''
const listeners = new Set<() => void>()

// Content keys, not just id@version: a pack saved from the Workshop can change without a version bump.
const keyOf = (packs: ContentPack[]): string => packs.map(packKey).join(',')

/** Sets the active homebrew packs (the SRD is always included). A no-op if nothing changed. */
export function setActivePacks(packs: ContentPack[]): void {
  const extra = packs.filter((p) => p.id !== SRD_PACK_ID)
  const key = keyOf(extra)
  if (key === activeOnlyKey) return
  activePacks = extra
  activeOnlyKey = key
  changed()
}

/** Sets every pack a character sheet can take its own packs from. A no-op if nothing changed. */
export function setPackPool(packs: ContentPack[]): void {
  const seen = new Set<string>()
  const pool = packs.filter((p) => p.id !== SRD_PACK_ID && !seen.has(p.id) && !!seen.add(p.id))
  const key = keyOf(pool)
  if (key === poolKey) return
  packPool = pool
  poolKey = key
  changed()
}

export function getPackPool(): ContentPack[] {
  return packPool
}

function changed(): void {
  activeKey = `${activeOnlyKey}|${poolKey}`
  for (const listener of listeners) listener()
}

/** `ids` and every pack they depend on, as found in `pool` (in pool order), plus the ids not found. */
export function packsWithDependencies(ids: string[], pool: ContentPack[]): { packs: ContentPack[]; missing: string[] } {
  const wanted = new Set<string>()
  const missing: string[] = []
  const add = (id: string): void => {
    if (id === SRD_PACK_ID || wanted.has(id)) return
    const pack = pool.find((p) => p.id === id)
    if (!pack) {
      if (!missing.includes(id)) missing.push(id)
      return
    }
    wanted.add(id)
    for (const dep of pack.dependsOn) add(dep)
  }
  for (const id of ids) add(id)
  return { packs: pool.filter((p) => wanted.has(p.id)), missing }
}

/** The homebrew packs a sheet derives with: its own (and what they need) from the pool, or the active ones for a sheet without a pack list. */
export function packsForSheet(sheet: CharacterSheetData): { packs: ContentPack[]; missing: string[] } {
  if (!sheet.packIds) return { packs: activePacks, missing: [] }
  // The active packs count as pool too: a campaign's packs are there even before the pool is first set.
  return packsWithDependencies(sheet.packIds, [...packPool, ...activePacks.filter((a) => !packPool.some((p) => p.id === a.id))])
}

/**
 * The packs a sheet without a pack list already uses: the ones its class,
 * subclass, species, background, picks and pack spells come from (as `pool`
 * resolves them — an override counts as the pack that overrides). Every other
 * sheet comes back unchanged.
 */
export function withDetectedPackIds<T extends CharacterSheetData>(sheet: T, givenPool: ContentPack[]): T {
  if (sheet.packIds) return sheet
  const pool = givenPool.filter((p) => p.id !== SRD_PACK_ID)
  const packs = [srdPack(), ...pool]
  // The ids the sheet saved say where things came from. Only a name with no id yet is looked up — in the SRD first,
  // so a plain "Fighter" isn't credited to whichever pack also has one.
  const bySrd = normalizeSheet(sheet, [srdPack()])
  const byPool = normalizeSheet(sheet, packs)
  const normalized = {
    ...sheet,
    classes: sheet.classes.map((c, i) => ({
      ...c,
      classId: c.classId ?? bySrd.classes[i]?.classId ?? byPool.classes[i]?.classId,
      subclassId: c.subclassId ?? bySrd.classes[i]?.subclassId ?? byPool.classes[i]?.subclassId
    })),
    speciesId: sheet.speciesId ?? bySrd.speciesId ?? byPool.speciesId,
    backgroundId: sheet.backgroundId ?? bySrd.backgroundId ?? byPool.backgroundId
  }
  const registry = registryForPacks(packs)
  const found = new Set<string>()
  const note = (kind: Parameters<Registry['get']>[0], id: string | undefined): void => {
    if (!id || !id.includes(':')) return
    const packId = registry.get(kind, id)?.packId ?? id.slice(0, id.indexOf(':'))
    if (packId !== SRD_PACK_ID) found.add(packId)
  }
  for (const c of normalized.classes) {
    note('classes', c.classId)
    note('subclasses', c.subclassId)
  }
  note('species', normalized.speciesId)
  note('backgrounds', normalized.backgroundId)
  for (const s of normalized.spells) note('spells', s.packSpellId)
  // Picks are ids too ("my-pack:great-weapon-master"); anything that names a known pack counts.
  for (const picks of Object.values(normalized.choices ?? {})) for (const id of picks) if (id.includes(':') && pool.some((p) => id.startsWith(`${p.id}:`))) found.add(id.slice(0, id.indexOf(':')))
  for (const id of Object.keys(normalized.packVersions ?? {})) if (id !== SRD_PACK_ID && pool.some((p) => p.id === id)) found.add(id)
  // A pack that isn't here any more stays on the list, so the sheet can say it's missing rather than quietly lose it.
  return { ...sheet, packIds: [...pool.filter((p) => found.has(p.id)).map((p) => p.id), ...[...found].filter((id) => !pool.some((p) => p.id === id))] }
}

export function getActivePacks(): ContentPack[] {
  return activePacks
}

/** A string that changes whenever the active packs do — for React (useSyncExternalStore) and caches. */
export function getActivePacksKey(): string {
  return activeKey
}

export function subscribeActivePacks(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * A stored sheet brought up to date on its own packs, taken from `pool` (every
 * pack the machine knows): an older sheet gets its pack list filled in first.
 * What the main process does on every character read and write.
 */
export function normalizeWithOwnPacks<T extends CharacterSheetData>(sheet: T, pool: ContentPack[]): T {
  const withIds = withDetectedPackIds(sheet, pool)
  return normalizeSheet(withIds, [srdPack(), ...packsWithDependencies(withIds.packIds ?? [], pool).packs])
}

/** normalizeSheet against the SRD plus the sheet's packs — so a homebrew class added since the last save already resolves to its pack id. */
export function normalizeForActivePacks<T extends CharacterSheetData>(sheet: T): T {
  return normalizeSheet(sheet, [srdPack(), ...packsForSheet(sheet).packs])
}

const derivedCache = new WeakMap<CharacterSheetData, { key: string; result: DerivedSheet }>()

/**
 * Derived numbers for a sheet with the active packs. Cached per sheet
 * object (and pack set), so calling it repeatedly for the same unchanged
 * sheet is free. Normalizes first, so a sheet from an older app version (or
 * a DM's copy of one) derives the same as a migrated one; the adapter's
 * workarounds (e.g. a class from a pack that isn't enabled) are added to
 * the diagnostics.
 */
export function deriveSheet(sheet: CharacterSheetData): DerivedSheet {
  const cached = derivedCache.get(sheet)
  if (cached && cached.key === activeKey) return cached.result
  const srd = srdPack()
  const own = packsForSheet(sheet)
  const { build, packs, warnings } = legacySheetToBuild(normalizeSheet(sheet, [srd, ...own.packs]), { packs: own.packs }, srd)
  const registry = registryForPacks(packs)
  // keepEvaluator: the sheet works out spell damage per slot level (spellNumbers) from the same character.
  const derived = deriveCharacter(build, registry, { keepEvaluator: true })
  for (const message of warnings) derived.diagnostics.push({ severity: 'warning', message })
  for (const id of own.missing) derived.diagnostics.push({ severity: 'warning', message: `This character uses the "${id}" content pack, which isn't on this device (or in this campaign).` })
  const result = { derived, build, registry }
  derivedCache.set(sheet, { key: activeKey, result })
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

/** A content pack's spell as a sheet spell (no id yet) — every rules field copied across, so it reads the same as an SRD one. */
export function sheetSpellFromPack(fullId: string, def: SpellDef): Omit<Spell, 'id'> {
  return {
    name: def.name,
    level: def.level,
    description: def.description,
    actionType: 'action',
    school: def.school,
    castingTime: def.castingTime,
    range: def.range,
    components: def.components,
    duration: def.duration,
    concentration: def.concentration,
    ritual: def.ritual,
    ...(def.higherLevel ? { higherLevel: def.higherLevel } : {}),
    packSpellId: fullId
  }
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
