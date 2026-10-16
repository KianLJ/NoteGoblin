// Dual-write for the generic choices UI (docs/homebrew-engine.md, phase 4b).
//
// A pick made in the new UI is stored natively in sheet.choices. While
// older app versions are still around, SRD picks are also mirrored into the
// legacy fields they read (asiSlotChoices, subclassFeatureChoices,
// raceLineageChoice, plus the free spells the old choosers wrote into
// `spells`), in exactly the shapes the old choosers wrote. This is the
// inverse of the adapter in legacy.ts, and the round-trip test
// (tests/content/legacyMirror.test.ts) holds the two together.
//
// Each edit rebuilds one legacy "group" from the effective picks after the
// edit: an ASI/feat slot, a subclass option, all Metamagic or Invocation
// records, all records of one spell-pick feature, the level-0 origin slots,
// or the lineage. Records for class levels the character no longer has are
// left alone (the legacy sheet keeps them so levelling back up restores
// them). Homebrew choices, and SRD choices with no legacy shape (Skillful),
// are native-only.
//
// Delete this module (and the legacy fields) once older clients are gone.

import { getSpellById } from '../compendium'
import { type Ability, type AsiSlotChoice, type CharacterSheetData, type Spell, type SubclassFeatureChoice } from '../dnd5e'
import type { DerivedCharacter, DerivedChoice } from './engine'
import { SRD_PACK_ID } from './srd'
import { CLASS_CHOICE_IDS } from './srd/classes'
import { FEAT_CHOICE_IDS } from './srd/feats'
import { LINEAGE_CHOICE_IDS } from './srd/origins'

const lower = (s: string): string => s.trim().toLowerCase()
const local = (id: string): string => (id.includes(':') ? id.slice(id.indexOf(':') + 1) : id)
const choiceIdOf = (key: string): string => key.slice(key.lastIndexOf('#') + 1)
const isSrd = (id: string | undefined): boolean => !!id && id.startsWith(`${SRD_PACK_ID}:`)

/** The `${pick}` / `${pick}@n` segment of a key directly under `choiceKey`, or undefined if it isn't directly under it. */
function pickSegment(choiceKey: string, key: string): string | undefined {
  if (!key.startsWith(`${choiceKey}/`)) return undefined
  const rest = key.slice(choiceKey.length + 1)
  const end = rest.search(/[#/]/)
  return end === -1 ? rest : rest.slice(0, end)
}

/** Whether `segment` ("feat" or "feat@1") still exists among `picks`. */
function segmentSurvives(segment: string, picks: string[]): boolean {
  const at = segment.lastIndexOf('@')
  const [pick, n] = at > 0 && /^\d+$/.test(segment.slice(at + 1)) ? [segment.slice(0, at), Number(segment.slice(at + 1))] : [segment, 0]
  return picks.filter((p) => p === pick).length > n
}

interface Effective {
  /** Picks for a choice key after the edit. */
  picks(key: string): string[]
  /** The derived choice for a key (as of before the edit). */
  choice(key: string): DerivedChoice | undefined
  /** Choices directly under one pick of `choiceKey` (an ASI feat's ability scores…). */
  nested(choiceKey: string, pick: string): DerivedChoice[]
}

function effective(derived: DerivedCharacter, editKey: string, editPicks: string[]): Effective {
  const byKey = new Map(derived.choices.map((c) => [c.key, c]))
  const removed = (key: string): boolean => {
    // A key under a pick that the edit removed has no picks any more.
    const segment = pickSegment(editKey, key)
    return segment !== undefined && !segmentSurvives(segment, editPicks)
  }
  return {
    picks: (key) => (key === editKey ? editPicks : removed(key) ? [] : (byKey.get(key)?.picks ?? [])),
    choice: (key) => byKey.get(key),
    // Only the first pick of an option has nested choices that the legacy records can hold.
    nested: (choiceKey, pick) => derived.choices.filter((c) => c.sourceKey === `${choiceKey}/${pick}`)
  }
}

/** The sheet's display name for a class id (what legacy records are keyed by). */
function sheetClassName(sheet: CharacterSheetData, classId: string | undefined, fallback: string | undefined): string {
  return sheet.classes.find((c) => c.classId === classId)?.className ?? fallback ?? ''
}

function classLevelOf(sheet: CharacterSheetData, className: string): number {
  return sheet.classes.find((c) => lower(c.className) === lower(className))?.level ?? 0
}

function freeSpell(spellId: string): Spell | undefined {
  const s = getSpellById(local(spellId))
  return s ? { id: crypto.randomUUID(), name: s.name, level: s.level, description: '', actionType: 'action', compendiumId: s.id, free: true } : undefined
}

/** Adds free spells for ids that aren't on the sheet yet, and removes free ones (by compendium id) in `drop`. */
function withSpells(spells: Spell[], add: string[], drop: string[]): Spell[] {
  const addLocal = add.map(local)
  const dropLocal = new Set(drop.map(local).filter((id) => !addLocal.includes(id)))
  const kept = spells.filter((s) => !(s.free && s.compendiumId && dropLocal.has(s.compendiumId)))
  const known = new Set(kept.map((s) => s.compendiumId).filter(Boolean))
  return [...kept, ...addLocal.filter((id) => !known.has(id)).map(freeSpell).filter((s): s is Spell => !!s)]
}

/** A feat slot record (ASI, Fighting Style, Epic Boon, origin feat) from a feat choice's effective picks, or null if it isn't complete. */
function featSlotRecord(eff: Effective, choiceKey: string, className: string, level: number, existing?: AsiSlotChoice): AsiSlotChoice | null {
  const [featId] = eff.picks(choiceKey)
  if (!featId) return null
  const nested = eff.nested(choiceKey, featId)
  const picksOf = (id: string): string[] => {
    const c = nested.find((n) => choiceIdOf(n.key) === id)
    return c ? eff.picks(c.key) : []
  }
  const base = { id: existing?.id ?? crypto.randomUUID(), className, level }
  if (local(featId) === 'ability-score-improvement') {
    const scores = picksOf(FEAT_CHOICE_IDS.scores)
    if (scores.length < 2) return null
    const abilityIncreases: Partial<Record<Ability, number>> = {}
    for (const a of scores) abilityIncreases[a as Ability] = (abilityIncreases[a as Ability] ?? 0) + 1
    return { ...base, kind: 'ability', abilityIncreases }
  }
  const record: AsiSlotChoice = { ...base, kind: 'feat', featId: local(featId) }
  const chosenAbility = picksOf(FEAT_CHOICE_IDS.ability)[0] ?? picksOf(FEAT_CHOICE_IDS.spellAbility)[0]
  if (chosenAbility) record.chosenAbility = chosenAbility as Ability
  const spellIds = [...picksOf(FEAT_CHOICE_IDS.cantrips), ...picksOf(FEAT_CHOICE_IDS.spells)].map(local)
  if (spellIds.length) record.chosenSpellIds = spellIds
  // A feat with its own picks only counts once they're all made, as the old chooser required.
  if (nested.some((n) => eff.picks(n.key).length < n.count)) return null
  return record
}

/**
 * The patch for setting `picks` on `choice`: the native picks (and dropping
 * picks nested under anything removed), plus the legacy mirror for SRD
 * choices. `derived` is the sheet's current derivation.
 */
export function choicePatch(sheet: CharacterSheetData, derived: DerivedCharacter, choice: DerivedChoice, picks: string[]): Partial<CharacterSheetData> {
  const choices = { ...(sheet.choices ?? {}), [choice.key]: picks }
  for (const key of Object.keys(choices)) {
    const segment = pickSegment(choice.key, key)
    if (segment !== undefined && !segmentSurvives(segment, picks)) delete choices[key]
  }
  return { choices, ...legacyMirror(sheet, derived, choice, picks) }
}

function topChoice(derived: DerivedCharacter, choice: DerivedChoice): DerivedChoice {
  let c = choice
  for (let i = 0; i < 10 && c.parentKey; i++) {
    const parent = derived.choices.find((x) => x.key === c.parentKey)
    if (!parent) break
    c = parent
  }
  return c
}

function legacyMirror(sheet: CharacterSheetData, derived: DerivedCharacter, choice: DerivedChoice, picks: string[]): Partial<CharacterSheetData> {
  const eff = effective(derived, choice.key, picks)
  const top = topChoice(derived, choice)
  const topId = choiceIdOf(top.key)
  const kind = top.sourceKey.split(':')[0]

  // --- species / background (level-0 slots and the lineage)
  if (kind === 'species' || kind === 'background') {
    if (!isSrd(top.sourceKey.slice(kind.length + 1))) return {}
    if (kind === 'species' && (topId === LINEAGE_CHOICE_IDS.lineage || topId === LINEAGE_CHOICE_IDS.spellAbility)) return lineageMirror(sheet, derived, eff)
    // Only the ability increases and origin feats have level-0 slot records; anything else (Skillful) is native-only.
    return isOriginSlotChoice(top) ? originSlotsMirror(sheet, derived, eff) : {}
  }
  if ((kind !== 'class' && kind !== 'subclass') || !isSrd(top.classId)) return {}

  const className = sheetClassName(sheet, top.classId, top.className)
  const level = top.level ?? 0
  const classLevel = classLevelOf(sheet, className)
  const sameClass = (r: { className: string }): boolean => lower(r.className) === lower(className)
  const active = (r: { level: number }): boolean => r.level <= classLevel

  // ASI / Epic Boon / Fighting Style / Additional Fighting Style: one slot record per (class, level).
  if (topId === CLASS_CHOICE_IDS.feat) {
    const existing = sheet.asiSlotChoices.find((r) => sameClass(r) && r.level === level)
    const record = featSlotRecord(eff, top.key, className, level, existing)
    const asiSlotChoices = sheet.asiSlotChoices.filter((r) => !(sameClass(r) && r.level === level))
    if (record) asiSlotChoices.push(record)
    return { asiSlotChoices, ...spellsForSlot(sheet, existing, record) }
  }

  const featureName = top.label
  /** Replaces the active records for this feature (only those at `atLevel`, when given) with one per entry. */
  const records = (name: string, entries: Array<{ level: number; chosenName: string }>, atLevel?: number): Partial<CharacterSheetData> => {
    const inGroup = (r: SubclassFeatureChoice): boolean => sameClass(r) && r.featureName === name && active(r) && (atLevel === undefined || r.level === atLevel)
    const kept = sheet.subclassFeatureChoices.filter((r) => !inGroup(r))
    const reuse = sheet.subclassFeatureChoices.filter((r) => sameClass(r) && r.featureName === name)
    const next: SubclassFeatureChoice[] = entries.map((e) => ({
      id: reuse.find((r) => r.chosenName === e.chosenName)?.id ?? crypto.randomUUID(),
      className,
      level: e.level,
      featureName: name,
      chosenName: e.chosenName
    }))
    return { subclassFeatureChoices: [...kept, ...next] }
  }
  const optionName = (id: string): string => top.options.find((o) => o.id === id || local(o.id) === local(id))?.name ?? id
  const topPicks = eff.picks(top.key)

  // A subclass feature written as mutually exclusive options ("Dragon Ancestor: Black - Acid Damage").
  if (topId === CLASS_CHOICE_IDS.option) {
    const kept = sheet.subclassFeatureChoices.filter((r) => !(sameClass(r) && r.featureName === featureName && r.level === level))
    const existing = sheet.subclassFeatureChoices.find((r) => sameClass(r) && r.featureName === featureName && r.level === level)
    const next = topPicks.slice(0, 1).map((p) => ({ id: existing?.id ?? crypto.randomUUID(), className, level, featureName, chosenName: `${featureName}: ${optionName(p)}` }))
    return { subclassFeatureChoices: [...kept, ...next] }
  }

  // Metamagic / Eldritch Invocations: one record per pick. Metamagic is one choice per level that grants picks
  // (2nd, 10th, 17th), and the old chooser stored each pick at the level it unlocked; an invocation is stored at
  // the class level it was taken at.
  if (topId === CLASS_CHOICE_IDS.options) {
    if (featureName === 'Metamagic') return records('Metamagic', topPicks.map((p) => ({ level, chosenName: optionName(p) })), level)
    if (featureName === 'Eldritch Invocation') {
      const existing = sheet.subclassFeatureChoices.filter((r) => sameClass(r) && r.featureName === featureName)
      return records(featureName, topPicks.map((p) => ({ level: existing.find((r) => r.chosenName === optionName(p))?.level ?? classLevel, chosenName: optionName(p) })))
    }
    return {}
  }

  // Spell picks: Magical Secrets (also written to the spell list as free spells), Mystic Arcanum, Spell Mastery, Signature Spells.
  if (topId === CLASS_CHOICE_IDS.spells) {
    const spellName = (id: string): string => getSpellById(local(id))?.name ?? optionName(id)
    const patch = records(featureName, topPicks.map((p) => ({ level, chosenName: spellName(p) })))
    if (featureName === 'Magical Secrets') {
      const before = derived.choices.find((c) => c.key === top.key)?.picks ?? []
      patch.spells = withSpells(sheet.spells, topPicks, before)
    }
    return patch
  }
  return {}
}

/** Magic Initiate-style feats write their spells into the spell list (and set a spellcasting ability if the sheet had none), as buildAsiSlotResolutionPatch did. */
function spellsForSlot(sheet: CharacterSheetData, before: AsiSlotChoice | undefined, after: AsiSlotChoice | null): Partial<CharacterSheetData> {
  const add = after?.chosenSpellIds ?? []
  const drop = before?.chosenSpellIds ?? []
  if (!add.length && !drop.length) return {}
  const patch: Partial<CharacterSheetData> = { spells: withSpells(sheet.spells, add, drop) }
  if (!sheet.spellcastingAbility && after?.chosenAbility && add.length) patch.spellcastingAbility = after.chosenAbility
  return patch
}

const ABILITY_IDS = ['str', 'dex', 'con', 'int', 'wis', 'cha']

function isAbilityChoice(c: DerivedChoice): boolean {
  return c.options.length > 0 && c.options.every((o) => ABILITY_IDS.includes(o.id))
}

/** A background's ability-increase choice or an origin feat choice (background feat, Human's Versatile). */
function isOriginSlotChoice(c: DerivedChoice): boolean {
  return isAbilityChoice(c) || c.options.some((o) => o.id.includes(':') && o.id.startsWith(`${SRD_PACK_ID}:`) && choiceIdOf(c.key) !== 'skill')
}

/** Level-0 slots: the background's ability increases, the background's feat, and Human's Versatile feat — rebuilt together, in the order the adapter reads them back. */
function originSlotsMirror(sheet: CharacterSheetData, derived: DerivedCharacter, eff: Effective): Partial<CharacterSheetData> {
  const origin = derived.choices.filter((c) => !c.parentKey && /^(background|species):/.test(c.sourceKey))
  const before = sheet.asiSlotChoices.filter((r) => r.level === 0)
  const rebuilt: AsiSlotChoice[] = []
  for (const c of [...origin.filter((x) => x.sourceKey.startsWith('background:')), ...origin.filter((x) => x.sourceKey.startsWith('species:'))]) {
    if (isAbilityChoice(c)) {
      const picks = eff.picks(c.key)
      if (!picks.length) continue
      const abilityIncreases: Partial<Record<Ability, number>> = {}
      for (const a of picks) abilityIncreases[a as Ability] = (abilityIncreases[a as Ability] ?? 0) + 1
      const existing = before.find((r) => r.kind === 'ability')
      rebuilt.push({ id: existing?.id ?? crypto.randomUUID(), className: existing?.className ?? '', level: 0, kind: 'ability', abilityIncreases })
      continue
    }
    if (!isOriginSlotChoice(c)) continue
    const [featId] = eff.picks(c.key)
    const existing = before.find((r) => r.kind === 'feat' && r.featId === (featId ? local(featId) : undefined))
    const record = featSlotRecord(eff, c.key, existing?.className ?? '', 0, existing)
    if (record) rebuilt.push(record)
  }
  const oldSpells = before.flatMap((r) => r.chosenSpellIds ?? [])
  const newSpells = rebuilt.flatMap((r) => r.chosenSpellIds ?? [])
  const patch: Partial<CharacterSheetData> = { asiSlotChoices: [...sheet.asiSlotChoices.filter((r) => r.level !== 0), ...rebuilt] }
  if (oldSpells.length || newSpells.length) {
    patch.spells = withSpells(sheet.spells, newSpells, oldSpells)
    const ability = rebuilt.find((r) => r.chosenSpellIds?.length)?.chosenAbility
    if (!sheet.spellcastingAbility && ability && newSpells.length) patch.spellcastingAbility = ability
  }
  return patch
}

function lineageMirror(sheet: CharacterSheetData, derived: DerivedCharacter, eff: Effective): Partial<CharacterSheetData> {
  const lineageChoice = derived.choices.find((c) => c.sourceKey.startsWith('species:') && choiceIdOf(c.key) === LINEAGE_CHOICE_IDS.lineage)
  const abilityChoice = derived.choices.find((c) => c.sourceKey.startsWith('species:') && choiceIdOf(c.key) === LINEAGE_CHOICE_IDS.spellAbility)
  const [lineage] = lineageChoice ? eff.picks(lineageChoice.key) : []
  const [ability] = abilityChoice ? eff.picks(abilityChoice.key) : []
  const raceId = sheet.speciesId ? local(sheet.speciesId) : undefined
  if (!lineage || !ability || !raceId) return { raceLineageChoice: null }
  const lineageName = lineageChoice!.options.find((o) => o.id === lineage)?.name ?? lineage
  return { raceLineageChoice: { raceId, lineageName, spellcastingAbility: ability as Ability } }
}
