// deriveCharacter: the one function that turns a character's raw choices
// (scores, classes, picks, equipment, toggles) plus the enabled content
// packs into every number and list the sheet shows. Nothing is special-cased
// by class, feat or item — every rule arrives as an Effect from some source.
// See docs/homebrew-engine.md §2–§5.
//
// How it works:
//   1. collect — walk every source the character has (species traits,
//      background, class + subclass features up to their level, picked
//      options/feats, equipped items, granted toggles, active conditions,
//      per-sheet custom effects) into a flat list of effects, each carrying
//      the conjunction of `when` gates of everything above it. Picks are
//      followed recursively, so a feat chosen at an ASI can grant its own
//      choice whose pick grants more effects.
//   2. stats — every stat is computed lazily on first read and memoised:
//      base value (core rule or `set`), then modifiers in a fixed op order.
//      Gates are evaluated lazily too, so a gate may read stats; reading a
//      stat while it's being computed is reported as a circular reference
//      instead of overflowing the stack.
//   3. assemble — attacks, resources, toggles, choices, spellcasting and
//      roll modes are read out of the collected effects.
//
// Errors in pack content never throw: they become diagnostics and the
// affected value falls back to its base, so one bad formula can't blank a
// whole sheet.

import {
  FormulaError,
  evaluateDice,
  evaluateNumber,
  formatDice,
  type DiceValue
} from './formula'
import { buildRegistry, localPart, type Diagnostic, type Registered, type Registry } from './registry'
import type {
  AbilityId,
  ActionDef,
  AttackDef,
  AttackFilter,
  ChoiceDef,
  ClassDef,
  Condition,
  ContentPack,
  Effect,
  EffectAction,
  FeatDef,
  Formula,
  ItemDef,
  ItemFilter,
  OptionDef,
  ResourceDef,
  SpellcastingDef,
  SubclassDef,
  ToggleDef
} from './schema'

export const ABILITY_IDS: AbilityId[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']

// ---------------------------------------------------------------------------
// Input

export type ProficiencyLevel = 'half' | 'proficient' | 'expertise'

export interface CharacterBuild {
  abilityScores: Record<AbilityId, number>
  speciesId?: string
  backgroundId?: string
  /** In the order taken — the first is the character's starting class (saves, full proficiencies). */
  classes: { classId: string; level: number; subclassId?: string }[]
  /** Picks per choice instance key (see DerivedChoice.key). */
  choices?: Record<string, string[]>
  equipment?: { key?: string; itemId: string; equipped?: boolean; attuned?: boolean; quantity?: number }[]
  /** Toggle ids (local or full) currently on, and spell ids whose ongoing effects are active. */
  activeToggles?: string[]
  conditions?: { id: string; level?: number }[]
  saveProficiencies?: AbilityId[]
  skillProficiencies?: Record<string, ProficiencyLevel>
  resourceUsed?: Record<string, number>
  currentHp?: number
  /** undefined = use the first spellcasting class's ability; null = explicitly none. */
  spellcastingAbility?: AbilityId | null
  damageResistances?: string[]
  damageImmunities?: string[]
  damageVulnerabilities?: string[]
  /** Per-sheet homebrew boons that aren't in any pack. */
  customEffects?: { name: string; effects: Effect[] }[]
}

// ---------------------------------------------------------------------------
// Output

export type RollMode = 'advantage' | 'disadvantage'

export interface DerivedAttack {
  id: string
  name: string
  kind: 'weapon' | 'unarmed' | 'granted'
  itemKey?: string
  range: 'melee' | 'ranged'
  ability: AbilityId
  proficient: boolean
  attackBonus: number
  damage: string
  damageDice: DiceValue
  damageType: string
  extraDamage: { damage: string; damageType?: string; source: string }[]
  mode?: RollMode
  actionType: string
}

export interface DerivedResource {
  id: string
  name: string
  description: string
  max: number
  used: number
  recharge: string
  display: 'uses' | 'pool'
  actionType?: string
  source: string
  /** The class that granted it, when a class or subclass feature did — for the sheet's class badge. */
  className?: string
  /** The granting feature's full rules text (the resource/toggle/action's own description is a one-liner). */
  detail?: string
}

export interface DerivedToggle {
  id: string
  name: string
  description: string
  actionType?: string
  cost?: { resourceId: string; amount: number }
  active: boolean
  source: string
  /** The class that granted it, when a class or subclass feature did — for the sheet's class badge. */
  className?: string
  /** The granting feature's full rules text (the resource/toggle/action's own description is a one-liner). */
  detail?: string
}

export interface DerivedAction {
  id: string
  name: string
  description: string
  actionType: string
  cost?: { resourceId: string; amount: number }
  attackBonus?: number
  saveDc?: number
  saveAbility?: AbilityId
  damage?: string
  damageType?: string
  healing?: string
  activatesToggle?: string
  source: string
  /** The class that granted it, when a class or subclass feature did — for the sheet's class badge. */
  className?: string
  /** The granting feature's full rules text (the resource/toggle/action's own description is a one-liner). */
  detail?: string
}

export interface DerivedChoiceOption {
  id: string
  name: string
  description: string
  available: boolean
}

export interface DerivedChoice {
  /** Stable instance key — where this choice's picks live in CharacterBuild.choices. */
  key: string
  label: string
  source: string
  count: number
  picks: string[]
  remaining: number
  allowRepeats: boolean
  freeform: boolean
  options: DerivedChoiceOption[]
  /** Key of the source that granted it (a class feature, species trait, picked feat…). */
  sourceKey: string
  /** Set when the choice hangs off another choice's pick (an ASI feat's ability scores) — that choice's key. */
  parentKey?: string
  /** Level of the class/subclass feature it came from, when it came from one. */
  level?: number
  /** The class it came from, when a class or subclass feature granted it. */
  classId?: string
  className?: string
}

export interface DerivedSpellcastingSource {
  classId: string
  className: string
  ability: AbilityId
  dc: number
  attackBonus: number
  list: string
  ritualCasting: boolean
  spellbook: boolean
}

export interface DerivedFeature {
  key: string
  name: string
  description: string
  source: string
  level?: number
}

export interface DerivedCharacter {
  level: number
  proficiencyBonus: number
  abilities: Record<AbilityId, { score: number; mod: number; max: number }>
  saves: Record<AbilityId, { bonus: number; proficiency?: ProficiencyLevel; mode?: RollMode }>
  skills: Record<string, { name: string; ability: AbilityId; bonus: number; passive: number; proficiency?: ProficiencyLevel; mode?: RollMode }>
  checkModes: Partial<Record<AbilityId, RollMode>>
  initiative: number
  initiativeMode?: RollMode
  attackMode?: RollMode
  armorClass: number
  speeds: Record<string, number>
  maxHp: number
  hitDice: { classId: string; className: string; die: number; count: number }[]
  carryingCapacity: number
  damageRelations: { resistances: string[]; immunities: string[]; vulnerabilities: string[] }
  conditionImmunities: string[]
  proficiencies: { weapon: string[]; armor: string[]; tool: string[]; language: string[] }
  spellcasting: {
    sources: DerivedSpellcastingSource[]
    dc: number | null
    attackBonus: number | null
    /** pool → spell level → slots. */
    slots: Record<string, Record<number, number>>
    preparedLimit: number | null
    knownLimit: number | null
    cantripsLimit: number | null
    granted: { spellId: string; name: string; alwaysPrepared: boolean; free: boolean; ability?: AbilityId; source: string }[]
  }
  resources: DerivedResource[]
  toggles: DerivedToggle[]
  actions: DerivedAction[]
  attacks: DerivedAttack[]
  features: DerivedFeature[]
  notes: { source: string; text: string }[]
  choices: DerivedChoice[]
  stats: Record<string, { name: string; value: number; display: boolean }>
  diagnostics: Diagnostic[]
}

// ---------------------------------------------------------------------------
// Internals

interface ClassContext {
  /** Index into the build's resolved classes. */
  index: number
}

interface Source {
  key: string
  name: string
  packId: string
  classCtx?: ClassContext
  /** The class/subclass level of the feature this ultimately came from (carried down through picks), for "what did this level unlock". */
  level?: number
  /** "Rage", "Darkvision"… shown on the sheet's Features list. */
  feature?: { description: string; level?: number }
}

interface CollectedEffect {
  action: EffectAction
  gates: Condition[]
  source: Source
}

interface ResolvedClass {
  reg: Registered<ClassDef>
  level: number
  subclass?: Registered<SubclassDef>
}

interface ResolvedItem {
  key: string
  reg: Registered<ItemDef>
  equipped: boolean
  attuned: boolean
}

type Op = 'add' | 'set' | 'multiply' | 'atLeast' | 'atMost' | 'transform'
const PROFICIENCY_VALUE: Record<ProficiencyLevel, number> = { half: 0.5, proficient: 1, expertise: 2 }

function proficiencyFromValue(v: number): ProficiencyLevel | undefined {
  if (v >= 2) return 'expertise'
  if (v >= 1) return 'proficient'
  if (v >= 0.5) return 'half'
  return undefined
}

function sameId(a: string, b: string): boolean {
  return a === b || localPart(a) === localPart(b)
}

function substitutePick<T>(value: T, pick: string): T {
  return JSON.parse(JSON.stringify(value).split('$pick').join(pick)) as T
}

/**
 * How the engine names sources and choice instances — CharacterBuild.choices is keyed by these.
 * Exported so code that writes picks (the legacy adapter, the choices UI) builds the same keys.
 */
export const choiceKeys = {
  classFeature: (classFullId: string, featureId: string): string => `class:${classFullId}:${featureId}`,
  subclassFeature: (subclassFullId: string, featureId: string): string => `subclass:${subclassFullId}:${featureId}`,
  speciesTrait: (speciesFullId: string, traitId: string): string => `species:${speciesFullId}:${traitId}`,
  backgroundFeature: (backgroundFullId: string, featureId: string): string => `background:${backgroundFullId}:${featureId}`,
  custom: (index: number): string => `custom:${index}`,
  /** A choice granted by the source with this key. */
  choice: (sourceKey: string, choiceId: string): string => `${sourceKey}#${choiceId}`,
  /** The source key of one pick — choices granted by the picked option hang off it. `repeat` counts earlier picks of the same option. */
  pick: (choiceKey: string, pick: string, repeat = 0): string => `${choiceKey}/${pick}${repeat ? `@${repeat}` : ''}`
}

function rechargeLabel(r: ResourceDef['recharge'], test: (c: Condition) => boolean): string {
  if (typeof r === 'string') return r
  return test(r.when) ? r.then : r.else
}

// ---------------------------------------------------------------------------

export function deriveCharacter(build: CharacterBuild, packsOrRegistry: ContentPack[] | Registry): DerivedCharacter {
  const registry = Array.isArray(packsOrRegistry) ? buildRegistry(packsOrRegistry) : packsOrRegistry
  const diagnostics: Diagnostic[] = [...registry.diagnostics]
  const warn = (message: string, source?: string): void => {
    if (!diagnostics.some((d) => d.message === message && d.source === source)) diagnostics.push({ severity: 'warning', message, source })
  }
  const error = (message: string, source?: string): void => {
    if (!diagnostics.some((d) => d.message === message && d.source === source)) diagnostics.push({ severity: 'error', message, source })
  }

  // --- resolve the build's references --------------------------------------

  const classes: ResolvedClass[] = []
  for (const c of build.classes) {
    const reg = registry.get('classes', c.classId)
    if (!reg) {
      warn(`Class "${c.classId}" isn't in any enabled pack — its features are skipped.`, c.classId)
      continue
    }
    let subclass: Registered<SubclassDef> | undefined
    if (c.subclassId) {
      subclass = registry.get('subclasses', c.subclassId, reg.packId)
      if (!subclass) warn(`Subclass "${c.subclassId}" isn't in any enabled pack.`, c.subclassId)
      else if (!sameId(subclass.def.classId, reg.fullId)) warn(`Subclass "${subclass.def.name}" belongs to a different class than ${reg.def.name}.`, subclass.fullId)
    }
    classes.push({ reg, level: Math.max(0, Math.floor(c.level)), subclass })
  }
  const rawLevel = classes.reduce((sum, c) => sum + c.level, 0)

  const species = build.speciesId ? registry.get('species', build.speciesId) : undefined
  if (build.speciesId && !species) warn(`Species "${build.speciesId}" isn't in any enabled pack.`, build.speciesId)
  const background = build.backgroundId ? registry.get('backgrounds', build.backgroundId) : undefined
  if (build.backgroundId && !background) warn(`Background "${build.backgroundId}" isn't in any enabled pack.`, build.backgroundId)

  const items: ResolvedItem[] = []
  ;(build.equipment ?? []).forEach((e, i) => {
    const reg = registry.get('items', e.itemId)
    if (!reg) {
      warn(`Item "${e.itemId}" isn't in any enabled pack.`, e.itemId)
      return
    }
    items.push({ key: e.key ?? `item-${i}`, reg, equipped: !!e.equipped, attuned: !!e.attuned })
  })

  const activeToggles = build.activeToggles ?? []
  const conditionLevels = new Map<string, number>()
  for (const c of build.conditions ?? []) conditionLevels.set(c.id, c.level ?? 1)

  // --- 1. collect ----------------------------------------------------------

  const effects: CollectedEffect[] = []
  const features: Array<{ feature: DerivedFeature; gates: Condition[]; source: Source }> = []
  const entryIds = new Set<string>()
  const choiceInstances: Array<{ key: string; choice: ChoiceDef; source: Source; gates: Condition[] }> = []

  function collectEffects(list: Effect[] | undefined, source: Source, gates: Condition[]): void {
    for (const effect of list ?? []) {
      const g = effect.when ? [...gates, effect.when] : gates
      effects.push({ action: effect.do, gates: g, source })
      if (effect.do.kind === 'grantChoice') collectChoice(effect.do.choice, source, g)
      if (effect.do.kind === 'grantToggle') collectToggle(effect.do.toggle, source, g)
    }
  }

  function addFeature(source: Source, gates: Condition[]): void {
    if (!source.feature) return
    const feature: DerivedFeature = { key: source.key, name: source.name, description: source.feature.description, source: source.packId }
    if (source.feature.level !== undefined) feature.level = source.feature.level
    features.push({ feature, gates, source })
  }

  function collectToggle(toggle: ToggleDef, parent: Source, gates: Condition[]): void {
    const source: Source = { key: `toggle:${toggle.id}`, name: toggle.name, packId: parent.packId, classCtx: parent.classCtx, level: parent.level }
    collectEffects(toggle.effects, source, [...gates, { kind: 'toggle', toggleId: toggle.id }])
  }

  function collectChoice(choice: ChoiceDef, parent: Source, gates: Condition[]): void {
    const key = choiceKeys.choice(parent.key, choice.id)
    choiceInstances.push({ key, choice, source: parent, gates })
    const picks = build.choices?.[key] ?? []
    const seen = new Map<string, number>()
    for (const pick of picks) {
      const n = seen.get(pick) ?? 0
      seen.set(pick, n + 1)
      const pickKey = choiceKeys.pick(key, pick, n)
      const pickSource: Source = { key: pickKey, name: choice.label, packId: parent.packId, classCtx: parent.classCtx, level: parent.level }
      collectEffects(choice.onPick ? substitutePick(choice.onPick, pick) : [], pickSource, gates)
      collectPickedOption(choice, pick, pickKey, parent, gates)
    }
  }

  function collectPickedOption(choice: ChoiceDef, pick: string, pickKey: string, parent: Source, gates: Condition[]): void {
    const from = choice.from
    if (from.kind === 'feats') {
      const feat = registry.get('feats', pick, parent.packId)
      if (!feat) return warn(`Picked feat "${pick}" isn't in any enabled pack.`, pickKey)
      entryIds.add(feat.fullId)
      const source: Source = { key: pickKey, name: feat.def.name, packId: feat.packId, classCtx: parent.classCtx, level: parent.level, feature: { description: feat.def.description } }
      addFeature(source, gates)
      collectEffects(feat.def.effects, source, gates)
    } else if (from.kind === 'optionList') {
      const list = registry.get('optionLists', from.listId, parent.packId)
      if (!list) return warn(`Option list "${from.listId}" isn't in any enabled pack.`, pickKey)
      const option = list.def.options.find((o) => o.id === pick)
      if (!option) return warn(`"${pick}" isn't an option in ${list.def.name}.`, pickKey)
      entryIds.add(`${list.fullId}/${option.id}`)
      const source: Source = { key: pickKey, name: option.name, packId: list.packId, classCtx: parent.classCtx, level: parent.level, feature: { description: option.description } }
      addFeature(source, gates)
      collectEffects(option.effects, source, gates)
    } else if (from.kind === 'spells') {
      const spell = registry.get('spells', pick, parent.packId)
      if (!spell) return warn(`Picked spell "${pick}" isn't in any enabled pack.`, pickKey)
      effects.push({
        action: { kind: 'grantSpells', spellIds: [spell.fullId], alwaysPrepared: false, free: true },
        gates,
        source: { key: pickKey, name: choice.label, packId: parent.packId, classCtx: parent.classCtx, level: parent.level }
      })
    }
  }

  function collectFeatureDef(
    def: { id: string; name: string; description?: string; effects?: Effect[] },
    key: string,
    packId: string,
    gates: Condition[],
    classCtx?: ClassContext,
    level?: number
  ): void {
    const source: Source = { key, name: def.name, packId, classCtx, level, feature: { description: def.description ?? '', level } }
    addFeature(source, gates)
    collectEffects(def.effects, source, gates)
  }

  if (species) {
    entryIds.add(species.fullId)
    for (const trait of species.def.traits) collectFeatureDef(trait, choiceKeys.speciesTrait(species.fullId, trait.id), species.packId, [])
  }
  if (background) {
    entryIds.add(background.fullId)
    for (const f of background.def.features) collectFeatureDef(f, choiceKeys.backgroundFeature(background.fullId, f.id), background.packId, [])
  }

  classes.forEach((c, index) => {
    const ctx: ClassContext = { index }
    const def = c.reg.def
    entryIds.add(c.reg.fullId)
    const implicit: Source = { key: `class:${c.reg.fullId}`, name: def.name, packId: c.reg.packId, classCtx: ctx }
    const prof = (category: 'save' | 'armor' | 'weapon' | 'tool', value: string): void => {
      effects.push({ action: { kind: 'proficiency', category, value }, gates: [], source: implicit })
    }
    if (index === 0) {
      def.saves.forEach((a) => prof('save', a))
      def.armorProficiencies.forEach((p) => prof('armor', p))
      def.weaponProficiencies.forEach((p) => prof('weapon', p))
      def.toolProficiencies.forEach((p) => prof('tool', p))
    } else {
      for (const p of def.multiclassProficiencies ?? []) {
        const [category, value] = p.includes(':') ? (p.split(':', 2) as [string, string]) : ['armor', p]
        if (category === 'armor' || category === 'weapon' || category === 'tool') prof(category, value)
        else warn(`Multiclass proficiency "${p}" should be written as "armor:<x>", "weapon:<x>" or "tool:<x>".`, c.reg.fullId)
      }
    }
    if (def.spellcasting) effects.push({ action: { kind: 'spellcasting', config: def.spellcasting }, gates: [], source: implicit })
    for (const lvl of def.levels) {
      if (lvl.level > c.level) continue
      for (const f of lvl.features) collectFeatureDef(f, choiceKeys.classFeature(c.reg.fullId, f.id), c.reg.packId, [], ctx, lvl.level)
    }
    if (c.subclass) {
      entryIds.add(c.subclass.fullId)
      const sub = c.subclass
      if (sub.def.spellcasting) {
        effects.push({ action: { kind: 'spellcasting', config: sub.def.spellcasting }, gates: [], source: { ...implicit, key: `subclass:${sub.fullId}`, name: sub.def.name } })
      }
      for (const lvl of sub.def.levels) {
        if (lvl.level > c.level) continue
        for (const f of lvl.features) collectFeatureDef(f, choiceKeys.subclassFeature(sub.fullId, f.id), sub.packId, [], ctx, lvl.level)
      }
    }
  })

  for (const item of items) {
    entryIds.add(item.reg.fullId)
    const def = item.reg.def
    const active = def.effectsWhen === 'carried' || (def.effectsWhen === 'equipped' && item.equipped) || (def.effectsWhen === 'attuned' && item.attuned && item.equipped)
    const source: Source = { key: `item:${item.key}`, name: def.name, packId: item.reg.packId }
    if (def.charges) effects.push({ action: { kind: 'grantResource', resource: { ...def.charges, id: def.charges.id || `${item.key}-charges` } }, gates: [], source })
    if (active) collectEffects(def.effects, source, [])
  }

  for (const [conditionId, level] of conditionLevels) {
    const def = registry.vocabulary.conditions.find((c) => sameId(c.id, conditionId))
    if (!def) {
      warn(`Condition "${conditionId}" isn't defined by any enabled pack.`, conditionId)
      continue
    }
    if (def.maxLevel !== undefined && level > def.maxLevel) warn(`${def.name} only goes up to level ${def.maxLevel}.`, conditionId)
    collectEffects(def.effects, { key: `condition:${def.id}`, name: def.name, packId: def.packId }, [])
  }

  // Spells with ongoing effects (Mage Armor, homebrew buffs) apply while their toggle is on.
  for (const toggleId of activeToggles) {
    const spell = registry.get('spells', toggleId)
    if (spell && spell.def.effects.length) {
      collectEffects(spell.def.effects, { key: `spell:${spell.fullId}`, name: spell.def.name, packId: spell.packId }, [])
    }
  }

  ;(build.customEffects ?? []).forEach((custom, i) => {
    const source: Source = { key: choiceKeys.custom(i), name: custom.name, packId: 'custom', feature: { description: '' } }
    collectEffects(custom.effects, source, [])
  })

  // --- 2. stats ------------------------------------------------------------

  const statCache = new Map<string, number | null>()
  const computing: string[] = []
  const modsByTarget = new Map<string, CollectedEffect[]>()
  for (const e of effects) {
    if (e.action.kind !== 'modify' || e.action.appliesTo) continue
    const list = modsByTarget.get(e.action.target) ?? []
    list.push(e)
    modsByTarget.set(e.action.target, list)
  }

  const skillDefs = registry.vocabulary.skills
  const customStats = registry.vocabulary.stats
  const hasStat = (path: string): boolean => coreStatBase(path) !== undefined

  // Skill/save proficiencies granted by effects feed the numeric proficiency stats.
  for (const e of effects) {
    if (e.action.kind !== 'proficiency' || (e.action.category !== 'skill' && e.action.category !== 'save')) continue
    const target = e.action.category === 'skill' ? `skill.${e.action.value}.proficiency` : `save.${e.action.value}.proficiency`
    const list = modsByTarget.get(target) ?? []
    list.push({
      action: { kind: 'modify', target, op: 'atLeast', value: String(PROFICIENCY_VALUE[e.action.level ?? 'proficient']) },
      gates: e.gates,
      source: e.source
    })
    modsByTarget.set(target, list)
  }

  /** The base of a built-in stat, or undefined if the path isn't a stat. Returning null means "this character doesn't have it" (e.g. spell DC for a non-caster). */
  function coreStatBase(path: string): (() => number | null) | undefined {
    const parts = path.split('.')
    const [head, a, b] = parts
    switch (head) {
      case 'level':
        return parts.length === 1 ? () => rawLevel || 1 : undefined
      case 'prof':
        return parts.length === 1 ? () => 2 + Math.floor((stat('level') - 1) / 4) : undefined
      case 'ability': {
        if (!ABILITY_IDS.includes(a as AbilityId) || parts.length !== 3) return undefined
        const ability = a as AbilityId
        if (b === 'score') return () => build.abilityScores[ability] ?? 10
        if (b === 'max') return () => 20
        if (b === 'mod') return () => Math.floor((stat(`ability.${ability}.score`) - 10) / 2)
        return undefined
      }
      case 'save': {
        if (!ABILITY_IDS.includes(a as AbilityId)) return undefined
        if (parts.length === 2) return () => stat(`ability.${a}.mod`) + Math.floor(stat('prof') * stat(`save.${a}.proficiency`))
        if (parts.length === 3 && b === 'proficiency') return () => (build.saveProficiencies?.includes(a as AbilityId) ? 1 : 0)
        return undefined
      }
      case 'skill': {
        const skill = skillDefs.find((s) => s.id === a)
        if (!skill) return undefined
        if (parts.length === 2) return () => stat(`ability.${skill.ability}.mod`) + Math.floor(stat('prof') * stat(`skill.${skill.id}.proficiency`))
        if (parts.length === 3 && b === 'proficiency') {
          return () => {
            const level = build.skillProficiencies?.[skill.id]
            return level ? PROFICIENCY_VALUE[level] : 0
          }
        }
        return undefined
      }
      case 'passive': {
        const skill = skillDefs.find((s) => s.id === a)
        return skill && parts.length === 2 ? () => 10 + stat(`skill.${skill.id}`) : undefined
      }
      case 'initiative':
        return parts.length === 1 ? () => stat('ability.dex.mod') : undefined
      case 'ac':
        return parts.length === 1 ? armorClassBase : undefined
      case 'speed': {
        if (parts.length !== 2 || !a) return undefined
        return () => {
          const formula = species?.def.speed[a] ?? (a === 'walk' ? '30' : undefined)
          return formula ? num(formula, { key: `species:${species?.fullId ?? 'default'}`, name: 'Speed', packId: species?.packId ?? '' }) : 0
        }
      }
      case 'hp':
        return a === 'max' && parts.length === 2 ? hitPointBase : undefined
      case 'carry':
        return a === 'capacity' && parts.length === 2 ? () => stat('ability.str.score') * 15 : undefined
      case 'spell': {
        if (parts.length !== 2 || (a !== 'dc' && a !== 'attack')) return undefined
        return () => {
          const ability = characterSpellAbility()
          if (!ability) return null
          const base = stat('prof') + stat(`ability.${ability}.mod`)
          return a === 'dc' ? 8 + base : base
        }
      }
      case 'slots':
        return parts.length === 3 ? () => slotBase(a, Number(b)) : undefined
      case 'spells':
        if (parts.length !== 2 || !['preparedLimit', 'knownLimit', 'cantripsLimit'].includes(a)) return undefined
        return () => spellLimitBase(a as 'preparedLimit' | 'knownLimit' | 'cantripsLimit')
      case 'resource': {
        if (parts.length !== 3 || b !== 'max') return undefined
        if (!effects.some((e) => e.action.kind === 'grantResource' && e.action.resource.id === a)) return undefined
        return () => {
          const grant = resourceGrants().find((r) => r.resource.id === a)
          return grant ? num(grant.resource.max, grant.source) : null
        }
      }
      case 'stat': {
        const def = customStats.find((s) => s.id === a)
        return def && parts.length === 2 ? () => num(def.base, { key: `stat:${def.id}`, name: def.name, packId: def.packId }) : undefined
      }
    }
    return undefined
  }

  /** The stat's final value; null when the character doesn't have it. Reports (and breaks) circular references. */
  function statOrNull(path: string): number | null {
    if (statCache.has(path)) return statCache.get(path)!
    if (computing.includes(path)) {
      throw new FormulaError(`Circular reference: ${[...computing.slice(computing.indexOf(path)), path].join(' → ')}`)
    }
    const base = coreStatBase(path)
    if (!base) throw new FormulaError(`Unknown reference @${path}`)
    computing.push(path)
    try {
      const value = applyModifiers(path, base())
      statCache.set(path, value)
      return value
    } finally {
      computing.pop()
    }
  }

  function stat(path: string): number {
    return statOrNull(path) ?? 0
  }

  function applyModifiers(path: string, base: number | null): number | null {
    if (base === null) return null
    const mods = (modsByTarget.get(path) ?? []).filter((m) => gatesPass(m.gates, m.source))
    const byOp = (op: Op): Array<CollectedEffect & { action: Extract<EffectAction, { kind: 'modify' }> }> =>
      mods.filter((m): m is CollectedEffect & { action: Extract<EffectAction, { kind: 'modify' }> } => m.action.kind === 'modify' && m.action.op === op)
    const valueOf = (m: CollectedEffect & { action: Extract<EffectAction, { kind: 'modify' }> }): number => num(m.action.value, m.source)

    let value = base
    const sets = byOp('set').map(valueOf)
    if (sets.length) value = Math.max(...sets)
    for (const m of byOp('add')) if (!m.action.uncapped) value += valueOf(m)
    for (const m of byOp('multiply')) value *= valueOf(m)
    const cap = path.match(/^ability\.(\w+)\.score$/) ? stat(`ability.${path.split('.')[1]}.max`) : undefined
    if (cap !== undefined) value = Math.min(value, cap)
    for (const m of byOp('add')) if (m.action.uncapped) value += valueOf(m)
    for (const m of byOp('atLeast')) value = Math.max(value, valueOf(m))
    for (const m of byOp('atMost')) value = Math.min(value, valueOf(m))
    for (const m of byOp('transform')) {
      const current = value
      value = num(m.action.value, m.source, { value: current })
    }
    return value
  }

  for (const [target, mods] of modsByTarget) {
    if (!hasStat(target)) warn(`"${mods[0].source.name}" modifies "${target}", which isn't a stat this character has.`, mods[0].source.key)
  }

  // --- formula references ---

  interface EvalExtras {
    value?: number
    spellLevel?: number
  }

  function tableValue(c: ResolvedClass, columnId: string, level: number): number {
    const column = [...(c.subclass?.def.columns ?? []), ...c.reg.def.columns].find((col) => col.id === columnId)
    if (!column) throw new FormulaError(`${c.reg.def.name} has no table column "${columnId}"`)
    if (level < 1) return 0
    const raw = column.values[Math.min(level, column.values.length) - 1]
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (raw === undefined || raw === '' || !Number.isFinite(n)) {
      throw new FormulaError(`${c.reg.def.name}'s "${column.label}" column has no number at level ${level}`)
    }
    return n
  }

  function findClass(ref: string): ResolvedClass | undefined {
    return classes.find((c) => sameId(c.reg.fullId, ref) || c.reg.def.id === ref)
  }

  function resolveRef(path: string[], index: number | undefined, source: Source, extras: EvalExtras): number {
    const [head, a, b, c] = path
    const ctxClass = source.classCtx ? classes[source.classCtx.index] : undefined
    if (path.length === 1) {
      if (head === 'value') {
        if (extras.value === undefined) throw new FormulaError('@value only works inside a transform')
        return extras.value
      }
      if (head === 'classLevel') {
        if (!ctxClass) throw new FormulaError('@classLevel only works inside a class or subclass feature')
        return ctxClass.level
      }
      if (head === 'slotLevel') {
        if (extras.spellLevel === undefined) throw new FormulaError('@slotLevel only works in spell formulas')
        return extras.spellLevel
      }
    }
    if (ABILITY_IDS.includes(head as AbilityId)) {
      if (path.length === 1 || (path.length === 2 && a === 'score')) return stat(`ability.${head}.score`)
      if (path.length === 2 && (a === 'mod' || a === 'max')) return stat(`ability.${head}.${a}`)
    }
    if (head === 'table' && path.length === 2) {
      if (!ctxClass) throw new FormulaError('@table only works inside a class or subclass feature — use @class.<id>.table.<column> elsewhere')
      return tableValue(ctxClass, a, index ?? ctxClass.level)
    }
    if (head === 'class' && a) {
      const cls = findClass(a)
      if (path.length === 3 && b === 'level') return cls?.level ?? 0
      if (path.length === 4 && b === 'table') return cls ? tableValue(cls, c, index ?? cls.level) : 0
    }
    if (head === 'condition' && a && path.length === 3 && b === 'level') {
      for (const [id, level] of conditionLevels) if (sameId(id, a)) return level
      return 0
    }
    if (head === 'resource' && a && path.length === 3 && (b === 'used' || b === 'remaining')) {
      const used = build.resourceUsed?.[a] ?? 0
      return b === 'used' ? used : Math.max(0, stat(`resource.${a}.max`) - used)
    }
    if (head === 'hp' && a === 'current' && path.length === 2) return build.currentHp ?? stat('hp.max')
    if (head === 'spell' && a === 'level' && path.length === 2) {
      if (extras.spellLevel === undefined) throw new FormulaError('@spell.level only works in spell formulas')
      return extras.spellLevel
    }
    const value = statOrNull(path.join('.'))
    if (value === null) throw new FormulaError(`@${path.join('.')} doesn't apply to this character`)
    return value
  }

  function num(formula: Formula, source: Source, extras: EvalExtras = {}): number {
    try {
      return evaluateNumber(formula, (path, index) => resolveRef(path, index, source, extras))
    } catch (e) {
      if (!(e instanceof FormulaError)) throw e
      error(`${source.name}: ${e.message} in "${formula}"`, source.key)
      return 0
    }
  }

  function dice(formula: Formula, source: Source, extras: EvalExtras = {}): DiceValue {
    try {
      return evaluateDice(formula, (path, index) => resolveRef(path, index, source, extras))
    } catch (e) {
      if (!(e instanceof FormulaError)) throw e
      error(`${source.name}: ${e.message} in "${formula}"`, source.key)
      return { dice: [], flat: 0 }
    }
  }

  // --- conditions ---

  function itemMatches(item: ResolvedItem, filter: ItemFilter): boolean {
    const def = item.reg.def
    const lower = (xs: string[] | undefined): string[] | undefined => xs?.map((x) => x.toLowerCase())
    if (filter.itemIds && !filter.itemIds.some((id) => sameId(id, item.reg.fullId))) return false
    if (filter.categories && !lower(filter.categories)!.includes(def.category.toLowerCase())) return false
    if (filter.armorCategories && !(def.armor && lower(filter.armorCategories)!.includes(def.armor.category.toLowerCase()))) return false
    if (filter.weaponCategories && !(def.weapon && lower(filter.weaponCategories)!.includes(def.weapon.category.toLowerCase()))) return false
    if (filter.properties) {
      const props = lower(def.weapon?.properties) ?? []
      if (!lower(filter.properties)!.some((p) => props.includes(p))) return false
    }
    return true
  }

  function grantedToggle(toggleId: string): CollectedEffect | undefined {
    return effects.find((e) => e.action.kind === 'grantToggle' && sameId(e.action.toggle.id, toggleId))
  }

  function toggleActive(toggleId: string): boolean {
    if (!activeToggles.some((t) => sameId(t, toggleId))) return false
    // A spell's toggle needs no grant; anything else must still be granted (and its grant's gates must pass).
    if (registry.get('spells', toggleId)) return true
    const grant = grantedToggle(toggleId)
    return !!grant && gatesPass(grant.gates, grant.source)
  }

  function conditionPasses(cond: Condition, source: Source): boolean {
    switch (cond.kind) {
      case 'level':
        return (cond.min === undefined || rawLevel >= cond.min) && (cond.max === undefined || rawLevel <= cond.max)
      case 'classLevel':
        return (findClass(cond.classId)?.level ?? 0) >= cond.min
      case 'subclass':
        return classes.some((c) => c.subclass && (sameId(c.subclass.fullId, cond.subclassId) || c.subclass.def.id === cond.subclassId))
      case 'equipped':
        return items.some((i) => i.equipped && itemMatches(i, cond.filter))
      case 'toggle':
        return toggleActive(cond.toggleId)
      case 'condition': {
        for (const [id, level] of conditionLevels) if (sameId(id, cond.conditionId)) return level >= (cond.minLevel ?? 1)
        return false
      }
      case 'hasEntry':
        return [...entryIds].some((id) => id === cond.entryId || localPart(id) === cond.entryId || id.endsWith(`/${cond.entryId}`))
      case 'formula':
        return num(cond.formula, source) !== 0
      case 'all':
        return cond.of.every((c) => conditionPasses(c, source))
      case 'any':
        return cond.of.some((c) => conditionPasses(c, source))
      case 'not':
        return !conditionPasses(cond.of, source)
    }
  }

  function gatesPass(gates: Condition[], source: Source): boolean {
    return gates.every((g) => conditionPasses(g, source))
  }

  const activeEffects = <K extends EffectAction['kind']>(kind: K): Array<CollectedEffect & { action: Extract<EffectAction, { kind: K }> }> =>
    effects.filter((e): e is CollectedEffect & { action: Extract<EffectAction, { kind: K }> } => e.action.kind === kind && gatesPass(e.gates, e.source))

  // --- base calculations that need more than a formula ---

  const BODY_ARMOR: ItemFilter = { armorCategories: ['light', 'medium', 'heavy'] }

  function armorClassBase(): number {
    const candidates: number[] = []
    if (!items.some((i) => i.equipped && itemMatches(i, BODY_ARMOR))) candidates.push(10 + stat('ability.dex.mod'))
    for (const e of activeEffects('acFormula')) candidates.push(num(e.action.formula, e.source))
    return candidates.length ? Math.max(...candidates) : 10 + stat('ability.dex.mod')
  }

  function hitPointBase(): number {
    const conMod = stat('ability.con.mod')
    let total = 0
    let first = true
    classes.forEach((c, index) => {
      const def = c.reg.def
      const source: Source = { key: `class:${c.reg.fullId}`, name: def.name, packId: c.reg.packId, classCtx: { index } }
      const firstHp = def.hpFirstLevel ? num(def.hpFirstLevel, source) : def.hitDie
      const perLevel = def.hpPerLevel ? num(def.hpPerLevel, source) : Math.floor(def.hitDie / 2) + 1
      for (let lvl = 1; lvl <= c.level; lvl++) {
        total += (first ? firstHp : perLevel) + conMod
        first = false
      }
    })
    return Math.max(1, total)
  }

  function spellcastingConfigs(): Array<{ config: SpellcastingDef; source: Source; cls: ResolvedClass }> {
    return activeEffects('spellcasting').flatMap((e) => {
      const cls = e.source.classCtx ? classes[e.source.classCtx.index] : undefined
      if (!cls) {
        warn(`${e.source.name}: spellcasting can only be granted by a class or subclass.`, e.source.key)
        return []
      }
      return [{ config: e.action.config, source: e.source, cls }]
    })
  }

  function slotBase(pool: string, spellLevel: number): number | null {
    let total = 0
    let any = false
    for (const { config, cls } of spellcastingConfigs()) {
      if (!config.slots || (config.slots.pool ?? 'standard') !== pool) continue
      const row = config.slots.rows[Math.min(cls.level, config.slots.rows.length) - 1]
      if (!row) continue
      any = true
      total += row[spellLevel - 1] ?? 0
    }
    return any ? total : null
  }

  function spellLimitBase(kind: 'preparedLimit' | 'knownLimit' | 'cantripsLimit'): number | null {
    const field = kind === 'preparedLimit' ? 'prepared' : kind === 'knownLimit' ? 'known' : 'cantrips'
    let total = 0
    let any = false
    for (const { config, source } of spellcastingConfigs()) {
      const formula = config[field]
      if (!formula) continue
      any = true
      total += num(formula, source)
    }
    return any ? total : null
  }

  function characterSpellAbility(): AbilityId | null {
    if (build.spellcastingAbility !== undefined) return build.spellcastingAbility
    return spellcastingConfigs()[0]?.config.ability ?? null
  }

  function resourceGrants(): Array<{ resource: ResourceDef; source: Source }> {
    const seen = new Map<string, { resource: ResourceDef; source: Source }>()
    for (const e of activeEffects('grantResource')) {
      if (seen.has(e.action.resource.id)) continue
      seen.set(e.action.resource.id, { resource: e.action.resource, source: e.source })
    }
    return [...seen.values()]
  }

  // --- 3. assemble -----------------------------------------------------------

  function combineModes(modes: RollMode[]): RollMode | undefined {
    const adv = modes.includes('advantage')
    const dis = modes.includes('disadvantage')
    if (adv === dis) return undefined
    return adv ? 'advantage' : 'disadvantage'
  }

  const rollModeEffects = activeEffects('rollMode')
  const modeFor = (target: string): RollMode | undefined =>
    combineModes(rollModeEffects.filter((e) => e.action.target === target && !e.action.appliesTo).map((e) => e.action.mode))

  const proficiencies = { skill: [] as string[], save: [] as string[], weapon: new Set<string>(), armor: new Set<string>(), tool: new Set<string>(), language: new Set<string>() }
  for (const e of activeEffects('proficiency')) {
    const { category, value } = e.action
    if (category === 'skill' || category === 'save') continue
    proficiencies[category].add(value)
  }
  const abilities = {} as DerivedCharacter['abilities']
  const saves = {} as DerivedCharacter['saves']
  const checkModes: DerivedCharacter['checkModes'] = {}
  for (const a of ABILITY_IDS) {
    abilities[a] = { score: stat(`ability.${a}.score`), mod: stat(`ability.${a}.mod`), max: stat(`ability.${a}.max`) }
    const proficiency = proficiencyFromValue(stat(`save.${a}.proficiency`))
    const mode = modeFor(`save:${a}`)
    saves[a] = { bonus: stat(`save.${a}`), ...(proficiency ? { proficiency } : {}), ...(mode ? { mode } : {}) }
    const check = modeFor(`check:${a}`)
    if (check) checkModes[a] = check
  }

  const skills: DerivedCharacter['skills'] = {}
  for (const s of skillDefs) {
    const proficiency = proficiencyFromValue(stat(`skill.${s.id}.proficiency`))
    const mode = modeFor(`skill:${s.id}`)
    skills[s.id] = {
      name: s.name,
      ability: s.ability,
      bonus: stat(`skill.${s.id}`),
      passive: stat(`passive.${s.id}`),
      ...(proficiency ? { proficiency } : {}),
      ...(mode ? { mode } : {})
    }
  }

  const speedTypes = new Set<string>(['walk', ...Object.keys(species?.def.speed ?? {})])
  for (const target of modsByTarget.keys()) if (target.startsWith('speed.') && target.split('.').length === 2) speedTypes.add(target.split('.')[1])
  const speeds: Record<string, number> = {}
  for (const t of speedTypes) speeds[t] = stat(`speed.${t}`)

  const relations = { resistances: new Set(build.damageResistances ?? []), immunities: new Set(build.damageImmunities ?? []), vulnerabilities: new Set(build.damageVulnerabilities ?? []) }
  for (const e of activeEffects('damageRelation')) {
    const key = e.action.relation === 'resistance' ? 'resistances' : e.action.relation === 'immunity' ? 'immunities' : 'vulnerabilities'
    relations[key].add(e.action.damageType)
  }

  /** Where a granted resource/toggle/action came from, for display. */
  const originOf = (source: Source): { source: string; className?: string; detail?: string } => {
    const cls = source.classCtx ? classes[source.classCtx.index] : undefined
    return {
      source: source.name,
      ...(cls ? { className: cls.reg.def.name } : {}),
      ...(source.feature?.description ? { detail: source.feature.description } : {})
    }
  }

  // Resources
  const resources: DerivedResource[] = resourceGrants().map(({ resource, source }) => ({
    id: resource.id,
    name: resource.name,
    description: resource.description ?? '',
    max: stat(`resource.${resource.id}.max`),
    used: build.resourceUsed?.[resource.id] ?? 0,
    recharge: rechargeLabel(resource.recharge, (c) => conditionPasses(c, source)),
    display: resource.display ?? 'uses',
    ...(resource.actionType ? { actionType: resource.actionType } : {}),
    ...originOf(source)
  }))
  const costOf = (cost: { resourceId: string; amount?: Formula } | undefined, source: Source): { resourceId: string; amount: number } | undefined => {
    if (!cost) return undefined
    if (!resources.some((r) => r.id === cost.resourceId)) warn(`${source.name} costs "${cost.resourceId}", which this character doesn't have.`, source.key)
    return { resourceId: cost.resourceId, amount: num(cost.amount ?? '1', source) }
  }

  const toggles: DerivedToggle[] = []
  for (const e of activeEffects('grantToggle')) {
    const t = e.action.toggle
    if (toggles.some((x) => x.id === t.id)) continue
    toggles.push({
      id: t.id,
      name: t.name,
      description: t.description ?? '',
      ...(t.actionType ? { actionType: t.actionType } : {}),
      ...(t.cost ? { cost: costOf(t.cost, e.source) } : {}),
      active: toggleActive(t.id),
      ...originOf(e.source)
    })
  }

  const actions: DerivedAction[] = activeEffects('grantAction').map((e) => {
    const a: ActionDef = e.action.action
    return {
      id: a.id,
      name: a.name,
      description: a.description ?? '',
      actionType: a.actionType,
      ...(a.cost ? { cost: costOf(a.cost, e.source) } : {}),
      ...(a.attackBonus ? { attackBonus: num(a.attackBonus, e.source) } : {}),
      ...(a.saveDc ? { saveDc: num(a.saveDc, e.source) } : {}),
      ...(a.saveAbility ? { saveAbility: a.saveAbility } : {}),
      ...(a.damage ? { damage: formatDice(dice(a.damage, e.source)) } : {}),
      ...(a.damageType ? { damageType: a.damageType } : {}),
      ...(a.healing ? { healing: formatDice(dice(a.healing, e.source)) } : {}),
      ...(a.activatesToggle ? { activatesToggle: a.activatesToggle } : {}),
      ...originOf(e.source)
    }
  })

  // Attacks
  const attackModifiers = effects.filter((e) => e.action.kind === 'modify' && e.action.appliesTo && gatesPass(e.gates, e.source)) as Array<
    CollectedEffect & { action: Extract<EffectAction, { kind: 'modify' }> }
  >
  for (const m of attackModifiers) {
    if (m.action.target !== 'attack.bonus' && m.action.target !== 'attack.damage') {
      warn(`"${m.source.name}": appliesTo only works with the attack.bonus and attack.damage targets.`, m.source.key)
    }
  }
  const extraDamageEffects = activeEffects('extraDamage')
  const abilityOptionEffects = activeEffects('attackAbility')

  interface AttackSeed {
    id: string
    name: string
    kind: 'weapon' | 'unarmed' | 'granted'
    item?: ResolvedItem
    range: 'melee' | 'ranged'
    abilities: AbilityId[]
    damage: Formula
    damageType: string
    addAbilityToDamage: boolean
    proficient: boolean
    actionType: string
    source: Source
  }

  function attackMatches(seed: AttackSeed, filter: AttackFilter | undefined, ability: AbilityId | null): boolean {
    if (!filter) return true
    if (filter.range && filter.range !== seed.range) return false
    if (filter.kinds && !filter.kinds.includes(seed.kind)) return false
    if (filter.attackIds && !filter.attackIds.some((id) => sameId(id, seed.id))) return false
    if (filter.item && !(seed.item && itemMatches(seed.item, filter.item))) return false
    if (filter.abilities && ability !== null && !filter.abilities.includes(ability)) return false
    return true
  }

  function weaponProficient(def: ItemDef, fullItemId: string): boolean {
    const profs = [...proficiencies.weapon].map((p) => p.toLowerCase())
    if (profs.includes('all')) return true
    const category = def.weapon?.category.toLowerCase()
    return (category !== undefined && profs.includes(category)) || profs.some((p) => sameId(p, fullItemId))
  }

  const seeds: AttackSeed[] = [
    {
      id: 'unarmed-strike',
      name: 'Unarmed Strike',
      kind: 'unarmed',
      range: 'melee',
      abilities: ['str'],
      damage: '1',
      damageType: 'Bludgeoning',
      addAbilityToDamage: true,
      proficient: true,
      actionType: 'action',
      source: { key: 'core:unarmed-strike', name: 'Unarmed Strike', packId: 'core' }
    }
  ]
  for (const item of items) {
    const w = item.reg.def.weapon
    if (!item.equipped || !w) continue
    const props = w.properties.map((p) => p.toLowerCase())
    seeds.push({
      id: item.key,
      name: item.reg.def.name,
      kind: 'weapon',
      item,
      range: w.range,
      abilities: w.range === 'ranged' ? ['dex'] : props.includes('finesse') ? ['str', 'dex'] : ['str'],
      damage: w.damage,
      damageType: w.damageType,
      addAbilityToDamage: true,
      proficient: weaponProficient(item.reg.def, item.reg.fullId),
      actionType: 'action',
      source: { key: `item:${item.key}`, name: item.reg.def.name, packId: item.reg.packId }
    })
  }
  for (const e of activeEffects('grantAttack')) {
    const a: AttackDef = e.action.attack
    const seed: AttackSeed = {
      id: a.id,
      name: a.name,
      kind: a.replaces === 'unarmed-strike' ? 'unarmed' : 'granted',
      range: a.range,
      abilities: a.abilities,
      damage: a.damage,
      damageType: a.damageType,
      addAbilityToDamage: a.addAbilityToDamage ?? true,
      proficient: a.proficient ?? true,
      actionType: a.actionType ?? 'action',
      source: e.source
    }
    const replaced = a.replaces ? seeds.findIndex((s) => s.id === a.replaces) : -1
    if (a.replaces && replaced === -1) warn(`${a.name} replaces "${a.replaces}", which this character doesn't have.`, e.source.key)
    if (replaced >= 0) seeds[replaced] = seed
    else seeds.push(seed)
  }

  const globalAttackMode = rollModeEffects.filter((e) => e.action.target === 'attack' && !e.action.appliesTo).map((e) => e.action.mode)
  const attacks: DerivedAttack[] = seeds.map((seed) => {
    const options = [...seed.abilities]
    for (const e of abilityOptionEffects) {
      if (attackMatches(seed, e.action.appliesTo, null) && !options.includes(e.action.ability)) options.push(e.action.ability)
    }
    // Best modifier wins; ties keep the earlier (default) ability.
    const ability = options.reduce((best, a) => (stat(`ability.${a}.mod`) > stat(`ability.${best}.mod`) ? a : best), options[0])
    const mod = stat(`ability.${ability}.mod`)
    let bonus = mod + (seed.proficient ? stat('prof') : 0)
    let damage = dice(seed.damage, seed.source)
    if (seed.addAbilityToDamage) damage = { ...damage, flat: damage.flat + mod }
    for (const m of attackModifiers) {
      if (!attackMatches(seed, m.action.appliesTo, ability)) continue
      if (m.action.target === 'attack.bonus') bonus += num(m.action.value, m.source)
      if (m.action.target === 'attack.damage') {
        const extra = dice(m.action.value, m.source)
        damage = { dice: [...damage.dice, ...extra.dice], flat: damage.flat + extra.flat }
      }
    }
    const extraDamage = extraDamageEffects
      .filter((e) => attackMatches(seed, e.action.appliesTo, ability))
      .map((e) => ({ value: dice(e.action.damage, e.source), damageType: e.action.damageType, source: e.source.name }))
    // Untyped extra damage is the same type as the attack, so it folds into the main roll (Rage's bonus).
    for (const x of extraDamage) if (!x.damageType) damage = { dice: [...damage.dice, ...x.value.dice], flat: damage.flat + x.value.flat }
    const mode = combineModes([
      ...globalAttackMode,
      ...rollModeEffects.filter((e) => e.action.target === 'attack' && e.action.appliesTo && attackMatches(seed, e.action.appliesTo, ability)).map((e) => e.action.mode)
    ])
    const merged = evaluateDice(formatDice(damage), () => 0)
    return {
      id: seed.id,
      name: seed.name,
      kind: seed.kind,
      ...(seed.item ? { itemKey: seed.item.key } : {}),
      range: seed.range,
      ability,
      proficient: seed.proficient,
      attackBonus: bonus,
      damage: formatDice(merged),
      damageDice: merged,
      damageType: seed.damageType,
      extraDamage: extraDamage.filter((x) => x.damageType).map((x) => ({ damage: formatDice(x.value), damageType: x.damageType, source: x.source })),
      ...(mode ? { mode } : {}),
      actionType: seed.actionType
    }
  })

  // Spellcasting
  const configs = spellcastingConfigs()
  const spellSources: DerivedSpellcastingSource[] = configs.map(({ config, cls }) => {
    const base = stat('prof') + stat(`ability.${config.ability}.mod`)
    return {
      classId: cls.reg.fullId,
      className: cls.reg.def.name,
      ability: config.ability,
      dc: 8 + base,
      attackBonus: base,
      list: config.list ?? cls.reg.def.id,
      ritualCasting: config.ritualCasting ?? false,
      spellbook: config.spellbook ?? false
    }
  })
  const slots: Record<string, Record<number, number>> = {}
  for (const { config } of configs) {
    if (!config.slots) continue
    const pool = config.slots.pool ?? 'standard'
    if (slots[pool]) continue
    const levels: Record<number, number> = {}
    for (let lvl = 1; lvl <= 9; lvl++) {
      const n = statOrNull(`slots.${pool}.${lvl}`) ?? 0
      if (n > 0) levels[lvl] = n
    }
    slots[pool] = levels
  }
  const granted = activeEffects('grantSpells').flatMap((e) =>
    e.action.spellIds.flatMap((id) => {
      const spell = registry.get('spells', id, e.source.packId)
      if (!spell) {
        warn(`${e.source.name} grants spell "${id}", which isn't in any enabled pack.`, e.source.key)
        return []
      }
      return [
        {
          spellId: spell.fullId,
          name: spell.def.name,
          alwaysPrepared: e.action.alwaysPrepared ?? true,
          free: e.action.free ?? true,
          ...(e.action.ability ? { ability: e.action.ability } : {}),
          source: e.source.name
        }
      ]
    })
  )

  // Choices
  const choices: DerivedChoice[] = []
  for (const inst of choiceInstances) {
    if (!gatesPass(inst.gates, inst.source)) continue
    const { choice, source, key } = inst
    const count = num(choice.count ?? '1', source)
    const picks = build.choices?.[key] ?? []
    const options = choiceOptions(choice, source)
    const freeform = choice.from.kind === 'freeform'
    if (picks.length > count) warn(`${choice.label}: ${picks.length} picked but only ${count} allowed.`, key)
    if (!freeform) {
      const counts = new Map<string, number>()
      for (const p of picks) {
        counts.set(p, (counts.get(p) ?? 0) + 1)
        const option = options.find((o) => sameId(o.id, p))
        if (!option) warn(`${choice.label}: "${p}" isn't one of the options.`, key)
        else if (!option.available) warn(`${choice.label}: "${option.name}" doesn't meet its prerequisite.`, key)
      }
      for (const [p, n] of counts) {
        if (n > 1 && !choice.allowRepeats) warn(`${choice.label}: "${p}" is picked more than once.`, key)
        else if (choice.maxRepeats !== undefined && n > choice.maxRepeats) warn(`${choice.label}: "${p}" is picked more than ${choice.maxRepeats} times.`, key)
      }
    }
    choices.push({
      key,
      label: choice.label,
      source: source.name,
      count,
      picks,
      remaining: Math.max(0, count - picks.length),
      allowRepeats: !!choice.allowRepeats,
      freeform,
      options,
      sourceKey: source.key,
      ...(source.key.includes('#') ? { parentKey: source.key.slice(0, source.key.lastIndexOf('/')) } : {}),
      ...(source.level !== undefined ? { level: source.level } : {}),
      ...(source.classCtx ? { classId: classes[source.classCtx.index].reg.fullId, className: classes[source.classCtx.index].reg.def.name } : {})
    })
  }

  function choiceOptions(choice: ChoiceDef, source: Source): DerivedChoiceOption[] {
    const from = choice.from
    const available = (cond: Condition | undefined): boolean => !cond || conditionPasses(cond, source)
    switch (from.kind) {
      case 'optionList': {
        const list = registry.get('optionLists', from.listId, source.packId)
        if (!list) {
          warn(`${choice.label}: option list "${from.listId}" isn't in any enabled pack.`, source.key)
          return []
        }
        return list.def.options.map((o: OptionDef) => ({ id: o.id, name: o.name, description: o.description, available: available(o.prerequisite) }))
      }
      case 'feats': {
        const categories = from.categories?.map((c) => c.toLowerCase())
        return registry
          .all('feats')
          .filter((f) => (!categories || categories.includes(f.def.category.toLowerCase())) && (!from.featIds || from.featIds.some((id) => sameId(id, f.fullId))))
          .map((f) => ({ id: f.fullId, name: f.def.name, description: f.def.description, available: available((f.def as FeatDef).prerequisite) }))
      }
      case 'spells': {
        const maxLevel = from.maxLevel !== undefined ? num(from.maxLevel, source) : Infinity
        return registry
          .all('spells')
          .filter(
            (s) =>
              (!from.lists || from.lists.some((l) => s.def.lists.includes(l))) &&
              (!from.spellIds || from.spellIds.some((id) => sameId(id, s.fullId))) &&
              s.def.level >= (from.minLevel ?? 0) &&
              s.def.level <= maxLevel
          )
          .map((s) => ({ id: s.fullId, name: s.def.name, description: s.def.description, available: true }))
      }
      case 'abilities':
        return (from.abilities ?? ABILITY_IDS).map((a) => ({ id: a, name: registry.terminology[`ability.${a}`] ?? a.toUpperCase(), description: '', available: true }))
      case 'skills':
        return skillDefs
          .filter((s) => !from.skillIds || from.skillIds.includes(s.id))
          .map((s) => ({ id: s.id, name: s.name, description: '', available: true }))
      case 'freeform':
        return []
    }
  }

  const notes = activeEffects('note').map((e) => ({ source: e.source.name, text: e.action.text }))
  const stats: DerivedCharacter['stats'] = {}
  for (const s of customStats) stats[s.id] = { name: s.name, value: stat(`stat.${s.id}`), display: s.display }

  const initiativeMode = modeFor('initiative')
  const attackMode = combineModes(globalAttackMode)

  return {
    level: rawLevel,
    proficiencyBonus: stat('prof'),
    abilities,
    saves,
    skills,
    checkModes,
    initiative: stat('initiative'),
    ...(initiativeMode ? { initiativeMode } : {}),
    ...(attackMode ? { attackMode } : {}),
    armorClass: stat('ac'),
    speeds,
    maxHp: stat('hp.max'),
    hitDice: classes.map((c) => ({ classId: c.reg.fullId, className: c.reg.def.name, die: c.reg.def.hitDie, count: c.level })),
    carryingCapacity: stat('carry.capacity'),
    damageRelations: {
      resistances: [...relations.resistances].sort(),
      immunities: [...relations.immunities].sort(),
      vulnerabilities: [...relations.vulnerabilities].sort()
    },
    conditionImmunities: [...new Set(activeEffects('conditionImmunity').map((e) => e.action.conditionId))],
    proficiencies: {
      weapon: [...proficiencies.weapon],
      armor: [...proficiencies.armor],
      tool: [...proficiencies.tool],
      language: [...proficiencies.language]
    },
    spellcasting: {
      sources: spellSources,
      dc: statOrNull('spell.dc'),
      attackBonus: statOrNull('spell.attack'),
      slots,
      preparedLimit: statOrNull('spells.preparedLimit'),
      knownLimit: statOrNull('spells.knownLimit'),
      cantripsLimit: statOrNull('spells.cantripsLimit'),
      granted
    },
    resources,
    toggles,
    actions,
    attacks,
    features: features.filter((f) => gatesPass(f.gates, f.source)).map((f) => f.feature),
    notes,
    choices,
    stats,
    diagnostics
  }
}
