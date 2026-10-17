// Two small packs that exercise the engine end to end: a trimmed 5e core
// written entirely as pack data (no special cases — the same shapes the
// SRD pack will use in phase 2), and a homebrew-flavoured homebrew pack built on
// top of it with custom stats, resources, toggles, nested choices, an
// override and a hide.

import { parsePack } from '@shared/content/validate'
import type { ContentPack, ContentPackInput } from '@shared/content/schema'

const range = (n: number, f: (level: number) => number): number[] => Array.from({ length: n }, (_, i) => f(i + 1))

const bodyArmor = { kind: 'equipped' as const, filter: { armorCategories: ['light', 'medium', 'heavy'] } }
const shield = { kind: 'equipped' as const, filter: { armorCategories: ['shield'] } }

const asiFeature = (level: number) => ({
  id: `asi-${level}`,
  name: 'Ability Score Improvement',
  effects: [{ do: { kind: 'grantChoice' as const, choice: { id: 'feat', label: 'Ability Score Improvement or feat', from: { kind: 'feats' as const, categories: ['General'] } } } }]
})

export const coreInput: ContentPackInput = {
  formatVersion: 1,
  id: 'core',
  name: 'Test Core',
  builtIn: true,
  terminology: { spellSlots: 'Spell Slots' },
  vocabulary: {
    skills: [
      { id: 'athletics', name: 'Athletics', ability: 'str' },
      { id: 'stealth', name: 'Stealth', ability: 'dex' },
      { id: 'perception', name: 'Perception', ability: 'wis' },
      { id: 'arcana', name: 'Arcana', ability: 'int' }
    ],
    conditions: [
      {
        id: 'exhaustion',
        name: 'Exhaustion',
        maxLevel: 6,
        effects: [
          { when: { kind: 'condition', conditionId: 'exhaustion', minLevel: 1 }, do: { kind: 'rollMode', target: 'check:str', mode: 'disadvantage' } },
          { when: { kind: 'condition', conditionId: 'exhaustion', minLevel: 2 }, do: { kind: 'modify', target: 'speed.walk', op: 'transform', value: 'floor(@value / 2 / 5) * 5' } },
          { when: { kind: 'condition', conditionId: 'exhaustion', minLevel: 4 }, do: { kind: 'modify', target: 'hp.max', op: 'transform', value: 'floor(@value / 2)' } },
          { when: { kind: 'condition', conditionId: 'exhaustion', minLevel: 5 }, do: { kind: 'modify', target: 'speed.walk', op: 'atMost', value: '0' } }
        ]
      }
    ]
  },
  species: [
    { id: 'human', name: 'Human', speed: { walk: '30' } },
    { id: 'dwarf', name: 'Dwarf', speed: { walk: '25' }, traits: [{ id: 'toughness', name: 'Dwarven Toughness', effects: [{ do: { kind: 'modify', target: 'hp.max', op: 'add', value: '@level' } }] }] },
    {
      id: 'elf',
      name: 'Elf',
      speed: { walk: '35' },
      traits: [{ id: 'keen-senses', name: 'Keen Senses', effects: [{ do: { kind: 'proficiency', category: 'skill', value: 'perception' } }] }]
    }
  ],
  feats: [
    {
      id: 'ability-score-improvement',
      name: 'Ability Score Improvement',
      category: 'General',
      repeatable: true,
      effects: [
        {
          do: {
            kind: 'grantChoice',
            choice: {
              id: 'scores',
              label: 'Increase ability scores',
              count: '2',
              from: { kind: 'abilities' },
              allowRepeats: true,
              maxRepeats: 2,
              onPick: [{ do: { kind: 'modify', target: 'ability.$pick.score', op: 'add', value: '1' } }]
            }
          }
        }
      ]
    },
    { id: 'tough', name: 'Tough', category: 'General', effects: [{ do: { kind: 'modify', target: 'hp.max', op: 'add', value: '2 * @level' } }] },
    { id: 'alert', name: 'Alert', category: 'General', effects: [{ do: { kind: 'modify', target: 'initiative', op: 'add', value: '@prof' } }] },
    {
      id: 'heavy-hitter',
      name: 'Heavy Hitter',
      category: 'General',
      prerequisite: { kind: 'formula', formula: '@str.score >= 13' },
      effects: [{ do: { kind: 'modify', target: 'attack.damage', op: 'add', value: '1', appliesTo: { range: 'melee' } } }]
    },
    { id: 'defense', name: 'Defense', category: 'Fighting Style', effects: [{ when: bodyArmor, do: { kind: 'modify', target: 'ac', op: 'add', value: '1' } }] },
    { id: 'archery', name: 'Archery', category: 'Fighting Style', effects: [{ do: { kind: 'modify', target: 'attack.bonus', op: 'add', value: '2', appliesTo: { range: 'ranged' } } }] },
    {
      id: 'boon-of-fate',
      name: 'Boon of Fate',
      category: 'Epic Boon',
      effects: [
        {
          do: {
            kind: 'grantChoice',
            choice: {
              id: 'score',
              label: 'Increase one ability score',
              from: { kind: 'abilities' },
              onPick: [{ do: { kind: 'modify', target: 'ability.$pick.score', op: 'add', value: '1', uncapped: true } }]
            }
          }
        },
        { do: { kind: 'note', text: 'Roll 2d4 to bend a nearby D20 Test.' } }
      ]
    }
  ],
  items: [
    { id: 'leather-armor', name: 'Leather Armor', category: 'Armor', armor: { category: 'light' }, effects: [{ do: { kind: 'acFormula', label: 'Leather', formula: '11 + @dex.mod' } }] },
    { id: 'half-plate', name: 'Half Plate', category: 'Armor', armor: { category: 'medium' }, effects: [{ do: { kind: 'acFormula', label: 'Half Plate', formula: '15 + min(@dex.mod, 2)' } }] },
    {
      id: 'chain-mail',
      name: 'Chain Mail',
      category: 'Armor',
      armor: { category: 'heavy', strengthRequirement: 13, stealthDisadvantage: true },
      effects: [
        { do: { kind: 'acFormula', label: 'Chain Mail', formula: '16' } },
        { when: { kind: 'formula', formula: '@str.score < 13' }, do: { kind: 'modify', target: 'speed.walk', op: 'add', value: '-10' } },
        { do: { kind: 'rollMode', target: 'skill:stealth', mode: 'disadvantage' } }
      ]
    },
    { id: 'shield', name: 'Shield', category: 'Armor', armor: { category: 'shield' }, effects: [{ do: { kind: 'modify', target: 'ac', op: 'add', value: '2' } }] },
    { id: 'longsword', name: 'Longsword', category: 'Weapon', weapon: { category: 'martial', range: 'melee', damage: '1d8', damageType: 'Slashing', versatileDamage: '1d10', properties: ['Versatile'] } },
    { id: 'rapier', name: 'Rapier', category: 'Weapon', weapon: { category: 'martial', range: 'melee', damage: '1d8', damageType: 'Piercing', properties: ['Finesse'] } },
    { id: 'longbow', name: 'Longbow', category: 'Weapon', weapon: { category: 'martial', range: 'ranged', damage: '1d8', damageType: 'Piercing', properties: ['Heavy', 'Two-Handed'] } },
    { id: 'dagger', name: 'Dagger', category: 'Weapon', weapon: { category: 'simple', range: 'melee', damage: '1d4', damageType: 'Piercing', properties: ['Finesse', 'Light'] } },
    {
      id: 'ring-of-protection',
      name: 'Ring of Protection',
      category: 'Ring',
      requiresAttunement: true,
      effectsWhen: 'attuned',
      effects: [
        { do: { kind: 'modify', target: 'ac', op: 'add', value: '1' } },
        ...(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((a) => ({ do: { kind: 'modify' as const, target: `save.${a}`, op: 'add' as const, value: '1' } }))
      ]
    },
    {
      id: 'wand-of-sparks',
      name: 'Wand of Sparks',
      category: 'Wand',
      charges: { id: 'wand-of-sparks-charges', name: 'Charges', max: '7', recharge: 'dawn' },
      effectsWhen: 'carried'
    }
  ],
  spells: [
    { id: 'mage-armor', name: 'Mage Armor', level: 1, lists: ['wizard'], effects: [{ when: { kind: 'not', of: bodyArmor }, do: { kind: 'acFormula', label: 'Mage Armor', formula: '13 + @dex.mod' } }] },
    { id: 'fire-bolt', name: 'Fire Bolt', level: 0, lists: ['wizard'], damage: '(1 + (@level >= 5) + (@level >= 11) + (@level >= 17))d10' },
    { id: 'shield-spell', name: 'Shield', level: 1, lists: ['wizard'] },
    { id: 'fireball', name: 'Fireball', level: 3, lists: ['wizard'] }
  ],
  classes: [
    {
      id: 'fighter',
      name: 'Fighter',
      hitDie: 10,
      saves: ['str', 'con'],
      armorProficiencies: ['light', 'medium', 'heavy', 'shield'],
      weaponProficiencies: ['simple', 'martial'],
      multiclassProficiencies: ['armor:light', 'armor:medium', 'armor:shield', 'weapon:martial'],
      levels: [
        {
          level: 1,
          features: [
            { id: 'fighting-style', name: 'Fighting Style', effects: [{ do: { kind: 'grantChoice', choice: { id: 'style', label: 'Fighting Style', from: { kind: 'feats', categories: ['Fighting Style'] } } } }] },
            {
              id: 'second-wind',
              name: 'Second Wind',
              effects: [
                { do: { kind: 'grantResource', resource: { id: 'second-wind', name: 'Second Wind', max: '@classLevel >= 10 ? 4 : @classLevel >= 4 ? 3 : 2', recharge: 'long', actionType: 'bonus' } } },
                { do: { kind: 'grantAction', action: { id: 'second-wind-use', name: 'Second Wind', actionType: 'bonus', cost: { resourceId: 'second-wind' }, healing: '1d10 + @classLevel' } } }
              ]
            }
          ]
        },
        { level: 4, features: [asiFeature(4)] },
        { level: 8, features: [asiFeature(8)] },
        { level: 12, features: [asiFeature(12)] },
        {
          level: 19,
          features: [{ id: 'epic-boon', name: 'Epic Boon', effects: [{ do: { kind: 'grantChoice', choice: { id: 'boon', label: 'Epic Boon', from: { kind: 'feats', categories: ['Epic Boon'] } } } }] }]
        }
      ]
    },
    {
      id: 'barbarian',
      name: 'Barbarian',
      hitDie: 12,
      saves: ['str', 'con'],
      armorProficiencies: ['light', 'medium', 'shield'],
      weaponProficiencies: ['simple', 'martial'],
      columns: [
        { id: 'rages', label: 'Rages', values: range(20, (l) => (l >= 17 ? 6 : l >= 12 ? 5 : l >= 6 ? 4 : l >= 3 ? 3 : 2)) },
        { id: 'rageDamage', label: 'Rage Damage', values: range(20, (l) => (l >= 16 ? 4 : l >= 9 ? 3 : 2)) }
      ],
      levels: [
        {
          level: 1,
          features: [
            {
              id: 'rage',
              name: 'Rage',
              effects: [
                { do: { kind: 'grantResource', resource: { id: 'rage', name: 'Rage', max: '@table.rages', recharge: { when: { kind: 'classLevel', classId: 'barbarian', min: 5 }, then: 'short', else: 'long' }, actionType: 'bonus' } } },
                {
                  do: {
                    kind: 'grantToggle',
                    toggle: {
                      id: 'raging',
                      name: 'Raging',
                      actionType: 'bonus',
                      cost: { resourceId: 'rage' },
                      effects: [
                        { do: { kind: 'rollMode', target: 'check:str', mode: 'advantage' } },
                        { do: { kind: 'rollMode', target: 'save:str', mode: 'advantage' } },
                        { do: { kind: 'damageRelation', damageType: 'Bludgeoning', relation: 'resistance' } },
                        { do: { kind: 'damageRelation', damageType: 'Piercing', relation: 'resistance' } },
                        { do: { kind: 'damageRelation', damageType: 'Slashing', relation: 'resistance' } },
                        { do: { kind: 'extraDamage', damage: '@table.rageDamage', appliesTo: { range: 'melee', abilities: ['str'] } } }
                      ]
                    }
                  }
                }
              ]
            },
            { id: 'unarmored-defense', name: 'Unarmored Defense', effects: [{ when: { kind: 'not', of: bodyArmor }, do: { kind: 'acFormula', label: 'Unarmored Defense', formula: '10 + @dex.mod + @con.mod' } }] }
          ]
        },
        {
          level: 2,
          features: [{ id: 'reckless', name: 'Reckless Attack', effects: [{ do: { kind: 'grantToggle', toggle: { id: 'reckless', name: 'Reckless Attack', effects: [{ do: { kind: 'rollMode', target: 'attack', mode: 'advantage', appliesTo: { range: 'melee', abilities: ['str'] } } }] } } }] }]
        },
        {
          level: 20,
          features: [
            {
              id: 'primal-champion',
              name: 'Primal Champion',
              effects: (['str', 'con'] as const).flatMap((a) => [
                { do: { kind: 'modify' as const, target: `ability.${a}.max`, op: 'set' as const, value: '24' } },
                { do: { kind: 'modify' as const, target: `ability.${a}.score`, op: 'add' as const, value: '4' } }
              ])
            }
          ]
        }
      ]
    },
    {
      id: 'monk',
      name: 'Monk',
      hitDie: 8,
      saves: ['str', 'dex'],
      weaponProficiencies: ['simple'],
      columns: [
        { id: 'martialArts', label: 'Martial Arts', values: range(20, (l) => (l >= 17 ? 12 : l >= 11 ? 10 : l >= 5 ? 8 : 6)) },
        { id: 'movement', label: 'Unarmored Movement', values: range(20, (l) => (l >= 18 ? 30 : l >= 14 ? 25 : l >= 10 ? 20 : l >= 6 ? 15 : l >= 2 ? 10 : 0)) }
      ],
      levels: [
        {
          level: 1,
          features: [
            {
              id: 'martial-arts',
              name: 'Martial Arts',
              effects: [
                { do: { kind: 'grantAttack', attack: { id: 'martial-arts', name: 'Unarmed Strike', range: 'melee', abilities: ['str', 'dex'], damage: '1d@table.martialArts', damageType: 'Bludgeoning', replaces: 'unarmed-strike' } } },
                { do: { kind: 'attackAbility', ability: 'dex', appliesTo: { item: { weaponCategories: ['simple'] } } } }
              ]
            },
            {
              id: 'unarmored-defense',
              name: 'Unarmored Defense',
              effects: [{ when: { kind: 'not', of: { kind: 'any', of: [bodyArmor, shield] } }, do: { kind: 'acFormula', label: 'Unarmored Defense', formula: '10 + @dex.mod + @wis.mod' } }]
            }
          ]
        },
        {
          level: 2,
          features: [
            { id: 'ki', name: 'Ki', effects: [{ do: { kind: 'grantResource', resource: { id: 'ki', name: 'Ki', max: '@classLevel', recharge: 'short', display: 'pool' } } }] },
            {
              id: 'unarmored-movement',
              name: 'Unarmored Movement',
              effects: [{ when: { kind: 'not', of: { kind: 'any', of: [bodyArmor, shield] } }, do: { kind: 'modify', target: 'speed.walk', op: 'add', value: '@table.movement' } }]
            }
          ]
        }
      ]
    },
    {
      id: 'wizard',
      name: 'Wizard',
      hitDie: 6,
      saves: ['int', 'wis'],
      weaponProficiencies: ['simple'],
      spellcasting: {
        ability: 'int',
        slots: { rows: [[2], [3], [4, 2], [4, 3], [4, 3, 2]] },
        prepared: 'max(1, @int.mod + @classLevel)',
        cantrips: '3 + (@classLevel >= 4) + (@classLevel >= 10)',
        ritualCasting: true,
        spellbook: true
      },
      levels: []
    }
  ],
  subclasses: [
    { id: 'champion', name: 'Champion', classId: 'fighter', levels: [{ level: 3, features: [{ id: 'improved-critical', name: 'Improved Critical', effects: [{ do: { kind: 'note', text: 'Crit on 19–20.' } }] }] }] }
  ]
}

export const frontierInput: ContentPackInput = {
  formatVersion: 1,
  id: 'frontier',
  name: 'Arcane Frontier',
  author: 'Test',
  dependsOn: ['core'],
  hides: ['core:tough'],
  terminology: { spellSlots: 'Mana Wells', 'ability.cha': 'Presence', subclass: 'Order' },
  vocabulary: {
    skills: [{ id: 'arcane-sense', name: 'Arcane Sense', ability: 'wis' }],
    damageTypes: [{ id: 'arcane', name: 'Arcane' }],
    stats: [{ id: 'output', name: 'Channel Power', base: '@cha.mod + @prof' }],
    actionTypes: [{ id: 'technique', name: 'Technique' }]
  },
  optionLists: [
    {
      id: 'bloodlines',
      name: 'Bloodlines',
      options: [
        {
          id: 'storm-blood',
          name: 'Storm Blood',
          prerequisite: { kind: 'formula', formula: '@cha.score >= 16' },
          effects: [{ do: { kind: 'modify', target: 'ac', op: 'add', value: 'floor(@cha.mod / 2)' } }]
        },
        {
          id: 'beast-blood',
          name: 'Beast Blood',
          effects: [
            { do: { kind: 'grantChoice', choice: { id: 'spirit-beasts', label: 'Spirit Beasts', count: 'floor(@classLevel / 4) + 1', from: { kind: 'optionList', listId: 'spirit-beasts' } } } }
          ]
        }
      ]
    },
    {
      id: 'spirit-beasts',
      name: 'Spirit Beasts',
      options: [
        { id: 'spirit-wolves', name: 'Spirit Wolves', effects: [{ do: { kind: 'proficiency', category: 'skill', value: 'perception', level: 'expertise' } }] },
        { id: 'spirit-hawk', name: 'Spirit Hawk', effects: [{ do: { kind: 'modify', target: 'speed.fly', op: 'set', value: '30' } }] }
      ]
    }
  ],
  items: [
    { id: 'heavy-longsword', overrides: 'core:longsword', name: 'Longsword', category: 'Weapon', weapon: { category: 'martial', range: 'melee', damage: '1d10', damageType: 'Slashing' } },
    {
      id: 'storm-staff',
      name: 'Storm Staff',
      category: 'Arcane Focus',
      weapon: { category: 'martial', range: 'melee', damage: '3d6', damageType: 'Bludgeoning' },
      effects: [{ do: { kind: 'extraDamage', damage: '1d6', damageType: 'Arcane', appliesTo: { item: { itemIds: ['storm-staff'] } } } }]
    }
  ],
  classes: [
    {
      id: 'channeler',
      name: 'Channeler',
      hitDie: 10,
      saves: ['con', 'cha'],
      weaponProficiencies: ['simple', 'martial'],
      skillChoice: { count: 2, from: ['arcane-sense', 'perception'] },
      subclassLabel: 'Order',
      columns: [
        { id: 'manaPool', label: 'Mana', values: range(20, (l) => l * 2 + 2) },
        { id: 'channelDie', label: 'Channel Die', values: range(20, (l) => (l >= 11 ? 10 : l >= 5 ? 8 : 6)) }
      ],
      levels: [
        {
          level: 1,
          features: [
            {
              id: 'mana',
              name: 'Mana',
              effects: [
                { do: { kind: 'grantResource', resource: { id: 'mana', name: 'Mana', max: '@table.manaPool + @cha.mod', recharge: 'short', display: 'pool' } } },
                {
                  do: {
                    kind: 'grantAction',
                    action: { id: 'arcane-strike', name: 'Arcane Strike', actionType: 'technique', cost: { resourceId: 'mana', amount: '2' }, attackBonus: '@prof + @cha.mod', damage: '2d@table.channelDie + @cha.mod', damageType: 'Arcane' }
                  }
                }
              ]
            },
            { id: 'bloodline', name: 'Bloodline', effects: [{ do: { kind: 'grantChoice', choice: { id: 'technique', label: 'Bloodline', from: { kind: 'optionList', listId: 'bloodlines' } } } }] }
          ]
        },
        {
          level: 3,
          features: [
            {
              id: 'overchannel',
              name: 'Overchannel',
              effects: [
                {
                  do: {
                    kind: 'grantToggle',
                    toggle: {
                      id: 'overchannel',
                      name: 'Overchannel',
                      actionType: 'action',
                      cost: { resourceId: 'mana', amount: '5' },
                      effects: [
                        { do: { kind: 'modify', target: 'ac', op: 'add', value: '2' } },
                        { do: { kind: 'rollMode', target: 'attack', mode: 'advantage' } },
                        { do: { kind: 'modify', target: 'stat.output', op: 'add', value: '@classLevel' } }
                      ]
                    }
                  }
                }
              ]
            }
          ]
        },
        { level: 4, features: [asiFeature(4)] }
      ]
    }
  ]
}

export const core: ContentPack = parsePack(coreInput)
export const frontier: ContentPack = parsePack(frontierInput, [core])
