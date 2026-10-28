// SRD classes and subclasses, rebuilt from dnd5e.ts (CLASSES,
// CLASS_LEVEL_FEATURES, CLASS_RESOURCES, TOGGLE_FEATURES, RESOURCE_ACTIONS,
// the option lists) and compendium.ts (subclasses, grouped subclass
// choices, spell tables, BUFF_EFFECTS). Every rule those files apply by
// checking a class name in code — Unarmored Defense/Movement, Primal
// Champion, Rage, Reckless Attack, Champion's extra Fighting Style — is an
// effect on the feature that grants it here.
//
// Choices are only added where today's sheet records a pick (ASIs, Fighting
// Styles, Epic Boons, Metamagic, Invocations, Mystic Arcanum, Spell Mastery,
// Signature Spells, Magical Secrets, grouped subclass options), so the
// legacy adapter can fill every one of them.

import {
  CIRCLE_OF_THE_LAND_SPELLS,
  SUBCLASSES,
  getSpellById,
  groupedSubclassFeaturesForLevelUp,
  spellSlotsForClassLevel,
  spellsKnownForClassLevel
} from '../../compendium'
import {
  CLASSES,
  CLASS_LEVEL_FEATURES,
  CLASS_RESOURCES,
  ELDRITCH_INVOCATIONS,
  FAVORED_ENEMY_OPTIONS,
  FAVORED_TERRAIN_OPTIONS,
  METAMAGIC_OPTIONS,
  PREPARED_SPELLS_BY_LEVEL,
  RESOURCE_ACTIONS,
  TOGGLE_FEATURES,
  eldritchInvocationSlotCountAtLevel,
  type Ability,
  type Class,
  type ClassResourceDef,
  type NamedOption
} from '../../dnd5e'
import type { ChoiceDef, Condition, ContentPackInput, Effect, ResourceDef } from '../schema'
import { NO_ARMOR_OR_SHIELD, NO_BODY_ARMOR, byLevel, skillId, slug } from './common'

type ClassInput = NonNullable<ContentPackInput['classes']>[number]
type SubclassInput = NonNullable<ContentPackInput['subclasses']>[number]
type OptionListInput = NonNullable<ContentPackInput['optionLists']>[number]
type FeatureInput = { id: string; name: string; description?: string; effects?: Effect[] }
type LevelInput = { level: number; features: FeatureInput[] }
type ColumnInput = { id: string; label: string; values: Array<number | string> }

/** A class feature's id: its name and level, since names repeat (Expertise at 2 and 9, every ASI). */
export const featureId = (name: string, level: number): string => `${slug(name)}-${level}`

/** Choice ids used on class/subclass features — the legacy adapter keys picks by these. */
export const CLASS_CHOICE_IDS = { feat: 'feat', options: 'options', spells: 'spells', option: 'option' } as const
export const EXPERTISE_CHOICE_ID = 'expertise'

// ---------------------------------------------------------------------------
// Option lists

const LIST_IDS = {
  metamagic: 'metamagic',
  invocations: 'eldritch-invocations',
  favoredEnemies: 'favored-enemies',
  favoredTerrains: 'favored-terrains',
  divineOrder: 'divine-order',
  primalOrder: 'primal-order'
} as const
export const SRD_LIST_IDS = LIST_IDS

const namedOptions = (options: NamedOption[]): OptionListInput['options'] => options.map((o) => ({ id: slug(o.name), name: o.name, description: o.description }))

function invocationPrerequisite(level: number, prereqInvocation?: string): Condition | undefined {
  const parts: Condition[] = []
  if (level > 1) parts.push({ kind: 'classLevel', classId: 'warlock', min: level })
  if (prereqInvocation) parts.push({ kind: 'hasEntry', entryId: slug(prereqInvocation) })
  if (parts.length === 0) return undefined
  return parts.length === 1 ? parts[0] : { kind: 'all', of: parts }
}

const prof = (category: 'weapon' | 'armor', value: string): Effect => ({ do: { kind: 'proficiency', category, value } })
const extraCantrip: Effect = { do: { kind: 'modify', target: 'spells.cantripsLimit', op: 'add', value: '1' } }
const skillBonus = (skills: string[], value: string): Effect[] => skills.map((s) => ({ do: { kind: 'modify', target: `skill.${s}`, op: 'add', value } }))
const advantage = (target: string): Effect => ({ do: { kind: 'rollMode', target, mode: 'advantage' } })
const attacks = (n: number): Effect => ({ do: { kind: 'modify', target: 'attacks.perAction', op: 'set', value: String(n) } })
const saveProfs = (abilities: Ability[]): Effect[] => abilities.map((a) => ({ do: { kind: 'proficiency', category: 'save', value: a } }))
const NOT_HEAVY: Condition = { kind: 'not', of: { kind: 'equipped', filter: { armorCategories: ['heavy'] } } }
const RAGING: Condition = { kind: 'toggle', toggleId: 'barbarian-rage' }
/** Always-prepared spells by class level, from a subclass's spell table. */
const spellsAt = (classId: string, rows: Array<[number, string[]]>): Effect[] =>
  rows.flatMap(([level, ids]) => {
    const known = ids.filter((id) => getSpellById(id))
    return known.length ? [{ when: { kind: 'classLevel', classId, min: level } as Condition, do: { kind: 'grantSpells', spellIds: known, alwaysPrepared: true, free: true } } as Effect] : []
  })
/** "Expertise in N skills you're proficient in" — choice id 'expertise' (the legacy adapter fills it from the sheet's Expertise skills). */
const expertise = (label: string, count: number): Effect => ({
  do: {
    kind: 'grantChoice',
    choice: { id: EXPERTISE_CHOICE_ID, label, count: String(count), from: { kind: 'skills', proficientOnly: true }, onPick: [{ do: { kind: 'proficiency', category: 'skill', value: '$pick', level: 'expertise' } }] }
  }
})
/** "Use the mastery property of N kinds of weapons" — picks of weapons the character is proficient with (melee only for a Barbarian). */
const weaponMastery = (count: string, range?: 'melee'): Effect => ({
  do: {
    kind: 'grantChoice',
    choice: { id: 'weapon-mastery', label: 'Weapon Mastery', count, from: { kind: 'weapons', proficientOnly: true, ...(range ? { range } : {}) }, onPick: [{ do: { kind: 'weaponMastery', itemId: '$pick' } }] }
  }
})
const SKILL_IDS = ['acrobatics', 'animal-handling', 'arcana', 'athletics', 'deception', 'history', 'insight', 'intimidation', 'investigation', 'medicine', 'nature', 'perception', 'performance', 'persuasion', 'religion', 'sleight-of-hand', 'stealth', 'survival']

export function srdClassOptionLists(): OptionListInput[] {
  return [
    { id: LIST_IDS.metamagic, name: 'Metamagic', options: namedOptions(METAMAGIC_OPTIONS) },
    {
      id: LIST_IDS.invocations,
      name: 'Eldritch Invocations',
      options: ELDRITCH_INVOCATIONS.map((o) => {
        const prerequisite = invocationPrerequisite(o.level, o.prereqInvocation)
        const spellPrereq = o.prereqSpell ? ` Prerequisite: the ${getSpellById(o.prereqSpell)?.name ?? o.prereqSpell} cantrip.` : ''
        return { id: slug(o.name), name: o.name, description: o.description + spellPrereq, ...(prerequisite ? { prerequisite } : {}) }
      })
    },
    {
      id: LIST_IDS.divineOrder,
      name: 'Divine Order',
      options: [
        { id: 'protector', name: 'Protector', description: 'Trained for battle, you gain proficiency with Martial weapons and training with Heavy armor.', effects: [prof('weapon', 'martial'), prof('armor', 'heavy')] },
        {
          id: 'thaumaturge',
          name: 'Thaumaturge',
          description: 'You know one extra Cleric cantrip, and add your Wisdom modifier (minimum +1) to Intelligence (Arcana or Religion) checks.',
          effects: [extraCantrip, ...skillBonus(['arcana', 'religion'], 'max(1, @wis.mod)')]
        }
      ]
    },
    {
      id: LIST_IDS.primalOrder,
      name: 'Primal Order',
      options: [
        {
          id: 'magician',
          name: 'Magician',
          description: 'You know one extra Druid cantrip, and add your Wisdom modifier (minimum +1) to Intelligence (Arcana or Nature) checks.',
          effects: [extraCantrip, ...skillBonus(['arcana', 'nature'], 'max(1, @wis.mod)')]
        },
        { id: 'warden', name: 'Warden', description: 'Trained for battle, you gain proficiency with Martial weapons and training with Medium armor.', effects: [prof('weapon', 'martial'), prof('armor', 'medium')] }
      ]
    },
    // 2014 Ranger picks the 5.2.1 Ranger no longer has — kept so characters who made them still show them.
    { id: LIST_IDS.favoredEnemies, name: 'Favored Enemy', description: 'SRD 2014 Ranger favored enemies.', options: namedOptions(FAVORED_ENEMY_OPTIONS) },
    { id: LIST_IDS.favoredTerrains, name: 'Favored Terrain', description: 'SRD 2014 Ranger favored terrains (Natural Explorer).', options: namedOptions(FAVORED_TERRAIN_OPTIONS) }
  ]
}

// ---------------------------------------------------------------------------
// Proficiencies the legacy data never recorded (SRD 5.2.1 class tables)

const PROFICIENCIES: Record<string, { armor: string[]; weapon: string[]; tool?: string[]; multiclass: string[] }> = {
  barbarian: { armor: ['light', 'medium', 'shield'], weapon: ['simple', 'martial'], multiclass: ['armor:shield', 'weapon:martial'] },
  bard: { armor: ['light'], weapon: ['simple'], tool: ['Musical Instrument'], multiclass: ['armor:light'] },
  cleric: { armor: ['light', 'medium', 'shield'], weapon: ['simple'], multiclass: ['armor:light', 'armor:medium', 'armor:shield'] },
  druid: { armor: ['light', 'shield'], weapon: ['simple'], tool: ['Herbalism Kit'], multiclass: ['armor:light', 'armor:shield'] },
  fighter: { armor: ['light', 'medium', 'heavy', 'shield'], weapon: ['simple', 'martial'], multiclass: ['armor:light', 'armor:medium', 'armor:shield', 'weapon:martial'] },
  // Martial weapons with the Light property.
  monk: { armor: [], weapon: ['simple', 'scimitar', 'shortsword', 'crossbow-hand'], multiclass: [] },
  paladin: { armor: ['light', 'medium', 'heavy', 'shield'], weapon: ['simple', 'martial'], multiclass: ['armor:light', 'armor:medium', 'armor:shield', 'weapon:martial'] },
  ranger: { armor: ['light', 'medium', 'shield'], weapon: ['simple', 'martial'], multiclass: ['armor:light', 'armor:medium', 'armor:shield', 'weapon:martial'] },
  // Martial weapons with the Finesse or Light property.
  rogue: { armor: ['light'], weapon: ['simple', 'rapier', 'scimitar', 'shortsword', 'whip', 'crossbow-hand'], tool: ["Thieves' Tools"], multiclass: ['armor:light', "tool:Thieves' Tools"] },
  sorcerer: { armor: [], weapon: ['simple'], multiclass: [] },
  warlock: { armor: ['light'], weapon: ['simple'], multiclass: ['armor:light'] },
  wizard: { armor: [], weapon: ['simple'], multiclass: [] }
}

// ---------------------------------------------------------------------------
// Resources, toggles and actions

/** CLASS_RESOURCES' max/recharge functions as formulas, and the feature each one belongs to. */
const RESOURCES: Record<string, { feature: string; max: string; recharge?: ResourceDef['recharge'] }> = {
  'barbarian-rage': { feature: 'Rage', max: '@table.rages' },
  // Font of Inspiration (5th level) switches it to a short rest.
  'bard-inspiration': { feature: 'Bardic Inspiration', max: 'max(1, @cha.mod)', recharge: { when: { kind: 'classLevel', classId: 'bard', min: 5 }, then: 'short', else: 'long' } },
  'cleric-channel-divinity': { feature: 'Channel Divinity', max: '@classLevel >= 18 ? 3 : @classLevel >= 6 ? 2 : 1' },
  // 99 is shown as "Unlimited" (Archdruid).
  'druid-wild-shape': { feature: 'Wild Shape', max: '@classLevel >= 20 ? 99 : 2' },
  'fighter-second-wind': { feature: 'Second Wind', max: '1' },
  'fighter-action-surge': { feature: 'Action Surge', max: '@classLevel >= 17 ? 2 : 1' },
  'fighter-indomitable': { feature: 'Indomitable', max: '@classLevel >= 17 ? 3 : @classLevel >= 13 ? 2 : 1' },
  'monk-ki': { feature: "Monk's Focus", max: '@classLevel' },
  'paladin-lay-on-hands': { feature: 'Lay on Hands', max: '@classLevel * 5' },
  // Not in the 5.2.1 feature table, but the sheet still tracks it — it gets a feature of its own.
  'paladin-divine-sense': { feature: 'Divine Sense', max: '1 + max(0, @cha.mod)' },
  'sorcerer-sorcery-points': { feature: 'Font of Magic', max: '@classLevel' },
  'wizard-arcane-recovery': { feature: 'Arcane Recovery', max: '1' }
}

/** compendium.ts's BUFF_EFFECTS: what activating a resource does while it's on, as a toggle that spends the resource. */
const RESOURCE_TOGGLES: Record<string, Effect[]> = {
  'barbarian-rage': [
    { do: { kind: 'rollMode', target: 'check:str', mode: 'advantage' } },
    { do: { kind: 'rollMode', target: 'save:str', mode: 'advantage' } },
    ...['Bludgeoning', 'Piercing', 'Slashing'].map((damageType): Effect => ({ do: { kind: 'damageRelation', damageType, relation: 'resistance' } })),
    // Strength-based melee weapon attacks only — not the unarmed strike.
    { do: { kind: 'extraDamage', damage: '@table.rageDamage', appliesTo: { kinds: ['weapon'], range: 'melee', abilities: ['str'] } } }
  ]
}

/** TOGGLE_FEATURES' effects (BUFF_EFFECTS entries for free toggles). */
const FREE_TOGGLE_EFFECTS: Record<string, Effect[]> = {
  // The sheet gives blanket advantage; "melee Strength attacks only" is the rules text.
  'barbarian-reckless-attack': [{ do: { kind: 'rollMode', target: 'attack', mode: 'advantage' } }]
}

function resourceEffects(classId: string, def: ClassResourceDef): Effect[] {
  const conv = RESOURCES[def.id]
  if (!conv) throw new Error(`No formula conversion for class resource "${def.id}"`)
  if (!conv.recharge && new Set(byLevel(def.recharge)).size > 1) throw new Error(`Class resource "${def.id}" changes recharge by level — give it a conditional recharge`)
  const recharge = conv.recharge ?? def.recharge(1)
  const effects: Effect[] = [
    {
      do: {
        kind: 'grantResource',
        resource: {
          id: def.id,
          name: def.name,
          description: def.description,
          max: conv.max,
          recharge,
          display: def.kind,
          ...(def.actionType ? { actionType: def.actionType } : {})
        }
      }
    }
  ]
  if (RESOURCE_TOGGLES[def.id]) {
    effects.push({
      do: {
        kind: 'grantToggle',
        toggle: { id: def.id, name: def.name, description: def.description, ...(def.actionType ? { actionType: def.actionType } : {}), cost: { resourceId: def.id }, effects: RESOURCE_TOGGLES[def.id] }
      }
    })
  }
  for (const a of RESOURCE_ACTIONS.filter((x) => x.resourceId === def.id && x.classId === classId)) {
    effects.push({ do: { kind: 'grantAction', action: { id: a.id, name: a.name, description: a.description, actionType: a.actionType, cost: { resourceId: a.resourceId, amount: String(a.cost) } } } })
  }
  return effects
}

// ---------------------------------------------------------------------------
// Feature effects by class and feature name

const optionChoice = (label: string, listId: string): Effect => ({ do: { kind: 'grantChoice', choice: { id: CLASS_CHOICE_IDS.option, label, from: { kind: 'optionList', listId } } } })
const feats = (label: string, categories?: string[]): Effect => ({
  do: { kind: 'grantChoice', choice: { id: CLASS_CHOICE_IDS.feat, label, from: { kind: 'feats', ...(categories ? { categories } : {}) } } }
})
const spellChoice = (label: string, count: number, from: Extract<ChoiceDef['from'], { kind: 'spells' }>): Effect => ({
  do: { kind: 'grantChoice', choice: { id: CLASS_CHOICE_IDS.spells, label, count: String(count), from } }
})
const grantSpells = (...ids: string[]): Effect[] => {
  const known = ids.filter((id) => getSpellById(id))
  return known.length ? [{ do: { kind: 'grantSpells', spellIds: known, alwaysPrepared: true, free: true } }] : []
}

/** Effects every class gets for a feature of this name. */
const COMMON_FEATURES: Record<string, (classId: string) => Effect[]> = {
  'Ability Score Improvement': () => [feats('Ability Score Improvement or feat')],
  // "An Epic Boon feat, or another feat of your choice for which you qualify."
  'Epic Boon': () => [feats('Epic Boon')],
  'Fighting Style': () => [feats('Fighting Style', ['Fighting Style'])]
}

const CLASS_FEATURES: Record<string, Record<string, Effect[]>> = {
  barbarian: {
    'Weapon Mastery': [weaponMastery('@table.masteries', 'melee')],
    'Unarmored Defense': [{ when: NO_BODY_ARMOR, do: { kind: 'acFormula', label: 'Unarmored Defense', formula: '10 + @dex.mod + @con.mod' } }],
    'Danger Sense': [advantage('save:dex')],
    'Extra Attack': [attacks(2)],
    'Fast Movement': [{ when: NOT_HEAVY, do: { kind: 'modify', target: 'speed.walk', op: 'add', value: '10' } }],
    'Feral Instinct': [advantage('initiative')],
    // compendium.ts's effectiveAbilityScores: +4 after the usual cap (and any Epic Boon), to a maximum of 24.
    'Primal Champion': (['str', 'con'] as Ability[]).flatMap((a): Effect[] => [
      { do: { kind: 'modify', target: `ability.${a}.score`, op: 'add', value: '4', uncapped: true } },
      { do: { kind: 'modify', target: `ability.${a}.score`, op: 'atMost', value: '24' } }
    ])
  },
  bard: {
    Expertise: [expertise('Expertise', 2)],
    // Half proficiency (rounded down) on every check without it — skills and initiative.
    'Jack of All Trades': [
      ...SKILL_IDS.map((s): Effect => ({ do: { kind: 'modify', target: `skill.${s}.proficiency`, op: 'atLeast', value: '0.5' } })),
      { do: { kind: 'modify', target: 'initiative', op: 'add', value: 'floor(@prof / 2)' } }
    ],
    'Magical Secrets': [spellChoice('Magical Secrets', 2, { kind: 'spells', minLevel: 1, maxLevel: 'min(9, ceil(@classLevel / 2))' })],
    'Words of Creation': grantSpells('power-word-heal', 'power-word-kill')
  },
  cleric: { 'Divine Order': [optionChoice('Divine Order', LIST_IDS.divineOrder)] },
  druid: { Druidic: grantSpells('speak-with-animals'), 'Primal Order': [optionChoice('Primal Order', LIST_IDS.primalOrder)] },
  fighter: { 'Weapon Mastery': [weaponMastery('@table.masteries')], 'Extra Attack': [attacks(2)], 'Two Extra Attacks': [attacks(3)], 'Three Extra Attacks': [attacks(4)] },
  monk: {
    // Neither applies with any armour or a shield (compendium.ts's computeArmorClassFromEquipment / classFeatureSpeedBonus).
    'Unarmored Defense': [{ when: NO_ARMOR_OR_SHIELD, do: { kind: 'acFormula', label: 'Unarmored Defense', formula: '10 + @dex.mod + @wis.mod' } }],
    'Unarmored Movement': [{ when: NO_ARMOR_OR_SHIELD, do: { kind: 'modify', target: 'speed.walk', op: 'add', value: '@table.unarmoredMovement' } }],
    // Unarmed Strikes use the Martial Arts die and Strength or Dexterity; Monk weapons (Simple melee, Martial with Light) can use Dexterity.
    'Martial Arts': [
      {
        when: NO_ARMOR_OR_SHIELD,
        do: { kind: 'grantAttack', attack: { id: 'martial-arts', name: 'Unarmed Strike', range: 'melee', abilities: ['str', 'dex'], damage: '1d@table.martialArts', damageType: 'Bludgeoning', replaces: 'unarmed-strike' } }
      },
      { when: NO_ARMOR_OR_SHIELD, do: { kind: 'attackAbility', ability: 'dex', appliesTo: { kinds: ['weapon'], range: 'melee', item: { weaponCategories: ['simple'] } } } },
      { when: NO_ARMOR_OR_SHIELD, do: { kind: 'attackAbility', ability: 'dex', appliesTo: { kinds: ['weapon'], item: { weaponCategories: ['martial'], properties: ['light'] } } } }
    ],
    'Extra Attack': [attacks(2)],
    'Disciplined Survivor': saveProfs(['str', 'dex', 'con', 'int', 'wis', 'cha']),
    'Body and Mind': (['dex', 'wis'] as Ability[]).flatMap((a): Effect[] => [
      { do: { kind: 'modify', target: `ability.${a}.score`, op: 'add', value: '4', uncapped: true } },
      { do: { kind: 'modify', target: `ability.${a}.score`, op: 'atMost', value: '25' } }
    ])
  },
  paladin: {
    'Weapon Mastery': [weaponMastery('2')],
    "Paladin's Smite": grantSpells('divine-smite'),
    'Faithful Steed': grantSpells('find-steed'),
    'Extra Attack': [attacks(2)],
    // You (and allies within 10 ft.) add your Charisma modifier, minimum +1, to saving throws.
    'Aura of Protection': (['str', 'dex', 'con', 'int', 'wis', 'cha'] as Ability[]).map((a): Effect => ({ do: { kind: 'modify', target: `save.${a}`, op: 'add', value: 'max(1, @cha.mod)' } })),
    'Aura of Courage': [{ do: { kind: 'conditionImmunity', conditionId: 'frightened' } }]
  },
  ranger: {
    'Weapon Mastery': [weaponMastery('2')],
    'Favored Enemy': grantSpells('hunters-mark'),
    'Deft Explorer': [
      expertise('Deft Explorer: Expertise', 1),
      { do: { kind: 'grantChoice', choice: { id: 'languages', label: 'Deft Explorer: Languages', count: '2', from: { kind: 'freeform' }, onPick: [{ do: { kind: 'proficiency', category: 'language', value: '$pick' } }] } } }
    ],
    Expertise: [expertise('Expertise', 2)],
    'Extra Attack': [attacks(2)],
    Roving: [
      { when: NOT_HEAVY, do: { kind: 'modify', target: 'speed.walk', op: 'add', value: '10' } },
      { do: { kind: 'modify', target: 'speed.climb', op: 'set', value: '@speed.walk' } },
      { do: { kind: 'modify', target: 'speed.swim', op: 'set', value: '@speed.walk' } }
    ],
    'Feral Senses': [{ do: { kind: 'modify', target: 'sense.blindsight', op: 'set', value: '30' } }]
  },
  rogue: { 'Weapon Mastery': [weaponMastery('2')], Expertise: [expertise('Expertise', 2)], 'Slippery Mind': saveProfs(['wis', 'cha']) },
  sorcerer: {
    Metamagic: [{ do: { kind: 'grantChoice', choice: { id: CLASS_CHOICE_IDS.options, label: 'Metamagic', count: '2', from: { kind: 'optionList', listId: LIST_IDS.metamagic } } } }]
  },
  warlock: {
    'Eldritch Invocations': [
      { do: { kind: 'grantChoice', choice: { id: CLASS_CHOICE_IDS.options, label: 'Eldritch Invocation', count: '@table.invocations', from: { kind: 'optionList', listId: LIST_IDS.invocations } } } }
    ],
    'Contact Patron': grantSpells('contact-other-plane'),
    ...Object.fromEntries(
      [6, 7, 8, 9].map((lvl) => [`Mystic Arcanum (${lvl}th level)`, [spellChoice(`Mystic Arcanum (${lvl}th level)`, 1, { kind: 'spells', lists: ['warlock'], minLevel: lvl, maxLevel: String(lvl) })]])
    )
  },
  wizard: {
    'Spell Mastery': [spellChoice('Spell Mastery', 2, { kind: 'spells', lists: ['wizard'], minLevel: 1, maxLevel: '2' })],
    'Signature Spells': [spellChoice('Signature Spells', 2, { kind: 'spells', lists: ['wizard'], minLevel: 3, maxLevel: '3' })]
  }
}

// ---------------------------------------------------------------------------
// Class tables

/** compendium.ts's CANTRIPS_KNOWN_AT_LEVEL_1 — +1 at 4th level and again at 10th. */
const CANTRIPS_AT_1: Record<string, number> = { bard: 2, cleric: 3, druid: 2, sorcerer: 4, warlock: 2, wizard: 3 }

function columns(cls: Class): ColumnInput[] {
  const cols: ColumnInput[] = []
  const add = (id: string, label: string, values: Array<number | string>): void => void cols.push({ id, label, values })
  if (cls.id === 'barbarian') {
    const rage = CLASS_RESOURCES.barbarian.find((r) => r.id === 'barbarian-rage')!
    add('rages', 'Rages', byLevel((l) => rage.max(l, () => 0)))
    add('rageDamage', 'Rage Damage', byLevel((l) => (l >= 16 ? 4 : l >= 9 ? 3 : 2)))
    add('masteries', 'Weapon Mastery', byLevel((l) => (l >= 10 ? 4 : l >= 4 ? 3 : 2)))
  }
  if (cls.id === 'fighter') add('masteries', 'Weapon Mastery', byLevel((l) => (l >= 16 ? 6 : l >= 10 ? 5 : l >= 4 ? 4 : 3)))
  if (cls.id === 'monk') add('martialArts', 'Martial Arts', byLevel((l) => (l >= 17 ? 12 : l >= 11 ? 10 : l >= 5 ? 8 : 6)))
  if (cls.id === 'monk') add('unarmoredMovement', 'Unarmored Movement', byLevel((l) => (l >= 18 ? 30 : l >= 14 ? 25 : l >= 10 ? 20 : l >= 6 ? 15 : l >= 2 ? 10 : 0)))
  if (cls.id === 'rogue') add('sneakAttack', 'Sneak Attack (d6)', byLevel((l) => Math.min(10, Math.ceil(l / 2))))
  if (cls.id === 'warlock') add('invocations', 'Eldritch Invocations', byLevel(eldritchInvocationSlotCountAtLevel))
  if (CANTRIPS_AT_1[cls.id] !== undefined) add('cantrips', 'Cantrips', byLevel((l) => CANTRIPS_AT_1[cls.id] + (l >= 10 ? 2 : l >= 4 ? 1 : 0)))
  if (spellsKnownForClassLevel(cls.id, 1) !== null) add('spellsKnown', 'Spells Known', byLevel((l) => spellsKnownForClassLevel(cls.id, l) ?? 0))
  const prepared = PREPARED_SPELLS_BY_LEVEL[cls.id]
  if (prepared) add('prepared', 'Prepared Spells', prepared)
  return cols
}

function spellcasting(cls: Class): ClassInput['spellcasting'] {
  if (!cls.spellcastingAbility) return undefined
  const rows = byLevel((l) => spellSlotsForClassLevel(cls.id, l))
  return {
    ability: cls.spellcastingAbility,
    ...(rows.some((r) => r.length) ? { slots: { ...(cls.id === 'warlock' ? { pool: 'pact' } : {}), rows } } : {}),
    ...(PREPARED_SPELLS_BY_LEVEL[cls.id] ? { prepared: '@table.prepared' } : {}),
    ...(spellsKnownForClassLevel(cls.id, 1) !== null ? { known: '@table.spellsKnown' } : {}),
    ...(CANTRIPS_AT_1[cls.id] !== undefined ? { cantrips: '@table.cantrips' } : {}),
    ...(cls.id === 'wizard' ? { ritualCasting: true, spellbook: true } : {})
  }
}

function levels(cls: Class): LevelInput[] {
  const byLvl = new Map<number, FeatureInput[]>()
  const at = (level: number): FeatureInput[] => {
    if (!byLvl.has(level)) byLvl.set(level, [])
    return byLvl.get(level)!
  }
  for (const f of CLASS_LEVEL_FEATURES[cls.id] ?? []) {
    const effects = [...(COMMON_FEATURES[f.name]?.(cls.id) ?? []), ...(CLASS_FEATURES[cls.id]?.[f.name] ?? [])]
    at(f.level).push({ id: featureId(f.name, f.level), name: f.name, description: f.description, effects })
  }
  const attach = (level: number, name: string, description: string, effects: Effect[]): void => {
    const list = at(level)
    let feature = list.find((f) => f.name === name)
    if (!feature) {
      feature = { id: featureId(name, level), name, description, effects: [] }
      list.push(feature)
    }
    feature.effects = [...(feature.effects ?? []), ...effects]
  }
  for (const def of CLASS_RESOURCES[cls.id] ?? []) attach(def.minLevel, RESOURCES[def.id]?.feature ?? def.name, def.fullDescription, resourceEffects(cls.id, def))
  for (const t of TOGGLE_FEATURES.filter((x) => x.classId === cls.id)) {
    attach(t.minLevel, t.name, t.description, [
      { do: { kind: 'grantToggle', toggle: { id: t.id, name: t.name, description: t.description, actionType: t.actionType, effects: FREE_TOGGLE_EFFECTS[t.id] ?? [] } } }
    ])
  }
  return [...byLvl.entries()].sort((a, b) => a[0] - b[0]).map(([level, features]) => ({ level, features }))
}

export function srdClasses(): ClassInput[] {
  return CLASSES.map((cls) => {
    const prof = PROFICIENCIES[cls.id]
    return {
      id: cls.id,
      name: cls.name,
      hitDie: cls.hitDie,
      primaryAbilities: cls.primaryAbility,
      saves: cls.savingThrowProficiencies,
      skillChoice: { count: cls.skillChoice.choose, from: cls.skillChoice.from.map(skillId) },
      armorProficiencies: prof.armor,
      weaponProficiencies: prof.weapon,
      toolProficiencies: prof.tool ?? [],
      multiclassProficiencies: prof.multiclass,
      subclassLevel: cls.subclassLevel,
      columns: columns(cls),
      levels: levels(cls),
      ...(cls.spellcastingAbility ? { spellcasting: spellcasting(cls) } : {})
    }
  })
}

// ---------------------------------------------------------------------------
// Subclasses

/** Option list id for a subclass feature written as several mutually exclusive options. */
export const subclassChoiceListId = (subclassId: string, baseName: string): string => `${subclassId}-${slug(baseName)}`

/** Effects for one subclass option (Circle of the Land's land → its always-prepared circle spells). */
function subclassOptionEffects(classId: string, baseName: string, label: string): Effect[] {
  if (baseName !== 'Circle of the Land') return []
  return Object.entries(CIRCLE_OF_THE_LAND_SPELLS[label] ?? {}).flatMap(([lvl, ids]) =>
    grantSpells(...ids).map((e) => ({ ...e, when: { kind: 'classLevel' as const, classId, min: Number(lvl) } }))
  )
}

/** Effects on single subclass features that dnd5e.ts/compendium.ts apply in code. */
const SUBCLASS_FEATURES: Record<string, Record<string, Effect[]>> = {
  berserker: { 'Mindless Rage': ['charmed', 'frightened'].map((conditionId): Effect => ({ when: RAGING, do: { kind: 'conditionImmunity', conditionId } })) },
  lore: {
    'Bonus Proficiencies': [
      { do: { kind: 'grantChoice', choice: { id: 'skills', label: 'Bonus Proficiencies', count: '3', from: { kind: 'skills' }, onPick: [{ do: { kind: 'proficiency', category: 'skill', value: '$pick' } }] } } }
    ]
  },
  life: {
    'Life Domain Spells': spellsAt('cleric', [
      [3, ['aid', 'bless', 'cure-wounds', 'lesser-restoration']],
      [5, ['mass-healing-word', 'revivify']],
      [7, ['aura-of-life', 'death-ward']],
      [9, ['greater-restoration', 'mass-cure-wounds']]
    ])
  },
  champion: {
    // dnd5e.ts's subclassFightingStyleSlotLevelsUpToLevel.
    'Additional Fighting Style': [feats('Additional Fighting Style', ['Fighting Style'])],
    'Improved Critical': [{ do: { kind: 'modify', target: 'crit.threshold', op: 'atMost', value: '19' } }],
    'Superior Critical': [{ do: { kind: 'modify', target: 'crit.threshold', op: 'atMost', value: '18' } }],
    'Remarkable Athlete': [advantage('initiative'), advantage('skill:athletics')]
  },
  devotion: {
    'Oath of Devotion Spells': spellsAt('paladin', [
      [3, ['protection-from-evil-and-good', 'shield-of-faith']],
      [5, ['aid', 'zone-of-truth']],
      [9, ['beacon-of-hope', 'dispel-magic']],
      [13, ['freedom-of-movement', 'guardian-of-faith']],
      [17, ['commune', 'flame-strike']]
    ]),
    'Aura of Devotion': [{ do: { kind: 'conditionImmunity', conditionId: 'charmed' } }]
  },
  thief: { 'Second-Story Work': [{ do: { kind: 'modify', target: 'speed.climb', op: 'set', value: '@speed.walk' } }] },
  draconic: {
    // +3 at Sorcerer level 3 and +1 per level after: the Sorcerer level. Base AC 10 + Dex + Cha while unarmored.
    'Draconic Resilience': [
      { do: { kind: 'modify', target: 'hp.max', op: 'add', value: '@classLevel' } },
      { when: NO_BODY_ARMOR, do: { kind: 'acFormula', label: 'Draconic Resilience', formula: '10 + @dex.mod + @cha.mod' } }
    ],
    'Draconic Spells': spellsAt('sorcerer', [
      [3, ['alter-self', 'chromatic-orb', 'command', 'dragons-breath']],
      [5, ['fear', 'fly']],
      [7, ['arcane-eye', 'charm-monster']],
      [9, ['legend-lore', 'summon-dragon']]
    ])
  },
  fiend: {
    'Fiend Spells': spellsAt('warlock', [
      [3, ['burning-hands', 'command', 'scorching-ray', 'suggestion']],
      [5, ['fireball', 'stinking-cloud']],
      [7, ['fire-shield', 'wall-of-fire']],
      [9, ['geas', 'insect-plague']]
    ])
  }
}

export function srdSubclasses(): { subclasses: SubclassInput[]; optionLists: OptionListInput[] } {
  const optionLists: OptionListInput[] = []
  const subclasses = SUBCLASSES.map((sc): SubclassInput => {
    const byLvl = new Map<number, FeatureInput[]>()
    for (const g of groupedSubclassFeaturesForLevelUp(sc.classId, sc.id, 0, 20)) {
      const level = g.kind === 'single' ? g.feature.level : g.level
      const list = byLvl.get(level) ?? []
      byLvl.set(level, list)
      if (g.kind === 'single') {
        list.push({ id: featureId(g.feature.name, level), name: g.feature.name, description: g.feature.desc, effects: SUBCLASS_FEATURES[sc.id]?.[g.feature.name] ?? [] })
        continue
      }
      const listId = subclassChoiceListId(sc.id, g.baseName)
      optionLists.push({
        id: listId,
        name: g.baseName,
        options: g.options.map((o) => ({ id: slug(o.label), name: o.label, description: o.desc, effects: subclassOptionEffects(sc.classId, g.baseName, o.label) }))
      })
      list.push({
        id: featureId(g.baseName, level),
        name: g.baseName,
        description: g.intro ?? '',
        effects: [{ do: { kind: 'grantChoice', choice: { id: CLASS_CHOICE_IDS.option, label: g.baseName, from: { kind: 'optionList', listId } } } }]
      })
    }
    return {
      id: sc.id,
      name: sc.name,
      description: sc.flavor ?? '',
      classId: sc.classId,
      levels: [...byLvl.entries()].sort((a, b) => a[0] - b[0]).map(([level, features]) => ({ level, features }))
    }
  })
  return { subclasses, optionLists }
}
