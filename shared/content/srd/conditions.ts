// The SRD's conditions as pack vocabulary. Each one carries the effects the
// sheet can show — roll modes, speed, resistances — and the rest of its rules
// as a reminder; what attackers get against you (advantage on attacks against
// a Restrained creature…) isn't a number on your own sheet.

import { DAMAGE_TYPES, EXHAUSTION_EFFECTS } from '../../dnd5e'
import type { ContentPackInput, Effect } from '../schema'
import { ABILITY_LIST, note, slug } from './common'

type ConditionInput = NonNullable<NonNullable<ContentPackInput['vocabulary']>['conditions']>[number]

const attacks = (mode: 'advantage' | 'disadvantage'): Effect => ({ do: { kind: 'rollMode', target: 'attack', mode } })
const initiative = (mode: 'advantage' | 'disadvantage'): Effect => ({ do: { kind: 'rollMode', target: 'initiative', mode } })
const checks = (mode: 'advantage' | 'disadvantage'): Effect[] => ABILITY_LIST.map((a) => ({ do: { kind: 'rollMode', target: `check:${a}`, mode } }))
const SPEED_0: Effect = { do: { kind: 'modify', target: 'speed.walk', op: 'atMost', value: '0' } }
const FAILS_STR_DEX = note('Automatically fails Strength and Dexterity saving throws.')
/** Incapacitated's own effects, shared by the conditions that include it. */
const INCAPACITATED: Effect[] = [initiative('disadvantage'), note('Incapacitated: no actions, bonus actions or reactions; concentration is broken; can’t speak.')]

/** dnd5e.ts's applyExhaustionToSpeed / applyExhaustionToMaxHp and compendium.ts's exhaustion roll modes, as a graded condition. */
function exhaustionEffects(): Effect[] {
  const at = (minLevel: number): Effect['when'] => ({ kind: 'condition', conditionId: 'exhaustion', minLevel })
  return [
    ...ABILITY_LIST.map((a): Effect => ({ when: at(1), do: { kind: 'rollMode', target: `check:${a}`, mode: 'disadvantage' } })),
    { when: at(2), do: { kind: 'modify', target: 'speed.walk', op: 'transform', value: 'floor(@value / 2 / 5) * 5' } },
    { when: at(3), do: { kind: 'rollMode', target: 'attack', mode: 'disadvantage' } },
    ...ABILITY_LIST.map((a): Effect => ({ when: at(3), do: { kind: 'rollMode', target: `save:${a}`, mode: 'disadvantage' } })),
    { when: at(4), do: { kind: 'modify', target: 'hp.max', op: 'transform', value: 'floor(@value / 2)' } },
    { when: at(5), do: { kind: 'modify', target: 'speed.walk', op: 'atMost', value: '0' } }
  ]
}

export function srdConditions(): ConditionInput[] {
  return [
    {
      id: 'blinded',
      name: 'Blinded',
      description: 'You can’t see and automatically fail any ability check that requires sight. Attack rolls against you have Advantage, and your attack rolls have Disadvantage.',
      effects: [attacks('disadvantage'), note('Automatically fails ability checks that require sight.')]
    },
    {
      id: 'charmed',
      name: 'Charmed',
      description: 'You can’t attack the charmer or target it with damaging abilities or magical effects. The charmer has Advantage on ability checks to interact with you socially.',
      effects: [note('Can’t attack the charmer or target it with damaging abilities or magical effects.')]
    },
    {
      id: 'deafened',
      name: 'Deafened',
      description: 'You can’t hear and automatically fail any ability check that requires hearing.',
      effects: [note('Automatically fails ability checks that require hearing.')]
    },
    {
      id: 'exhaustion',
      name: 'Exhaustion',
      description: EXHAUSTION_EFFECTS.slice(1, 7).map((e, i) => `Level ${i + 1}: ${e}`).join('\n'),
      maxLevel: 6,
      effects: exhaustionEffects()
    },
    {
      id: 'frightened',
      name: 'Frightened',
      description: 'You have Disadvantage on ability checks and attack rolls while the source of fear is within line of sight, and you can’t willingly move closer to it.',
      effects: [attacks('disadvantage'), ...checks('disadvantage'), note('Can’t willingly move closer to the source of fear.')]
    },
    {
      id: 'grappled',
      name: 'Grappled',
      description: 'Your Speed is 0 and can’t increase. You have Disadvantage on attack rolls against any target other than the grappler, and the grappler can drag or carry you.',
      effects: [SPEED_0, note('Disadvantage on attack rolls against any target other than the grappler.')]
    },
    {
      id: 'incapacitated',
      name: 'Incapacitated',
      description: 'You can’t take any action, Bonus Action or Reaction; your Concentration is broken; you can’t speak; and you have Disadvantage on Initiative rolls.',
      effects: INCAPACITATED
    },
    {
      id: 'invisible',
      name: 'Invisible',
      description: 'You have Advantage on Initiative rolls, aren’t affected by effects that require seeing you, and attack rolls against you have Disadvantage while your attack rolls have Advantage — unless the other creature can somehow see you.',
      effects: [attacks('advantage'), initiative('advantage')]
    },
    {
      id: 'paralyzed',
      name: 'Paralyzed',
      description: 'You have the Incapacitated condition and a Speed of 0. You automatically fail Strength and Dexterity saving throws, attack rolls against you have Advantage, and any hit from within 5 feet is a Critical Hit.',
      effects: [...INCAPACITATED, SPEED_0, FAILS_STR_DEX]
    },
    {
      id: 'petrified',
      name: 'Petrified',
      description:
        'You turn into a solid inanimate substance, with the Incapacitated condition and a Speed of 0. You automatically fail Strength and Dexterity saving throws, attack rolls against you have Advantage, and you have Resistance to all damage and Immunity to the Poisoned condition.',
      effects: [
        ...INCAPACITATED,
        SPEED_0,
        FAILS_STR_DEX,
        ...DAMAGE_TYPES.map((d): Effect => ({ do: { kind: 'damageRelation', damageType: slug(d), relation: 'resistance' } })),
        { do: { kind: 'conditionImmunity', conditionId: 'poisoned' } }
      ]
    },
    {
      id: 'poisoned',
      name: 'Poisoned',
      description: 'You have Disadvantage on attack rolls and ability checks.',
      effects: [attacks('disadvantage'), ...checks('disadvantage')]
    },
    {
      id: 'prone',
      name: 'Prone',
      description: 'Your only movement option is to crawl, unless you spend half your Speed to stand up. You have Disadvantage on attack rolls; attack rolls against you have Advantage within 5 feet and Disadvantage from farther away.',
      effects: [attacks('disadvantage'), note('Can only crawl, or spend half your Speed to stand up.')]
    },
    {
      id: 'restrained',
      name: 'Restrained',
      description: 'Your Speed is 0 and can’t increase. Attack rolls against you have Advantage, and you have Disadvantage on attack rolls and Dexterity saving throws.',
      effects: [SPEED_0, attacks('disadvantage'), { do: { kind: 'rollMode', target: 'save:dex', mode: 'disadvantage' } }]
    },
    {
      id: 'stunned',
      name: 'Stunned',
      description: 'You have the Incapacitated condition. You automatically fail Strength and Dexterity saving throws, and attack rolls against you have Advantage.',
      effects: [...INCAPACITATED, FAILS_STR_DEX]
    },
    {
      id: 'unconscious',
      name: 'Unconscious',
      description:
        'You have the Incapacitated and Prone conditions, a Speed of 0, and drop whatever you’re holding. You automatically fail Strength and Dexterity saving throws; attack rolls against you have Advantage, and any hit from within 5 feet is a Critical Hit.',
      effects: [...INCAPACITATED, SPEED_0, attacks('disadvantage'), FAILS_STR_DEX]
    }
  ]
}
