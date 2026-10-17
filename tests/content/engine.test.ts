import { describe, expect, it } from 'vitest'
import { deriveCharacter, type CharacterBuild } from '@shared/content/engine'
import { parsePack } from '@shared/content/validate'
import type { ContentPack } from '@shared/content/schema'
import { core, frontier } from './packs'

const SCORES = { str: 16, dex: 12, con: 14, int: 10, wis: 13, cha: 8 }

function derive(build: Partial<CharacterBuild>, packs: ContentPack[] = [core]) {
  return deriveCharacter({ abilityScores: SCORES, classes: [], ...build }, packs)
}

const equip = (...ids: string[]) => ids.map((itemId) => ({ itemId, equipped: true }))
const STYLE = 'class:core:fighter:fighting-style#style'
const ASI4 = 'class:core:fighter:asi-4#feat'
const ASI4_SCORES = `${ASI4}/ability-score-improvement#scores`

const errors = (d: ReturnType<typeof derive>) => d.diagnostics.filter((x) => x.severity === 'error')

describe('core 5e rules as pack data', () => {
  const fighter = (level: number, extra: Partial<CharacterBuild> = {}) =>
    derive({
      speciesId: 'human',
      classes: [{ classId: 'fighter', level }],
      equipment: equip('chain-mail', 'shield', 'longsword', 'longbow'),
      choices: { [STYLE]: ['defense'] },
      ...extra
    })

  it('derives a level 1 fighter', () => {
    const d = fighter(1)
    expect(errors(d)).toEqual([])
    expect(d.level).toBe(1)
    expect(d.proficiencyBonus).toBe(2)
    expect(d.saves.str).toEqual({ bonus: 5, proficiency: 'proficient' })
    expect(d.saves.con).toEqual({ bonus: 4, proficiency: 'proficient' })
    expect(d.saves.dex).toEqual({ bonus: 1 })
    expect(d.armorClass).toBe(19) // chain mail 16 + shield 2 + Defense 1
    expect(d.maxHp).toBe(12)
    expect(d.speeds).toEqual({ walk: 30 })
    expect(d.skills.stealth.mode).toBe('disadvantage')
    expect(d.attacks.map((a) => [a.name, a.ability, a.attackBonus, a.damage, a.proficient])).toEqual([
      ['Unarmed Strike', 'str', 5, '4', true],
      ['Longsword', 'str', 5, '1d8 + 3', true],
      ['Longbow', 'dex', 3, '1d8 + 1', true]
    ])
    expect(d.resources).toEqual([expect.objectContaining({ id: 'second-wind', max: 2, recharge: 'long', actionType: 'bonus' })])
    expect(d.actions).toEqual([expect.objectContaining({ id: 'second-wind-use', healing: '1d10 + 1', cost: { resourceId: 'second-wind', amount: 1 } })])
    expect(d.choices).toEqual([
      expect.objectContaining({ key: STYLE, count: 1, picks: ['defense'], remaining: 0, options: expect.arrayContaining([expect.objectContaining({ id: 'core:archery' })]) })
    ])
    // A pick is listed right after the feature that granted it.
    expect(d.features.map((f) => f.name)).toEqual(['Fighting Style', 'Defense', 'Second Wind'])
  })

  it('applies a different fighting style through the same choice', () => {
    const d = fighter(1, { choices: { [STYLE]: ['archery'] } })
    expect(d.armorClass).toBe(18)
    expect(d.attacks.find((a) => a.name === 'Longbow')!.attackBonus).toBe(5)
    expect(d.attacks.find((a) => a.name === 'Longsword')!.attackBonus).toBe(5)
  })

  it('only gives Defense while wearing body armour', () => {
    expect(fighter(1, { equipment: equip('shield') }).armorClass).toBe(13) // 10 + 1 dex + 2 shield, no Defense
  })

  it('resolves an ASI taken as a nested feat choice, and caps ability scores at 20', () => {
    expect(fighter(4, { choices: { [STYLE]: ['defense'], [ASI4]: ['ability-score-improvement'], [ASI4_SCORES]: ['str', 'str'] } }).abilities.str).toEqual({ score: 18, mod: 4, max: 20 })
    const capped = fighter(4, { abilityScores: { ...SCORES, str: 19 }, choices: { [ASI4]: ['ability-score-improvement'], [ASI4_SCORES]: ['str', 'str'] } })
    expect(capped.abilities.str.score).toBe(20)
    const split = fighter(4, { choices: { [ASI4]: ['ability-score-improvement'], [ASI4_SCORES]: ['str', 'con'] } })
    expect([split.abilities.str.score, split.abilities.con.score]).toEqual([17, 15])
    expect(split.maxHp).toBe(10 + 3 * 6 + 4 * 2) // con 15 still +2
  })

  it('lets an Epic Boon push past 20 with an uncapped increase', () => {
    const d = fighter(19, {
      abilityScores: { ...SCORES, str: 20 },
      choices: { 'class:core:fighter:epic-boon#boon': ['boon-of-fate'], 'class:core:fighter:epic-boon#boon/boon-of-fate#score': ['str'] }
    })
    expect(d.abilities.str.score).toBe(21)
    expect(d.notes).toContainEqual({ source: 'Boon of Fate', text: 'Roll 2d4 to bend a nearby D20 Test.' })
  })

  it('reports invalid picks without dropping the rest of the sheet', () => {
    const d = fighter(4, {
      abilityScores: { ...SCORES, str: 12 },
      choices: { [STYLE]: ['defense', 'archery'], [ASI4]: ['heavy-hitter'] }
    })
    const messages = d.diagnostics.map((x) => x.message)
    expect(messages).toContain('Fighting Style: 2 picked but only 1 allowed.')
    expect(messages).toContain('Ability Score Improvement or feat: "Heavy Hitter" doesn\'t meet its prerequisite.')
    const asi = d.choices.find((c) => c.key === ASI4)!
    expect(asi.options.find((o) => o.id === 'core:heavy-hitter')!.available).toBe(false)
    expect(d.attacks.find((a) => a.name === 'Longsword')!.damage).toBe('1d8 + 2') // str 12 (+1) + Heavy Hitter's +1
  })

  describe('barbarian', () => {
    const barbarian = (level: number, extra: Partial<CharacterBuild> = {}) =>
      derive({ speciesId: 'human', classes: [{ classId: 'barbarian', level }], abilityScores: { ...SCORES, dex: 14, con: 16 }, equipment: equip('longsword', 'longbow'), ...extra })

    it('uses Unarmored Defense only without body armour', () => {
      expect(barbarian(5).armorClass).toBe(15)
      expect(barbarian(5, { equipment: equip('shield') }).armorClass).toBe(17)
      expect(barbarian(5, { equipment: equip('chain-mail') }).armorClass).toBe(16)
    })

    it('reads Rage uses from the class table and switches recharge at level 5', () => {
      expect(barbarian(4).resources[0]).toMatchObject({ id: 'rage', max: 3, recharge: 'long' })
      expect(barbarian(5).resources[0]).toMatchObject({ id: 'rage', max: 3, recharge: 'short' })
    })

    it('applies Rage only while the toggle is on, and its damage only to Str melee attacks', () => {
      const calm = barbarian(5)
      expect(calm.toggles.find((t) => t.id === 'raging')).toMatchObject({ active: false, cost: { resourceId: 'rage', amount: 1 } })
      expect(calm.damageRelations.resistances).toEqual([])

      const raging = barbarian(5, { activeToggles: ['raging'] })
      expect(raging.toggles.find((t) => t.id === 'raging')!.active).toBe(true)
      expect(raging.damageRelations.resistances).toEqual(['Bludgeoning', 'Piercing', 'Slashing'])
      expect(raging.saves.str.mode).toBe('advantage')
      expect(raging.checkModes.str).toBe('advantage')
      expect(raging.attacks.map((a) => [a.name, a.damage])).toEqual([
        ['Unarmed Strike', '6'],
        ['Longsword', '1d8 + 5'],
        ['Longbow', '1d8 + 2']
      ])
    })

    it('cancels advantage against disadvantage', () => {
      const d = barbarian(5, { activeToggles: ['raging'], conditions: [{ id: 'exhaustion', level: 1 }] })
      expect(d.checkModes.str).toBeUndefined()
      expect(d.saves.str.mode).toBe('advantage')
    })

    it('scopes Reckless Attack advantage to Str melee attacks', () => {
      const d = barbarian(2, { activeToggles: ['reckless'] })
      expect(d.attackMode).toBeUndefined()
      expect(d.attacks.find((a) => a.name === 'Longsword')!.mode).toBe('advantage')
      expect(d.attacks.find((a) => a.name === 'Longbow')!.mode).toBeUndefined()
    })

    it('ignores a toggle the character has not been granted', () => {
      expect(barbarian(1, { activeToggles: ['reckless'] }).attacks.find((a) => a.name === 'Longsword')!.mode).toBeUndefined()
    })

    it('raises the cap for Primal Champion', () => {
      const d = barbarian(20, { abilityScores: { ...SCORES, str: 20, con: 19 } })
      expect(d.abilities.str).toEqual({ score: 24, mod: 7, max: 24 })
      expect(d.abilities.con.score).toBe(23)
    })
  })

  describe('monk', () => {
    const monk = (level: number, extra: Partial<CharacterBuild> = {}) =>
      derive({ speciesId: 'human', classes: [{ classId: 'monk', level }], abilityScores: { ...SCORES, str: 10, dex: 16, wis: 16 }, ...extra })

    it('replaces the unarmed strike with Martial Arts using the better ability and table die', () => {
      const d = monk(5)
      expect(d.attacks).toHaveLength(1)
      expect(d.attacks[0]).toMatchObject({ id: 'martial-arts', kind: 'unarmed', ability: 'dex', attackBonus: 6, damage: '1d8 + 3' })
    })

    it('gets Unarmored Defense and Movement only with no armour or shield', () => {
      expect(monk(5).armorClass).toBe(16)
      expect(monk(5).speeds.walk).toBe(40)
      const shielded = monk(5, { equipment: equip('shield') })
      expect(shielded.armorClass).toBe(15)
      expect(shielded.speeds.walk).toBe(30)
    })

    it('tracks weapon proficiency and per-weapon ability options', () => {
      const d = monk(5, { equipment: equip('longsword', 'dagger') })
      expect(d.attacks.find((a) => a.name === 'Longsword')).toMatchObject({ proficient: false, ability: 'str', attackBonus: 0 })
      expect(d.attacks.find((a) => a.name === 'Dagger')).toMatchObject({ proficient: true, ability: 'dex', attackBonus: 6 })
    })

    it('grants a Ki pool from level 2', () => {
      expect(monk(1).resources).toEqual([])
      expect(monk(5).resources[0]).toMatchObject({ id: 'ki', max: 5, display: 'pool', recharge: 'short' })
    })
  })

  describe('wizard', () => {
    const wizard = (level: number, extra: Partial<CharacterBuild> = {}) =>
      derive({ speciesId: 'human', classes: [{ classId: 'wizard', level }], abilityScores: { ...SCORES, str: 8, int: 16, dex: 14, con: 12 }, ...extra })

    it('derives slots, limits, DC and attack from the spellcasting config', () => {
      const d = wizard(5)
      expect(d.spellcasting.slots).toEqual({ standard: { 1: 4, 2: 3, 3: 2 } })
      expect(d.spellcasting.preparedLimit).toBe(8)
      expect(d.spellcasting.knownLimit).toBeNull()
      expect(d.spellcasting.cantripsLimit).toBe(4)
      expect(d.spellcasting.dc).toBe(14)
      expect(d.spellcasting.attackBonus).toBe(6)
      expect(d.spellcasting.sources).toEqual([expect.objectContaining({ classId: 'core:wizard', list: 'wizard', ritualCasting: true, spellbook: true, dc: 14 })])
      expect(d.maxHp).toBe(6 + 4 * 4 + 5)
    })

    it('respects an explicit "no spellcasting ability"', () => {
      expect(wizard(5, { spellcastingAbility: null }).spellcasting.dc).toBeNull()
    })

    it('applies a spell’s ongoing effects while it is toggled on', () => {
      expect(wizard(1).armorClass).toBe(12)
      expect(wizard(1, { activeToggles: ['mage-armor'] }).armorClass).toBe(15)
      expect(wizard(1, { activeToggles: ['mage-armor'], equipment: equip('leather-armor') }).armorClass).toBe(13)
    })

    it('applies under-strength heavy armour penalties', () => {
      expect(wizard(1, { equipment: equip('chain-mail') }).speeds.walk).toBe(20)
    })
  })

  describe('conditions', () => {
    const at = (level: number, speciesId = 'human') => derive({ speciesId, classes: [{ classId: 'fighter', level: 1 }], conditions: [{ id: 'exhaustion', level }] })

    it('halves speed (rounded down to 5 ft) from exhaustion 2', () => {
      expect(at(1).speeds.walk).toBe(30)
      expect(at(2).speeds.walk).toBe(15)
      expect(at(2, 'dwarf').speeds.walk).toBe(10)
    })

    it('halves max HP from exhaustion 4 and zeroes speed from 5', () => {
      expect(at(3).maxHp).toBe(12)
      expect(at(4).maxHp).toBe(6)
      expect(at(5).speeds.walk).toBe(0)
    })
  })

  it('handles multiclassing: first-class saves, per-class tables and summed hit points', () => {
    const d = derive({
      speciesId: 'human',
      classes: [
        { classId: 'fighter', level: 3, subclassId: 'champion' },
        { classId: 'wizard', level: 2 }
      ]
    })
    expect(d.level).toBe(5)
    expect(d.proficiencyBonus).toBe(3)
    expect(Object.entries(d.saves).filter(([, s]) => s.proficiency).map(([a]) => a)).toEqual(['str', 'con'])
    expect(d.maxHp).toBe(10 + 6 * 2 + 4 * 2 + 2 * 5)
    expect(d.spellcasting.slots).toEqual({ standard: { 1: 3 } })
    expect(d.resources.find((r) => r.id === 'second-wind')!.max).toBe(2)
    expect(d.notes).toContainEqual({ source: 'Improved Critical', text: 'Crit on 19–20.' })
    expect(d.hitDice).toEqual([
      { classId: 'core:fighter', className: 'Fighter', die: 10, count: 3 },
      { classId: 'core:wizard', className: 'Wizard', die: 6, count: 2 }
    ])
  })

  it('grants only multiclass proficiencies to a later class', () => {
    const d = derive({ classes: [{ classId: 'wizard', level: 1 }, { classId: 'fighter', level: 1 }] })
    expect(d.proficiencies.armor.sort()).toEqual(['light', 'medium', 'shield'])
    expect(d.proficiencies.weapon.sort()).toEqual(['martial', 'simple'])
  })

  it('folds species traits into skills and HP', () => {
    expect(derive({ speciesId: 'elf' }).skills.perception).toMatchObject({ proficiency: 'proficient', bonus: 3, passive: 13 })
    expect(derive({ speciesId: 'dwarf', classes: [{ classId: 'fighter', level: 3 }] }).maxHp).toBe(10 + 6 * 2 + 2 * 3 + 3)
  })

  it('applies attuned items only while attuned, and item charges while carried', () => {
    const plain = derive({ equipment: [{ itemId: 'ring-of-protection', equipped: true }] })
    const attuned = derive({ equipment: [{ itemId: 'ring-of-protection', equipped: true, attuned: true }] })
    expect([plain.armorClass, attuned.armorClass]).toEqual([11, 12])
    expect(attuned.saves.wis.bonus).toBe(2)
    expect(derive({ equipment: [{ itemId: 'wand-of-sparks' }] }).resources).toEqual([expect.objectContaining({ id: 'wand-of-sparks-charges', max: 7, recharge: 'dawn' })])
  })

  it('accepts per-sheet custom effects', () => {
    const d = derive({ customEffects: [{ name: 'Blessing of the Goblin King', effects: [{ do: { kind: 'modify', target: 'speed.walk', op: 'add', value: '10' } }] }] })
    expect(d.speeds.walk).toBe(40)
  })
})

describe('homebrew pack built on core', () => {
  const BLOODLINE = 'class:frontier:channeler:bloodline#technique'
  const SPIRIT_BEASTS = `${BLOODLINE}/beast-blood#spirit-beasts`
  const sorcerer = (level: number, extra: Partial<CharacterBuild> = {}) =>
    derive({ speciesId: 'human', classes: [{ classId: 'channeler', level }], abilityScores: { ...SCORES, cha: 16, wis: 14 }, ...extra }, [core, frontier])

  it('derives a homebrew resource and action from its own class table', () => {
    const d = sorcerer(5)
    expect(errors(d)).toEqual([])
    expect(d.resources).toEqual([expect.objectContaining({ id: 'mana', max: 15, display: 'pool', recharge: 'short' })])
    expect(d.actions).toEqual([
      expect.objectContaining({ id: 'arcane-strike', actionType: 'technique', attackBonus: 6, damage: '2d8 + 3', damageType: 'Arcane', cost: { resourceId: 'mana', amount: 2 } })
    ])
  })

  it('computes a custom stat and lets a toggle modify it', () => {
    expect(sorcerer(5).stats.output).toEqual({ name: 'Channel Power', value: 6, display: true })
    const domain = sorcerer(5, { activeToggles: ['overchannel'] })
    expect(domain.stats.output.value).toBe(11)
    expect(domain.armorClass).toBe(13)
    expect(domain.attackMode).toBe('advantage')
    expect(domain.toggles.find((t) => t.id === 'overchannel')).toMatchObject({ active: true, cost: { resourceId: 'mana', amount: 5 } })
  })

  it('applies a picked option-list entry, gated by its prerequisite', () => {
    expect(sorcerer(1, { choices: { [BLOODLINE]: ['storm-blood'] } }).armorClass).toBe(12)
    const weak = sorcerer(1, { abilityScores: { ...SCORES, cha: 10 } })
    expect(weak.choices.find((c) => c.key === BLOODLINE)!.options.find((o) => o.id === 'storm-blood')!.available).toBe(false)
  })

  it('follows a pick into a nested choice whose count is a formula', () => {
    const d = sorcerer(5, { choices: { [BLOODLINE]: ['beast-blood'], [SPIRIT_BEASTS]: ['spirit-wolves', 'spirit-hawk'] } })
    expect(d.choices.find((c) => c.key === SPIRIT_BEASTS)).toMatchObject({ count: 2, remaining: 0 })
    expect(d.skills.perception).toMatchObject({ proficiency: 'expertise', bonus: 2 + 3 * 2 })
    expect(d.speeds).toEqual({ walk: 30, fly: 30 })
    expect(d.features.map((f) => f.name)).toEqual(expect.arrayContaining(['Beast Blood', 'Spirit Wolves', 'Spirit Hawk']))
  })

  it('adds vocabulary and merges terminology', () => {
    expect(sorcerer(1).skills['arcane-sense']).toMatchObject({ name: 'Arcane Sense', ability: 'wis', bonus: 2 })
  })

  it('uses core feats for its ASI, minus the ones it hides', () => {
    const asi = sorcerer(4).choices.find((c) => c.key === 'class:frontier:channeler:asi-4#feat')!
    expect(asi.options.map((o) => o.id)).toEqual(expect.arrayContaining(['core:ability-score-improvement', 'core:alert']))
    expect(asi.options.map((o) => o.id)).not.toContain('core:tough')
  })

  it('overrides a core item for everyone, and adds typed extra damage from a arcane focus', () => {
    const d = sorcerer(1, { equipment: equip('longsword', 'storm-staff') })
    expect(d.attacks.find((a) => a.name === 'Longsword')!.damage).toBe('1d10 + 3')
    expect(d.attacks.find((a) => a.name === 'Storm Staff')).toMatchObject({ damage: '3d6 + 3', extraDamage: [{ damage: '1d6', damageType: 'Arcane', source: 'Storm Staff' }] })
  })
})

describe('diagnostics', () => {
  it('skips content that is not in any enabled pack', () => {
    const d = derive({ classes: [{ classId: 'sorcerer-hunter', level: 7 }], speciesId: 'kitsune' })
    expect(d.level).toBe(0)
    expect(d.proficiencyBonus).toBe(2)
    expect(d.diagnostics.map((x) => x.message)).toEqual([
      'Class "sorcerer-hunter" isn\'t in any enabled pack — its features are skipped.',
      'Species "kitsune" isn\'t in any enabled pack.'
    ])
  })

  it('turns a bad reference into an error instead of throwing', () => {
    const d = derive({ customEffects: [{ name: 'Bad Boon', effects: [{ do: { kind: 'modify', target: 'ac', op: 'add', value: '@nonsense + 1' } }] }] })
    expect(d.armorClass).toBe(11)
    expect(errors(d).map((x) => x.message)).toEqual(['Bad Boon: Unknown reference @nonsense in "@nonsense + 1"'])
  })

  it('reports circular references', () => {
    const loop = parsePack({
      formatVersion: 1,
      id: 'loop',
      name: 'Loop',
      vocabulary: { stats: [{ id: 'a', name: 'A', base: '@stat.b + 1' }, { id: 'b', name: 'B', base: '@stat.a + 1' }] }
    })
    const d = derive({}, [core, loop])
    expect(errors(d)[0].message).toMatch(/Circular reference: stat\.a → stat\.b → stat\.a/)
  })

  it('warns when an effect targets a stat that does not exist', () => {
    const d = derive({ customEffects: [{ name: 'Odd', effects: [{ do: { kind: 'modify', target: 'luck', op: 'add', value: '1' } }] }] })
    expect(d.diagnostics.map((x) => x.message)).toContain('"Odd" modifies "luck", which isn\'t a stat this character has.')
  })
})
