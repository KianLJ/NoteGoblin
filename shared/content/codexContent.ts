// What the Codex shows for content packs: every entry the active packs add
// (the SRD's own entries are already in the Codex's SRD categories), as a
// flat, kind-agnostic list of name / fields / sections — so the Codex can
// browse a homebrew class, archetype, feat, spell or item without knowing
// each schema. See docs/homebrew-engine.md §9.

import type { EntryKind, Registry } from './registry'
import type { ContentPack } from './schema'
import { SRD_PACK_ID } from './srd'
import { WORKSHOP_SECTIONS } from './workshop'

export interface CodexEntry {
  /** "<kind>:<full id>" — unique across kinds. */
  key: string
  kind: EntryKind
  kindLabel: string
  fullId: string
  packId: string
  packName: string
  name: string
  description: string
  /** Short facts ("Level 3 · Evocation", "Hit die d10"). */
  fields: Array<{ label: string; value: string }>
  /** Longer parts: a class's levels, a species' traits, an option list's options. */
  sections: Array<{ title: string; items: Array<{ name: string; description: string; meta?: string }> }>
}

const levelLabel = (n: number): string => (n === 0 ? 'Cantrip' : `Level ${n}`)
const nonEmpty = (fields: Array<{ label: string; value: string | undefined }>): CodexEntry['fields'] =>
  fields.filter((f): f is { label: string; value: string } => !!f.value && f.value.trim() !== '')

type Levels = Array<{ level: number; features: Array<{ name: string; description?: string }> }>
const levelSections = (levels: Levels | undefined): CodexEntry['sections'] =>
  levels && levels.length
    ? [
        {
          title: 'Features',
          items: [...levels]
            .sort((a, b) => a.level - b.level)
            .flatMap((l) => l.features.map((f) => ({ name: f.name, description: f.description ?? '', meta: `Level ${l.level}` })))
        }
      ]
    : []

/** Every non-SRD entry in `registry` (overrides included, hidden entries excluded), sorted by name. */
export function codexEntries(registry: Registry, packs: ContentPack[]): CodexEntry[] {
  const packName = (id: string): string => packs.find((p) => p.id === id)?.name ?? id
  const out: CodexEntry[] = []
  for (const section of WORKSHOP_SECTIONS) {
    for (const reg of registry.all(section.kind)) {
      if (reg.packId === SRD_PACK_ID) continue
      const def = reg.def as unknown as Record<string, unknown> & { name: string; description?: string }
      const entry: CodexEntry = {
        key: `${section.kind}:${reg.fullId}`,
        kind: section.kind,
        kindLabel: section.singular.charAt(0).toUpperCase() + section.singular.slice(1),
        fullId: reg.fullId,
        packId: reg.packId,
        packName: packName(reg.packId),
        name: def.name,
        description: def.description ?? '',
        fields: [],
        sections: []
      }
      describe(section.kind, reg.def, entry, registry)
      out.push(entry)
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

function describe(kind: EntryKind, raw: unknown, entry: CodexEntry, registry: Registry): void {
  switch (kind) {
    case 'classes': {
      const d = raw as ContentPack['classes'][number]
      entry.fields = nonEmpty([
        { label: 'Hit die', value: `d${d.hitDie}` },
        { label: 'Saves', value: d.saves.map((a) => a.toUpperCase()).join(', ') },
        { label: 'Armor', value: d.armorProficiencies.join(', ') },
        { label: 'Weapons', value: d.weaponProficiencies.join(', ') },
        { label: 'Spellcasting', value: d.spellcasting ? d.spellcasting.ability.toUpperCase() : undefined },
        { label: d.subclassLabel ?? 'Subclass', value: `at level ${d.subclassLevel}` }
      ])
      entry.sections = levelSections(d.levels)
      return
    }
    case 'subclasses': {
      const d = raw as ContentPack['subclasses'][number]
      entry.fields = nonEmpty([{ label: 'Class', value: registry.get('classes', d.classId)?.def.name ?? d.classId }])
      entry.sections = levelSections(d.levels)
      return
    }
    case 'archetypes': {
      const d = raw as ContentPack['archetypes'][number]
      entry.fields = nonEmpty([
        { label: 'Tags', value: d.tags.join(', ') },
        { label: 'Levels by', value: d.levelBasis === 'highestClass' ? 'highest class level' : d.levelBasis === 'character' ? 'character level' : 'the class that grants it' }
      ])
      entry.sections = levelSections(d.levels)
      return
    }
    case 'species': {
      const d = raw as ContentPack['species'][number]
      entry.fields = nonEmpty([
        { label: 'Size', value: d.size },
        { label: 'Speed', value: Object.entries(d.speed).map(([k, v]) => `${k} ${v}`).join(', ') }
      ])
      entry.sections = d.traits.length ? [{ title: 'Traits', items: d.traits.map((t) => ({ name: t.name, description: t.description ?? '' })) }] : []
      return
    }
    case 'backgrounds': {
      const d = raw as ContentPack['backgrounds'][number]
      entry.sections = d.features.length ? [{ title: 'Features', items: d.features.map((t) => ({ name: t.name, description: t.description ?? '' })) }] : []
      return
    }
    case 'feats': {
      const d = raw as ContentPack['feats'][number]
      entry.fields = nonEmpty([
        { label: 'Category', value: d.category },
        { label: 'Prerequisite', value: d.prerequisiteText },
        { label: 'Repeatable', value: d.repeatable ? 'Yes' : undefined }
      ])
      return
    }
    case 'optionLists': {
      const d = raw as ContentPack['optionLists'][number]
      entry.sections = [{ title: 'Options', items: d.options.map((o) => ({ name: o.name, description: o.description, ...(o.cost ? { meta: `${o.cost} pt` } : {}) })) }]
      return
    }
    case 'spells': {
      const d = raw as ContentPack['spells'][number]
      entry.fields = nonEmpty([
        { label: 'Level', value: `${levelLabel(d.level)}${d.school ? ` · ${d.school}` : ''}` },
        { label: 'Casting time', value: `${d.castingTime}${d.ritual ? ' (ritual)' : ''}` },
        { label: 'Range', value: d.range },
        { label: 'Components', value: d.components },
        { label: 'Duration', value: `${d.concentration ? 'Concentration, ' : ''}${d.duration}` },
        { label: 'Damage', value: d.damage ? `${d.damage}${d.damageType ? ` ${d.damageType}` : ''}` : undefined },
        { label: 'Healing', value: d.healing },
        { label: 'Lists', value: d.lists.join(', ') }
      ])
      if (d.higherLevel) entry.sections = [{ title: 'At higher levels', items: [{ name: '', description: d.higherLevel }] }]
      return
    }
    case 'items': {
      const d = raw as ContentPack['items'][number]
      entry.fields = nonEmpty([
        { label: 'Category', value: d.category },
        { label: 'Rarity', value: d.rarity },
        { label: 'Cost', value: d.cost },
        { label: 'Weight', value: d.weight !== undefined ? `${d.weight} lb` : undefined },
        { label: 'Attunement', value: d.requiresAttunement ? 'Required' : undefined },
        { label: 'Damage', value: d.weapon ? `${d.weapon.damage} ${d.weapon.damageType}` : undefined },
        { label: 'Properties', value: d.weapon?.properties.join(', ') },
        { label: 'Armor', value: d.armor ? `${d.armor.category}${d.armor.stealthDisadvantage ? ', stealth disadvantage' : ''}` : undefined }
      ])
      return
    }
    case 'monsters':
      return
  }
}
