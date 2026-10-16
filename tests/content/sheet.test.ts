import { describe, expect, it } from 'vitest'
import { deriveSheet, effectiveScores, resourcesRefilledBy, skillModeOf, skillOf, skillProficiencyOf } from '@shared/content/sheet'
import { emptyCharacterSheet, type CharacterSheetData } from '@shared/dnd5e'
import { engineDerive } from '../regression/project'

const barbarian = (): CharacterSheetData => ({
  ...emptyCharacterSheet(),
  race: 'Human',
  classes: [{ className: 'Barbarian', level: 5 }],
  abilityScores: { str: 16, dex: 14, con: 16, int: 8, wis: 10, cha: 10 },
  skillProficiencies: { Athletics: 'proficient', 'Sleight of Hand': 'expertise' },
  equipment: [{ id: 'e1', name: 'Chain Mail', quantity: 1, weight: 55, notes: '', equipped: true, compendiumId: 'chain-mail' }]
})

describe('deriveSheet', () => {
  it('matches the adapter → engine path the parity tests check', () => {
    const sheet = barbarian()
    expect(deriveSheet(sheet).derived).toEqual(engineDerive(sheet).derived)
  })

  it('caches per sheet object and reuses the registry across sheets', () => {
    const sheet = barbarian()
    const first = deriveSheet(sheet)
    expect(deriveSheet(sheet)).toBe(first)
    const other = deriveSheet({ ...sheet, currentHp: 3 })
    expect(other).not.toBe(first)
    expect(other.registry).toBe(first.registry)
  })

  it('reads skills by their legacy display names', () => {
    const { derived } = deriveSheet(barbarian())
    expect(skillOf(derived, 'Athletics')?.bonus).toBe(3 + 3)
    expect(skillProficiencyOf(derived, 'Sleight of Hand')).toBe('expertise')
    expect(skillModeOf(derived, 'Stealth')).toBe('disadvantage') // chain mail
    expect(effectiveScores(derived).str).toBe(16)
  })

  it('lists which resources each rest refills', () => {
    const { derived } = deriveSheet(barbarian())
    expect(derived.resources.find((r) => r.id === 'barbarian-rage')).toMatchObject({ recharge: 'long', className: 'Barbarian' })
    expect(resourcesRefilledBy(derived, 'short')).not.toContain('barbarian-rage')
    expect(resourcesRefilledBy(derived, 'long')).toContain('barbarian-rage')
  })
})
