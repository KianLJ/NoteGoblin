import { describe, expect, it } from 'vitest'
import { emptyCharacterSheet } from '@shared/dnd5e'
import type { CharacterSheet } from '@shared/ipc'
import { deriveSheet } from '@shared/content/sheet'
import { buildCloudCharacter } from '@shared/cloudCharacter'

function cleric(): CharacterSheet {
  return {
    ...emptyCharacterSheet(),
    id: 'c1',
    name: 'Brenna',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    race: 'Dwarf',
    classes: [{ className: 'Cleric', level: 5, subclass: 'Life Domain' }],
    abilityScores: { str: 14, dex: 10, con: 16, int: 10, wis: 17, cha: 12 },
    savingThrowProficiencies: ['wis', 'cha'],
    skillProficiencies: { Medicine: 'expertise' },
    spellcastingAbility: 'wis'
  }
}

describe('buildCloudCharacter', () => {
  it('is plain JSON — the engine output it draws from carries functions that IPC and the relay would choke on', () => {
    const sheet = cleric()
    const cloud = buildCloudCharacter(sheet, deriveSheet(sheet).derived)
    expect(JSON.parse(JSON.stringify(cloud))).toEqual(cloud)
    expect(() => structuredClone(cloud)).not.toThrow()
  })

  it('carries the list fields and the derived numbers the viewer shows', () => {
    const sheet = cleric()
    const cloud = buildCloudCharacter(sheet, deriveSheet(sheet).derived)
    expect(cloud).toMatchObject({ id: 'c1', name: 'Brenna', updatedAt: '2026-01-02T00:00:00.000Z', subtitle: 'Dwarf Cleric (Life Domain) 5' })
    expect(cloud.derived.level).toBe(5)
    expect(cloud.derived.proficiencyBonus).toBe(3)
    expect(cloud.derived.spellcasting.dc).toBe(14)
    expect(cloud.derived.skills.find((s) => s.name === 'Medicine')).toMatchObject({ bonus: 9, proficiency: 'expertise' })
    expect(cloud.derived.saves.wis).toMatchObject({ bonus: 6, proficiency: 'proficient' })
  })

  it('carries what the viewer needs to roll exactly like the desktop sheet', () => {
    const sheet = cleric()
    const cloud = buildCloudCharacter(sheet, deriveSheet(sheet).derived)
    expect(cloud.derived.critThreshold).toBe(20)
    const unarmed = cloud.derived.attacks.find((a) => a.name === 'Unarmed Strike')
    expect(unarmed?.damageDice).toEqual({ dice: [], flat: 3 })
    expect(cloud.derived.checkModes).toBeDefined()
  })
})
