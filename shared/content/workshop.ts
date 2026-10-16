// The Homebrew Workshop's pack-editing rules — pure functions over a pack
// draft, shared by the Workshop UI and its tests. A draft is the pack as
// plain JSON (what the author is editing); it only becomes a ContentPack
// once it validates. See docs/homebrew-engine.md, phase 6.

import type { EntryKind } from './registry'
import type { ContentPack, ContentPackInput } from './schema'
import { PACK_FORMAT_VERSION } from './schema'
import { SRD_PACK_ID } from './srd'
import type { PackIssue } from './validate'

export type PackDraft = ContentPackInput & Record<string, unknown>

/** The entry kinds the Workshop edits, in the order it lists them. */
export const WORKSHOP_SECTIONS: Array<{ kind: EntryKind; label: string; singular: string }> = [
  { kind: 'classes', label: 'Classes', singular: 'class' },
  { kind: 'subclasses', label: 'Subclasses', singular: 'subclass' },
  { kind: 'archetypes', label: 'Archetypes', singular: 'archetype' },
  { kind: 'species', label: 'Species', singular: 'species' },
  { kind: 'backgrounds', label: 'Backgrounds', singular: 'background' },
  { kind: 'feats', label: 'Feats', singular: 'feat' },
  { kind: 'optionLists', label: 'Option lists', singular: 'option list' },
  { kind: 'spells', label: 'Spells', singular: 'spell' },
  { kind: 'items', label: 'Items', singular: 'item' },
  { kind: 'monsters', label: 'Monsters', singular: 'monster' }
]

/** Lower-case, hyphenated, safe as a pack or entry id: "Jujutsu Codex!" → "jujutsu-codex". */
export function slugify(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'untitled'
  )
}

/** An id based on `base` that isn't in `taken` ("x", "x-2", "x-3"…). */
export function uniqueId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

/** A new, empty pack built on the SRD. */
export function newPackDraft(name: string, author: string, takenIds: string[]): PackDraft {
  return {
    formatVersion: PACK_FORMAT_VERSION,
    id: uniqueId(slugify(name), [...takenIds, SRD_PACK_ID]),
    name: name.trim() || 'Untitled Pack',
    version: '0.1.0',
    author,
    description: '',
    dependsOn: [SRD_PACK_ID],
    hides: [],
    terminology: {},
    vocabulary: {}
  }
}

/** A copy of a pack under a new id and name, starting again at 0.1.0. */
export function duplicatePackDraft(pack: ContentPack, takenIds: string[]): PackDraft {
  const copy = structuredClone(pack) as unknown as PackDraft
  copy.id = uniqueId(`${pack.id}-copy`, [...takenIds, SRD_PACK_ID])
  copy.name = `${pack.name} (copy)`
  copy.version = '0.1.0'
  copy.builtIn = false
  return copy
}

/** "1.2.3" → "1.2.4" (or the minor/major part, resetting what's after it). Anything that isn't x.y.z gets ".1" appended to its patch part. */
export function bumpVersion(version: string, part: 'major' | 'minor' | 'patch' = 'patch'): string {
  const m = version.trim().match(/^(\d+)\.(\d+)\.(\d+)(.*)$/)
  if (!m) return `${version.trim() || '0.0'}.1`
  let [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (part === 'major') [major, minor, patch] = [major + 1, 0, 0]
  else if (part === 'minor') [minor, patch] = [minor + 1, 0]
  else patch += 1
  return `${major}.${minor}.${patch}`
}

/** A minimal entry of this kind that validates, with an id not already used in the draft. */
export function entryTemplate(kind: EntryKind, draft: PackDraft): Record<string, unknown> {
  const taken = entriesOf(draft, kind).map((e) => String(e.id ?? ''))
  const section = WORKSHOP_SECTIONS.find((s) => s.kind === kind)!
  const id = uniqueId(`new-${slugify(section.singular)}`, taken)
  const name = `New ${section.singular.charAt(0).toUpperCase()}${section.singular.slice(1)}`
  const base = { id, name, description: '' }
  switch (kind) {
    case 'classes':
      return { ...base, hitDie: 8, saves: [], levels: [{ level: 1, features: [] }] }
    case 'subclasses': {
      const classes = entriesOf(draft, 'classes')
      return { ...base, classId: String(classes[0]?.id ?? `${SRD_PACK_ID}:fighter`), levels: [{ level: 3, features: [] }] }
    }
    case 'archetypes':
      return { ...base, tags: [], levels: [{ level: 1, features: [] }] }
    case 'species':
      return { ...base, size: 'Medium', speed: { walk: '30' }, traits: [] }
    case 'backgrounds':
      return { ...base, features: [] }
    case 'feats':
      return { ...base, category: 'General', effects: [] }
    case 'optionLists':
      return { ...base, options: [{ id: 'option-1', name: 'Option 1', description: '', effects: [] }] }
    case 'spells':
      return { ...base, level: 1, school: '', castingTime: '1 action', range: '', components: 'V, S', duration: 'Instantaneous', lists: [], effects: [] }
    case 'items':
      return { ...base, category: 'Gear', effects: [] }
    case 'monsters':
      return { ...base }
  }
}

export function entriesOf(draft: PackDraft, kind: EntryKind): Array<Record<string, unknown>> {
  const list = draft[kind]
  return Array.isArray(list) ? (list as Array<Record<string, unknown>>) : []
}

/** The draft with `kind`'s list replaced (a new object — drafts are never mutated). */
export function withEntries(draft: PackDraft, kind: EntryKind, entries: Array<Record<string, unknown>>): PackDraft {
  return { ...draft, [kind]: entries }
}

export function addEntry(draft: PackDraft, kind: EntryKind, entry: Record<string, unknown> = entryTemplate(kind, draft)): { draft: PackDraft; index: number } {
  const list = [...entriesOf(draft, kind), entry]
  return { draft: withEntries(draft, kind, list), index: list.length - 1 }
}

export function replaceEntry(draft: PackDraft, kind: EntryKind, index: number, entry: Record<string, unknown>): PackDraft {
  return withEntries(
    draft,
    kind,
    entriesOf(draft, kind).map((e, i) => (i === index ? entry : e))
  )
}

export function removeEntry(draft: PackDraft, kind: EntryKind, index: number): PackDraft {
  return withEntries(
    draft,
    kind,
    entriesOf(draft, kind).filter((_, i) => i !== index)
  )
}

/** A copy of an entry, added after the original, with a fresh id and "(copy)" name. */
export function duplicateEntry(draft: PackDraft, kind: EntryKind, index: number): { draft: PackDraft; index: number } {
  const list = entriesOf(draft, kind)
  const source = list[index]
  if (!source) return { draft, index }
  const copy = structuredClone(source)
  copy.id = uniqueId(`${String(source.id ?? 'entry')}-copy`, list.map((e) => String(e.id ?? '')))
  copy.name = `${String(source.name ?? 'Entry')} (copy)`
  const next = [...list.slice(0, index + 1), copy, ...list.slice(index + 1)]
  return { draft: withEntries(draft, kind, next), index: index + 1 }
}

/** The pack's metadata — everything but the entry lists, vocabulary and terminology — for the overview form and its JSON view. */
export const METADATA_KEYS = ['id', 'name', 'version', 'author', 'description', 'dependsOn', 'hides'] as const

/** Which entry an issue path points into: "spells[2].damage" → { kind: 'spells', index: 2 }. */
export function issueTarget(path: string): { kind: EntryKind; index: number } | { section: 'vocabulary' | 'terminology' | 'metadata' } {
  const m = path.match(/^(\w+)\[(\d+)\]/)
  if (m && WORKSHOP_SECTIONS.some((s) => s.kind === m[1])) return { kind: m[1] as EntryKind, index: Number(m[2]) }
  if (path.startsWith('vocabulary')) return { section: 'vocabulary' }
  if (path.startsWith('terminology')) return { section: 'terminology' }
  return { section: 'metadata' }
}

/** Issues that belong to one entry, with the "kind[i]." prefix stripped so they read relative to it. */
export function issuesForEntry(issues: PackIssue[], kind: EntryKind, index: number): PackIssue[] {
  const prefix = `${kind}[${index}]`
  return issues.filter((i) => i.path === prefix || i.path.startsWith(`${prefix}.`) || i.path.startsWith(`${prefix}[`)).map((i) => ({ ...i, path: i.path.slice(prefix.length).replace(/^\./, '') }))
}

/** Parses JSON typed into an editor, reporting a readable error instead of throwing. */
export function parseJsonField(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * The packs a test character derives with besides the SRD: every library
 * pack this one depends on (and theirs, dependencies first), then the pack
 * itself.
 */
export function packsForTesting(pack: ContentPack, library: ContentPack[]): ContentPack[] {
  const ordered: ContentPack[] = []
  const visit = (p: ContentPack, seen: Set<string>): void => {
    for (const dep of p.dependsOn) {
      if (dep === SRD_PACK_ID || seen.has(dep) || ordered.some((o) => o.id === dep)) continue
      const found = library.find((l) => l.id === dep)
      if (!found) continue
      visit(found, new Set([...seen, dep]))
      ordered.push(found)
    }
  }
  visit(pack, new Set([pack.id]))
  return [...ordered.filter((p) => p.id !== pack.id), pack]
}
