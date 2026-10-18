import { describe, expect, it } from 'vitest'
import { listForSpells, migrateMagicInitiate } from '@shared/content/magicInitiate'
import { deriveSheet } from '@shared/content/sheet'
import { emptyCharacterSheet, type CharacterSheetData } from '@shared/dnd5e'

const base = (fields: Partial<CharacterSheetData>): CharacterSheetData => ({ ...emptyCharacterSheet(), classes: [{ className: 'Fighter', level: 4 }], ...fields })

describe('Magic Initiate split', () => {
  it('picks the list most chosen spells come from', () => {
    expect(listForSpells(['fire-bolt', 'mage-hand', 'magic-missile'])).toBe('wizard')
    expect(listForSpells(['srd-5.2.1:guidance', 'srd-5.2.1:produce-flame', 'srd-5.2.1:entangle'])).toBe('druid')
    expect(listForSpells([], 'int')).toBe('wizard')
    expect(listForSpells([], 'wis')).toBe('cleric')
  })

  it('moves an old origin feat to its background’s version and keeps the spells', () => {
    const sheet = base({
      background: 'Sage',
      asiSlotChoices: [{ id: 'o', className: '', level: 0, kind: 'feat', featId: 'magic-initiate', chosenAbility: 'int', chosenSpellIds: ['light', 'guidance', 'cure-wounds'] }]
    })
    const moved = migrateMagicInitiate(sheet)
    expect(moved.asiSlotChoices[0]).toMatchObject({ featId: 'magic-initiate-wizard', chosenSpellIds: ['light', 'guidance', 'cure-wounds'] })
    expect(migrateMagicInitiate(moved)).toBe(moved)
    expect(migrateMagicInitiate(base({}))).toEqual(base({}))
  })

  it('moves native choice picks and the feat’s own picks under the new id', () => {
    const key = 'class:srd-5.2.1:fighter:ability-score-improvement-4#feat'
    const sheet = base({
      choices: {
        [key]: ['srd-5.2.1:magic-initiate'],
        [`${key}/srd-5.2.1:magic-initiate#cantrips`]: ['srd-5.2.1:fire-bolt', 'srd-5.2.1:mage-hand'],
        [`${key}/srd-5.2.1:magic-initiate#spells`]: ['srd-5.2.1:magic-missile'],
        [`${key}/srd-5.2.1:magic-initiate#spell-ability`]: ['int'],
        'species:srd-5.2.1:human:skillful#skill': ['srd-5.2.1:perception']
      }
    })
    const moved = migrateMagicInitiate(sheet).choices!
    expect(moved).toEqual({
      [key]: ['srd-5.2.1:magic-initiate-wizard'],
      [`${key}/srd-5.2.1:magic-initiate-wizard#cantrips`]: ['srd-5.2.1:fire-bolt', 'srd-5.2.1:mage-hand'],
      [`${key}/srd-5.2.1:magic-initiate-wizard#spells`]: ['srd-5.2.1:magic-missile'],
      [`${key}/srd-5.2.1:magic-initiate-wizard#spell-ability`]: ['int'],
      'species:srd-5.2.1:human:skillful#skill': ['srd-5.2.1:perception']
    })
  })

  it('an old Acolyte keeps its Magic Initiate spells on the sheet, now as the Cleric version', () => {
    const d = deriveSheet(
      base({
        background: 'Acolyte',
        classes: [{ className: 'Fighter', level: 1 }],
        asiSlotChoices: [{ id: 'o', className: 'Fighter', level: 0, kind: 'feat', featId: 'magic-initiate', chosenAbility: 'wis', chosenSpellIds: ['guidance', 'light', 'bless'] }]
      })
    ).derived
    const picks = (suffix: string): string[] => d.choices.find((c) => c.key.includes('magic-initiate-cleric') && c.key.endsWith(suffix))?.picks ?? []
    expect(picks('#cantrips')).toEqual(['srd-5.2.1:guidance', 'srd-5.2.1:light'])
    expect(picks('#spells')).toEqual(['srd-5.2.1:bless'])
    const origin = d.choices.find((c) => c.key.startsWith('background:') && c.key.endsWith('#feat'))!
    expect(origin.picks).toEqual(['srd-5.2.1:magic-initiate-cleric'])
    expect(d.diagnostics.filter((x) => x.severity === 'error')).toEqual([])
  })
})
