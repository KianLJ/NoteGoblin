// SRD feats (shared/data/srd-feats.json) as pack feats: each legacy
// FeatEffect becomes an Effect, and the rules compendium.ts applies to a
// feat by id in code (Defense's +1 AC in armour) become effects too.

import { FEATS, type CompendiumFeat, type FeatEffect } from '../../compendium'
import type { ChoiceDef, Condition, ContentPackInput, Effect } from '../schema'
import { ABILITY_LIST, BODY_ARMOR, skillId } from './common'

type FeatInput = NonNullable<ContentPackInput['feats']>[number]

/** Rules compendium.ts hard-codes for a feat id rather than reading from its effects. */
const CODED_FEAT_RULES: Record<string, Effect[]> = {
  // computeArmorClassFromEquipment: +1 AC only while wearing body armour.
  defense: [{ when: BODY_ARMOR, do: { kind: 'modify', target: 'ac', op: 'add', value: '1' } }]
}

/** The ASI feat's own pick: +2 to one score or +1 to two (legacy kind: 'ability' slots). */
const ASI_CHOICE: ChoiceDef = {
  id: 'scores',
  label: 'Increase ability scores',
  count: '2',
  from: { kind: 'abilities' },
  allowRepeats: true,
  maxRepeats: 2,
  onPick: [{ do: { kind: 'modify', target: 'ability.$pick.score', op: 'add', value: '1' } }]
}

/** Choice ids the legacy adapter fills from an AsiSlotChoice's chosenAbility / chosenSpellIds. */
export const FEAT_CHOICE_IDS = { ability: 'ability', spellAbility: 'spell-ability', cantrips: 'cantrips', spells: 'spells', scores: ASI_CHOICE.id } as const

function featEffect(effect: FeatEffect, epicBoon: boolean): Effect[] {
  // Epic Boons are the SRD's exception to the 20 cap — applied after it (compendium.ts's effectiveAbilityScores).
  const uncapped = epicBoon ? { uncapped: true } : {}
  switch (effect.kind) {
    case 'abilityScore':
      return [{ do: { kind: 'modify', target: `ability.${effect.ability}.score`, op: 'add', value: String(effect.amount), ...uncapped } }]
    case 'abilityScoreChoice':
      return [
        {
          do: {
            kind: 'grantChoice',
            choice: {
              id: FEAT_CHOICE_IDS.ability,
              label: 'Ability Score Increase',
              from: { kind: 'abilities', ...(effect.options.length < ABILITY_LIST.length ? { abilities: effect.options } : {}) },
              onPick: [{ do: { kind: 'modify', target: 'ability.$pick.score', op: 'add', value: String(effect.amount), ...uncapped } }]
            }
          }
        }
      ]
    case 'skillProficiency':
      return [{ do: { kind: 'proficiency', category: 'skill', value: skillId(effect.skill) } }]
    case 'savingThrowProficiency':
      return [{ do: { kind: 'proficiency', category: 'save', value: effect.ability } }]
    case 'speed':
      return [{ do: { kind: 'modify', target: 'speed.walk', op: 'add', value: String(effect.amount) } }]
    case 'note':
      return [{ do: { kind: 'note', text: effect.text } }]
    case 'skillAdvantage':
    case 'skillDisadvantage':
      return [{ do: { kind: 'rollMode', target: `skill:${skillId(effect.skill)}`, mode: effect.kind === 'skillAdvantage' ? 'advantage' : 'disadvantage' } }]
    case 'abilityCheckAdvantage':
    case 'abilityCheckDisadvantage':
      return [{ do: { kind: 'rollMode', target: `check:${effect.ability}`, mode: effect.kind === 'abilityCheckAdvantage' ? 'advantage' : 'disadvantage' } }]
    case 'savingThrowAdvantage':
    case 'savingThrowDisadvantage':
      return [{ do: { kind: 'rollMode', target: `save:${effect.ability}`, mode: effect.kind === 'savingThrowAdvantage' ? 'advantage' : 'disadvantage' } }]
    case 'attackAdvantage':
    case 'attackDisadvantage':
      return [{ do: { kind: 'rollMode', target: 'attack', mode: effect.kind === 'attackAdvantage' ? 'advantage' : 'disadvantage' } }]
    case 'initiativeAdvantage':
    case 'initiativeDisadvantage':
      return [{ do: { kind: 'rollMode', target: 'initiative', mode: effect.kind === 'initiativeAdvantage' ? 'advantage' : 'disadvantage' } }]
    case 'armorClass':
      return [{ do: { kind: 'modify', target: 'ac', op: 'add', value: String(effect.amount) } }]
    case 'spellChoice': {
      const lists = effect.classes.map((c) => c.toLowerCase())
      return [
        { do: { kind: 'grantChoice', choice: { id: FEAT_CHOICE_IDS.spellAbility, label: 'Spellcasting ability', from: { kind: 'abilities', abilities: ['int', 'wis', 'cha'] } } } },
        { do: { kind: 'grantChoice', choice: { id: FEAT_CHOICE_IDS.cantrips, label: 'Cantrips', count: String(effect.cantripCount), from: { kind: 'spells', lists, maxLevel: '0' } } } },
        {
          do: {
            kind: 'grantChoice',
            choice: { id: FEAT_CHOICE_IDS.spells, label: `Level ${effect.spellLevel} spell`, count: String(effect.spellCount), from: { kind: 'spells', lists, minLevel: effect.spellLevel, maxLevel: String(effect.spellLevel) } }
          }
        }
      ]
    }
  }
}

function prerequisite(feat: CompendiumFeat): Condition | undefined {
  const parts: Condition[] = []
  if (feat.minLevel) parts.push({ kind: 'level', min: feat.minLevel })
  if (feat.prerequisiteAbility) parts.push({ kind: 'formula', formula: `@${feat.prerequisiteAbility.ability}.score >= ${feat.prerequisiteAbility.minimum}` })
  if (parts.length === 0) return undefined
  return parts.length === 1 ? parts[0] : { kind: 'all', of: parts }
}

export function srdFeats(): FeatInput[] {
  return FEATS.map((feat) => {
    const epicBoon = feat.category === 'Epic Boon'
    const effects: Effect[] = [
      ...(feat.id === 'ability-score-improvement' ? [{ do: { kind: 'grantChoice' as const, choice: ASI_CHOICE } }] : []),
      ...(CODED_FEAT_RULES[feat.id] ?? []),
      ...(feat.effects ?? []).flatMap((e) => featEffect(e, epicBoon))
    ]
    const prereq = prerequisite(feat)
    return {
      id: feat.id,
      name: feat.name,
      description: feat.desc,
      category: feat.category,
      ...(prereq ? { prerequisite: prereq } : {}),
      ...(feat.prerequisite ? { prerequisiteText: feat.prerequisite } : {}),
      repeatable: !!feat.repeatable,
      effects
    }
  })
}
