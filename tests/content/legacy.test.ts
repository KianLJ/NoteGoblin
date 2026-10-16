import { describe, expect, it } from 'vitest'
import { deriveCharacter } from '@shared/content/engine'
import { legacySheetToBuild } from '@shared/content/legacy'
import { emptyCharacterSheet, type CharacterSheetData } from '@shared/dnd5e'

function derive(overrides: Partial<CharacterSheetData>) {
  const sheet = { ...emptyCharacterSheet(), ...overrides }
  const { build, packs } = legacySheetToBuild(sheet)
  return { build, derived: deriveCharacter(build, packs) }
}

const granted = (d: ReturnType<typeof derive>['derived']): string[] => d.spellcasting.granted.map((g) => g.spellId)
const pickIssues = (d: ReturnType<typeof derive>['derived']) => d.diagnostics.filter((x) => /option|picked|prerequisite|isn't/.test(x.message))

describe('legacy sheet adapter', () => {
  it('puts the background ability and feat slots on the background, and keys skills by id', () => {
    const { build, derived } = derive({
      race: 'Human',
      background: 'Criminal',
      classes: [{ className: 'Rogue', level: 1 }],
      skillProficiencies: { 'Sleight of Hand': 'expertise' },
      asiSlotChoices: [
        { id: 'b', className: 'Rogue', level: 0, kind: 'ability', abilityIncreases: { dex: 2, con: 1 } },
        { id: 'f', className: 'Rogue', level: 0, kind: 'feat', featId: 'alert' },
        { id: 'h', className: 'Rogue', level: 0, kind: 'feat', featId: 'skilled' }
      ]
    })
    expect(build.choices).toMatchObject({
      'background:srd-5.2.1:criminal:ability-scores#scores': ['dex', 'dex', 'con'],
      'background:srd-5.2.1:criminal:origin-feat#feat': ['srd-5.2.1:alert'],
      // A second Origin feat goes to the Human's Versatile trait.
      'species:srd-5.2.1:human:versatile#feat': ['srd-5.2.1:skilled']
    })
    expect(derived.abilities.dex.score).toBe(12)
    expect(derived.abilities.con.score).toBe(11)
    expect(derived.skills['sleight-of-hand'].proficiency).toBe('expertise')
    expect(derived.skills.stealth.proficiency).toBe('proficient')
    expect(pickIssues(derived)).toEqual([])
  })

  it('ignores slots whose class is below the slot level, as today', () => {
    const { derived } = derive({
      classes: [{ className: 'Fighter', level: 3 }],
      abilityScores: { str: 15, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      asiSlotChoices: [{ id: 'a', className: 'Fighter', level: 4, kind: 'ability', abilityIncreases: { str: 2 } }]
    })
    expect(derived.abilities.str.score).toBe(15)
  })

  it('keeps a slot with no matching feature as a per-sheet effect', () => {
    const { build, derived } = derive({
      classes: [{ className: 'Wizard', level: 5 }],
      asiSlotChoices: [{ id: 'x', className: 'Wizard', level: 5, kind: 'ability', abilityIncreases: { int: 1, wis: 1 } }]
    })
    expect(build.customEffects?.map((c) => c.name)).toContain('Ability Score Improvement')
    expect(derived.abilities.int.score).toBe(11)
    expect(derived.abilities.wis.score).toBe(11)
  })

  it('maps Metamagic, Invocations and Mystic Arcanum picks onto their class choices', () => {
    const { build, derived } = derive({
      classes: [
        { className: 'Sorcerer', level: 10 },
        { className: 'Warlock', level: 11 }
      ],
      subclassFeatureChoices: [
        { id: '1', className: 'Sorcerer', level: 2, featureName: 'Metamagic', chosenName: 'Quickened Spell' },
        { id: '2', className: 'Sorcerer', level: 10, featureName: 'Metamagic', chosenName: 'Twinned Spell' },
        { id: '3', className: 'Warlock', level: 1, featureName: 'Eldritch Invocation', chosenName: 'Pact of the Blade' },
        { id: '4', className: 'Warlock', level: 5, featureName: 'Eldritch Invocation', chosenName: 'Thirsting Blade' },
        { id: '5', className: 'Warlock', level: 11, featureName: 'Mystic Arcanum (6th level)', chosenName: 'Circle of Death' }
      ]
    })
    expect(build.choices).toMatchObject({
      'class:srd-5.2.1:sorcerer:metamagic-2#options': ['quickened-spell'],
      'class:srd-5.2.1:sorcerer:metamagic-10#options': ['twinned-spell'],
      'class:srd-5.2.1:warlock:eldritch-invocations-1#options': ['pact-of-the-blade', 'thirsting-blade'],
      'class:srd-5.2.1:warlock:mystic-arcanum-6th-level-11#spells': ['srd-5.2.1:circle-of-death']
    })
    expect(derived.features.map((f) => f.name)).toEqual(expect.arrayContaining(['Quickened Spell', 'Twinned Spell', 'Thirsting Blade']))
    expect(pickIssues(derived)).toEqual([])
  })

  it('maps a grouped subclass pick to its option, which grants its circle spells by level', () => {
    const { build, derived } = derive({
      classes: [{ className: 'Druid', level: 5, subclass: 'Land' }],
      subclassFeatureChoices: [
        { id: '1', className: 'Druid', level: 3, featureName: 'Circle of the Land', chosenName: 'Circle of the Land: Arid' },
        { id: '2', className: 'Druid', level: 3, featureName: 'Circle Spells', chosenName: '3' }
      ]
    })
    expect(build.choices).toMatchObject({ 'subclass:srd-5.2.1:land:circle-of-the-land-3#option': ['arid'] })
    expect(granted(derived)).toEqual(expect.arrayContaining(['srd-5.2.1:blur', 'srd-5.2.1:fireball', 'srd-5.2.1:speak-with-animals']))
    expect(granted(derived)).not.toContain('srd-5.2.1:blight')
  })

  it('keeps 2014 Favored Enemy picks as a per-sheet option-list choice', () => {
    const { build, derived } = derive({
      classes: [{ className: 'Ranger', level: 6 }],
      subclassFeatureChoices: [{ id: '1', className: 'Ranger', level: 1, featureName: 'Favored Enemy', chosenName: 'Undead' }]
    })
    expect(build.choices?.['custom:0#pick']).toEqual(['undead'])
    expect(derived.features.map((f) => f.name)).toContain('Undead')
  })

  it('maps a species lineage to its trait choice, granting spells by character level', () => {
    const { build, derived } = derive({
      race: 'Elf',
      classes: [{ className: 'Fighter', level: 3 }],
      raceLineageChoice: { raceId: 'elf', lineageName: 'High Elf', spellcastingAbility: 'int' }
    })
    expect(build.choices).toMatchObject({
      'species:srd-5.2.1:elf:elven-lineage#lineage': ['high-elf'],
      'species:srd-5.2.1:elf:elven-lineage#spell-ability': ['int']
    })
    expect(granted(derived)).toEqual(['srd-5.2.1:prestidigitation', 'srd-5.2.1:detect-magic'])
  })

  it('fills a feat’s own choices from the slot (Magic Initiate spells and ability)', () => {
    const { build } = derive({
      classes: [{ className: 'Fighter', level: 4 }],
      asiSlotChoices: [
        { id: 'm', className: 'Fighter', level: 4, kind: 'feat', featId: 'magic-initiate', chosenAbility: 'wis', chosenSpellIds: ['guidance', 'light', 'cure-wounds'] }
      ]
    })
    const key = 'class:srd-5.2.1:fighter:ability-score-improvement-4#feat/srd-5.2.1:magic-initiate'
    expect(build.choices).toMatchObject({
      [`${key}#spell-ability`]: ['wis'],
      [`${key}#cantrips`]: ['srd-5.2.1:guidance', 'srd-5.2.1:light'],
      [`${key}#spells`]: ['srd-5.2.1:cure-wounds']
    })
  })

  it('counts an unrecognised class toward level but not hit points, after the known classes', () => {
    const { build, derived } = derive({
      classes: [
        { className: 'Blood Hunter', level: 3 },
        { className: 'Fighter', level: 2 }
      ],
      abilityScores: { str: 10, dex: 10, con: 14, int: 10, wis: 10, cha: 10 }
    })
    expect(build.classes.map((c) => c.classId)).toEqual(['srd-5.2.1:fighter', 'legacy-homebrew:blood-hunter'])
    expect(derived.level).toBe(5)
    expect(derived.proficiencyBonus).toBe(3)
    // Fighter keeps its full first-level die: 10 + 2, then 6 + 2.
    expect(derived.maxHp).toBe(20)
  })
})
