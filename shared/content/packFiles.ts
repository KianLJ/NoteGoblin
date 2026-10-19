// Content packs as files and stored rows: reading an imported .ngpack.json,
// writing one for export, and the rules for enabling/disabling packs in a
// campaign. Pure functions — the main process (storage, dialogs) and the
// renderer (library/campaign UI) both use them. See docs/homebrew-engine.md,
// phase 5.

import { PACK_FORMAT_VERSION, contentPackSchema, type ContentPack } from './schema'
import { SRD_PACK_ID, srdPack } from './srd'
import { validatePack, type PackIssue } from './validate'

export const PACK_FILE_EXTENSION = '.ngpack.json'

export type PackFileResult = { ok: true; pack: ContentPack; issues: PackIssue[] } | { ok: false; issues: PackIssue[] }

/**
 * Reads an imported pack file's text into a validated pack. `available` are
 * the packs it may depend on (the SRD is always included) — its references
 * into them are checked too. Warnings don't block an import; errors do.
 */
export function readPackFile(text: string, available: ContentPack[] = []): PackFileResult {
  let json: unknown
  try {
    json = JSON.parse(text.replace(/^﻿/, ''))
  } catch (e) {
    return { ok: false, issues: [{ severity: 'error', path: '', message: `Not a valid JSON file: ${e instanceof Error ? e.message : String(e)}` }] }
  }
  if (json && typeof json === 'object' && 'formatVersion' in json && (json as { formatVersion: unknown }).formatVersion !== PACK_FORMAT_VERSION) {
    return {
      ok: false,
      issues: [{ severity: 'error', path: 'formatVersion', message: `This pack uses format version ${String((json as { formatVersion: unknown }).formatVersion)}; this version of NoteGoblin reads version ${PACK_FORMAT_VERSION}. Update the app to import it.` }]
    }
  }
  // Checked before validating, since a copy of the SRD would otherwise just collide with the real one.
  const raw = json as { id?: unknown; builtIn?: unknown } | null
  if (raw && (raw.id === SRD_PACK_ID || raw.builtIn === true)) {
    return { ok: false, issues: [{ severity: 'error', path: 'id', message: 'Built-in packs (like the SRD) are part of the app and can’t be imported.' }] }
  }
  const result = validatePack(json, withSrd(available))
  if (!result.ok) return { ok: false, issues: result.issues }
  return { ok: true, pack: result.pack, issues: result.issues }
}

/** The pack as an export file's text — stable key order (as stored), pretty-printed so it diffs well. */
export function writePackFile(pack: ContentPack): string {
  return `${JSON.stringify(pack, null, 2)}\n`
}

/** A file name for exporting a pack: "Arcane Frontier 1.2.0.ngpack.json". */
export function packFileName(pack: Pick<ContentPack, 'name' | 'version'>): string {
  const safe = `${pack.name} ${pack.version}`.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim()
  return `${safe || 'content-pack'}${PACK_FILE_EXTENSION}`
}

/**
 * A pack from storage. Stored packs were validated when they went in, so
 * this only re-applies defaults (and drops a row that somehow no longer
 * fits the schema rather than crashing whoever reads it).
 */
export function readStoredPack(json: string): ContentPack | null {
  try {
    const parsed = contentPackSchema.safeParse(JSON.parse(json))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export interface PackSummary {
  id: string
  name: string
  version: string
  author: string
  description: string
  dependsOn: string[]
  counts: Record<'classes' | 'subclasses' | 'species' | 'backgrounds' | 'feats' | 'spells' | 'items' | 'monsters' | 'vehicles' | 'optionLists' | 'archetypes', number>
}

export function packSummary(pack: ContentPack): PackSummary {
  return {
    id: pack.id,
    name: pack.name,
    version: pack.version,
    author: pack.author,
    description: pack.description,
    dependsOn: pack.dependsOn,
    counts: {
      classes: pack.classes.length,
      subclasses: pack.subclasses.length,
      species: pack.species.length,
      backgrounds: pack.backgrounds.length,
      feats: pack.feats.length,
      spells: pack.spells.length,
      items: pack.items.length,
      monsters: pack.monsters.length,
      vehicles: pack.vehicles.length,
      optionLists: pack.optionLists.length,
      archetypes: (pack.archetypes ?? []).length
    }
  }
}

/** "3 classes, 12 spells, 4 items" — empty kinds left out. */
export function describePackContents(pack: ContentPack): string {
  const labels: Array<[keyof PackSummary['counts'], string, string]> = [
    ['classes', 'class', 'classes'],
    ['subclasses', 'subclass', 'subclasses'],
    ['species', 'species', 'species'],
    ['backgrounds', 'background', 'backgrounds'],
    ['feats', 'feat', 'feats'],
    ['spells', 'spell', 'spells'],
    ['items', 'item', 'items'],
    ['monsters', 'monster', 'monsters'],
    ['vehicles', 'vehicle', 'vehicles'],
    ['optionLists', 'pick list', 'pick lists'],
    ['archetypes', 'archetype', 'archetypes']
  ]
  const counts = packSummary(pack).counts
  const parts = labels.filter(([k]) => counts[k] > 0).map(([k, one, many]) => `${counts[k]} ${counts[k] === 1 ? one : many}`)
  return parts.length ? parts.join(', ') : 'No content yet'
}

function withSrd(packs: ContentPack[]): ContentPack[] {
  return packs.some((p) => p.id === SRD_PACK_ID) ? packs : [srdPack(), ...packs]
}

/**
 * Problems with enabling `pack` in a campaign that already has `enabled`
 * (the SRD is implicit): a dependency that isn't enabled, or content that
 * no longer validates against what is. Replacing an already-enabled pack
 * with a new version is fine — that's an update.
 */
export function enableProblems(pack: ContentPack, enabled: ContentPack[]): string[] {
  const others = enabled.filter((p) => p.id !== pack.id)
  const problems: string[] = []
  for (const dep of pack.dependsOn) {
    if (dep === SRD_PACK_ID || others.some((p) => p.id === dep)) continue
    problems.push(`“${pack.name}” needs the “${dep}” pack — enable that first.`)
  }
  if (problems.length) return problems
  const check = validatePack(pack, withSrd(others))
  for (const issue of check.issues) if (issue.severity === 'error') problems.push(`${issue.path ? `${issue.path}: ` : ''}${issue.message}`)
  return problems
}

/** Enabled packs that depend on `packId` — it can't be disabled while any of these are enabled. */
export function dependents(packId: string, enabled: ContentPack[]): ContentPack[] {
  return enabled.filter((p) => p.id !== packId && p.dependsOn.includes(packId))
}
