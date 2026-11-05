import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { readPackFile } from '@shared/content/packFiles'
import { setActivePacks } from '@shared/content/sheet'
import { CLASSES, RACES } from '@shared/dnd5e'
import { buildPickerContent } from '@shared/content/pickerContent'
import { contentPackSchema } from '@shared/content/schema'

describe('picker content', () => {
  afterEach(() => setActivePacks([]))

  it('lists only the SRD with no packs active', () => {
    const picker = buildPickerContent()
    expect(picker.classes).toEqual(CLASSES)
    expect(picker.races).toEqual(RACES)
  })

  it('adds the active packs’ classes after the SRD, adapted for the pickers', () => {
    const read = readPackFile(readFileSync('docs/examples/arcane-frontier.ngpack.json', 'utf8'))
    if (!read.ok) throw new Error('example pack should import')
    setActivePacks([read.pack])
    const picker = buildPickerContent()
    expect(picker.classes.slice(0, CLASSES.length)).toEqual(CLASSES)
    expect(picker.classes.at(-1)).toEqual({
      id: 'arcane-frontier:channeler',
      name: 'Channeler',
      hitDie: 10,
      primaryAbility: [],
      savingThrowProficiencies: ['con', 'cha'],
      skillChoice: { choose: 2, from: ['Arcane Sense', 'Perception'] },
      spellcastingAbility: null,
      subclassLevel: 3
    })
    // The pack's longsword override doesn't add a second Longsword, and no SRD name is duplicated.
    expect(new Set(picker.classes.map((c) => c.name)).size).toBe(picker.classes.length)
  })
  it('names a pack background’s origin feat, from the pack or the SRD', () => {
    const background = (id: string, featId: string) => ({
      id,
      name: id,
      features: [
        { id: 'origin-feat', name: 'Origin Feat', effects: [{ do: { kind: 'grantChoice', choice: { id: 'feat', label: 'Origin feat', from: { kind: 'feats', featIds: [featId] } } } }] },
        { id: 'proficiencies', name: 'Proficiencies', effects: [{ do: { kind: 'proficiency', category: 'skill', value: 'athletics' } }, { do: { kind: 'proficiency', category: 'tool', value: 'Vehicles (ground)' } }] }
      ]
    })
    const pack = contentPackSchema.parse({
      formatVersion: 1,
      id: 'homebrew',
      name: 'Homebrew',
      backgrounds: [background('scarred', 'iron-will'), background('veteran', 'alert')],
      feats: [{ id: 'iron-will', name: 'Iron Will', description: 'You don’t break.', category: 'Origin' }]
    })
    setActivePacks([pack])
    const picker = buildPickerContent()
    const scarred = picker.backgrounds.find((b) => b.id === 'homebrew:scarred')!
    expect(scarred.featId).toBe('homebrew:iron-will')
    expect(scarred.skillProficiencies).toEqual(['Athletics'])
    expect(scarred.toolProficiency).toBe('Vehicles (ground)')
    expect(picker.originFeatFor('homebrew:scarred')).toEqual({ name: 'Iron Will', description: 'You don’t break.' })
    expect(picker.originFeatFor('homebrew:veteran')?.name).toBe('Alert')
    expect(picker.originFeatFor('homebrew:veteran')?.description).not.toBe('')
  })
})
