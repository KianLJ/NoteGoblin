import { afterEach, describe, expect, it } from 'vitest'
import {
  dependents,
  describePackContents,
  enableProblems,
  packFileName,
  readPackFile,
  readStoredPack,
  writePackFile
} from '@shared/content/packFiles'
import { deriveSheet, getActivePacksKey, setActivePacks, subscribeActivePacks } from '@shared/content/sheet'
import { SRD_PACK_ID } from '@shared/content/srd'
import { parsePack } from '@shared/content/validate'
import type { ContentPack, ContentPackInput } from '@shared/content/schema'
import { emptyCharacterSheet, type CharacterSheetData } from '@shared/dnd5e'

const hexboundInput: ContentPackInput = {
  formatVersion: 1,
  id: 'hexbound',
  name: 'Hexbound',
  version: '1.0.0',
  author: 'Test',
  dependsOn: [SRD_PACK_ID],
  classes: [{ id: 'hexblade', name: 'Hexblade', hitDie: 10, saves: ['wis', 'cha'] }],
  feats: [{ id: 'arcane-blood', name: 'Arcane Blood', effects: [{ do: { kind: 'modify', target: 'hp.max', op: 'add', value: '@level' } }] }]
}
const addonInput: ContentPackInput = {
  formatVersion: 1,
  id: 'hexbound-addon',
  name: 'Hexbound Addon',
  dependsOn: ['hexbound'],
  subclasses: [{ id: 'grave-hex', name: 'Grave Hex', classId: 'hexblade' }]
}
const hexbound: ContentPack = parsePack(hexboundInput)

describe('readPackFile', () => {
  it('reads a valid pack and keeps warnings', () => {
    const result = readPackFile(JSON.stringify(hexboundInput))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.pack).toMatchObject({ id: 'hexbound', version: '1.0.0', classes: [expect.objectContaining({ id: 'hexblade' })] })
  })

  it('tolerates a byte-order mark', () => {
    expect(readPackFile(`﻿${JSON.stringify(hexboundInput)}`).ok).toBe(true)
  })

  it('rejects files that are not JSON, from a newer format, or a built-in pack', () => {
    expect(readPackFile('{ nope')).toMatchObject({ ok: false, issues: [{ message: expect.stringMatching(/^Not a valid JSON file/) }] })
    expect(readPackFile(JSON.stringify({ ...hexboundInput, formatVersion: 2 }))).toMatchObject({ ok: false, issues: [{ path: 'formatVersion', message: expect.stringMatching(/format version 2/) }] })
    expect(readPackFile(JSON.stringify({ ...hexboundInput, id: SRD_PACK_ID }))).toMatchObject({ ok: false, issues: [{ path: 'id' }] })
  })

  it('checks references against the packs it depends on', () => {
    expect(readPackFile(JSON.stringify(addonInput)).ok).toBe(false)
    expect(readPackFile(JSON.stringify(addonInput), [hexbound]).ok).toBe(true)
  })

  it('round-trips through an export file', () => {
    const again = readPackFile(writePackFile(hexbound))
    expect(again.ok && again.pack).toEqual(hexbound)
    expect(readStoredPack(JSON.stringify(hexbound))).toEqual(hexbound)
    expect(readStoredPack('{"not":"a pack"}')).toBeNull()
  })

  it('names and describes packs', () => {
    expect(packFileName({ name: 'Hex: Bound?', version: '1.0.0' })).toBe('Hex Bound 1.0.0.ngpack.json')
    expect(describePackContents(hexbound)).toBe('1 class, 1 feat')
  })
})

describe('enabling and disabling', () => {
  const addon = parsePack(addonInput, [hexbound])

  it('requires dependencies to be enabled first', () => {
    expect(enableProblems(addon, [])).toEqual(['“Hexbound Addon” needs the “hexbound” pack — enable that first.'])
    expect(enableProblems(addon, [hexbound])).toEqual([])
    expect(enableProblems(hexbound, [])).toEqual([])
  })

  it('allows replacing an enabled pack with a new version', () => {
    expect(enableProblems({ ...hexbound, version: '1.1.0' }, [hexbound])).toEqual([])
  })

  it('blocks disabling a pack another enabled pack depends on', () => {
    expect(dependents('hexbound', [hexbound, addon]).map((p) => p.id)).toEqual(['hexbound-addon'])
    expect(dependents('hexbound-addon', [hexbound, addon])).toEqual([])
  })
})

describe('active packs', () => {
  afterEach(() => setActivePacks([]))

  const hexblade: CharacterSheetData = { ...emptyCharacterSheet(), classes: [{ className: 'Hexblade', level: 3 }], abilityScores: { str: 10, dex: 10, con: 14, int: 10, wis: 10, cha: 10 } }

  it('derives a homebrew class only while its pack is active', () => {
    // Without the pack, the class is an unknown name: levels count, but no hit points.
    expect(deriveSheet(hexblade).derived.maxHp).toBe(1)
    setActivePacks([hexbound])
    expect(deriveSheet(hexblade).derived.maxHp).toBe(10 + 6 * 2 + 2 * 3)
    expect(deriveSheet(hexblade).derived.saves.cha.proficiency).toBe('proficient')
    setActivePacks([])
    expect(deriveSheet(hexblade).derived.maxHp).toBe(1)
  })

  it('notifies subscribers only when the pack set actually changes', () => {
    let calls = 0
    const unsubscribe = subscribeActivePacks(() => calls++)
    setActivePacks([hexbound])
    const key = getActivePacksKey()
    setActivePacks([hexbound])
    setActivePacks([{ ...hexbound, version: '2.0.0' }])
    // Same version, different content (a Workshop save without a bump) counts as a change too.
    setActivePacks([{ ...hexbound, version: '2.0.0', description: 'edited' }])
    unsubscribe()
    expect(calls).toBe(3)
    expect(key).toMatch(/^hexbound@1\.0\.0#/)
  })
})

describe('the pack-writing prompt', () => {
  it('has an example pack that imports without errors and derives cleanly', async () => {
    const { readFileSync } = await import('node:fs')
    const { deriveCharacter } = await import('@shared/content/engine')
    const { srdPack } = await import('@shared/content/srd')
    const doc = readFileSync('docs/homebrew-pack-prompt.md', 'utf8')
    const json = doc.match(/```json\r?\n([\s\S]*?)\r?\n```/)![1]
    const read = readPackFile(json)
    if (!read.ok) throw new Error(read.issues.map((i) => `${i.path}: ${i.message}`).join('\n'))
    expect(read.issues.filter((i) => i.severity === 'error')).toEqual([])
    const d = deriveCharacter(
      {
        abilityScores: { str: 15, dex: 12, con: 14, int: 10, wis: 10, cha: 13 },
        speciesId: 'emberwild:ashborn',
        backgroundId: 'emberwild:forge-hand',
        classes: [{ classId: 'emberwild:ember-knight', level: 4, subclassId: 'emberwild:oath-of-cinders' }],
        choices: { 'class:emberwild:ember-knight:bloodline#pick': ['phoenix-blood'] }
      },
      [srdPack(), read.pack]
    )
    expect(d.diagnostics.filter((x) => x.severity === 'error')).toEqual([])
    expect(d.actions.find((a) => a.id === 'flare')?.spend).toEqual({ resourceId: 'embers', min: 1, max: 3 })
    expect(d.damageRelations.resistances).toContain('fire')
  })
})
