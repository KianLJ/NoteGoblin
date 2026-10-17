import { describe, expect, it } from 'vitest'
import { explainIssue } from '@shared/content/issueText'
import { addEntry, entriesOf, newPackDraft, type PackDraft } from '@shared/content/workshop'
import { validatePack } from '@shared/content/validate'
import { srdPack } from '@shared/content/srd'

function draftWith(kind: 'feats' | 'classes', entry: Record<string, unknown>): PackDraft {
  return addEntry(newPackDraft('Test', '', []), kind, entry).draft
}

describe('problems in plain English', () => {
  it('names the entry and the field, and offers an id from the name', () => {
    const draft = draftWith('feats', { name: 'Lucky Break', description: '', effects: [] })
    const issue = validatePack(draft, [srdPack()]).issues.find((i) => i.path === 'feats[0].id')!
    const explained = explainIssue(issue, draft)
    expect(explained.where).toBe('Feat “Lucky Break”')
    expect(explained.message).toBe('The id is missing.')
    expect(explained.fix?.label).toBe('Use “lucky-break”')
    const fixed = explained.fix!.apply(draft)
    expect(entriesOf(fixed, 'feats')[0].id).toBe('lucky-break')
    expect(validatePack(fixed, [srdPack()]).ok).toBe(true)
  })

  it('describes where inside an entry a broken formula is', () => {
    const draft = draftWith('classes', {
      id: 'warden',
      name: 'Warden',
      hitDie: 10,
      levels: [{ level: 3, features: [{ id: 'aura', name: 'Aura', effects: [{ do: { kind: 'modify', target: 'ac', op: 'add', value: '1 +' } }] }] }]
    })
    const issue = validatePack(draft, [srdPack()]).issues.find((i) => i.severity === 'error')!
    const explained = explainIssue(issue, draft)
    expect(explained.where).toBe('Class “Warden” · level 3, “Aura”, effect 1')
    expect(explained.message).toMatch(/^This formula doesn't work yet: /)
    expect(explainIssue(issue, draft, true).where).toBe('level 3, “Aura”, effect 1')
  })

  it('cleans up an id with spaces, and renames a duplicate', () => {
    const draft = draftWith('feats', { id: 'lucky break', name: 'Lucky Break' })
    const bad = validatePack(draft, [srdPack()]).issues.find((i) => i.path === 'feats[0].id')!
    expect(explainIssue(bad, draft).fix?.label).toBe('Use “lucky-break”')
    const twice = addEntry(draftWith('feats', { id: 'lucky', name: 'Lucky' }), 'feats', { id: 'lucky', name: 'Lucky Two' }).draft
    const dup = validatePack(twice, [srdPack()]).issues.find((i) => /Duplicate/.test(i.message))!
    const explained = explainIssue(dup, twice)
    expect(explained.message).toBe('Two feats share the id “lucky” — each needs its own.')
    expect(entriesOf(explained.fix!.apply(twice), 'feats').map((f) => f.id)).toEqual(['lucky', 'lucky-2'])
  })
})
