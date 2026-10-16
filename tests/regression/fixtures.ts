// A broad matrix of SRD characters for the regression baseline: every class
// at a spread of levels with a typical kit, plus hand-picked edge cases for
// every special-cased rule in shared/ (Unarmored Defense/Movement, Rage,
// Reckless Attack, the ability cap and its Epic Boon/Primal Champion
// exceptions, Defense, under-strength heavy armour, exhaustion, multiclass
// casters, an unrecognised homebrew class).

import {
  CLASSES,
  RACES,
  asiSlotLevelsUpToLevel,
  emptyCharacterSheet,
  fightingStyleSlotLevelsUpToLevel,
  type Ability,
  type AbilityScores,
  type AsiSlotChoice,
  type CharacterSheetData,
  type ClassLevel,
  type EquipmentItem
} from '@shared/dnd5e'
import { subclassesForClass } from '@shared/compendium'

export interface Fixture {
  name: string
  sheet: CharacterSheetData
}

const ABILITY_ORDER: Record<string, Ability[]> = {
  barbarian: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
  bard: ['cha', 'dex', 'con', 'wis', 'int', 'str'],
  cleric: ['wis', 'con', 'str', 'cha', 'dex', 'int'],
  druid: ['wis', 'con', 'dex', 'int', 'cha', 'str'],
  fighter: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
  monk: ['dex', 'wis', 'con', 'str', 'int', 'cha'],
  paladin: ['str', 'cha', 'con', 'wis', 'dex', 'int'],
  ranger: ['dex', 'wis', 'con', 'str', 'int', 'cha'],
  rogue: ['dex', 'con', 'int', 'wis', 'cha', 'str'],
  sorcerer: ['cha', 'con', 'dex', 'wis', 'int', 'str'],
  warlock: ['cha', 'con', 'dex', 'wis', 'int', 'str'],
  wizard: ['int', 'con', 'dex', 'wis', 'cha', 'str']
}

const STANDARD = [15, 14, 13, 12, 10, 8]

const KITS: Record<string, string[]> = {
  barbarian: ['greataxe', 'handaxe'],
  bard: ['leather-armor', 'rapier'],
  cleric: ['chain-mail', 'shield', 'mace'],
  druid: ['leather-armor', 'shield', 'quarterstaff'],
  fighter: ['chain-mail', 'longsword', 'shield', 'longbow'],
  monk: ['quarterstaff', 'dart'],
  paladin: ['chain-mail', 'greatsword'],
  ranger: ['scale-mail', 'longbow', 'shortsword'],
  rogue: ['leather-armor', 'rapier', 'shortbow'],
  sorcerer: ['dagger'],
  warlock: ['leather-armor', 'dagger'],
  wizard: ['quarterstaff']
}

const FIGHTING_STYLE: Record<string, string> = { fighter: 'defense', paladin: 'great-weapon-fighting', ranger: 'archery' }

function scoresFor(classId: string): AbilityScores {
  const order = ABILITY_ORDER[classId]
  const scores = {} as AbilityScores
  order.forEach((a, i) => (scores[a] = STANDARD[i]))
  return scores
}

function kit(ids: string[]): EquipmentItem[] {
  return ids.map((id, i) => ({ id: `eq-${i}`, name: id, quantity: 1, weight: 0, notes: '', equipped: true, compendiumId: id }))
}

/** ASI slots resolved as +2 to the class's primary ability, fighting styles from FIGHTING_STYLE, and an Epic Boon (Fate, +1 primary) at 19. */
function slotChoicesFor(classId: string, className: string, level: number): AsiSlotChoice[] {
  const primary = ABILITY_ORDER[classId][0]
  const choices: AsiSlotChoice[] = asiSlotLevelsUpToLevel(className, level).map((lvl) => ({
    id: `asi-${lvl}`,
    className,
    level: lvl,
    kind: 'ability',
    abilityIncreases: { [primary]: 2 }
  }))
  for (const lvl of fightingStyleSlotLevelsUpToLevel(className, level)) {
    const featId = FIGHTING_STYLE[classId]
    if (featId) choices.push({ id: `fs-${lvl}`, className, level: lvl, kind: 'feat', featId })
  }
  if (level >= 19) choices.push({ id: 'boon', className, level: 19, kind: 'feat', featId: 'boon-of-fate', chosenAbility: primary })
  return choices
}

function build(overrides: Partial<CharacterSheetData>): CharacterSheetData {
  return { ...emptyCharacterSheet(), ...overrides }
}

function classSheet(classId: string, level: number, raceIndex: number): CharacterSheetData {
  const cls = CLASSES.find((c) => c.id === classId)!
  const subclass = level >= cls.subclassLevel ? subclassesForClass(classId)[0]?.id : undefined
  const classes: ClassLevel[] = [{ className: cls.name, level, ...(subclass ? { subclass } : {}) }]
  return build({
    race: RACES[raceIndex % RACES.length].name,
    classes,
    abilityScores: scoresFor(classId),
    savingThrowProficiencies: [...cls.savingThrowProficiencies],
    skillProficiencies: Object.fromEntries(cls.skillChoice.from.slice(0, cls.skillChoice.choose).map((s) => [s, 'proficient'])),
    equipment: kit(KITS[classId]),
    asiSlotChoices: slotChoicesFor(classId, cls.name, level),
    spellcastingAbility: cls.spellcastingAbility
  })
}

const LEVELS = [1, 2, 3, 4, 5, 6, 9, 11, 14, 17, 19, 20]

export function regressionFixtures(): Fixture[] {
  const fixtures: Fixture[] = []
  CLASSES.forEach((cls, i) => {
    for (const level of LEVELS) fixtures.push({ name: `${cls.id} ${level}`, sheet: classSheet(cls.id, level, i + level) })
  })

  const barbarian = (level: number): CharacterSheetData => classSheet('barbarian', level, 0)
  fixtures.push(
    { name: 'barbarian 5 raging', sheet: { ...barbarian(5), activeBuffs: ['barbarian-rage'] } },
    { name: 'barbarian 16 raging + reckless', sheet: { ...barbarian(16), activeBuffs: ['barbarian-rage', 'barbarian-reckless-attack'] } },
    { name: 'barbarian 20 primal champion at cap', sheet: { ...barbarian(20), abilityScores: { ...scoresFor('barbarian'), str: 20, con: 19 } } },
    { name: 'barbarian 6 in chain mail', sheet: { ...barbarian(6), equipment: kit(['chain-mail', 'greataxe']) } },
    { name: 'barbarian 6 with shield only', sheet: { ...barbarian(6), equipment: kit(['shield', 'handaxe']) } },
    { name: 'monk 10 with shield', sheet: { ...classSheet('monk', 10, 1), equipment: kit(['shield', 'quarterstaff']) } },
    { name: 'monk 18 in leather', sheet: { ...classSheet('monk', 18, 1), equipment: kit(['leather-armor']) } },
    {
      name: 'wizard 3 in under-strength plate',
      sheet: { ...classSheet('wizard', 3, 2), equipment: kit(['plate-armor', 'quarterstaff']) }
    },
    { name: 'fighter 1 defense without armor', sheet: { ...classSheet('fighter', 1, 3), equipment: kit(['longsword']) } },
    {
      name: 'rogue 8 high-dex expertise',
      sheet: {
        ...classSheet('rogue', 8, 4),
        abilityScores: { ...scoresFor('rogue'), dex: 18, str: 16 },
        skillProficiencies: { Stealth: 'expertise', 'Sleight of Hand': 'expertise', Perception: 'proficient' }
      }
    },
    {
      name: 'ability cap respected by ASIs',
      sheet: { ...classSheet('fighter', 12, 5), abilityScores: { ...scoresFor('fighter'), str: 19 } }
    },
    {
      name: 'grappler feat (dex)',
      sheet: {
        ...classSheet('fighter', 4, 6),
        asiSlotChoices: [{ id: 'g', className: 'Fighter', level: 4, kind: 'feat', featId: 'grappler', chosenAbility: 'dex' }]
      }
    },
    { name: 'alert feat', sheet: { ...classSheet('rogue', 4, 7), asiSlotChoices: [{ id: 'a', className: 'Rogue', level: 4, kind: 'feat', featId: 'alert' }] } },
    { name: 'exhaustion 2', sheet: { ...classSheet('cleric', 5, 0), exhaustionLevel: 2 } },
    { name: 'exhaustion 4', sheet: { ...classSheet('cleric', 5, 0), exhaustionLevel: 4 } },
    { name: 'exhaustion 5', sheet: { ...classSheet('cleric', 5, 0), exhaustionLevel: 5 } },
    {
      name: 'paladin 6 / warlock 3',
      sheet: {
        ...classSheet('paladin', 6, 8),
        classes: [
          { className: 'Paladin', level: 6, subclass: 'devotion' },
          { className: 'Warlock', level: 3, subclass: 'fiend' }
        ]
      }
    },
    {
      name: 'wizard 5 / cleric 2',
      sheet: {
        ...classSheet('wizard', 5, 2),
        classes: [
          { className: 'Wizard', level: 5, subclass: 'evocation' },
          { className: 'Cleric', level: 2 }
        ]
      }
    },
    {
      name: 'fighter 3 / rogue 3 / barbarian 2',
      sheet: {
        ...classSheet('fighter', 3, 3),
        classes: [
          { className: 'Fighter', level: 3, subclass: 'champion' },
          { className: 'Rogue', level: 3, subclass: 'thief' },
          { className: 'Barbarian', level: 2 }
        ]
      }
    },
    {
      name: 'unknown homebrew class',
      sheet: build({ race: 'Kitsune', classes: [{ className: 'Sorcerer Hunter', level: 7 }], abilityScores: scoresFor('rogue') })
    },
    { name: 'no class yet', sheet: build({ race: 'Human' }) },
    { name: 'stored resistances', sheet: { ...barbarian(3), damageResistances: ['Fire'], activeBuffs: ['barbarian-rage'] } }
  )
  return fixtures
}
