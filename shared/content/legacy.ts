// Reads today's CharacterSheetData — classes, species and backgrounds by
// display name, skills by display name, picks as asiSlotChoices /
// subclassFeatureChoices / raceLineageChoice, buffs as activeBuffs,
// equipment by compendiumId — as a CharacterBuild for deriveCharacter, plus
// whatever generated pack it needs (classes the SRD doesn't know).
//
// This is the bridge until characters store pack ids themselves (phase 4).
// It mirrors legacy semantics — a pick only counts while its class is at or
// above the pick's level, unrecognised classes add levels but no hit points
// — so the derived sheet matches the legacy calculations apart from the
// deliberate rules fixes recorded in tests/regression/parity.test.ts.snap.

import {
  activeAsiSlotChoices,
  activeSubclassFeatureChoices,
  type Ability,
  type AsiSlotChoice,
  type CharacterSheetData,
  type SubclassFeatureChoice
} from '../dnd5e'
import { choiceKeys, type CharacterBuild, type ProficiencyLevel } from './engine'
import { registryForPacks } from './migrate'
import type { Registered, Registry } from './registry'
import type { BackgroundDef, ChoiceDef, ClassDef, ContentPack, Effect, FeatDef, OptionSource, SpeciesDef } from './schema'
import { srdPack } from './srd'
import { SRD_LIST_IDS } from './srd/classes'
import { skillId, slug } from './srd/common'
import { FEAT_CHOICE_IDS } from './srd/feats'
import { LINEAGE_CHOICE_IDS } from './srd/origins'
import { parsePack } from './validate'

export const LEGACY_HOMEBREW_PACK_ID = 'legacy-homebrew'

export interface LegacyBuild {
  build: CharacterBuild
  /** The SRD pack, any extra enabled packs, plus a generated pack for any class the enabled packs don't recognise. */
  packs: ContentPack[]
  /** Problems the adapter worked around (a class from a pack that isn't enabled, …), for the sheet's diagnostics. */
  warnings: string[]
}

export interface LegacyBuildOptions {
  /** Enabled content packs beyond the SRD (homebrew), in enable order. */
  packs?: ContentPack[]
  /**
   * The legacy sheet treats every weapon as proficient. Off by default, so
   * class weapon proficiencies decide; on reproduces the legacy numbers.
   */
  assumeWeaponProficiency?: boolean
}

/** A feature (or species trait / background feature) that grants choices, with the key its picks live under. */
interface ChoiceSite {
  sourceKey: string
  level: number
  name: string
  choices: ChoiceDef[]
}

const lower = (s: string): string => s.trim().toLowerCase()

function grantedChoices(effects: Effect[] | undefined): ChoiceDef[] {
  return (effects ?? []).flatMap((e) => (e.do.kind === 'grantChoice' ? [e.do.choice] : []))
}

/** Expands { str: 2, dex: 1 } into one +1 pick per point: ['str', 'str', 'dex']. */
function abilityPicks(increases: Partial<Record<Ability, number>> | undefined): string[] {
  return Object.entries(increases ?? {}).flatMap(([a, n]) => Array.from({ length: Math.max(0, n ?? 0) }, () => a))
}

class Adapter {
  readonly choices: Record<string, string[]> = {}
  readonly customEffects: NonNullable<CharacterBuild['customEffects']> = []
  private readonly used = new Set<string>()

  constructor(private readonly registry: Registry) {}

  /** Adds a pick to a choice and returns the pick's own source key (for nested choices). */
  pick(choiceKey: string, pick: string): string {
    const list = (this.choices[choiceKey] ??= [])
    const repeat = list.filter((p) => p === pick).length
    list.push(pick)
    return choiceKeys.pick(choiceKey, pick, repeat)
  }

  /** Fills a picked feat's own choices (ability, spellcasting ability, spells, ASI scores) from the slot that picked it. */
  fillFeat(pickKey: string, feat: Registered<FeatDef>, slot: AsiSlotChoice): void {
    const spells = (slot.chosenSpellIds ?? []).map((id) => this.registry.get('spells', id)).filter((s): s is NonNullable<typeof s> => !!s)
    for (const choice of grantedChoices(feat.def.effects)) {
      const key = choiceKeys.choice(pickKey, choice.id)
      const picks =
        choice.id === FEAT_CHOICE_IDS.scores
          ? abilityPicks(slot.abilityIncreases)
          : choice.id === FEAT_CHOICE_IDS.ability || choice.id === FEAT_CHOICE_IDS.spellAbility
            ? slot.chosenAbility
              ? [slot.chosenAbility]
              : []
            : choice.id === FEAT_CHOICE_IDS.cantrips
              ? spells.filter((s) => s.def.level === 0).map((s) => s.fullId)
              : choice.id === FEAT_CHOICE_IDS.spells
                ? spells.filter((s) => s.def.level > 0).map((s) => s.fullId)
                : []
      for (const p of picks) this.pick(key, p)
    }
  }

  claim(key: string): boolean {
    if (this.used.has(key)) return false
    this.used.add(key)
    return true
  }

  custom(name: string, effects: Effect[]): string {
    this.customEffects.push({ name, effects })
    return choiceKeys.custom(this.customEffects.length - 1)
  }
}

function featAccepts(from: OptionSource, feat: Registered<FeatDef>): boolean {
  if (from.kind !== 'feats') return false
  if (from.categories && !from.categories.some((c) => lower(c) === lower(feat.def.category))) return false
  if (from.featIds && !from.featIds.some((id) => id === feat.fullId || id === feat.def.id)) return false
  return true
}

function levelSites(
  levels: ClassDef['levels'],
  key: (featureId: string) => string
): ChoiceSite[] {
  return levels.flatMap((l) => l.features.map((f) => ({ sourceKey: key(f.id), level: l.level, name: f.name, choices: grantedChoices(f.effects) })))
}

/** Builds a pack of stub classes for names the SRD doesn't know: they count toward character level but add no hit points or features, as today. */
function homebrewPack(names: string[]): { pack: ContentPack; ids: Map<string, string> } {
  const ids = new Map<string, string>()
  const classes = names.map((name, i) => {
    const id = slug(name) || `unnamed-class-${i + 1}`
    ids.set(lower(name), id)
    // hitPointBase adds the Con modifier per level; cancelling it keeps today's "no hit points from an unknown class".
    return { id, name: name.trim() || 'Unnamed class', hitDie: 1, hpFirstLevel: '-@con.mod', hpPerLevel: '-@con.mod' }
  })
  // The version encodes the class list: registries are cached by pack id + version (see migrate.ts's registryForPacks),
  // and this pack's contents differ per sheet.
  const version = `generated:${classes.map((c) => c.name).join('|')}`
  const pack = parsePack({ formatVersion: 1, id: LEGACY_HOMEBREW_PACK_ID, name: 'Homebrew classes', version, classes })
  return { pack, ids }
}

export function legacySheetToBuild(sheet: CharacterSheetData, options: LegacyBuildOptions = {}, srd: ContentPack = srdPack()): LegacyBuild {
  const enabled = [srd, ...(options.packs ?? []).filter((p) => p.id !== srd.id)]
  const enabledRegistry = registryForPacks(enabled)
  const warnings: string[] = []
  const byName = <T extends { name: string }>(entries: Registered<T>[], name: string): Registered<T> | undefined =>
    name.trim() ? entries.find((e) => lower(e.def.name) === lower(name)) : undefined
  /** A v2 sheet's id wins (see migrate.ts); a v1 sheet, or an id the enabled packs don't have, falls back to the name. */
  const byIdOrName = <T extends { name: string }>(kind: 'classes' | 'species' | 'backgrounds', id: string | undefined, name: string): Registered<T> | undefined =>
    ((id ? enabledRegistry.get(kind, id) : undefined) as Registered<T> | undefined) ?? (byName(enabledRegistry.all(kind) as unknown as Registered<T>[], name))
  const packMissing = (id: string | undefined): string | undefined => {
    const packId = id?.includes(':') ? id.split(':')[0] : undefined
    return packId && !enabled.some((p) => p.id === packId) ? packId : undefined
  }

  // --- classes: known ones in order, unknown ones after (so the first known class keeps its full first-level hit die, as today)
  const known: { reg: Registered<ClassDef>; level: number; subclass?: string; subclassId?: string; className: string }[] = []
  const unknown: { name: string; level: number }[] = []
  for (const c of sheet.classes) {
    const reg = byIdOrName<ClassDef>('classes', c.classId, c.className)
    if (reg) {
      known.push({ reg, level: c.level, subclass: c.subclass, subclassId: c.subclassId, className: c.className })
      continue
    }
    const missing = packMissing(c.classId)
    if (missing) warnings.push(`${c.className || 'A class'} comes from the "${missing}" content pack, which isn't enabled — only its levels count until it is.`)
    unknown.push({ name: c.className, level: c.level })
  }
  const packs = [...enabled]
  let homebrewIds = new Map<string, string>()
  if (unknown.length) {
    const hb = homebrewPack([...new Set(unknown.map((u) => u.name))])
    packs.push(hb.pack)
    homebrewIds = hb.ids
  }
  const registry = packs.length === enabled.length ? enabledRegistry : registryForPacks(packs)
  const adapter = new Adapter(registry)

  const resolvedClasses = known.map((k) => {
    const byId = k.subclassId ? registry.get('subclasses', k.subclassId) : undefined
    const sub =
      byId ??
      (k.subclass
        ? registry
            .all('subclasses')
            .find((s) => (s.def.classId === k.reg.def.id || s.def.classId === k.reg.fullId) && (s.def.id === k.subclass || lower(s.def.name) === lower(k.subclass!)))
        : undefined)
    if (!sub && packMissing(k.subclassId)) warnings.push(`${k.className}'s subclass comes from the "${packMissing(k.subclassId)}" content pack, which isn't enabled.`)
    return { ...k, sub }
  })

  // An unrecognised species is left out (base speed 30, no traits), as today.
  const species = byIdOrName<SpeciesDef>('species', sheet.speciesId, sheet.race)
  const background = byIdOrName<BackgroundDef>('backgrounds', sheet.backgroundId, sheet.background)
  const origins = [
    { found: !!species, id: sheet.speciesId, name: sheet.race },
    { found: !!background, id: sheet.backgroundId, name: sheet.background }
  ]
  for (const o of origins) {
    const missing = o.found ? undefined : packMissing(o.id)
    if (missing) warnings.push(`${o.name || 'This'} comes from the "${missing}" content pack, which isn't enabled.`)
  }

  // --- where picks can go
  const classSites = (className: string): ChoiceSite[] => {
    const c = resolvedClasses.find((x) => lower(x.className) === lower(className))
    if (!c) return []
    return [
      ...levelSites(c.reg.def.levels, (id) => choiceKeys.classFeature(c.reg.fullId, id)),
      ...(c.sub ? levelSites(c.sub.def.levels, (id) => choiceKeys.subclassFeature(c.sub!.fullId, id)) : [])
    ]
  }
  const originSites: ChoiceSite[] = [
    ...(background ? background.def.features.map((f) => ({ sourceKey: choiceKeys.backgroundFeature(background.fullId, f.id), level: 0, name: f.name, choices: grantedChoices(f.effects) })) : []),
    ...(species ? species.def.traits.map((t) => ({ sourceKey: choiceKeys.speciesTrait(species.fullId, t.id), level: 0, name: t.name, choices: grantedChoices(t.effects) })) : [])
  ]
  const asiFeat = registry.get('feats', 'ability-score-improvement')

  // --- ASI / feat slots (only the ones that count today)
  for (const slot of activeAsiSlotChoices(sheet.classes, sheet.asiSlotChoices)) {
    const feat = slot.kind === 'feat' ? (slot.featId ? registry.get('feats', slot.featId) : undefined) : asiFeat
    if (!feat) continue
    const sites = slot.level > 0 ? classSites(slot.className).filter((s) => s.level === slot.level) : originSites
    let placed = false
    for (const site of sites) {
      // Level-0 ability slots are the background's own ability choice, not an ASI feat.
      const direct = slot.level === 0 && slot.kind === 'ability' ? site.choices.find((c) => c.from.kind === 'abilities') : undefined
      if (direct) {
        const key = choiceKeys.choice(site.sourceKey, direct.id)
        if (!adapter.claim(key)) continue
        for (const a of abilityPicks(slot.abilityIncreases)) adapter.pick(key, a)
        placed = true
        break
      }
      const choice = site.choices.find((c) => featAccepts(c.from, feat))
      if (!choice) continue
      const key = choiceKeys.choice(site.sourceKey, choice.id)
      // Origin choices take one pick each; class features can stack (a duplicate slot still counts today).
      if (slot.level === 0 && !adapter.claim(key)) continue
      adapter.fillFeat(adapter.pick(key, feat.fullId), feat, slot)
      placed = true
      break
    }
    if (placed) continue
    // Nowhere on the build for it — keep it as a per-sheet effect so it still counts.
    if (slot.kind === 'ability') {
      adapter.custom('Ability Score Improvement', abilityPicks(slot.abilityIncreases).map((a) => ({ do: { kind: 'modify', target: `ability.${a}.score`, op: 'add', value: '1' } })))
    } else {
      const key = choiceKeys.choice(adapter.custom(feat.def.name, [{ do: { kind: 'grantChoice', choice: { id: 'feat', label: feat.def.name, from: { kind: 'feats', featIds: [feat.fullId] } } } }]), 'feat')
      adapter.fillFeat(adapter.pick(key, feat.fullId), feat, slot)
    }
  }

  // --- named subclass / class feature picks
  for (const record of activeSubclassFeatureChoices(sheet.classes, sheet.subclassFeatureChoices)) placeFeatureChoice(record)

  function resolvePick(from: OptionSource, record: SubclassFeatureChoice): string | undefined {
    const name = lower(record.chosenName)
    if (from.kind === 'optionList') {
      const list = registry.get('optionLists', from.listId)
      return list?.def.options.find((o) => lower(o.name) === name || lower(`${record.featureName}: ${o.name}`) === name || o.id === slug(record.chosenName))?.id
    }
    if (from.kind === 'spells') return registry.all('spells').find((s) => lower(s.def.name) === name || s.def.id === record.chosenName)?.fullId
    if (from.kind === 'feats') return registry.all('feats').find((f) => lower(f.def.name) === name || f.def.id === record.chosenName)?.fullId
    return undefined
  }

  function placeFeatureChoice(record: SubclassFeatureChoice): void {
    // Circle Spells only recorded that the spells were added — the Land option grants them itself now.
    if (record.featureName === 'Circle Spells') return
    const matches = classSites(record.className).flatMap((site) =>
      site.choices.filter((c) => lower(c.label) === lower(record.featureName) || lower(site.name) === lower(record.featureName)).map((choice) => ({ site, choice }))
    )
    const ordered = [...matches.filter((m) => m.site.level === record.level), ...matches.filter((m) => m.site.level !== record.level)]
    for (const { site, choice } of ordered) {
      const pick = resolvePick(choice.from, record)
      if (!pick) continue
      adapter.pick(choiceKeys.choice(site.sourceKey, choice.id), pick)
      return
    }
    // 2014 Ranger picks, and anything else with nowhere to go, are kept as a per-sheet record.
    const legacyList = record.featureName === 'Favored Enemy' ? SRD_LIST_IDS.favoredEnemies : record.featureName === 'Favored Terrain' ? SRD_LIST_IDS.favoredTerrains : undefined
    const from: OptionSource = legacyList ? { kind: 'optionList', listId: legacyList } : { kind: 'freeform' }
    const pick = legacyList ? resolvePick(from, record) : record.chosenName
    const key = choiceKeys.choice(adapter.custom(record.featureName, [{ do: { kind: 'grantChoice', choice: { id: 'pick', label: record.featureName, from } } }]), 'pick')
    adapter.pick(key, pick ?? record.chosenName)
  }

  // --- species lineage
  const lineage = sheet.raceLineageChoice
  if (lineage && species && species.def.id === lineage.raceId) {
    for (const site of originSites.filter((s) => s.sourceKey.startsWith('species:'))) {
      const lineageChoice = site.choices.find((c) => c.id === LINEAGE_CHOICE_IDS.lineage)
      if (!lineageChoice || lineageChoice.from.kind !== 'optionList') continue
      const list = registry.get('optionLists', lineageChoice.from.listId)
      const option = list?.def.options.find((o) => lower(o.name) === lower(lineage.lineageName))
      if (!option) continue
      adapter.pick(choiceKeys.choice(site.sourceKey, lineageChoice.id), option.id)
      adapter.pick(choiceKeys.choice(site.sourceKey, LINEAGE_CHOICE_IDS.spellAbility), lineage.spellcastingAbility)
    }
  }

  if (options.assumeWeaponProficiency) adapter.custom('Weapon proficiency (legacy sheet)', [{ do: { kind: 'proficiency', category: 'weapon', value: 'all' } }])

  const skillProficiencies: Record<string, ProficiencyLevel> = {}
  for (const [name, level] of Object.entries(sheet.skillProficiencies)) if (level) skillProficiencies[skillId(name)] = level

  const build: CharacterBuild = {
    abilityScores: { ...sheet.abilityScores },
    ...(species ? { speciesId: species.fullId } : {}),
    ...(background ? { backgroundId: background.fullId } : {}),
    classes: [
      ...resolvedClasses.map((c) => ({ classId: c.reg.fullId, level: c.level, ...(c.sub ? { subclassId: c.sub.fullId } : {}) })),
      ...unknown.map((u) => ({ classId: `${LEGACY_HOMEBREW_PACK_ID}:${homebrewIds.get(lower(u.name))}`, level: u.level }))
    ],
    // Native picks (v2 sheets, the new choices UI, homebrew) override whatever the legacy fields say for the same choice.
    choices: { ...adapter.choices, ...(sheet.choices ?? {}) },
    equipment: sheet.equipment.flatMap((e) => {
      const itemId = e.packItemId ?? e.compendiumId ?? e.magicItemId
      return itemId ? [{ key: e.id, itemId: registry.get('items', itemId)?.fullId ?? itemId, equipped: !!e.equipped, quantity: e.quantity }] : []
    }),
    activeToggles: [...sheet.activeBuffs],
    conditions: [
      ...(sheet.exhaustionLevel > 0 ? [{ id: 'exhaustion', level: sheet.exhaustionLevel }] : []),
      ...(sheet.activeConditions ?? []).filter((c) => c.id !== 'exhaustion').map((c) => ({ id: c.id, ...(c.level ? { level: c.level } : {}) }))
    ],
    saveProficiencies: [...sheet.savingThrowProficiencies],
    skillProficiencies,
    resourceUsed: { ...sheet.resourceUsed },
    currentHp: sheet.currentHp,
    // Passed through as-is, including null ("no spellcasting ability") — the sheet's own field wins.
    spellcastingAbility: sheet.spellcastingAbility,
    damageResistances: [...sheet.damageResistances],
    damageImmunities: [...sheet.damageImmunities],
    damageVulnerabilities: [...sheet.damageVulnerabilities],
    customEffects: adapter.customEffects,
    ...(sheet.counters ? { counters: { ...sheet.counters } } : {}),
    ...(sheet.abilityAliases ? { abilityAliases: { ...sheet.abilityAliases } } : {}),
    ...(sheet.resourceTemp ? { resourceTemp: { ...sheet.resourceTemp } } : {}),
    ...(sheet.companionStates ? { companions: { ...sheet.companionStates } } : {})
  }
  return { build, packs, warnings }
}
