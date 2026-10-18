// The built-in SRD 5.2.1 content pack, generated at import from the legacy
// rules modules (shared/dnd5e.ts, shared/compendium.ts and shared/data/) so
// there's one source of truth while both paths exist. Everything those
// modules hard-code — class checks, resource functions, buff effects,
// exhaustion, armour AC — is expressed here as pack data, which is what lets
// homebrew packs do anything the SRD can. See docs/homebrew-engine.md.

import { ABILITIES, DAMAGE_TYPES, SKILLS } from '../../dnd5e'
import { SPELLS } from '../../compendium'
import equipmentData from '../../data/srd-equipment.json'
import type { ContentPack, ContentPackInput } from '../schema'
import { PACK_FORMAT_VERSION } from '../schema'
import { parsePack } from '../validate'
import { srdClassOptionLists, srdClasses, srdSubclasses } from './classes'
import { SRD_PACK_ID, skillId, slug } from './common'
import { srdConditions } from './conditions'
import { srdFeats } from './feats'
import { srdItemOptionLists, srdItems } from './items'
import { srdBackgrounds, srdLineageLists, srdSpecies } from './origins'
import { srdSpells } from './spells'

export { SRD_PACK_ID } from './common'

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
      conditions: srdConditions(),
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
    optionLists: [...srdClassOptionLists(), ...subclasses.optionLists, ...srdLineageLists(), ...srdItemOptionLists()]
  }
}

let cached: ContentPack | undefined

/** The parsed, validated SRD pack (built once, on first use). */
export function srdPack(): ContentPack {
  cached ??= parsePack(buildSrdPackInput())
  return cached
}
