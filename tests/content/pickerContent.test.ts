import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { readPackFile } from '@shared/content/packFiles'
import { setActivePacks } from '@shared/content/sheet'
import { CLASSES, RACES } from '@shared/dnd5e'
import { buildPickerContent } from '@shared/content/pickerContent'

describe('picker content', () => {
  afterEach(() => setActivePacks([]))

  it('lists only the SRD with no packs active', () => {
    const picker = buildPickerContent()
    expect(picker.classes).toEqual(CLASSES)
    expect(picker.races).toEqual(RACES)
  })

  it('adds the active packs’ classes after the SRD, adapted for the pickers', () => {
    const read = readPackFile(readFileSync('docs/examples/jujutsu-codex.ngpack.json', 'utf8'))
    if (!read.ok) throw new Error('example pack should import')
    setActivePacks([read.pack])
    const picker = buildPickerContent()
    expect(picker.classes.slice(0, CLASSES.length)).toEqual(CLASSES)
    expect(picker.classes.at(-1)).toEqual({
      id: 'jujutsu-codex:jujutsu-sorcerer',
      name: 'Jujutsu Sorcerer',
      hitDie: 10,
      primaryAbility: [],
      savingThrowProficiencies: ['con', 'cha'],
      skillChoice: { choose: 2, from: ['Cursed Sense', 'Perception'] },
      spellcastingAbility: null,
      subclassLevel: 3
    })
    // The pack's longsword override doesn't add a second Longsword, and no SRD name is duplicated.
    expect(new Set(picker.classes.map((c) => c.name)).size).toBe(picker.classes.length)
  })
})
