import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { answersToEntry, entryToAnswers, guidedKindFor, mergeIntoEntry } from '@shared/content/guided'
import { blankAttack, blankMonster, blankSave, entryToMonster, hpText, monsterToEntry, proficiencyForCr, type MonsterAnswers } from '@shared/content/guidedMonster'

const drake: MonsterAnswers = {
  ...blankMonster('ember-drake'),
  name: 'Ember Drake',
  size: 'Large',
  type: 'dragon',
  cr: '5',
  ac: 16,
  hitDice: 10,
  scores: { str: 18, dex: 12, con: 16, int: 8, wis: 12, cha: 10 },
  speeds: { fly: 60, swim: 0, climb: 0, burrow: 0 },
  saves: ['dex', 'con'],
  skills: [{ id: 'perception', expertise: false }],
  initiativeProficient: true,
  resistances: ['fire'],
  languages: 'Draconic',
  blocks: {
    traits: [{ name: 'Heated Body', usage: '', desc: 'A creature that touches the drake takes 5 (1d10) fire damage.', roll: null }],
    actions: [
      { name: 'Bite', usage: '', desc: '', roll: { ...blankAttack(), reach: 10, dice: '2d6', damageType: 'piercing', extraDice: '1d6', extraType: 'fire' } },
      { name: 'Fire Breath', usage: 'Recharge 5–6', desc: '', roll: { ...blankSave(), dice: '8d6' } }
    ],
    bonus_actions: [{ name: 'Tail Flick', usage: '', desc: '', roll: { ...blankAttack(), dice: '1d8', damageType: 'bludgeoning', rider: 'and the target is knocked prone.' } }],
    reactions: [],
    legendary_actions: [],
    lair_actions: [{ name: 'Magma Burst', usage: '', desc: 'Lava erupts from a point the drake can see within 60 feet.', roll: null }]
  }
}

describe('guided monsters', () => {
  it('works out the statblock numbers', () => {
    expect(proficiencyForCr('1/4')).toBe(2)
    expect(proficiencyForCr('5')).toBe(3)
    expect(proficiencyForCr('17')).toBe(6)
    expect(proficiencyForCr('30')).toBe(9)
    const e = monsterToEntry(drake)
    expect(e).toMatchObject({
      ac: '16 (natural armor)',
      hp: hpText(drake),
      initiative: '+4 (14)',
      speed: '30 ft., fly 60 ft.',
      saves: 'Dex +4, Con +6',
      skills: 'Perception +4',
      senses: 'darkvision 60 ft., passive Perception 14',
      damage_resistances: 'fire',
      cr: '5'
    })
    expect(e.hp).toBe('85 (10d10 + 30)')
    const actions = e.actions as Array<{ name: string; desc: string }>
    expect(actions[0].desc).toBe('Melee Weapon Attack: +7 to hit, reach 10 ft., one target. Hit: 11 (2d6 + 4) piercing damage plus 3 (1d6) fire damage.')
    expect(actions[1]).toEqual({
      name: 'Fire Breath (Recharge 5–6)',
      desc: 'Each creature in a 15-foot cone must make a DC 14 Dexterity saving throw, taking 28 (8d6) fire damage on a failed save, or half as much damage on a successful one.'
    })
    expect((e.bonus_actions as Array<{ desc: string }>)[0].desc).toBe('Melee Weapon Attack: +7 to hit, reach 5 ft., one target. Hit: 8 (1d8 + 4) bludgeoning damage and the target is knocked prone.')
  })

  it('reads its own statblocks back unchanged', () => {
    const entry = monsterToEntry(drake)
    expect(guidedKindFor('monsters', entry)).toBe('monster')
    const back = entryToAnswers('monster', entry) as MonsterAnswers
    expect(back.custom).toEqual({})
    expect(back.blocks.actions.map((b) => b.roll?.kind)).toEqual(['attack', 'save'])
    expect(answersToEntry(back)).toEqual(entry)
  })

  it('keeps SRD statblock lines it cannot rebuild, and loses nothing on a round trip', () => {
    const bestiary = JSON.parse(readFileSync('src/renderer/src/data/bestiary.json', 'utf8')) as Array<Record<string, unknown>>
    for (const m of bestiary) {
      const entry = { ...m, id: String(m.index) }
      const merged = mergeIntoEntry(entryToMonster(entry), entry)
      for (const key of ['ac', 'hp', 'speed', 'saves', 'skills', 'senses', 'damage_resistances', 'damage_immunities', 'condition_immunities', 'languages', 'str', 'dex', 'con']) {
        expect([m.name, key, merged[key] ?? '']).toEqual([m.name, key, m[key] ?? ''])
      }
      for (const key of ['traits', 'actions', 'reactions', 'legendary_actions']) {
        const original = (m[key] as Array<{ name: string; desc: string }> | undefined) ?? []
        expect([m.name, key, merged[key]]).toEqual([m.name, key, original.map((x) => ({ name: x.name, desc: x.desc }))])
      }
    }
  })

  it('reads SRD attacks as attacks', () => {
    const bestiary = JSON.parse(readFileSync('src/renderer/src/data/bestiary.json', 'utf8')) as Array<Record<string, unknown>>
    const goblin = entryToMonster({ ...bestiary.find((m) => m.index === 'goblin')!, id: 'goblin' })
    expect(goblin.blocks.actions.map((b) => b.roll && b.roll.kind === 'attack' && b.roll.ability)).toEqual(['dex', 'dex'])
  })
})
