import { describe, expect, it } from 'vitest'
import { deriveSheet } from '@shared/content/sheet'
import { emptyCharacterSheet, type CharacterSheetData } from '@shared/dnd5e'

const elf = (lineageName: string, fields: Partial<CharacterSheetData> = {}): CharacterSheetData => ({
  ...emptyCharacterSheet(),
  race: 'Elf',
  classes: [{ className: 'Fighter', level: 1 }],
  raceLineageChoice: { raceId: 'elf', lineageName, spellcastingAbility: 'int' },
  ...fields
})
const granted = (sheet: CharacterSheetData): string[] => deriveSheet(sheet).derived.spellcasting.granted.map((g) => g.spellId)

describe('Elf', () => {
  it('has darkvision, Keen Senses and Fey Ancestry on the sheet', () => {
    const d = deriveSheet(elf('High Elf')).derived
    expect(d.senses.darkvision.range).toBe(60)
    const keen = d.choices.find((c) => c.label === 'Keen Senses')!
    expect(keen.options.map((o) => o.id)).toEqual(['insight', 'perception', 'survival'])
    expect(d.notes.map((n) => n.text)).toContain('Advantage on saving throws to avoid or end the Charmed condition.')
    const picked = deriveSheet(elf('High Elf', { choices: { [keen.key]: ['perception'] } })).derived
    expect(picked.skills.perception.proficiency).toBe('proficient')
  })

  it('a Drow sees 120 ft. and a Wood Elf walks 35 ft.', () => {
    expect(deriveSheet(elf('Drow')).derived.senses.darkvision.range).toBe(120)
    expect(deriveSheet(elf('Wood Elf')).derived.speeds.walk).toBe(35)
    expect(deriveSheet(elf('High Elf')).derived.speeds.walk).toBe(30)
  })

  it('a High Elf knows Prestidigitation until they swap it for another Wizard cantrip', () => {
    expect(granted(elf('High Elf'))).toContain('srd-5.2.1:prestidigitation')
    const d = deriveSheet(elf('High Elf')).derived
    const cantrip = d.choices.find((c) => c.label === 'High Elf cantrip')!
    expect(cantrip.picks).toEqual(['srd-5.2.1:prestidigitation'])
    expect(cantrip.options.some((o) => o.id === 'srd-5.2.1:mage-hand')).toBe(true)
    expect(cantrip.options.some((o) => o.id === 'srd-5.2.1:guidance')).toBe(false)
    const swapped = elf('High Elf', { choices: { [cantrip.key]: ['srd-5.2.1:mage-hand'] } })
    expect(granted(swapped)).toContain('srd-5.2.1:mage-hand')
    expect(granted(swapped)).not.toContain('srd-5.2.1:prestidigitation')
  })

  it('other lineages still know their cantrip outright', () => {
    expect(granted(elf('Drow'))).toContain('srd-5.2.1:dancing-lights')
    expect(deriveSheet(elf('Drow')).derived.choices.some((c) => c.label === 'High Elf cantrip')).toBe(false)
  })
})
