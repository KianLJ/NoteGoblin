import { describe, expect, it } from 'vitest'
import { deriveCharacter } from '@shared/content/engine'
import { deriveSheet } from '@shared/content/sheet'
import { SRD_PACK_ID, srdPack } from '@shared/content/srd'
import { emptyCharacterSheet } from '@shared/dnd5e'

const SRD = `${SRD_PACK_ID}:`
const rogue = (choices: Record<string, string[]> = {}) =>
  deriveCharacter(
    { abilityScores: { str: 10, dex: 16, con: 12, int: 12, wis: 12, cha: 10 }, classes: [{ classId: `${SRD}rogue`, level: 6 }], skillProficiencies: { stealth: 'proficient', perception: 'proficient', acrobatics: 'proficient' }, choices },
    [srdPack()]
  )

describe('Expertise picks', () => {
  it('Rogue gets two Expertise picks at 1 and 6, from skills already proficient', () => {
    const picks = rogue().choices.filter((c) => c.label === 'Expertise')
    expect(picks.map((c) => c.count)).toEqual([2, 2])
    const options = picks[0].options
    expect(options.find((o) => o.id === 'stealth')?.available).toBe(true)
    expect(options.find((o) => o.id === 'arcana')?.available).toBe(false)
    const d = rogue({ [picks[0].key]: ['stealth', 'perception'] })
    expect(d.skills.stealth.proficiency).toBe('expertise')
    expect(d.skills.stealth.bonus).toBe(3 + 3 * 2)
  })

  it('Ranger Deft Explorer: one Expertise and two languages', () => {
    const d = deriveCharacter({ abilityScores: { str: 10, dex: 16, con: 12, int: 10, wis: 14, cha: 8 }, classes: [{ classId: `${SRD}ranger`, level: 2 }] }, [srdPack()])
    expect(d.choices.find((c) => c.label === 'Deft Explorer: Expertise')?.count).toBe(1)
    const langs = d.choices.find((c) => c.label === 'Deft Explorer: Languages')!
    const picked = deriveCharacter({ abilityScores: { str: 10, dex: 16, con: 12, int: 10, wis: 14, cha: 8 }, classes: [{ classId: `${SRD}ranger`, level: 2 }], choices: { [langs.key]: ['Elvish', 'Sylvan'] } }, [srdPack()])
    expect(picked.proficiencies.language).toEqual(expect.arrayContaining(['Elvish', 'Sylvan']))
  })

  it('an existing character’s Expertise skills fill the picks, lowest level first', () => {
    const d = deriveSheet({
      ...emptyCharacterSheet(),
      classes: [{ className: 'Rogue', level: 6 }],
      skillProficiencies: { Stealth: 'expertise', Perception: 'expertise', Acrobatics: 'expertise', Athletics: 'proficient' }
    }).derived
    const [first, second] = d.choices.filter((c) => c.label === 'Expertise')
    expect(first.picks).toEqual(['stealth', 'perception'])
    expect(second.picks).toEqual(['acrobatics'])
    expect(second.remaining).toBe(1)
    expect(d.skills.acrobatics.proficiency).toBe('expertise')
  })
})
