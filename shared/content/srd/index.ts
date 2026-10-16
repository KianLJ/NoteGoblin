// The built-in SRD 5.2.1 content pack, generated at import from the legacy
// rules modules (shared/dnd5e.ts, shared/compendium.ts and shared/data/) so
// there's one source of truth while both paths exist. Everything those
// modules hard-code — class checks, resource functions, buff effects,
// exhaustion, armour AC — is expressed here as pack data, which is what lets
// homebrew packs do anything the SRD can. See docs/homebrew-engine.md.

import { ABILITIES, DAMAGE_TYPES, EXHAUSTION_EFFECTS, SKILLS } from '../../dnd5e'
import { SPELLS } from '../../compendium'
import equipmentData from '../../data/srd-equipment.json'
import type { ContentPack, ContentPackInput, Effect } from '../schema'
import { PACK_FORMAT_VERSION } from '../schema'
import { parsePack } from '../validate'
import { srdClassOptionLists, srdClasses, srdSubclasses } from './classes'
import { ABILITY_LIST, SRD_PACK_ID, skillId, slug } from './common'
import { srdFeats } from './feats'
import { srdItems } from './items'
import { srdBackgrounds, srdLineageLists, srdSpecies } from './origins'
import { srdSpells } from './spells'

export { SRD_PACK_ID } from './common'

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

export function buildSrdPackInput(): ContentPackInput {
  const subclasses = srdSubclasses()
  const properties = [...new Set((equipmentData as Array<{ properties?: string[] }>).flatMap((e) => e.properties ?? []))]
  return {
    formatVersion: PACK_FORMAT_VERSION,
    id: SRD_PACK_ID,
    name: 'System Reference Document 5.2.1',
    version: '5.2.1',
    author: 'Wizards of the Coast (CC BY 4.0)',
    description: 'The D&D 5e System Reference Document 5.2.1, as used by the character sheet.',
    builtIn: true,
    vocabulary: {
      skills: SKILLS.map((s) => ({ id: skillId(s.id), name: s.id, ability: s.ability })),
      damageTypes: DAMAGE_TYPES.map((d) => ({ id: slug(d), name: d })),
      conditions: [
        {
          id: 'exhaustion',
          name: 'Exhaustion',
          description: EXHAUSTION_EFFECTS.slice(1, 7).map((e, i) => `Level ${i + 1}: ${e}`).join('\n'),
          maxLevel: 6,
          effects: exhaustionEffects()
        }
      ],
      currencies: [
        { id: 'cp', name: 'Copper', valueInBase: 1 },
        { id: 'sp', name: 'Silver', valueInBase: 10 },
        { id: 'ep', name: 'Electrum', valueInBase: 50 },
        { id: 'gp', name: 'Gold', valueInBase: 100 },
        { id: 'pp', name: 'Platinum', valueInBase: 1000 }
      ],
      weaponProperties: properties.map((p) => ({ id: slug(p), name: p })),
      spellSchools: [...new Set(SPELLS.map((s) => s.school))].map((s) => ({ id: slug(s), name: s }))
    },
    terminology: Object.fromEntries(ABILITIES.map((a) => [`ability.${a.id}`, a.label])),
    classes: srdClasses(),
    subclasses: subclasses.subclasses,
    species: srdSpecies(),
    backgrounds: srdBackgrounds(),
    feats: srdFeats(),
    spells: srdSpells(),
    items: srdItems(),
    optionLists: [...srdClassOptionLists(), ...subclasses.optionLists, ...srdLineageLists()]
  }
}

let cached: ContentPack | undefined

/** The parsed, validated SRD pack (built once, on first use). */
export function srdPack(): ContentPack {
  cached ??= parsePack(buildSrdPackInput())
  return cached
}
