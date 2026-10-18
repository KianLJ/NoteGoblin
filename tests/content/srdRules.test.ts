import { describe, expect, it } from 'vitest'
import { deriveCharacter, type CharacterBuild } from '@shared/content/engine'
import { SRD_PACK_ID, srdPack } from '@shared/content/srd'

const SRD = `${SRD_PACK_ID}:`
const derive = (b: Partial<CharacterBuild> & { classes: CharacterBuild['classes'] }) =>
  deriveCharacter({ abilityScores: { str: 14, dex: 16, con: 14, int: 10, wis: 14, cha: 16 }, ...b }, [srdPack()])
const cls = (id: string, level: number, subclass?: string): CharacterBuild['classes'] => [{ classId: `${SRD}${id}`, level, ...(subclass ? { subclassId: `${SRD}${subclass}` } : {}) }]

describe('SRD rules on the sheet', () => {
  it('Paladin: Aura of Protection adds Cha (min +1) to saves; Aura of Courage', () => {
    const after = derive({ classes: cls('paladin', 10) })
    // Dex +3 (not proficient) and Charisma +3 from the aura.
    expect(after.saves.dex.bonus).toBe(3 + 3)
    expect(after.conditionImmunities).toContain('frightened')
    expect(after.attacksPerAction).toBe(2)
  })

  it('Bard: Jack of All Trades adds half proficiency to unproficient skills and initiative', () => {
    const d = derive({ classes: cls('bard', 2) })
    expect(d.skills.athletics.bonus).toBe(2 + 1)
    expect(d.initiative).toBe(3 + 1)
  })

  it('Monk: Martial Arts unarmed strike and Disciplined Survivor', () => {
    const d = derive({ classes: cls('monk', 14) })
    const unarmed = d.attacks.find((a) => a.kind === 'unarmed')!
    expect(unarmed.ability).toBe('dex')
    expect(unarmed.damage).toBe('1d10 + 3')
    expect(Object.values(d.saves).every((s) => s.proficiency === 'proficient')).toBe(true)
  })

  it('Fighter: extra attacks; Champion crits and Remarkable Athlete', () => {
    expect(derive({ classes: cls('fighter', 11) }).attacksPerAction).toBe(3)
    const champ = derive({ classes: cls('fighter', 15, 'champion') })
    expect(champ.critThreshold).toBe(18)
    expect(champ.initiativeMode).toBe('advantage')
    expect(derive({ classes: cls('fighter', 3, 'champion') }).critThreshold).toBe(19)
  })

  it('Cleric Divine Order and subclass spells by class level', () => {
    const order = derive({ classes: cls('cleric', 1) }).choices.find((c) => c.label === 'Divine Order')!
    const thaum = derive({ classes: cls('cleric', 1), choices: { [order.key]: ['thaumaturge'] } })
    expect(thaum.skills.religion.bonus).toBe(0 + 2)
    const life = derive({ classes: cls('cleric', 5, 'life') }).spellcasting.granted.map((g) => g.spellId)
    expect(life).toEqual(expect.arrayContaining([`${SRD}bless`, `${SRD}revivify`]))
    expect(life).not.toContain(`${SRD}death-ward`)
  })

  it('Species: Dwarven Toughness, Gnomish Cunning, Tiefling Thaumaturgy, Dragonborn ancestry', () => {
    expect(derive({ classes: cls('fighter', 4), speciesId: `${SRD}dwarf` }).maxHp - derive({ classes: cls('fighter', 4) }).maxHp).toBe(4)
    expect(derive({ classes: cls('wizard', 1), speciesId: `${SRD}gnome` }).saves.int.mode).toBe('advantage')
    expect(derive({ classes: cls('wizard', 1), speciesId: `${SRD}tiefling` }).spellcasting.granted.map((g) => g.spellId)).toContain(`${SRD}thaumaturgy`)
    const dragonborn = derive({ classes: cls('fighter', 5), speciesId: `${SRD}dragonborn` })
    const ancestry = dragonborn.choices.find((c) => c.label === 'Draconic Ancestry')!
    const red = derive({ classes: cls('fighter', 5), speciesId: `${SRD}dragonborn`, choices: { [ancestry.key]: ['red'] } })
    expect(red.damageRelations.resistances).toContain('fire')
    const breath = red.actions.find((a) => a.name === 'Breath Weapon')!
    expect(breath.damage).toBe('2d10')
    expect(breath.saveDc).toBe(8 + 2 + 3)
  })

  it('Skilled gives three skill picks', () => {
    const human = derive({ classes: cls('fighter', 1), speciesId: `${SRD}human` })
    const versatile = human.choices.find((c) => c.key.startsWith('species:') && c.key.endsWith('#feat'))!
    const withSkilled = derive({ classes: cls('fighter', 1), speciesId: `${SRD}human`, choices: { [versatile.key]: [`${SRD}skilled`] } })
    const skilled = withSkilled.choices.find((c) => c.label === 'Skilled')!
    expect(skilled.count).toBe(3)
    const picked = derive({ classes: cls('fighter', 1), speciesId: `${SRD}human`, choices: { [versatile.key]: [`${SRD}skilled`], [skilled.key]: ['arcana', 'history', 'stealth'] } })
    expect(['arcana', 'history', 'stealth'].map((s) => picked.skills[s].proficiency)).toEqual(['proficient', 'proficient', 'proficient'])
  })
})
