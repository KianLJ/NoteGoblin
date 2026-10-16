// Species (with their lineage/legacy picks) and backgrounds from dnd5e.ts's
// RACES, RACE_TRAIT_DESCRIPTIONS, RACE_LINEAGES and BACKGROUNDS.

import { BACKGROUNDS, RACES, RACE_LINEAGES, RACE_TRAIT_DESCRIPTIONS, type LineageOption } from '../../dnd5e'
import type { ContentPackInput, Effect } from '../schema'
import { skillId, slug } from './common'

type SpeciesInput = NonNullable<ContentPackInput['species']>[number]
type BackgroundInput = NonNullable<ContentPackInput['backgrounds']>[number]
type OptionListInput = NonNullable<ContentPackInput['optionLists']>[number]

const SMALL = new Set(['halfling', 'gnome'])

/** The trait that carries each species' lineage pick. */
const LINEAGE_TRAIT: Record<string, string> = { elf: 'Elven Lineage', gnome: 'Gnomish Lineage', tiefling: 'Fiendish Legacy' }

export const lineageListId = (raceId: string): string => `${raceId}-lineages`

/** Choice ids on a lineage trait — the legacy adapter fills them from RaceLineageChoice. */
export const LINEAGE_CHOICE_IDS = { lineage: 'lineage', spellAbility: 'spell-ability' } as const

function lineageEffects(option: LineageOption): Effect[] {
  const now = [option.cantripId, option.secondCantripId, option.alwaysPreparedSpellId].filter((id): id is string => !!id)
  const effects: Effect[] = [{ do: { kind: 'grantSpells', spellIds: now, alwaysPrepared: true, free: true } }]
  // Gated by total character level — the species doesn't belong to a class.
  if (option.level3SpellId) effects.push({ when: { kind: 'level', min: 3 }, do: { kind: 'grantSpells', spellIds: [option.level3SpellId], alwaysPrepared: true, free: true } })
  if (option.level5SpellId) effects.push({ when: { kind: 'level', min: 5 }, do: { kind: 'grantSpells', spellIds: [option.level5SpellId], alwaysPrepared: true, free: true } })
  return effects
}

export function srdLineageLists(): OptionListInput[] {
  return Object.entries(RACE_LINEAGES).map(([raceId, options]) => ({
    id: lineageListId(raceId),
    name: LINEAGE_TRAIT[raceId] ?? 'Lineage',
    options: options.map((o) => ({ id: slug(o.name), name: o.name, description: o.description, effects: lineageEffects(o) }))
  }))
}

function traitEffects(raceId: string, trait: string): Effect[] {
  if (LINEAGE_TRAIT[raceId] === trait) {
    return [
      { do: { kind: 'grantChoice', choice: { id: LINEAGE_CHOICE_IDS.lineage, label: trait, from: { kind: 'optionList', listId: lineageListId(raceId) } } } },
      { do: { kind: 'grantChoice', choice: { id: LINEAGE_CHOICE_IDS.spellAbility, label: 'Spellcasting ability', from: { kind: 'abilities', abilities: ['int', 'wis', 'cha'] } } } }
    ]
  }
  if (trait === 'Versatile') return [{ do: { kind: 'grantChoice', choice: { id: 'feat', label: 'Origin feat', from: { kind: 'feats', categories: ['Origin'] } } } }]
  if (trait === 'Skillful') return [{ do: { kind: 'grantChoice', choice: { id: 'skill', label: 'Skill proficiency', from: { kind: 'skills' }, onPick: [{ do: { kind: 'proficiency', category: 'skill', value: '$pick' } }] } } }]
  // Every other trait is rules text only today (Darkvision, Dwarven Toughness, Draconic Ancestry…).
  return []
}

export function srdSpecies(): SpeciesInput[] {
  return RACES.map((race) => ({
    id: race.id,
    name: race.name,
    size: SMALL.has(race.id) ? 'Small' : 'Medium',
    speed: { walk: String(race.speed) },
    traits: race.traits.map((trait) => ({ id: slug(trait), name: trait, description: RACE_TRAIT_DESCRIPTIONS[trait] ?? '', effects: traitEffects(race.id, trait) }))
  }))
}

/** Feature/choice ids on a background — the legacy adapter fills them from level-0 AsiSlotChoices. */
export const BACKGROUND_IDS = { abilityFeature: 'ability-scores', abilityChoice: 'scores', featFeature: 'origin-feat', featChoice: 'feat' } as const

export function srdBackgrounds(): BackgroundInput[] {
  return BACKGROUNDS.map((b) => ({
    id: b.id,
    name: b.name,
    features: [
      {
        id: BACKGROUND_IDS.abilityFeature,
        name: 'Ability Scores',
        description: 'Increase one of these scores by 2 and another by 1, or all three by 1.',
        effects: [
          {
            do: {
              kind: 'grantChoice',
              choice: {
                id: BACKGROUND_IDS.abilityChoice,
                label: 'Ability score increases',
                count: '3',
                from: { kind: 'abilities', abilities: b.abilityScores },
                allowRepeats: true,
                maxRepeats: 2,
                onPick: [{ do: { kind: 'modify', target: 'ability.$pick.score', op: 'add', value: '1' } }]
              }
            }
          }
        ]
      },
      {
        id: BACKGROUND_IDS.featFeature,
        name: 'Origin Feat',
        effects: [{ do: { kind: 'grantChoice', choice: { id: BACKGROUND_IDS.featChoice, label: 'Origin feat', from: { kind: 'feats', featIds: [b.featId] } } } }]
      },
      {
        id: 'proficiencies',
        name: 'Proficiencies',
        description: `Skills: ${b.skillProficiencies.join(', ')}. Tool: ${b.toolProficiency}.`,
        effects: [
          ...b.skillProficiencies.map((s): Effect => ({ do: { kind: 'proficiency', category: 'skill', value: skillId(s) } })),
          { do: { kind: 'proficiency', category: 'tool', value: b.toolProficiency } }
        ]
      }
    ]
  }))
}
