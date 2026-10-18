import { describe, expect, it } from 'vitest'
import type { DerivedChoice } from '@shared/content/engine'
import { choicePatch } from '@shared/content/legacyMirror'
import { normalizeSheet } from '@shared/content/migrate'
import { deriveSheet } from '@shared/content/sheet'
import { emptyCharacterSheet, type AsiSlotChoice, type CharacterSheetData, type Spell, type SubclassFeatureChoice } from '@shared/dnd5e'
import { regressionFixtures } from '../regression/fixtures'

let n = 0
const rid = (): string => `r${++n}`
const free = (compendiumId: string, name: string, level: number): Spell => ({ id: rid(), name, level, description: '', actionType: 'action', compendiumId, free: true })
const feature = (className: string, level: number, featureName: string, chosenName: string): SubclassFeatureChoice => ({ id: rid(), className, level, featureName, chosenName })

function sheet(overrides: Partial<CharacterSheetData>): CharacterSheetData {
  return normalizeSheet({ ...emptyCharacterSheet(), abilityScores: { str: 10, dex: 14, con: 14, int: 12, wis: 12, cha: 16 }, ...overrides })
}

/** Characters exercising every kind of legacy pick record the mirror writes. */
const MIRROR_FIXTURES: Array<{ name: string; sheet: CharacterSheetData }> = [
  {
    name: 'sorcerer 10 with four Metamagic picks and a subclass option',
    sheet: sheet({
      classes: [{ className: 'Sorcerer', level: 10, subclass: 'draconic' }],
      subclassFeatureChoices: [
        feature('Sorcerer', 2, 'Metamagic', 'Careful Spell'),
        feature('Sorcerer', 2, 'Metamagic', 'Distant Spell'),
        feature('Sorcerer', 10, 'Metamagic', 'Empowered Spell'),
        feature('Sorcerer', 10, 'Metamagic', 'Extended Spell'),
        feature('Sorcerer', 6, 'Elemental Affinity', 'Elemental Affinity: Cold')
      ]
    })
  },
  {
    name: 'warlock 11 with invocations and Mystic Arcanum',
    sheet: sheet({
      classes: [{ className: 'Warlock', level: 11, subclass: 'fiend' }],
      subclassFeatureChoices: [
        feature('Warlock', 2, 'Eldritch Invocation', 'Armor of Shadows'),
        feature('Warlock', 5, 'Eldritch Invocation', 'Eldritch Mind'),
        feature('Warlock', 11, 'Mystic Arcanum (6th level)', 'Circle of Death')
      ]
    })
  },
  {
    name: 'bard 10 with Magical Secrets',
    sheet: sheet({
      classes: [{ className: 'Bard', level: 10, subclass: 'lore' }],
      subclassFeatureChoices: [feature('Bard', 10, 'Magical Secrets', 'Acid Arrow'), feature('Bard', 10, 'Magical Secrets', 'Aid')],
      spells: [free('acid-arrow', 'Acid Arrow', 2), free('aid', 'Aid', 2)]
    })
  },
  {
    name: 'wizard 20 with Spell Mastery and Signature Spells',
    sheet: sheet({
      classes: [{ className: 'Wizard', level: 20, subclass: 'evocation' }],
      subclassFeatureChoices: [
        feature('Wizard', 18, 'Spell Mastery', 'Alarm'),
        feature('Wizard', 20, 'Signature Spells', 'Animate Dead'),
        feature('Wizard', 20, 'Signature Spells', 'Bestow Curse')
      ]
    })
  },
  {
    name: 'ranger 7 hunter with two subclass options',
    sheet: sheet({
      classes: [{ className: 'Ranger', level: 7, subclass: 'hunter' }],
      subclassFeatureChoices: [feature('Ranger', 3, "Hunter's Prey", "Hunter's Prey: Colossus Slayer"), feature('Ranger', 7, 'Defensive Tactics', 'Defensive Tactics: Escape the Horde')]
    })
  },
  {
    name: 'high elf acolyte with background picks and Magic Initiate',
    sheet: sheet({
      race: 'Elf',
      background: 'Acolyte',
      classes: [{ className: 'Cleric', level: 1 }],
      raceLineageChoice: { raceId: 'elf', lineageName: 'High Elf', spellcastingAbility: 'int' },
      asiSlotChoices: [
        { id: rid(), className: '', level: 0, kind: 'ability', abilityIncreases: { wis: 2, cha: 1 } },
        { id: rid(), className: '', level: 0, kind: 'feat', featId: 'magic-initiate-cleric', chosenAbility: 'wis', chosenSpellIds: ['guidance', 'light', 'bane'] }
      ],
      spellcastingAbility: 'wis',
      spells: [free('guidance', 'Guidance', 0), free('light', 'Light', 0), free('bane', 'Bane', 1)]
    })
  }
]

type LegacyPicks = Pick<CharacterSheetData, 'asiSlotChoices' | 'subclassFeatureChoices' | 'raceLineageChoice' | 'spells'>

/** Legacy pick fields with record ids dropped and lists sorted, so a rebuilt record compares equal to the original. */
function legacyOf(s: Partial<CharacterSheetData>): Partial<LegacyPicks> {
  const strip = <T extends { id: string }>(xs: T[] | undefined): Omit<T, 'id'>[] | undefined =>
    xs?.map(({ id: _id, ...rest }) => rest).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  return {
    asiSlotChoices: strip(s.asiSlotChoices) as AsiSlotChoice[] | undefined,
    subclassFeatureChoices: strip(s.subclassFeatureChoices) as SubclassFeatureChoice[] | undefined,
    raceLineageChoice: s.raceLineageChoice,
    spells: strip(s.spells) as Spell[] | undefined
  }
}

/** Re-applies every top-level choice's current picks through the mirror, one after another. */
function remirror(original: CharacterSheetData): CharacterSheetData {
  let current = original
  for (const choice of deriveSheet(original).derived.choices.filter((c) => !c.parentKey && c.picks.length)) {
    const derived = deriveSheet(current).derived
    const live = derived.choices.find((c) => c.key === choice.key) as DerivedChoice
    current = { ...current, ...choicePatch(current, derived, live, live.picks) }
  }
  return current
}

describe('legacy mirror round trip', () => {
  const all = [...MIRROR_FIXTURES, ...regressionFixtures().map((f) => ({ name: f.name, sheet: normalizeSheet(f.sheet) }))]
  for (const { name, sheet: s } of all) {
    it(name, () => {
      const after = remirror(s)
      for (const field of ['asiSlotChoices', 'subclassFeatureChoices', 'raceLineageChoice', 'spells'] as const) {
        expect(legacyOf(after)[field], field).toEqual(legacyOf(s)[field])
      }
      // And the derived sheet is unchanged with the native picks layered on top.
      expect(deriveSheet(after).derived.abilities).toEqual(deriveSheet(s).derived.abilities)
      expect(deriveSheet(after).derived.choices.map((c) => [c.key, c.picks])).toEqual(deriveSheet(s).derived.choices.map((c) => [c.key, c.picks]))
    })
  }
})

describe('legacy mirror edits', () => {
  const sorcerer = MIRROR_FIXTURES[0].sheet
  const pick = (s: CharacterSheetData, match: (c: DerivedChoice) => boolean, picks: (c: DerivedChoice) => string[]): CharacterSheetData => {
    const derived = deriveSheet(s).derived
    const choice = derived.choices.find(match)!
    return { ...s, ...choicePatch(s, derived, choice, picks(choice)) }
  }

  it('removes a Metamagic pick from both stores', () => {
    const atTen = (c: DerivedChoice): boolean => c.label === 'Metamagic' && c.level === 10
    const next = pick(sorcerer, atTen, (c) => c.picks.slice(0, 1))
    expect(next.subclassFeatureChoices.filter((r) => r.featureName === 'Metamagic').map((r) => r.chosenName).sort()).toEqual(['Careful Spell', 'Distant Spell', 'Empowered Spell'])
    expect(deriveSheet(next).derived.choices.find(atTen)).toMatchObject({ remaining: 1 })
  })

  it('resolves an ASI only once its ability picks are made, then mirrors it', () => {
    const fighter = sheet({ classes: [{ className: 'Fighter', level: 4 }] })
    const asi = (c: DerivedChoice): boolean => c.label === 'Ability Score Improvement or feat'
    const step1 = pick(fighter, asi, (c) => [c.options.find((o) => o.name === 'Ability Score Improvement')!.id])
    expect(step1.asiSlotChoices.filter((r) => r.level === 4)).toEqual([])
    const step2 = pick(step1, (c) => c.label === 'Increase ability scores', () => ['str', 'con'])
    expect(step2.asiSlotChoices.filter((r) => r.level === 4)).toEqual([expect.objectContaining({ className: 'Fighter', kind: 'ability', abilityIncreases: { str: 1, con: 1 } })])
    expect(deriveSheet(step2).derived.abilities.str.score).toBe(11)

    // Swapping the feat drops its nested ability picks too.
    const step3 = pick(step2, asi, (c) => [c.options.find((o) => o.name === 'Grappler')!.id])
    expect(Object.keys(step3.choices ?? {}).some((k) => k.includes('ability-score-improvement/'))).toBe(false)
    expect(deriveSheet(step3).derived.abilities.con.score).toBe(14)
  })

  it('adds and removes Magical Secrets spells on the spell list', () => {
    const bard = MIRROR_FIXTURES[2].sheet
    const fewer = pick(bard, (c) => c.label === 'Magical Secrets', (c) => c.picks.slice(0, 1))
    expect(fewer.spells.map((s) => s.compendiumId)).toEqual(['acid-arrow'])
    expect(fewer.subclassFeatureChoices.map((r) => r.chosenName)).toEqual(['Acid Arrow'])
  })

  it('leaves records for levels the class no longer has alone', () => {
    const lowered = normalizeSheet({ ...sorcerer, classes: [{ ...sorcerer.classes[0], level: 5 }] })
    // At 5th level only the 2nd-level Metamagic choice exists; the 10th-level records are inactive and stay.
    const next = pick(lowered, (c) => c.label === 'Metamagic', (c) => c.picks.slice(0, 1))
    expect(next.subclassFeatureChoices.filter((r) => r.featureName === 'Metamagic').map((r) => r.chosenName).sort()).toEqual(['Careful Spell', 'Empowered Spell', 'Extended Spell'])
  })

  it('writes homebrew-only picks natively and leaves the legacy fields alone', () => {
    const s = sheet({ race: 'Human', classes: [{ className: 'Fighter', level: 1 }] })
    const derived = deriveSheet(s).derived
    const skillful = derived.choices.find((c) => c.label === 'Skill proficiency')!
    const patch = choicePatch(s, derived, skillful, ['arcana'])
    expect(Object.keys(patch)).toEqual(['choices'])
    expect(deriveSheet({ ...s, ...patch }).derived.skills.arcana.proficiency).toBe('proficient')
  })
})
