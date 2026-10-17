import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildRegistry } from '@shared/content/registry'
import { readPackFile } from '@shared/content/packFiles'
import { codexEntries } from '@shared/content/codexContent'
import { srdPack } from '@shared/content/srd'
import { validatePack } from '@shared/content/validate'
import {
  WORKSHOP_SECTIONS,
  addEntry,
  bumpVersion,
  copyEntry,
  duplicateEntry,
  duplicatePackDraft,
  entriesOf,
  entryTemplate,
  issueTarget,
  issuesForEntry,
  nameLookup,
  newPackDraft,
  packsForTesting,
  removeEntry,
  replaceEntry,
  rollTargetChoices,
  slugify,
  statChoices,
  suggestionLists,
  uniqueId
} from '@shared/content/workshop'
import type { ContentPack } from '@shared/content/schema'

const example = (): ContentPack => {
  const read = readPackFile(readFileSync('docs/examples/arcane-frontier.ngpack.json', 'utf8'))
  if (!read.ok) throw new Error('example pack should import')
  return read.pack
}

describe('workshop drafts', () => {
  it('makes ids', () => {
    expect(slugify('  Arcane Frontier!  ')).toBe('arcane-frontier')
    expect(slugify('Élan Vital')).toBe('elan-vital')
    expect(slugify('!!!')).toBe('untitled')
    expect(uniqueId('x', ['x', 'x-2'])).toBe('x-3')
  })

  it('starts a new pack that validates, with an id not already taken', () => {
    const draft = newPackDraft('My Pack', 'Kian', ['my-pack'])
    expect(draft.id).toBe('my-pack-2')
    expect(draft.dependsOn).toEqual(['srd-5.2.1'])
    expect(validatePack(draft, [srdPack()]).ok).toBe(true)
  })

  it('gives every entry kind a template that validates', () => {
    let draft = newPackDraft('Templates', '', [])
    for (const { kind } of WORKSHOP_SECTIONS) draft = addEntry(draft, kind).draft
    // A subclass template needs a class — it points at the pack's own first class.
    expect(entriesOf(draft, 'subclasses')[0].classId).toBe('new-class')
    const result = validatePack(draft, [srdPack()])
    expect(result.issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(entryTemplate('feats', draft).id).toBe('new-feat-2')
  })

  it('adds, replaces, duplicates and removes entries without mutating the draft', () => {
    const base = newPackDraft('Edits', '', [])
    const { draft: one, index } = addEntry(base, 'feats')
    expect(entriesOf(base, 'feats')).toEqual([])
    const renamed = replaceEntry(one, 'feats', index, { ...entriesOf(one, 'feats')[0], name: 'Lucky Break' })
    const dup = duplicateEntry(renamed, 'feats', 0)
    expect(entriesOf(dup.draft, 'feats').map((f) => [f.id, f.name])).toEqual([
      ['new-feat', 'Lucky Break'],
      ['new-feat-copy', 'Lucky Break (copy)']
    ])
    expect(entriesOf(removeEntry(dup.draft, 'feats', 0), 'feats').map((f) => f.id)).toEqual(['new-feat-copy'])
  })

  it('duplicates a pack under a new id and version', () => {
    const copy = duplicatePackDraft(example(), ['arcane-frontier'])
    expect([copy.id, copy.name, copy.version]).toEqual(['arcane-frontier-copy', 'Arcane Frontier (copy)', '0.1.0'])
    expect(validatePack(copy, [srdPack()]).ok).toBe(true)
  })

  it('bumps versions', () => {
    expect(bumpVersion('1.2.3')).toBe('1.2.4')
    expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0')
    expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0')
    expect(bumpVersion('beta')).toBe('beta.1')
  })

  it('points issues at their entry', () => {
    expect(issueTarget('spells[2].damage')).toEqual({ kind: 'spells', index: 2 })
    expect(issueTarget('vocabulary.stats[0].base')).toEqual({ section: 'vocabulary' })
    expect(issueTarget('version')).toEqual({ section: 'metadata' })
    const issues = [
      { severity: 'error' as const, path: 'feats[1].effects[0].do.value', message: 'bad' },
      { severity: 'error' as const, path: 'feats[10]', message: 'other' }
    ]
    expect(issuesForEntry(issues, 'feats', 1)).toEqual([{ severity: 'error', path: 'effects[0].do.value', message: 'bad' }])
  })

  it('lists a pack’s dependencies, dependencies first, for the test character', () => {
    const base = { ...example(), id: 'base', dependsOn: ['srd-5.2.1'] }
    const mid = { ...example(), id: 'mid', dependsOn: ['base'] }
    const top = { ...example(), id: 'top', dependsOn: ['mid', 'missing'] }
    expect(packsForTesting(top, [top, mid, base]).map((p) => p.id)).toEqual(['base', 'mid', 'top'])
  })
})

describe('codex entries', () => {
  it('lists a pack’s entries of every kind with their pack, and leaves the SRD out', () => {
    const pack = example()
    const entries = codexEntries(buildRegistry([srdPack(), pack]), [pack])
    expect(entries.every((e) => e.packId === 'arcane-frontier' && e.packName === 'Arcane Frontier')).toBe(true)
    const cls = entries.find((e) => e.fullId === 'arcane-frontier:channeler')!
    expect(cls.kind).toBe('classes')
    expect(cls.fields).toContainEqual({ label: 'Hit die', value: 'd10' })
    expect(cls.sections[0].items.map((i) => i.name)).toContain('Perfect Strike')
    const stormBlood = entries.find((e) => e.fullId === 'arcane-frontier:storm-blood')!
    expect(stormBlood.kindLabel).toBe('Archetype')
    expect(stormBlood.fields).toContainEqual({ label: 'Levels by', value: 'highest class level' })
  })
})

describe('suggestion lists', () => {
  it('offers the pack’s own ids, its dependencies’, and what its effects grant', () => {
    const pack = example()
    const registry = buildRegistry([srdPack(), pack])
    const lists = suggestionLists(registry, pack as unknown as Parameters<typeof suggestionLists>[1])
    expect(lists.classes).toEqual(expect.arrayContaining(['channeler', 'arcane-frontier:channeler', 'srd-5.2.1:fighter']))
    expect(lists.resources).toEqual(expect.arrayContaining(['mana', 'focus']))
    expect(lists.toggles).toContain('overchannel')
    expect(lists.archetypeTags).toContain('bloodline')
    expect(lists.stats).toEqual(expect.arrayContaining(['alias.ce.score', 'counter.renown', 'stat.output', 'resource.mana.max']))
    expect(lists.rollTargets).toContain('skill:arcane-sense')
  })
})

describe('copying entries', () => {
  it('copies an SRD entry under a new name, or as an override', () => {
    const registry = buildRegistry([srdPack()])
    const fighter = registry.get('classes', 'srd-5.2.1:fighter')!
    const draft = newPackDraft('Copies', '', [])
    const copied = copyEntry(draft, 'classes', fighter)
    const entry = entriesOf(copied.draft, 'classes')[copied.index]
    expect([entry.id, entry.name, entry.overrides]).toEqual(['fighter', 'Fighter (copy)', undefined])
    const overridden = copyEntry(draft, 'classes', fighter, true)
    expect(entriesOf(overridden.draft, 'classes')[0]).toEqual(expect.objectContaining({ name: 'Fighter', overrides: 'srd-5.2.1:fighter' }))
    expect(validatePack(copied.draft, [srdPack()]).issues.filter((i) => i.severity === 'error')).toEqual([])
  })

  it('builds on the pack it copied from', () => {
    const frontier = example()
    const registry = buildRegistry([srdPack(), frontier])
    const stormBlood = registry.get('archetypes', 'arcane-frontier:storm-blood')!
    const { draft } = copyEntry(newPackDraft('Mine', '', []), 'archetypes', stormBlood)
    expect(draft.dependsOn).toEqual(['srd-5.2.1', 'arcane-frontier'])
  })
})

describe('pickers and names', () => {
  it('names and groups what effects can target', () => {
    const pack = example()
    const registry = buildRegistry([srdPack(), pack])
    const stats = statChoices(registry, pack as never)
    expect(stats).toContainEqual({ value: 'ac', label: 'Armor Class', group: 'Defence' })
    expect(stats).toContainEqual({ value: 'skill.arcane-sense', label: 'Arcane Sense', group: 'Skills' })
    expect(stats).toContainEqual({ value: 'resource.mana.max', label: 'Mana maximum', group: 'Resources' })
    expect(stats).toContainEqual({ value: 'counter.renown', label: 'Renown', group: 'This pack' })
    expect(rollTargetChoices(registry)).toContainEqual({ value: 'save:dex', label: 'Dexterity saving throws', group: 'Saving throws' })
    const name = nameLookup(registry, pack as never)
    expect([name('column', 'manaPool'), name('alias', 'ce'), name('resource', 'focus'), name('class', 'arcane-frontier:channeler')]).toEqual([
      'Mana',
      'Channelling ability',
      'Focus',
      'Channeler'
    ])
  })
})
