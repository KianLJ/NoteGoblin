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
  duplicateEntry,
  duplicatePackDraft,
  entriesOf,
  entryTemplate,
  issueTarget,
  issuesForEntry,
  newPackDraft,
  packsForTesting,
  removeEntry,
  replaceEntry,
  slugify,
  uniqueId
} from '@shared/content/workshop'
import type { ContentPack } from '@shared/content/schema'

const example = (): ContentPack => {
  const read = readPackFile(readFileSync('docs/examples/jujutsu-codex.ngpack.json', 'utf8'))
  if (!read.ok) throw new Error('example pack should import')
  return read.pack
}

describe('workshop drafts', () => {
  it('makes ids', () => {
    expect(slugify('  Jujutsu Codex!  ')).toBe('jujutsu-codex')
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
    const copy = duplicatePackDraft(example(), ['jujutsu-codex'])
    expect([copy.id, copy.name, copy.version]).toEqual(['jujutsu-codex-copy', 'Jujutsu Codex (copy)', '0.1.0'])
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
    expect(entries.every((e) => e.packId === 'jujutsu-codex' && e.packName === 'Jujutsu Codex')).toBe(true)
    const cls = entries.find((e) => e.fullId === 'jujutsu-codex:jujutsu-sorcerer')!
    expect(cls.kind).toBe('classes')
    expect(cls.fields).toContainEqual({ label: 'Hit die', value: 'd10' })
    expect(cls.sections[0].items.map((i) => i.name)).toContain('Black Flash')
    const limitless = entries.find((e) => e.fullId === 'jujutsu-codex:limitless')!
    expect(limitless.kindLabel).toBe('Archetype')
    expect(limitless.fields).toContainEqual({ label: 'Levels by', value: 'highest class level' })
  })
})
