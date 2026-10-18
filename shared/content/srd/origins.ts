// Species (with their lineage/legacy picks) and backgrounds from dnd5e.ts's
// RACES, RACE_TRAIT_DESCRIPTIONS, RACE_LINEAGES and BACKGROUNDS.

import { BACKGROUNDS, RACES, RACE_LINEAGES, RACE_TRAIT_DESCRIPTIONS, type LineageOption } from '../../dnd5e'
import type { ContentPackInput, Effect } from '../schema'
import { skillId, slug } from './common'

type SpeciesInput = NonNullable<ContentPackInput['species']>[number]
type BackgroundInput = NonNullable<ContentPackInput['backgrounds']>[number]
type OptionListInput = NonNullable<ContentPackInput['optionLists']>[number]

const SMALL = new Set(['halfling', 'gnome'])

/** Darkvision range by species, where it isn't the usual 60 ft. */
const DARKVISION: Record<string, number> = { dwarf: 120, orc: 120 }

/** The trait that carries each species' lineage pick. */
const LINEAGE_TRAIT: Record<string, string> = { elf: 'Elven Lineage', gnome: 'Gnomish Lineage', tiefling: 'Fiendish Legacy' }

export const lineageListId = (raceId: string): string => `${raceId}-lineages`

/** Choice ids on a lineage trait — the legacy adapter fills them from RaceLineageChoice. */
export const LINEAGE_CHOICE_IDS = { lineage: 'lineage', spellAbility: 'spell-ability', cantrip: 'cantrip' } as const

/**
 * Lineages whose cantrip the player can swap for another from a spell list
 * (High Elf: "replace it with a different cantrip from the Wizard spell
 * list" on a Long Rest) — a pick, with the usual cantrip as the default the
 * legacy adapter fills in.
 */
export const SWAPPABLE_LINEAGE_CANTRIP: Record<string, { list: string; label: string }> = { 'High Elf': { list: 'wizard', label: 'High Elf cantrip' } }

/** What a lineage does besides its spells (Drow's longer darkvision, a Wood Elf's speed). */
const LINEAGE_EXTRAS: Record<string, Effect[]> = {
  Drow: [{ do: { kind: 'modify', target: 'sense.darkvision', op: 'set', value: '120' } }],
  'Wood Elf': [{ do: { kind: 'modify', target: 'speed.walk', op: 'add', value: '5' } }]
}

function lineageEffects(option: LineageOption): Effect[] {
  const swap = SWAPPABLE_LINEAGE_CANTRIP[option.name]
  const now = [swap ? undefined : option.cantripId, option.secondCantripId, option.alwaysPreparedSpellId].filter((id): id is string => !!id)
  const effects: Effect[] = [...(now.length ? [{ do: { kind: 'grantSpells', spellIds: now, alwaysPrepared: true, free: true } } as Effect] : []), ...(LINEAGE_EXTRAS[option.name] ?? [])]
  if (swap) effects.push({ do: { kind: 'grantChoice', choice: { id: LINEAGE_CHOICE_IDS.cantrip, label: swap.label, from: { kind: 'spells', lists: [swap.list], maxLevel: '0' } } } })
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
  if (trait === 'Darkvision') return [{ do: { kind: 'modify', target: 'sense.darkvision', op: 'set', value: String(DARKVISION[raceId] ?? 60) } }]
  if (trait === 'Keen Senses') {
    return [
      {
        do: {
          kind: 'grantChoice',
          choice: { id: 'skill', label: 'Keen Senses', from: { kind: 'skills', skillIds: ['insight', 'perception', 'survival'] }, onPick: [{ do: { kind: 'proficiency', category: 'skill', value: '$pick' } }] }
        }
      }
    ]
  }
  if (trait === 'Fey Ancestry') return [{ do: { kind: 'note', text: 'Advantage on saving throws to avoid or end the Charmed condition.' } }]
  // Every other trait is rules text only today (Dwarven Toughness, Draconic Ancestry…).
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
