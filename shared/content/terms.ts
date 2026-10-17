// The terminology layer (docs/homebrew-engine.md §7): packs rename core
// concepts — "Spell Slots" → "Mana Wells", Charisma → "Presence"
// — and every label the UI shows goes through t(). Renames never
// change a rule.

import type { Terminology } from './schema'

/**
 * The concept keys a pack can rename, with the label used when nothing
 * renames it. `ability.<id>`, `skill.<id>`, `currency.<id>`, `damage.<id>`,
 * `condition.<id>` and `actionType.<id>` rename those entries too.
 */
export const TERM_DEFAULTS: Record<string, string> = {
  spellSlots: 'Spell Slots',
  spells: 'Spells',
  cantrips: 'Cantrips',
  spellcasting: 'Spellcasting',
  hitDice: 'Hit Dice',
  subclass: 'Subclass',
  species: 'Species',
  background: 'Background',
  proficiencyBonus: 'Proficiency',
  savingThrows: 'Saving Throws',
  skills: 'Skills',
  inspiration: 'Inspiration',
  armorClass: 'AC',
  initiative: 'Initiative',
  speed: 'Speed',
  hitPoints: 'Hit Points',
  feats: 'Feats',
  currency: 'Currency',
  'actionType.action': 'Action',
  'actionType.bonus': 'Bonus Action',
  'actionType.reaction': 'Reaction',
  'actionType.free': 'Free'
}

export interface Terms {
  /** The label for a concept: the pack's rename, else `fallback`, else the built-in default, else the key. */
  t: (key: string, fallback?: string) => string
  /** An ability's (possibly renamed) name. */
  ability: (id: string, fallback?: string) => string
  /** Its short form: a pack's `ability.<id>.short`, else the first three letters of its name. */
  abilityShort: (id: string, name?: string) => string
}

export function termsFor(terminology: Terminology): Terms {
  const t = (key: string, fallback?: string): string => {
    const renamed = terminology[key]
    return renamed && renamed.trim() ? renamed : (fallback ?? TERM_DEFAULTS[key] ?? key)
  }
  const ability = (id: string, fallback?: string): string => t(`ability.${id}`, fallback ?? id.toUpperCase())
  return { t, ability, abilityShort: (id, name) => t(`ability.${id}.short`, (name ?? ability(id)).slice(0, 3)) }
}

/**
 * Concepts more than one pack renames — the one later in load order wins
 * (the DM reorders a campaign's packs to choose). `packs` in load order.
 */
export function terminologyConflicts(packs: Array<{ id: string; name: string; terminology: Terminology }>): Array<{ key: string; packs: Array<{ id: string; name: string; label: string }>; winner: string }> {
  const byKey = new Map<string, Array<{ id: string; name: string; label: string }>>()
  for (const p of packs) {
    for (const [key, label] of Object.entries(p.terminology ?? {})) {
      const list = byKey.get(key) ?? []
      list.push({ id: p.id, name: p.name, label })
      byKey.set(key, list)
    }
  }
  return [...byKey.entries()]
    .filter(([, list]) => new Set(list.map((x) => x.label)).size > 1)
    .map(([key, list]) => ({ key, packs: list, winner: list[list.length - 1].id }))
}
