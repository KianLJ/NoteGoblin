import { describe, expect, it } from 'vitest'
import { deriveCharacter, type CharacterBuild } from '@shared/content/engine'
import { answersToEntry, blankAnswers, entryToAnswers, type WeaponAnswers } from '@shared/content/guided'
import { SRD_PACK_ID, srdPack } from '@shared/content/srd'
import { MASTERY_DESCRIPTIONS, WEAPON_MASTERY } from '@shared/content/srd/items'

const SRD = `${SRD_PACK_ID}:`
const build = (classId: string, level: number, extra: Partial<CharacterBuild> = {}): CharacterBuild => ({
  abilityScores: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 10 },
  classes: [{ classId: `${SRD}${classId}`, level }],
  equipment: [{ key: 'ls', itemId: `${SRD}longsword`, equipped: true }],
  ...extra
})

describe('Weapon Mastery', () => {
  it('every SRD weapon but the Net has a known mastery property', () => {
    const weapons = srdPack().items.filter((i) => i.weapon)
    const missing = weapons.filter((w) => !w.weapon!.mastery).map((w) => w.id)
    expect(missing).toEqual(['net'])
    for (const w of weapons.filter((x) => x.weapon!.mastery)) expect(MASTERY_DESCRIPTIONS[w.weapon!.mastery!]).toBeTruthy()
    expect(WEAPON_MASTERY.longsword).toBe('Sap')
  })

  it('Fighters pick 3 masteries (4 at level 4), Barbarians melee weapons only', () => {
    const fighter = deriveCharacter(build('fighter', 4), [srdPack()])
    expect(fighter.choices.find((c) => c.label === 'Weapon Mastery')?.count).toBe(4)
    const barbarian = deriveCharacter(build('barbarian', 1), [srdPack()]).choices.find((c) => c.label === 'Weapon Mastery')!
    expect(barbarian.count).toBe(2)
    expect(barbarian.options.some((o) => o.name === 'Longbow')).toBe(false)
    expect(barbarian.options.some((o) => o.name === 'Greataxe')).toBe(true)
  })

  it('a mastered weapon’s attack shows its mastery; unmastered ones don’t', () => {
    const plain = deriveCharacter(build('fighter', 1), [srdPack()])
    expect(plain.attacks.find((a) => a.name === 'Longsword')?.mastery).toBeUndefined()
    const pick = plain.choices.find((c) => c.label === 'Weapon Mastery')!
    const mastered = deriveCharacter(build('fighter', 1, { choices: { [pick.key]: [`${SRD}longsword`, `${SRD}greataxe`, `${SRD}longbow`] } }), [srdPack()])
    expect(mastered.attacks.find((a) => a.name === 'Longsword')?.mastery).toBe('Sap')
    expect(mastered.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
  })

  it('only weapons the character is proficient with can be picked', () => {
    const wizard = deriveCharacter({ ...build('wizard', 1), equipment: [] }, [srdPack()])
    expect(wizard.choices.some((c) => c.label === 'Weapon Mastery')).toBe(false)
    const rogue = deriveCharacter(build('rogue', 1), [srdPack()]).choices.find((c) => c.label === 'Weapon Mastery')!
    expect(rogue.options.find((o) => o.name === 'Rapier')?.available).toBe(true)
    expect(rogue.options.find((o) => o.name === 'Greataxe')?.available).toBe(false)
  })

  it('a guided homebrew weapon keeps its mastery', () => {
    const a: WeaponAnswers = { ...(blankAnswers('weapon', 'ember-blade') as WeaponAnswers), name: 'Ember Blade', mastery: 'Topple' }
    const entry = answersToEntry(a)
    expect((entry.weapon as { mastery?: string }).mastery).toBe('Topple')
    expect((entryToAnswers('weapon', entry) as WeaponAnswers).mastery).toBe('Topple')
  })
})
