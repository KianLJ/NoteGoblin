// Merges a set of enabled content packs into one lookup: dependency order,
// "<packId>:<localId>" namespacing, overrides, hides, and merged
// vocabulary/terminology. Everything downstream (the engine, the Codex,
// pickers) reads content through a Registry, never a pack directly.

import type { ContentPack, Terminology, Vocabulary } from './schema'

export type EntryKind = 'classes' | 'subclasses' | 'species' | 'backgrounds' | 'feats' | 'spells' | 'items' | 'monsters' | 'optionLists' | 'archetypes'
export const ENTRY_KINDS: EntryKind[] = ['classes', 'subclasses', 'species', 'backgrounds', 'feats', 'spells', 'items', 'monsters', 'optionLists', 'archetypes']

type EntryOf<K extends EntryKind> = ContentPack[K][number]

export interface Registered<T> {
  def: T
  /** "<packId>:<localId>" — for an override, the id of the entry it replaced. */
  fullId: string
  /** The pack the definition actually came from (for an override, the overriding pack) — local references inside it resolve against this pack first. */
  packId: string
}

export interface Diagnostic {
  severity: 'error' | 'warning'
  message: string
  /** Where it came from — a pack id, entry id, or "<choice key>". */
  source?: string
}

type MergedVocabulary = { [K in keyof Vocabulary]: Array<Vocabulary[K][number] & { packId: string }> }

export interface Registry {
  /** Packs in dependency order (dependencies before dependents). */
  packs: ContentPack[]
  get<K extends EntryKind>(kind: K, ref: string, fromPackId?: string): Registered<EntryOf<K>> | undefined
  all<K extends EntryKind>(kind: K): Registered<EntryOf<K>>[]
  vocabulary: MergedVocabulary
  terminology: Terminology
  diagnostics: Diagnostic[]
}

export function fullId(packId: string, localId: string): string {
  return localId.includes(':') ? localId : `${packId}:${localId}`
}

export function localPart(id: string): string {
  const i = id.indexOf(':')
  return i === -1 ? id : id.slice(i + 1)
}

/** Dependencies before dependents; packs whose dependencies are missing are still included (with a warning) so their content stays visible. */
function orderPacks(packs: ContentPack[], diagnostics: Diagnostic[]): ContentPack[] {
  const byId = new Map<string, ContentPack>()
  for (const p of packs) {
    if (byId.has(p.id)) diagnostics.push({ severity: 'error', message: `Pack "${p.id}" is enabled twice — only the first copy is used.`, source: p.id })
    else byId.set(p.id, p)
  }
  const ordered: ContentPack[] = []
  const state = new Map<string, 'visiting' | 'done'>()
  const visit = (p: ContentPack, chain: string[]): void => {
    const s = state.get(p.id)
    if (s === 'done') return
    if (s === 'visiting') {
      diagnostics.push({ severity: 'error', message: `Packs depend on each other in a loop: ${[...chain, p.id].join(' → ')}`, source: p.id })
      return
    }
    state.set(p.id, 'visiting')
    for (const dep of p.dependsOn) {
      const d = byId.get(dep)
      if (!d) diagnostics.push({ severity: 'warning', message: `Pack "${p.name}" needs pack "${dep}", which isn't enabled.`, source: p.id })
      else visit(d, [...chain, p.id])
    }
    state.set(p.id, 'done')
    ordered.push(p)
  }
  for (const p of byId.values()) visit(p, [])
  return ordered
}

/** Every pack `packId` can see, nearest first: itself, then its dependencies breadth-first. */
function visiblePacks(packId: string, byId: Map<string, ContentPack>): string[] {
  const seen: string[] = []
  const queue = [packId]
  while (queue.length) {
    const id = queue.shift()!
    if (seen.includes(id)) continue
    seen.push(id)
    queue.push(...(byId.get(id)?.dependsOn ?? []))
  }
  return seen
}

export function buildRegistry(packs: ContentPack[]): Registry {
  const diagnostics: Diagnostic[] = []
  const ordered = orderPacks(packs, diagnostics)
  const packById = new Map(ordered.map((p) => [p.id, p]))

  const entries = new Map<EntryKind, Map<string, Registered<unknown>>>()
  const byLocal = new Map<EntryKind, Map<string, string[]>>()
  for (const kind of ENTRY_KINDS) {
    entries.set(kind, new Map())
    byLocal.set(kind, new Map())
  }

  for (const pack of ordered) {
    for (const kind of ENTRY_KINDS) {
      const table = entries.get(kind)!
      for (const def of (pack[kind] ?? []) as Array<{ id: string; overrides?: string }>) {
        let id = fullId(pack.id, def.id)
        if (def.overrides) {
          const target = resolveIn(kind, def.overrides, pack.id)
          if (!target) {
            diagnostics.push({ severity: 'warning', message: `"${def.id}" overrides "${def.overrides}", which doesn't exist.`, source: id })
          } else {
            id = target
          }
        } else if (table.has(id)) {
          diagnostics.push({ severity: 'error', message: `Duplicate ${kind} id "${def.id}" in pack "${pack.id}".`, source: id })
          continue
        }
        table.set(id, { def, fullId: id, packId: pack.id })
        const local = localPart(id)
        const list = byLocal.get(kind)!.get(local) ?? []
        if (!list.includes(id)) list.push(id)
        byLocal.get(kind)!.set(local, list)
      }
    }
  }

  for (const pack of ordered) {
    for (const hidden of pack.hides) {
      let removed = false
      for (const kind of ENTRY_KINDS) {
        if (entries.get(kind)!.delete(hidden)) {
          removed = true
          const local = byLocal.get(kind)!.get(localPart(hidden))
          if (local) byLocal.get(kind)!.set(localPart(hidden), local.filter((x) => x !== hidden))
        }
      }
      if (!removed) diagnostics.push({ severity: 'warning', message: `Pack "${pack.name}" hides "${hidden}", which doesn't exist.`, source: pack.id })
    }
  }

  function resolveIn(kind: EntryKind, ref: string, fromPackId?: string): string | undefined {
    const table = entries.get(kind)!
    if (ref.includes(':')) return table.has(ref) ? ref : undefined
    if (fromPackId) {
      for (const pid of visiblePacks(fromPackId, packById)) {
        const id = `${pid}:${ref}`
        if (table.has(id)) return id
      }
    }
    // Not visible from the referring pack (or no referrer): the most recently enabled pack with that local id wins.
    const candidates = byLocal.get(kind)!.get(ref)?.filter((id) => table.has(id)) ?? []
    return candidates[candidates.length - 1]
  }

  const vocabulary = {} as MergedVocabulary
  const vocabKeys: Array<keyof Vocabulary> = [
    'skills',
    'damageTypes',
    'conditions',
    'currencies',
    'stats',
    'actionTypes',
    'weaponProperties',
    'spellSchools',
    'counters',
    'abilityAliases',
    'senses'
  ]
  for (const key of vocabKeys) {
    const merged = new Map<string, Vocabulary[typeof key][number] & { packId: string }>()
    for (const pack of ordered) for (const v of pack.vocabulary[key] ?? []) merged.set(v.id, { ...v, packId: pack.id })
    ;(vocabulary as Record<string, unknown>)[key] = [...merged.values()]
  }

  const terminology: Terminology = {}
  for (const pack of ordered) Object.assign(terminology, pack.terminology)

  return {
    packs: ordered,
    get(kind, ref, fromPackId) {
      const id = resolveIn(kind, ref, fromPackId)
      return id ? (entries.get(kind)!.get(id) as Registered<never>) : undefined
    },
    all(kind) {
      return [...entries.get(kind)!.values()] as Registered<never>[]
    },
    vocabulary,
    terminology,
    diagnostics
  }
}
