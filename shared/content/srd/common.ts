// Shared bits for building the SRD pack: ids, the pack id, and the handful
// of conditions every part of the pack gates on.

import type { Ability, SkillName } from '../../dnd5e'
import type { Condition, Effect } from '../schema'

export const SRD_PACK_ID = 'srd-5.2.1'

/** "Paladin's Smite" → "paladins-smite", "Mystic Arcanum (6th level)" → "mystic-arcanum-6th-level". */
export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Legacy skills are keyed by display name ("Sleight of Hand"); the pack uses ids ("sleight-of-hand"). */
export function skillId(name: SkillName | string): string {
  return slug(name)
}

/** values[level - 1] for levels 1–20. */
export function byLevel<T>(f: (level: number) => T): T[] {
  return Array.from({ length: 20 }, (_, i) => f(i + 1))
}

export const ABILITY_LIST: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']

export const BODY_ARMOR: Condition = { kind: 'equipped', filter: { armorCategories: ['light', 'medium', 'heavy'] } }
export const SHIELD: Condition = { kind: 'equipped', filter: { armorCategories: ['shield'] } }
export const NO_BODY_ARMOR: Condition = { kind: 'not', of: BODY_ARMOR }
export const NO_ARMOR_OR_SHIELD: Condition = { kind: 'not', of: { kind: 'any', of: [BODY_ARMOR, SHIELD] } }

export const note = (text: string): Effect => ({ do: { kind: 'note', text } })
