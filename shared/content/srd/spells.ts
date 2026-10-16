// SRD spells (shared/data/srd-spells.json) as pack spells, tagged with the
// class lists they belong to by class id.

import { SPELLS } from '../../compendium'
import type { ContentPackInput, Effect } from '../schema'
import { NO_BODY_ARMOR } from './common'

type SpellInput = NonNullable<ContentPackInput['spells']>[number]

/** Ongoing effects on the caster while the spell's toggle is on. Nothing turns these on yet, so they don't change today's numbers. */
const SPELL_EFFECTS: Record<string, Effect[]> = {
  'mage-armor': [{ when: NO_BODY_ARMOR, do: { kind: 'acFormula', label: 'Mage Armor', formula: '13 + @dex.mod' } }]
}

export function srdSpells(): SpellInput[] {
  return SPELLS.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    level: s.level,
    school: s.school,
    castingTime: s.castingTime,
    range: s.range,
    components: s.components,
    duration: s.duration,
    concentration: s.concentration,
    ritual: s.ritual,
    lists: s.classes.map((c) => c.toLowerCase()),
    ...(s.higherLevel ? { higherLevel: s.higherLevel } : {}),
    ...(s.attackType ? { attackType: s.attackType } : {}),
    ...(SPELL_EFFECTS[s.id] ? { effects: SPELL_EFFECTS[s.id] } : {})
  }))
}
