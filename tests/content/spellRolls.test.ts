import { describe, expect, it } from 'vitest'
import { SPELLS } from '@shared/compendium'
import { deriveCharacter } from '@shared/content/engine'
import { spellNumbers } from '@shared/content/spellNumbers'
import { SRD_PACK_ID, srdPack } from '@shared/content/srd'
import { spellRollFields } from '@shared/content/srd/spellRolls'

const fields = (name: string) => spellRollFields(SPELLS.find((s) => s.name === name)!)

describe('SRD spell rolls', () => {
  it('reads saves, attacks, damage and healing from the text', () => {
    expect(fields('Fireball')).toEqual({ saveAbility: 'dex', damage: '(8 + (@slotLevel - 3) * 1)d6', damageType: 'Fire' })
    expect(fields('Fire Bolt')).toEqual({ attackType: 'ranged', damage: '(1 + 1 * ((@level >= 5) + (@level >= 11) + (@level >= 17)))d10', damageType: 'Fire' })
    expect(fields('Cure Wounds')).toEqual({ healing: '(1 + (@slotLevel - 1) * 1)d8 + @spell.mod' })
    expect(fields('Magic Missile')).toEqual({ damage: '1d4 + 1', damageType: 'Force' })
    expect(fields('Spiritual Weapon')).toEqual({ attackType: 'melee', damage: '(1 + floor((@slotLevel - 2) / 2) * 1)d8 + @spell.mod', damageType: 'Force' })
    expect(fields('Hold Person')).toEqual({ saveAbility: 'wis' })
    expect(fields('Heal').healing).toBe('70')
  })

  it('covers most of the SRD', () => {
    const all = SPELLS.map((s) => spellRollFields(s))
    expect(all.filter((f) => f.damage).length).toBeGreaterThanOrEqual(75)
    expect(all.filter((f) => f.saveAbility).length).toBeGreaterThanOrEqual(100)
  })

  it('works the numbers out for a caster at each slot level', () => {
    const d = deriveCharacter({ abilityScores: { str: 8, dex: 14, con: 14, int: 18, wis: 10, cha: 10 }, classes: [{ classId: `${SRD_PACK_ID}:wizard`, level: 11 }] }, [srdPack(), ], { keepEvaluator: true })
    const spell = (id: string) => srdPack().spells.find((s) => s.id === id)!
    expect(spellNumbers(d, spell('fireball'))).toEqual({ saveDc: 8 + 4 + 4, saveAbility: 'dex', damage: '8d6', damageType: 'Fire' })
    expect(spellNumbers(d, spell('fireball'), 5).damage).toBe('10d6')
    expect(spellNumbers(d, spell('fire-bolt'))).toEqual({ attackBonus: 4 + 4, damage: '3d10', damageType: 'Fire' })
  })
})
