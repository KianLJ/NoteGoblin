// Sheet format v2: fills in content-pack ids next to the name-based fields
// the UI (and older app versions) still use, and records which pack
// versions those ids point into. See docs/homebrew-engine.md, phase 4.
//
// Rules:
//   - Additive only. Names, legacy pick fields and anything this module
//     doesn't know about are never removed or rewritten, so a sheet keeps
//     working in older app versions and the migration can always be redone.
//   - Idempotent, and returns the *same object* when nothing changes — every
//     read can run it (deriveSheet's per-sheet cache depends on identity).
//   - Names win. The UI still changes classes/species/backgrounds by name,
//     so an id that no longer matches its name is re-resolved from the name.
//     The one exception: an id into a pack that isn't enabled is kept (its
//     name can't be checked), so disabling a homebrew pack never loses it.

import type { CharacterSheetData, ClassLevel } from '../dnd5e'
import { buildRegistry, type Registered, type Registry } from './registry'
import type { ContentPack } from './schema'
import { srdPack } from './srd'

export const CURRENT_SHEET_VERSION = 2

const lower = (s: string | undefined): string => (s ?? '').trim().toLowerCase()

const registryCache = new Map<string, Registry>()

/** The registry for a pack list — cached by pack id + version, since the same few packs are used for every sheet. */
export function registryForPacks(packs: ContentPack[]): Registry {
  const key = packs.map((p) => `${p.id}@${p.version}`).join(',')
  let registry = registryCache.get(key)
  if (!registry) {
    if (registryCache.size > 50) registryCache.clear()
    registry = buildRegistry(packs)
    registryCache.set(key, registry)
  }
  return registry
}

function packIdOf(fullId: string): string {
  const i = fullId.indexOf(':')
  return i === -1 ? '' : fullId.slice(0, i)
}

/**
 * Keeps `currentId` if it still names an entry called `name` (or points into
 * a pack that isn't enabled while `name` matches nothing enabled); otherwise
 * resolves `name` afresh. Undefined when nothing matches — a custom name.
 */
function resolveId<T extends { name: string }>(
  registry: Registry,
  entries: Registered<T>[],
  currentId: string | undefined,
  name: string,
  accept: (e: Registered<T>) => boolean = () => true
): string | undefined {
  const byName = lower(name) ? entries.find((e) => lower(e.def.name) === lower(name) && accept(e)) : undefined
  if (currentId) {
    const current = entries.find((e) => e.fullId === currentId)
    if (current && accept(current) && (lower(current.def.name) === lower(name) || !lower(name))) return currentId
    const packEnabled = registry.packs.some((p) => p.id === packIdOf(currentId))
    if (!current && !packEnabled && !byName && lower(name)) return currentId
  }
  return byName?.fullId
}

function sameStrings(a: Record<string, string> | undefined, b: Record<string, string>): boolean {
  const ak = Object.keys(a ?? {})
  return ak.length === Object.keys(b).length && ak.every((k) => a![k] === b[k])
}

/**
 * Brings a sheet up to format v2 against the given packs (the SRD by
 * default). Safe to call on every read; see the module comment.
 */
export function normalizeSheet<T extends CharacterSheetData>(sheet: T, packs: ContentPack[] = [srdPack()]): T {
  const registry = registryForPacks(packs)
  const allClasses = registry.all('classes')
  const allSubclasses = registry.all('subclasses')

  let classesChanged = false
  const classes: ClassLevel[] = sheet.classes.map((c) => {
    const classId = resolveId(registry, allClasses, c.classId, c.className)
    const subclassName = c.subclass ?? ''
    const belongsToClass = (s: Registered<{ name: string; classId: string }>): boolean =>
      !!classId && (s.def.classId === classId || `${s.packId}:${s.def.classId}` === classId || s.def.classId === classId.split(':')[1])
    // Legacy sheets store the subclass as either its id ("berserker") or its name.
    const subclassById = subclassName ? allSubclasses.find((s) => s.def.id === subclassName && belongsToClass(s)) : undefined
    const subclassId = subclassById
      ? subclassById.fullId
      : resolveId(registry, allSubclasses, c.subclassId, subclassName, belongsToClass)
    if (classId === c.classId && subclassId === c.subclassId) return c
    classesChanged = true
    const next: ClassLevel = { ...c }
    if (classId) next.classId = classId
    else delete next.classId
    if (subclassId) next.subclassId = subclassId
    else delete next.subclassId
    return next
  })

  const speciesId = resolveId(registry, registry.all('species'), sheet.speciesId, sheet.race)
  const backgroundId = resolveId(registry, registry.all('backgrounds'), sheet.backgroundId, sheet.background)

  // The version of every pack an id points into, as first seen. A version already recorded is kept even when the
  // enabled pack has moved on — that difference is what changedPacks() reports, until acknowledgePackVersions().
  const packVersions: Record<string, string> = {}
  const referenced = [...classes.flatMap((c) => [c.classId, c.subclassId]), speciesId, backgroundId].filter((id): id is string => !!id)
  for (const id of referenced) {
    const packId = packIdOf(id)
    const seen = sheet.packVersions?.[packId]
    const version = seen ?? registry.packs.find((p) => p.id === packId)?.version
    if (version) packVersions[packId] = version
  }

  const unchanged =
    !classesChanged &&
    speciesId === sheet.speciesId &&
    backgroundId === sheet.backgroundId &&
    sameStrings(sheet.packVersions, packVersions) &&
    sheet.sheetVersion === CURRENT_SHEET_VERSION
  if (unchanged) return sheet

  const next: T = { ...sheet, sheetVersion: CURRENT_SHEET_VERSION, classes: classesChanged ? classes : sheet.classes, packVersions }
  if (speciesId) next.speciesId = speciesId
  else delete next.speciesId
  if (backgroundId) next.backgroundId = backgroundId
  else delete next.backgroundId
  return next
}

/** Packs a sheet's ids point into that aren't in `packs`, with the version the sheet last saw. */
export function missingPacks(sheet: CharacterSheetData, packs: ContentPack[]): { packId: string; version?: string }[] {
  const enabled = new Set(packs.map((p) => p.id))
  const ids = [...sheet.classes.flatMap((c) => [c.classId, c.subclassId]), sheet.speciesId, sheet.backgroundId].filter((id): id is string => !!id)
  const missing = [...new Set(ids.map(packIdOf))].filter((p) => p && !enabled.has(p))
  return missing.map((packId) => ({ packId, ...(sheet.packVersions?.[packId] ? { version: sheet.packVersions[packId] } : {}) }))
}

/** A patch recording the enabled packs' current versions as seen — call when the player accepts a pack update. */
export function acknowledgePackVersions(sheet: CharacterSheetData, packs: ContentPack[]): Pick<CharacterSheetData, 'packVersions'> {
  const packVersions = { ...sheet.packVersions }
  for (const p of packs) if (packVersions[p.id] !== undefined) packVersions[p.id] = p.version
  return { packVersions }
}

/** Packs that are enabled but at a different version than the sheet last saw. */
export function changedPacks(sheet: CharacterSheetData, packs: ContentPack[]): { packId: string; from: string; to: string }[] {
  return packs.flatMap((p) => {
    const seen = sheet.packVersions?.[p.id]
    return seen && seen !== p.version ? [{ packId: p.id, from: seen, to: p.version }] : []
  })
}
