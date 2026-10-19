// The Homebrew Workshop's pack-editing rules — pure functions over a pack
// draft, shared by the Workshop UI and its tests. A draft is the pack as
// plain JSON (what the author is editing); it only becomes a ContentPack
// once it validates. See docs/homebrew-engine.md, phase 6.

import type { EntryKind, Registry } from './registry'
import type { ContentPack, ContentPackInput } from './schema'
import { PACK_FORMAT_VERSION } from './schema'
import { SRD_PACK_ID } from './srd'
import type { PackIssue } from './validate'

export type PackDraft = ContentPackInput & Record<string, unknown>

/** The entry kinds the Workshop edits, in the order it lists them, each with a one-line explanation of what it is. */
export const WORKSHOP_SECTIONS: Array<{ kind: EntryKind; label: string; singular: string; description: string }> = [
  { kind: 'classes', label: 'Classes', singular: 'class', description: 'A character class like Fighter or Wizard: hit points, proficiencies, and a level table with features at each level.' },
  { kind: 'subclasses', label: 'Subclasses', singular: 'subclass', description: 'A specialisation of one class, chosen at a set level (like Champion for Fighter), with features of its own.' },
  {
    kind: 'archetypes',
    label: 'Archetypes',
    singular: 'archetype',
    description: 'A set of features that grows with level but isn’t tied to one class: a bloodline, a patron, a magical tradition. A choice on any class, species or feat can grant one.'
  },
  { kind: 'species', label: 'Species', singular: 'species', description: 'A character’s species or race: size, speeds and traits like darkvision.' },
  { kind: 'backgrounds', label: 'Backgrounds', singular: 'background', description: 'What the character did before adventuring, with the features (proficiencies, a feat) it brings.' },
  { kind: 'feats', label: 'Feats', singular: 'feat', description: 'A special ability taken at an Ability Score Improvement or from a background, like Alert or Tough.' },
  {
    kind: 'optionLists',
    label: 'Pick lists',
    singular: 'pick list',
    description: 'A list of options a player picks from, like Fighting Styles or Metamagic. Each option can have its own effects and point cost.'
  },
  { kind: 'spells', label: 'Spells', singular: 'spell', description: 'A spell characters can learn or be granted, with its casting details, damage or healing, and any ongoing effects.' },
  { kind: 'items', label: 'Items', singular: 'item', description: 'Equipment: weapons, armor and magic items. Equipped (or attuned) items apply their effects to the sheet.' },
  { kind: 'monsters', label: 'Monsters', singular: 'monster', description: 'A creature statblock for the DM, offered in the Codex, the encounter builder and the initiative tracker.' },
  {
    kind: 'vehicles',
    label: 'Vehicles',
    singular: 'vehicle',
    description: 'Anything that carries people: a mount, a cart, a car, a ship or a starship, with its hit points, crew stations, weapons and fuel. The DM tracks them in a campaign’s Vehicles panel.'
  }
]

/** Lower-case, hyphenated, safe as a pack or entry id: "Arcane Frontier!" → "arcane-frontier". */
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
      return {
        ...base,
        size: 'Medium',
        type: 'beast',
        alignment: 'unaligned',
        ac: '12',
        hp: '11 (2d8 + 2)',
        speed: '30 ft.',
        str: '10',
        dex: '10',
        con: '10',
        int: '10',
        wis: '10',
        cha: '10',
        cr: '1/4',
        traits: [],
        actions: [{ name: 'Claw', desc: 'Melee Weapon Attack: +2 to hit, reach 5 ft., one target. Hit: 3 (1d6) slashing damage.' }],
        bonus_actions: [],
        reactions: [],
        legendary_actions: [],
        lair_actions: []
      }
    case 'vehicles':
      return { ...base, category: 'Land', size: 'Large', speeds: [{ mode: 'walk', value: '30 ft.' }], ac: 12, hp: 50, crew: 1 }
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

/**
 * What the Workshop's inputs suggest (their <datalist>s): ids of every entry
 * the pack can reference (its own and its dependencies'), vocabulary ids,
 * the resources and toggles the draft grants, and the stat paths and roll
 * targets effects can use.
 */
export function suggestionLists(registry: Registry, draft: PackDraft): Record<string, string[]> {
  const ids = (kind: EntryKind): string[] => {
    const out = new Set<string>()
    for (const e of registry.all(kind)) {
      out.add(e.fullId)
      if (e.packId === draft.id) out.add(e.def.id)
    }
    for (const e of entriesOf(draft, kind)) if (typeof e.id === 'string' && e.id) out.add(e.id)
    return [...out].sort()
  }
  const resources = new Set<string>()
  const toggles = new Set<string>()
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(walk)
    if (!v || typeof v !== 'object') return
    const o = v as Record<string, unknown>
    if (o.kind === 'grantResource' && o.resource && typeof o.resource === 'object') resources.add(String((o.resource as { id?: unknown }).id ?? ''))
    if (o.kind === 'grantToggle' && o.toggle && typeof o.toggle === 'object') toggles.add(String((o.toggle as { id?: unknown }).id ?? ''))
    if (o.charges && typeof o.charges === 'object') resources.add(String((o.charges as { id?: unknown }).id ?? ''))
    Object.values(o).forEach(walk)
  }
  walk(draft)
  const v = registry.vocabulary
  const skills = v.skills.map((s) => s.id)
  const abilities = ['str', 'dex', 'con', 'int', 'wis', 'cha']
  const stats = [
    'ac',
    'hp.max',
    'initiative',
    'prof',
    'carry.capacity',
    'crit.threshold',
    'reactions',
    'attacks.perAction',
    'attack.bonus',
    'attack.damage',
    'spell.dc',
    'spell.attack',
    'spells.preparedLimit',
    'spells.knownLimit',
    'spells.cantripsLimit',
    'speed.walk',
    'speed.fly',
    'speed.swim',
    'speed.climb',
    'speed.burrow',
    ...abilities.flatMap((a) => [`ability.${a}.score`, `ability.${a}.max`, `save.${a}`]),
    ...skills.flatMap((s) => [`skill.${s}`, `passive.${s}`]),
    ...v.stats.map((s) => `stat.${s.id}`),
    ...v.counters.map((c) => `counter.${c.id}`),
    ...v.abilityAliases.map((a) => `alias.${a.id}.score`),
    ...['darkvision', 'blindsight', 'tremorsense', 'truesight', ...v.senses.map((s) => s.id)].map((s) => `sense.${s}`),
    ...[...resources].filter(Boolean).map((r) => `resource.${r}.max`),
    ...Array.from({ length: 9 }, (_, i) => `slots.standard.${i + 1}`)
  ]
  const rollTargets = ['attack', 'initiative', 'deathSave', ...abilities.flatMap((a) => [`check:${a}`, `save:${a}`]), ...skills.map((s) => `skill:${s}`)]
  const archetypeTags = new Set<string>()
  for (const a of registry.all('archetypes')) for (const t of a.def.tags ?? []) archetypeTags.add(t)
  for (const a of entriesOf(draft, 'archetypes')) for (const t of Array.isArray(a.tags) ? a.tags : []) archetypeTags.add(String(t))
  const featCategories = new Set<string>(registry.all('feats').map((f) => f.def.category))
  for (const f of entriesOf(draft, 'feats')) if (typeof f.category === 'string') featCategories.add(f.category)
  return {
    classes: ids('classes'),
    subclasses: ids('subclasses'),
    spells: ids('spells'),
    feats: ids('feats'),
    items: ids('items'),
    optionLists: ids('optionLists'),
    archetypes: ids('archetypes'),
    entries: WORKSHOP_SECTIONS.flatMap((s) => ids(s.kind)),
    archetypeTags: [...archetypeTags].sort(),
    featCategories: [...featCategories].sort(),
    skills,
    abilities,
    damageTypes: v.damageTypes.map((d) => d.id),
    conditions: v.conditions.map((c) => c.id),
    weaponProperties: v.weaponProperties.map((w) => w.id),
    actionTypes: ['action', 'bonus', 'reaction', 'free', ...v.actionTypes.map((a) => a.id)],
    resources: [...resources].filter(Boolean).sort(),
    toggles: [...toggles].filter(Boolean).sort(),
    stats,
    rollTargets
  }
}

/** One thing an effect can target, with a readable name and the group it's listed under. */
export interface TargetChoice {
  value: string
  label: string
  group: string
}

const ABILITY_NAMES: Record<string, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }

/** Names of the resources the draft grants, by id (so pickers can say "Mana" instead of "mana"). */
function draftResources(draft: PackDraft): Map<string, string> {
  const out = new Map<string, string>()
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(walk)
    if (!v || typeof v !== 'object') return
    const o = v as Record<string, unknown>
    if (o.kind === 'grantResource' && o.resource && typeof o.resource === 'object') {
      const r = o.resource as { id?: unknown; name?: unknown }
      if (typeof r.id === 'string' && r.id) out.set(r.id, typeof r.name === 'string' && r.name ? r.name : r.id)
    }
    Object.values(o).forEach(walk)
  }
  walk(draft)
  return out
}

/**
 * The numbers a "Change a number" effect can target, named and grouped for a
 * picker — the built-in stats, every ability, save and skill, and the
 * pack's custom stats, counters, aliases, senses and resources.
 */
export function statChoices(registry: Registry, draft: PackDraft): TargetChoice[] {
  const v = registry.vocabulary
  const out: TargetChoice[] = [
    { value: 'ac', label: 'Armor Class', group: 'Defence' },
    { value: 'hp.max', label: 'Max hit points', group: 'Defence' },
    { value: 'initiative', label: 'Initiative', group: 'Combat' },
    { value: 'attack.bonus', label: 'Attack rolls', group: 'Combat' },
    { value: 'attack.damage', label: 'Attack damage', group: 'Combat' },
    { value: 'crit.threshold', label: 'Critical hit on (lowest roll)', group: 'Combat' },
    { value: 'reactions', label: 'Reactions per round', group: 'Combat' },
    { value: 'attacks.perAction', label: 'Attacks per Attack action', group: 'Combat' },
    { value: 'prof', label: 'Proficiency bonus', group: 'Combat' },
    { value: 'speed.walk', label: 'Walking speed', group: 'Movement' },
    { value: 'speed.fly', label: 'Flying speed', group: 'Movement' },
    { value: 'speed.swim', label: 'Swimming speed', group: 'Movement' },
    { value: 'speed.climb', label: 'Climbing speed', group: 'Movement' },
    { value: 'speed.burrow', label: 'Burrowing speed', group: 'Movement' },
    { value: 'spell.dc', label: 'Spell save DC', group: 'Spellcasting' },
    { value: 'spell.attack', label: 'Spell attack bonus', group: 'Spellcasting' },
    { value: 'spells.preparedLimit', label: 'Spells prepared', group: 'Spellcasting' },
    { value: 'spells.knownLimit', label: 'Spells known', group: 'Spellcasting' },
    { value: 'spells.cantripsLimit', label: 'Cantrips known', group: 'Spellcasting' },
    { value: 'carry.capacity', label: 'Carrying capacity', group: 'Other' }
  ]
  for (const [a, name] of Object.entries(ABILITY_NAMES)) {
    out.push({ value: `ability.${a}.score`, label: `${name} score`, group: 'Abilities' })
    out.push({ value: `ability.${a}.max`, label: `${name} maximum`, group: 'Abilities' })
  }
  for (const [a, name] of Object.entries(ABILITY_NAMES)) out.push({ value: `save.${a}`, label: `${name} saving throw`, group: 'Saving throws' })
  for (const s of v.skills) out.push({ value: `skill.${s.id}`, label: s.name, group: 'Skills' })
  for (const s of v.skills) out.push({ value: `passive.${s.id}`, label: `Passive ${s.name}`, group: 'Passive skills' })
  for (const s of v.stats) out.push({ value: `stat.${s.id}`, label: s.name, group: 'This pack' })
  for (const c of v.counters) out.push({ value: `counter.${c.id}`, label: c.name, group: 'This pack' })
  for (const a of v.abilityAliases) out.push({ value: `alias.${a.id}.score`, label: `${a.name} (score)`, group: 'This pack' })
  for (const [id, name] of draftResources(draft)) out.push({ value: `resource.${id}.max`, label: `${name} maximum`, group: 'Resources' })
  for (const s of [{ id: 'darkvision', name: 'Darkvision' }, { id: 'blindsight', name: 'Blindsight' }, { id: 'tremorsense', name: 'Tremorsense' }, { id: 'truesight', name: 'Truesight' }, ...v.senses]) {
    if (!out.some((x) => x.value === `sense.${s.id}`)) out.push({ value: `sense.${s.id}`, label: `${s.name} range`, group: 'Senses' })
  }
  return out
}

/** The rolls advantage / disadvantage can apply to, named and grouped. */
export function rollTargetChoices(registry: Registry): TargetChoice[] {
  const out: TargetChoice[] = [
    { value: 'attack', label: 'Attack rolls', group: 'Combat' },
    { value: 'initiative', label: 'Initiative', group: 'Combat' },
    { value: 'deathSave', label: 'Death saving throws', group: 'Combat' }
  ]
  for (const [a, name] of Object.entries(ABILITY_NAMES)) out.push({ value: `check:${a}`, label: `${name} checks`, group: 'Ability checks' })
  for (const [a, name] of Object.entries(ABILITY_NAMES)) out.push({ value: `save:${a}`, label: `${name} saving throws`, group: 'Saving throws' })
  for (const s of registry.vocabulary.skills) out.push({ value: `skill:${s.id}`, label: s.name, group: 'Skills' })
  return out
}

/** Names for the plain-English formula readback (describeFormula): pack stats, counters, aliases, resources, classes, skills and table columns. */
export function nameLookup(registry: Registry, draft: PackDraft): (kind: 'stat' | 'counter' | 'alias' | 'resource' | 'class' | 'skill' | 'column', id: string) => string | undefined {
  const v = registry.vocabulary
  const resources = draftResources(draft)
  const columns = new Map<string, string>()
  for (const kind of ['classes', 'subclasses', 'archetypes'] as const) {
    for (const e of [...registry.all(kind).map((r) => r.def as unknown as Record<string, unknown>), ...entriesOf(draft, kind)]) {
      for (const c of Array.isArray(e.columns) ? (e.columns as Array<{ id?: unknown; label?: unknown }>) : []) {
        if (typeof c.id === 'string' && typeof c.label === 'string') columns.set(c.id, c.label)
      }
    }
  }
  return (kind, id) => {
    switch (kind) {
      case 'stat':
        return v.stats.find((s) => s.id === id)?.name
      case 'counter':
        return v.counters.find((s) => s.id === id)?.name
      case 'alias':
        return v.abilityAliases.find((s) => s.id === id)?.name
      case 'resource':
        return resources.get(id)
      case 'class':
        return registry.get('classes', id)?.def.name
      case 'skill':
        return v.skills.find((s) => s.id === id)?.name
      case 'column':
        return columns.get(id)
    }
  }
}

/**
 * Adds a copy of another entry (an SRD class, a feat from another pack…) to
 * the draft as a starting point: a new id and "(copy)" on the name — or,
 * as an override, the original's id with `overrides` set so it replaces
 * it. Copying from a library pack makes this pack build on it, so the
 * copy's references (its option lists, its class) still resolve.
 */
export function copyEntry(
  draft: PackDraft,
  kind: EntryKind,
  source: { def: unknown; fullId: string; packId: string },
  asOverride = false
): { draft: PackDraft; index: number } {
  const copy = structuredClone(source.def) as Record<string, unknown>
  const taken = entriesOf(draft, kind).map((e) => String(e.id ?? ''))
  if (asOverride) {
    copy.overrides = source.fullId
    copy.id = uniqueId(String(copy.id ?? 'entry'), taken)
  } else {
    delete copy.overrides
    copy.id = uniqueId(String(copy.id ?? 'entry'), taken)
    copy.name = `${String(copy.name ?? 'Entry')} (copy)`
  }
  const dependsOn = draft.dependsOn ?? []
  const next: PackDraft = source.packId === draft.id || dependsOn.includes(source.packId) ? draft : { ...draft, dependsOn: [...dependsOn, source.packId] }
  return addEntry(next, kind, copy)
}
