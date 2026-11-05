import { useMemo, useState, useSyncExternalStore } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import type { ContentPack } from '@shared/content/schema'
import { deriveSheet, getActivePacksKey, getPackPool, normalizeForActivePacks, packsWithDependencies, sheetSpellFromPack, subscribeActivePacks } from '@shared/content/sheet'
import { buildPickerContent, type PickerContent } from '@shared/content/pickerContent'
import { packKey } from '@shared/content/packKey'
import { registryForPacks } from '@shared/content/migrate'
import { SRD_PACK_ID, srdPack } from '@shared/content/srd'
import { choicePatch } from '@shared/content/legacyMirror'
import type { DerivedCharacter, DerivedChoice } from '@shared/content/engine'
import {
  ABILITIES,
  STANDARD_ARRAY,
  emptyCharacterSheet,
  lineageOptionsForRace,
  type Ability,
  type AbilityScores,
  type Appearance,
  type AsiSlotChoice,
  type CharacterSheetData,
  type SkillName
} from '@shared/dnd5e'
import { FEATS, SPELLS, startingEquipmentFor, type CompendiumSpell, type FeatEffect } from '@shared/compendium'
import { usePickerContent } from '../../content/pickerContent'

/** The 2024 order: class, then origin (background, then species), ability scores, spells (for a spellcaster), alignment and details, and a last look. */
export const STEPS = ['class', 'background', 'species', 'abilities', 'spells', 'details', 'review'] as const
export type StepId = (typeof STEPS)[number]

/** A spell the creator offers: an SRD one (its compendium id) or a pack's ("pack:<full id>"). */
export interface SpellOption {
  id: string
  name: string
  level: number
  school: string
  castingTime: string
  range: string
  duration: string
  concentration: boolean
  ritual: boolean
  description: string
}

/** How the six base scores are made. Standard array and rolled scores are a pool you deal out; point buy and manual set each one. */
export type AbilityMethod = 'standard' | 'pointBuy' | 'roll' | 'manual'

export const POINT_BUY_BUDGET = 27
/** What a score costs under point buy, 8 to 15. */
export const POINT_BUY_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 }

const ABILITY_IDS = ABILITIES.map((a) => a.id)
const noScores = (): Record<Ability, number | null> => ({ str: null, dex: null, con: null, int: null, wis: null, cha: null })
const flat = (n: number): AbilityScores => ({ str: n, dex: n, con: n, int: n, wis: n, cha: n })

export function roll4d6DropLowest(): number {
  const dice = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1).sort((a, b) => a - b)
  return dice[1] + dice[2] + dice[3]
}

/** Whether a background's ability increases are a legal spread: +2 and +1, or +1 to three. */
export function validBonusSpread(bonus: Partial<Record<Ability, number>>): boolean {
  const vals = Object.values(bonus)
    .filter((v): v is number => !!v)
    .sort()
  return vals.join(',') === '1,1,1' || vals.join(',') === '1,2'
}

const PACKS_KEY = 'gb-creator-packs'

/** The packs the last character was made with, to start the next one from. */
function rememberedPackIds(): string[] {
  try {
    const raw = localStorage.getItem(PACKS_KEY)
    const ids = raw ? (JSON.parse(raw) as unknown) : null
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function rememberPackIds(ids: string[]): void {
  try {
    localStorage.setItem(PACKS_KEY, JSON.stringify(ids))
  } catch {
    /* only a convenience */
  }
}

/** Where the creator starts: blank (on the remembered or campaign packs), or filled in from a character being edited. */
interface Seed {
  packIds: string[]
  classId: string | null
  chosenSkills: SkillName[]
  classChoices: Record<string, string[]>
  backgroundId: string | null
  bonus: Partial<Record<Ability, number>>
  bonusMode: 'split' | 'even'
  featSpellAbility: Ability
  featCantrips: string[]
  featLeveledSpellId: string
  raceId: string | null
  humanSkill: SkillName | null
  humanFeatChoice: Omit<AsiSlotChoice, 'id'> | null
  lineageName: string | null
  lineageAbility: Ability
  speciesChoices: Record<string, string[]>
  manualScores: AbilityScores | null
  chosenSpells: string[]
  /** The skills the class, background and Skillful picks gave (an edit swaps exactly these). */
  explainedSkills: SkillName[]
  name: string
  alignment: string
  appearance: Appearance
  backstory: string
  portrait: string | null
  personality: { personalityTraits: string; ideals: string; bonds: string; flaws: string }
}

function seedFor(initial: CharacterSheet | null | undefined, campaignPackIds: string[] | null | undefined): Seed {
  const blank: Seed = {
    packIds: campaignPackIds ?? rememberedPackIds(),
    classId: null,
    chosenSkills: [],
    classChoices: {},
    backgroundId: null,
    bonus: {},
    bonusMode: 'even',
    featSpellAbility: 'wis',
    featCantrips: [],
    featLeveledSpellId: '',
    raceId: null,
    humanSkill: null,
    humanFeatChoice: null,
    lineageName: null,
    lineageAbility: 'wis',
    speciesChoices: {},
    manualScores: null,
    chosenSpells: [],
    explainedSkills: [],
    name: '',
    alignment: '',
    appearance: { age: '', height: '', weight: '', eyes: '', skin: '', hair: '' },
    backstory: '',
    portrait: null,
    personality: { personalityTraits: '', ideals: '', bonds: '', flaws: '' }
  }
  if (!initial) return blank
  const packIds = initial.packIds ?? []
  const picker = buildPickerContent(packsWithDependencies(packIds, getPackPool()).packs)
  const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()
  const cls = picker.classes.find((c) => same(c.name, initial.classes[0]?.className ?? '')) ?? null
  const background = picker.backgrounds.find((b) => same(b.name, initial.background)) ?? null
  const race = picker.races.find((r) => same(r.name, initial.race)) ?? null
  const proficient = Object.entries(initial.skillProficiencies).filter(([, v]) => !!v).map(([k]) => k as SkillName)
  const fromBackground = background?.skillProficiencies ?? []
  const chosenSkills = cls ? cls.skillChoice.from.filter((sk) => proficient.includes(sk) && !fromBackground.includes(sk)).slice(0, cls.skillChoice.choose) : []
  const level0 = initial.asiSlotChoices.filter((c) => c.level === 0)
  const increases = level0.find((c) => c.kind === 'ability')?.abilityIncreases ?? {}
  const backgroundFeat = level0.find((c) => c.kind === 'feat' && !!background && c.featId === background.featId)
  const otherFeat = level0.find((c) => c.kind === 'feat' && c !== backgroundFeat)
  const choices = initial.choices ?? {}
  const strip = ({ id: _id, ...rest }: AsiSlotChoice): Omit<AsiSlotChoice, 'id'> => rest
  const humanSkill = race?.id === 'human' ? (proficient.find((sk) => !chosenSkills.includes(sk) && !fromBackground.includes(sk)) ?? null) : null
  return {
    ...blank,
    packIds,
    classId: cls?.id ?? null,
    chosenSkills,
    classChoices: Object.fromEntries(Object.entries(choices).filter(([k]) => !k.startsWith('species:'))),
    backgroundId: background?.id ?? null,
    bonus: increases,
    bonusMode: Object.values(increases).includes(2) ? 'split' : 'even',
    featSpellAbility: backgroundFeat?.chosenAbility ?? 'wis',
    featCantrips: (backgroundFeat?.chosenSpellIds ?? []).filter((id) => SPELLS.find((x) => x.id === id)?.level === 0),
    featLeveledSpellId: (backgroundFeat?.chosenSpellIds ?? []).find((id) => (SPELLS.find((x) => x.id === id)?.level ?? 0) > 0) ?? '',
    raceId: race?.id ?? null,
    // A Human's Skillful skill: the proficiency neither the class nor the background explains.
    humanSkill,
    explainedSkills: [...chosenSkills, ...fromBackground.filter((sk) => proficient.includes(sk)), ...(humanSkill ? [humanSkill] : [])],
    humanFeatChoice: otherFeat ? strip(otherFeat) : null,
    lineageName: initial.raceLineageChoice?.lineageName ?? null,
    lineageAbility: initial.raceLineageChoice?.spellcastingAbility ?? 'wis',
    speciesChoices: Object.fromEntries(Object.entries(choices).filter(([k]) => k.startsWith('species:'))),
    manualScores: initial.abilityScores,
    chosenSpells: initial.spells.filter((sp) => !sp.free && sp.level <= 1).map((sp) => (sp.packSpellId ? `pack:${sp.packSpellId}` : (sp.compendiumId ?? ''))).filter(Boolean),
    name: initial.name,
    alignment: initial.alignment,
    appearance: initial.appearance,
    backstory: initial.backstory,
    portrait: initial.portraitDataUrl,
    personality: { personalityTraits: initial.personalityTraits, ideals: initial.ideals, bonds: initial.bonds, flaws: initial.flaws }
  }
}

/**
 * Everything the character creator knows: the picks so far, what they add up
 * to (the finished sheet, run through the rules engine, for the live card),
 * and whether each step is done. Ported from the old modal wizard, so a
 * character is built exactly the same way: the background's increases and
 * origin feat as level-0 ASI picks, a lineage from its pick, and the
 * engine's own level-1 choices through choicePatch.
 */
export function useCreator({ initial, campaignPackIds }: { initial?: CharacterSheet | null; campaignPackIds?: string[] | null } = {}) {
  const [seed] = useState(() => seedFor(initial, campaignPackIds))
  const editing = !!initial
  /** The character's level: a new one starts at 1; an edited one keeps its levels (and its later picks). */
  const level = initial?.classes[0]?.level ?? 1

  // Packs: this character's own, from every pack this device can use (the library, plus the open campaign's).
  const poolKey = useSyncExternalStore(subscribeActivePacks, getActivePacksKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const packPool = useMemo(() => getPackPool(), [poolKey])
  const [packIds, setPackIds] = useState<string[]>(seed.packIds)
  const selected = useMemo(() => packsWithDependencies(packIds, packPool), [packIds, packPool])
  const selectedPacks: ContentPack[] = selected.packs
  const selectedKey = selectedPacks.map(packKey).join(',')
  const picker: PickerContent = usePickerContent(selectedPacks)
  const [step, setStep] = useState<StepId>('class')

  // Class
  const [classId, setClassId] = useState<string | null>(seed.classId)
  const [chosenSkills, setChosenSkills] = useState<SkillName[]>(seed.chosenSkills)
  const [classChoices, setClassChoices] = useState<Record<string, string[]>>(seed.classChoices)

  // Background
  const [backgroundId, setBackgroundId] = useState<string | null>(seed.backgroundId)
  const [bonus, setBonus] = useState<Partial<Record<Ability, number>>>(seed.bonus)
  /** The background increase's shape: +2 and +1, or +1 to three. */
  const [bonusMode, setBonusMode] = useState<'split' | 'even'>(seed.bonusMode)
  const [featSpellAbility, setFeatSpellAbility] = useState<Ability>(seed.featSpellAbility)
  const [featCantrips, setFeatCantrips] = useState<string[]>(seed.featCantrips)
  const [featLeveledSpellId, setFeatLeveledSpellId] = useState(seed.featLeveledSpellId)

  // Species
  const [raceId, setRaceId] = useState<string | null>(seed.raceId)
  const [humanSkill, setHumanSkill] = useState<SkillName | null>(seed.humanSkill)
  const [humanFeatChoice, setHumanFeatChoice] = useState<Omit<AsiSlotChoice, 'id'> | null>(seed.humanFeatChoice)
  const [lineageName, setLineageName] = useState<string | null>(seed.lineageName)
  const [lineageAbility, setLineageAbility] = useState<Ability>(seed.lineageAbility)
  const [speciesChoices, setSpeciesChoices] = useState<Record<string, string[]>>(seed.speciesChoices)

  // Ability scores (an edited character's scores come in as entered ones)
  const [abilityMethod, setAbilityMethodState] = useState<AbilityMethod>(seed.manualScores ? 'manual' : 'standard')
  const [rolledPool, setRolledPool] = useState<number[] | null>(null)
  const [assignment, setAssignment] = useState<Record<Ability, number | null>>(noScores)
  const [pointBuy, setPointBuy] = useState<AbilityScores>(flat(8))
  const [manualScores, setManualScores] = useState<AbilityScores>(seed.manualScores ?? flat(10))

  // Spells (ids as SpellOption gives them)
  const [chosenSpells, setChosenSpells] = useState<string[]>(seed.chosenSpells)

  // Details
  const [name, setName] = useState(seed.name)
  const [alignment, setAlignment] = useState(seed.alignment)
  const [appearance, setAppearance] = useState<Appearance>(seed.appearance)
  const [backstory, setBackstory] = useState(seed.backstory)
  const [portrait, setPortrait] = useState<string | null>(seed.portrait)
  /** Personality traits, ideals, bonds and flaws, as the sheet's Story tab keeps them. */
  const [personality, setPersonality] = useState(seed.personality)

  const cls = useMemo(() => picker.classes.find((c) => c.id === classId) ?? null, [picker, classId])
  const background = useMemo(() => picker.backgrounds.find((b) => b.id === backgroundId) ?? null, [picker, backgroundId])
  const race = useMemo(() => picker.races.find((r) => r.id === raceId) ?? null, [picker, raceId])
  const lineageOptions = race ? lineageOptionsForRace(race.id) : []
  const lineage = lineageOptions.find((l) => l.name === lineageName) ?? null

  // --- What the engine asks of the class and species at 1st level -----------------------------------------
  const previewSheet = useMemo<CharacterSheetData>(
    () => ({
      ...emptyCharacterSheet(),
      race: race?.name ?? '',
      background: background?.name ?? '',
      classes: cls ? [{ className: cls.name, level }] : [],
      packIds,
      raceLineageChoice: race && lineage ? { raceId: race.id, lineageName: lineage.name, spellcastingAbility: lineageAbility } : null,
      // The skills picked so far, so a choice that needs one (a Rogue's Expertise) can offer it.
      skillProficiencies: Object.fromEntries([...(background?.skillProficiencies ?? []), ...chosenSkills, ...(humanSkill ? [humanSkill] : [])].map((s) => [s, 'proficient'])),
      choices: { ...speciesChoices, ...classChoices }
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [race, background, cls, lineage, lineageAbility, speciesChoices, classChoices, chosenSkills, humanSkill, packIds, selectedKey]
  )
  const preview = useMemo(() => deriveSheet(previewSheet), [previewSheet])
  const previewClassId = useMemo(() => normalizeForActivePacks(previewSheet).classes[0]?.classId, [previewSheet])
  const needsPick = (c: DerivedChoice): boolean => c.remaining > 0 || preview.derived.choices.some((n) => n.parentKey === c.key && needsPick(n))

  const classLevelChoices = preview.derived.choices.filter((c) => !!previewClassId && c.classId === previewClassId)
  // Only 1st-level picks are needed here: an edited higher-level character's later ones are shown, but can wait for the sheet.
  const classChoicesDone = classLevelChoices.filter((c) => !c.parentKey && (c.level ?? 1) <= 1).every((c) => !needsPick(c))

  // The species' choices beyond the ones the step asks itself (Human's Skillful/Versatile, the lineage and its ability).
  const speciesExtraChoices = preview.derived.choices
    .filter((c) => c.key.startsWith('species:') && !/#(lineage|spell-ability)$/.test(c.key) && !(race?.id === 'human' && /#(feat|skill)$/.test(c.key)))
    .filter((c) => !c.parentKey || !c.parentKey.startsWith('species:') || /#lineage$/.test(c.parentKey))
    .map((c) => (c.parentKey && /#lineage$/.test(c.parentKey) ? { ...c, parentKey: undefined } : c))
  const speciesChoicesDone = speciesExtraChoices.filter((c) => !c.parentKey).every((c) => !needsPick(c))

  const setClassChoice = (choice: DerivedChoice, picks: string[]): void => setClassChoices(choicePatch(previewSheet, preview.derived, choice, picks).choices ?? {})
  const setSpeciesChoice = (choice: DerivedChoice, picks: string[]): void => setSpeciesChoices(choicePatch(previewSheet, preview.derived, choice, picks).choices ?? {})

  // --- Background feat (an SRD one's spells are picked here) ----------------------------------------------
  const backgroundFeat = background ? FEATS.find((f) => f.id === background.featId) : undefined
  const duplicateOriginFeat = !!backgroundFeat && !backgroundFeat.repeatable && humanFeatChoice?.featId === backgroundFeat.id
  const featSpellChoice = backgroundFeat?.effects?.find((e): e is Extract<FeatEffect, { kind: 'spellChoice' }> => e.kind === 'spellChoice')
  const grantableCantrips: CompendiumSpell[] = featSpellChoice ? SPELLS.filter((s) => s.level === 0 && s.classes.some((c) => featSpellChoice.classes.includes(c))) : []
  const grantableLeveledSpells: CompendiumSpell[] = featSpellChoice ? SPELLS.filter((s) => s.level === featSpellChoice.spellLevel && s.classes.some((c) => featSpellChoice.classes.includes(c))) : []
  const featSpellsDone = !featSpellChoice || (featCantrips.length === 2 && !!featLeveledSpellId)

  // --- Ability scores ---------------------------------------------------------------------------------------
  const pool: number[] = abilityMethod === 'standard' ? STANDARD_ARRAY : abilityMethod === 'roll' ? rolledPool ?? [] : []
  const pointsSpent = ABILITY_IDS.reduce((sum, a) => sum + (POINT_BUY_COST[pointBuy[a]] ?? 0), 0)
  const baseScores: AbilityScores =
    abilityMethod === 'pointBuy'
      ? pointBuy
      : abilityMethod === 'manual'
        ? manualScores
        : (Object.fromEntries(ABILITY_IDS.map((a) => [a, assignment[a] ?? 10])) as AbilityScores)
  const allAssigned = ABILITY_IDS.every((a) => assignment[a] !== null)
  const scoresDone =
    abilityMethod === 'pointBuy' ? pointsSpent <= POINT_BUY_BUDGET : abilityMethod === 'manual' ? ABILITY_IDS.every((a) => manualScores[a] >= 3 && manualScores[a] <= 20) : pool.length === 6 && allAssigned
  const backgroundBonuses: Partial<AbilityScores> = background ? (Object.fromEntries(Object.entries(bonus).filter(([, v]) => !!v)) as Partial<AbilityScores>) : {}
  const bonusDone = !background || background.abilityScores.length === 0 || validBonusSpread(backgroundBonuses)
  const finalScores = Object.fromEntries(ABILITY_IDS.map((a) => [a, baseScores[a] + (race?.abilityBonuses[a] ?? 0) + (backgroundBonuses[a] ?? 0)])) as AbilityScores

  function setAbilityMethod(method: AbilityMethod): void {
    setAbilityMethodState(method)
    setAssignment(noScores())
    if (method === 'roll' && !rolledPool) setRolledPool(Array.from({ length: 6 }, roll4d6DropLowest))
  }
  function rerollPool(): void {
    setRolledPool(Array.from({ length: 6 }, roll4d6DropLowest))
    setAssignment(noScores())
  }
  /** Put a pool value (by its index in the pool) on an ability; whatever was there goes where the value came from. */
  function assignFromPool(ability: Ability, poolIndex: number): void {
    setAssignment((prev) => {
      const used = usedPoolIndexes(prev)
      const next = { ...prev }
      const holder = ABILITY_IDS.find((a) => used[a] === poolIndex)
      if (holder && holder !== ability) next[holder] = prev[ability]
      next[ability] = pool[poolIndex]
      return next
    })
  }
  /** Which pool slot each assigned ability is holding (values can repeat in a rolled pool). */
  function usedPoolIndexes(a: Record<Ability, number | null>): Partial<Record<Ability, number>> {
    const taken = new Set<number>()
    const out: Partial<Record<Ability, number>> = {}
    for (const id of ABILITY_IDS) {
      const v = a[id]
      if (v === null) continue
      const i = pool.findIndex((p, idx) => p === v && !taken.has(idx))
      if (i >= 0) {
        taken.add(i)
        out[id] = i
      }
    }
    return out
  }
  /** The pool dealt out by the class's priorities: its main abilities first, then Constitution, then the rest. */
  function suggestScores(): void {
    if (abilityMethod === 'pointBuy') {
      const order = abilityPriority(cls?.primaryAbility ?? [])
      const spread = [15, 15, 15, 8, 8, 8]
      setPointBuy(Object.fromEntries(order.map((a, i) => [a, spread[i]])) as AbilityScores)
      return
    }
    if (!pool.length) return
    const order = abilityPriority(cls?.primaryAbility ?? [])
    const sorted = [...pool].sort((a, b) => b - a)
    setAssignment(Object.fromEntries(order.map((a, i) => [a, sorted[i]])) as Record<Ability, number>)
  }

  // --- The finished sheet ------------------------------------------------------------------------------------
  const built = useMemo<CharacterSheetData>(() => {
    const skillProficiencies: Partial<Record<SkillName, 'proficient' | 'expertise'>> = {}
    for (const skill of background?.skillProficiencies ?? []) skillProficiencies[skill] = 'proficient'
    for (const skill of chosenSkills) skillProficiencies[skill] = 'proficient'
    if (humanSkill) skillProficiencies[humanSkill] = 'proficient'
    const className = cls?.name ?? ''

    // The background's increase and origin feat (and a Human's Versatile feat) are level-0 ASI picks, so they show in
    // the sheet's bonus breakdowns and Feats section, and Magic Initiate grants its spells.
    const granted: Omit<AsiSlotChoice, 'id'>[] = []
    if (background && Object.keys(backgroundBonuses).length > 0) granted.push({ className, level: 0, kind: 'ability', abilityIncreases: backgroundBonuses })
    if (background && backgroundFeat) {
      granted.push({
        className,
        level: 0,
        kind: 'feat',
        featId: backgroundFeat.id,
        chosenAbility: featSpellChoice ? featSpellAbility : undefined,
        chosenSpellIds: featSpellChoice ? [...featCantrips, featLeveledSpellId].filter(Boolean) : undefined
      })
    }
    if (humanFeatChoice) granted.push({ ...humanFeatChoice, className })
    // Stable ids, so the preview doesn't churn; a fresh set is made when the character is created.
    const asiSlotChoices: AsiSlotChoice[] = granted.map((entry, i) => ({ id: `creator-${i}`, ...entry }))
    const featSpells = granted
      .flatMap((e) => e.chosenSpellIds ?? [])
      .map((id) => SPELLS.find((s) => s.id === id))
      .filter((s): s is CompendiumSpell => !!s)
      .map((s, i) => ({ id: `creator-spell-${i}`, name: s.name, level: s.level, description: '', actionType: 'action' as const, compendiumId: s.id, free: true }))
    // The class's own spells, picked on the Spells step.
    const registry = registryForPacks([srdPack(), ...selectedPacks])
    const classSpells = chosenSpells.flatMap((id, i) => {
      if (id.startsWith('pack:')) {
        const fullId = id.slice('pack:'.length)
        const def = registry.get('spells', fullId)?.def
        return def ? [{ id: `creator-class-spell-${i}`, ...sheetSpellFromPack(fullId, def) }] : []
      }
      const s = SPELLS.find((x) => x.id === id)
      return s ? [{ id: `creator-class-spell-${i}`, name: s.name, level: s.level, description: '', actionType: 'action' as const, compendiumId: s.id }] : []
    })
    const spells = [...featSpells, ...classSpells]
    const grantedSpellcastingAbility = granted.find((e) => e.chosenSpellIds)?.chosenAbility ?? (lineage ? lineageAbility : null)

    let sheet: CharacterSheetData = {
      ...emptyCharacterSheet(),
      packIds,
      race: race?.name ?? '',
      classes: cls ? [{ className: cls.name, level }] : [],
      background: background?.name ?? '',
      alignment,
      appearance,
      backstory,
      ...personality,
      portraitDataUrl: portrait,
      abilityScores: baseScores,
      savingThrowProficiencies: cls?.savingThrowProficiencies ?? [],
      skillProficiencies,
      currentHp: 1,
      spellcastingAbility: cls?.spellcastingAbility ?? grantedSpellcastingAbility,
      equipment: cls ? startingEquipmentFor(cls.id) : [],
      asiSlotChoices,
      spells,
      raceLineageChoice: race && lineage ? { raceId: race.id, lineageName: lineage.name, spellcastingAbility: lineageAbility } : null
    }
    // The engine's level-1 picks, parents first (a nested choice only exists once its parent pick does).
    const picked = { ...speciesChoices, ...classChoices }
    for (const key of Object.keys(picked).sort((a, b) => a.length - b.length)) {
      const { derived } = deriveSheet(sheet)
      const choice = derived.choices.find((c) => c.key === key)
      if (choice) sheet = { ...sheet, ...choicePatch(sheet, derived, choice, picked[key]) }
    }
    sheet.currentHp = deriveSheet(sheet).derived.maxHp
    return sheet
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cls, background, race, lineage, lineageAbility, chosenSkills, humanSkill, humanFeatChoice, classChoices, speciesChoices, alignment, appearance, backstory, personality, portrait, JSON.stringify(baseScores), JSON.stringify(backgroundBonuses), featSpellAbility, featCantrips, featLeveledSpellId, chosenSpells, packIds, selectedKey])
  const derived: DerivedCharacter = useMemo(() => deriveSheet(built).derived, [built])

  // --- Spells -------------------------------------------------------------------------------------------------
  // What the class casts at 1st level, as the engine works it out: how many cantrips, and how many 1st-level
  // spells it prepares (or knows). A class with neither gets no Spells step.
  const casting = derived.spellcasting
  const cantripLimit = casting.cantripsLimit ?? 0
  const spellLimit = casting.preparedLimit ?? casting.knownLimit ?? 0
  const source = casting.sources[0]
  const spellOptions = useMemo<SpellOption[]>(() => {
    if (!cls || !source) return []
    // A spell is on the class's list if it names the list or the class (SRD spells name classes; pack spells name lists).
    const local = (n: string): string => n.toLowerCase().slice(n.lastIndexOf(':') + 1)
    const names = [source.list, cls.name, source.className].map(local)
    const onList = (lists: string[]): boolean => lists.some((l) => names.includes(local(l)))
    const registry = registryForPacks([srdPack(), ...selectedPacks])
    const srd: SpellOption[] = SPELLS.filter((s) => s.level <= 1 && onList(s.classes)).map((s) => ({ ...s }))
    const fromPacks: SpellOption[] = registry
      .all('spells')
      .filter((s) => s.packId !== SRD_PACK_ID && s.def.level <= 1 && onList(s.def.lists))
      .map((s) => ({ id: `pack:${s.fullId}`, name: s.def.name, level: s.def.level, school: s.def.school, castingTime: s.def.castingTime, range: s.def.range, duration: s.def.duration, concentration: s.def.concentration, ritual: s.def.ritual, description: s.def.description }))
    // A pack spell with an SRD spell's name replaces it.
    const packNames = new Set(fromPacks.map((s) => s.name.toLowerCase()))
    return [...srd.filter((s) => !packNames.has(s.name.toLowerCase())), ...fromPacks].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cls, source?.list, source?.className, selectedKey])
  const cantripOptions = spellOptions.filter((s) => s.level === 0)
  const levelOneOptions = spellOptions.filter((s) => s.level === 1)
  const cantripsNeeded = Math.min(cantripLimit, cantripOptions.length)
  const spellsNeeded = Math.min(spellLimit, levelOneOptions.length)
  const isCaster = !!cls && level === 1 && (cantripsNeeded > 0 || spellsNeeded > 0)
  const chosenCantrips = chosenSpells.filter((id) => cantripOptions.some((o) => o.id === id))
  const chosenLevelOne = chosenSpells.filter((id) => levelOneOptions.some((o) => o.id === id))
  function toggleSpell(id: string): void {
    const option = spellOptions.find((o) => o.id === id)
    if (!option) return
    setChosenSpells((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      const sameLevel = prev.filter((x) => spellOptions.find((o) => o.id === x)?.level === option.level).length
      return sameLevel >= (option.level === 0 ? cantripsNeeded : spellsNeeded) ? prev : [...prev, id]
    })
  }
  const steps: StepId[] = STEPS.filter((s) => s !== 'spells' || isCaster)

  // --- Steps ---------------------------------------------------------------------------------------------------
  const done: Record<StepId, boolean> = {
    // Editing never blocks on a pick the character left open (the sheet's Features tab still offers it).
    class: !!cls && chosenSkills.length === cls.skillChoice.choose && (editing || classChoicesDone),
    background: !!background && featSpellsDone,
    species: !!race && (race.id !== 'human' || (!!humanSkill && !!humanFeatChoice)) && (lineageOptions.length === 0 || !!lineage) && (editing || speciesChoicesDone) && !duplicateOriginFeat,
    abilities: scoresDone && bonusDone,
    spells: !isCaster || (chosenCantrips.length === cantripsNeeded && chosenLevelOne.length === spellsNeeded),
    details: name.trim().length > 0,
    review: true
  }
  /** The furthest step you can jump to: every step before it is done. */
  const reachable = (s: StepId): boolean => steps.slice(0, steps.indexOf(s)).every((p) => done[p])

  function chooseClass(id: string): void {
    if (id === classId) return
    setClassId(id)
    setChosenSkills([])
    setClassChoices({})
    setChosenSpells([])
  }
  function toggleSkill(skill: SkillName): void {
    setChosenSkills((prev) => (prev.includes(skill) ? prev.filter((s) => s !== skill) : cls && prev.length >= cls.skillChoice.choose ? prev : [...prev, skill]))
  }
  function chooseBackground(id: string): void {
    if (id === backgroundId) return
    setBackgroundId(id)
    const b = picker.backgrounds.find((x) => x.id === id)
    // +1 to each of its three to start with; a background offering more than three starts empty.
    setBonus(b && b.abilityScores.length === 3 ? Object.fromEntries(b.abilityScores.map((a) => [a, 1])) : {})
    setBonusMode('even')
    setFeatCantrips([])
    setFeatLeveledSpellId('')
  }
  function chooseSpecies(id: string): void {
    if (id === raceId) return
    setRaceId(id)
    setHumanSkill(null)
    setHumanFeatChoice(null)
    setLineageName(null)
    setSpeciesChoices({})
  }

  /** The sheet to hand over, with fresh ids. */
  function finish(): { name: string; sheet: CharacterSheetData } {
    rememberPackIds(packIds)
    // Class spells only come from the Spells step (a 1st-level character); feat spells always.
    const freshSpells = built.spells.filter((sp) => isCaster || !sp.id.startsWith('creator-class-spell-')).map((sp) => ({ ...sp, id: crypto.randomUUID() }))
    const freshAsi = built.asiSlotChoices.map((c) => ({ ...c, id: crypto.randomUUID() }))
    if (!initial) return { name: name.trim(), sheet: { ...built, asiSlotChoices: freshAsi, spells: freshSpells } }

    // Editing: the creator's parts of the sheet are replaced; everything it doesn't cover (later levels and their
    // picks, inventory, hit points, expertise, spells past 1st level, notes) is kept as it was.
    const { id: _id, name: _name, createdAt: _c, updatedAt: _u, ...old } = initial
    const oldClass = old.classes[0]
    const sameClass = !!oldClass && !!cls && oldClass.className.trim().toLowerCase() === cls.name.trim().toLowerCase()
    const skills = { ...old.skillProficiencies }
    const now = Object.keys(built.skillProficiencies) as SkillName[]
    for (const sk of seed.explainedSkills) if (!now.includes(sk)) delete skills[sk]
    for (const sk of now) skills[sk] = old.skillProficiencies[sk] ?? 'proficient'
    const oldFeatSpellIds = new Set(old.asiSlotChoices.filter((c) => c.level === 0).flatMap((c) => c.chosenSpellIds ?? []))
    const keptSpells = old.spells.filter((sp) => !(sp.free && sp.compendiumId && oldFeatSpellIds.has(sp.compendiumId)) && !(isCaster && !sp.free && sp.level <= 1))
    const oldChoices = Object.fromEntries(Object.entries(old.choices ?? {}).filter(([k]) => sameClass && !k.startsWith('species:')))
    const sheet: CharacterSheetData = {
      ...old,
      packIds,
      race: built.race,
      raceLineageChoice: built.raceLineageChoice,
      background: built.background,
      alignment: built.alignment,
      appearance: built.appearance,
      backstory: built.backstory,
      personalityTraits: built.personalityTraits,
      ideals: built.ideals,
      bonds: built.bonds,
      flaws: built.flaws,
      portraitDataUrl: built.portraitDataUrl,
      abilityScores: built.abilityScores,
      classes: cls ? [sameClass ? { ...oldClass, className: cls.name } : { className: cls.name, level }, ...old.classes.slice(1)] : old.classes,
      savingThrowProficiencies: sameClass ? old.savingThrowProficiencies : built.savingThrowProficiencies,
      spellcastingAbility: sameClass ? old.spellcastingAbility : built.spellcastingAbility,
      skillProficiencies: skills,
      asiSlotChoices: [...old.asiSlotChoices.filter((c) => c.level !== 0), ...freshAsi],
      spells: [...keptSpells, ...freshSpells],
      choices: { ...oldChoices, ...(built.choices ?? {}) }
    }
    return { name: name.trim(), sheet }
  }

  /** Turns a pack on or off for this character (what it depends on comes with it). */
  function togglePack(id: string): void {
    setPackIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  return {
    picker,
    editing,
    level,
    packPool,
    packIds,
    selectedPacks,
    missingPacks: selected.missing,
    togglePack,
    step,
    setStep,
    steps,
    done,
    reachable,
    // class
    cls,
    chooseClass,
    chosenSkills,
    toggleSkill,
    classLevelChoices,
    setClassChoice,
    // background
    background,
    chooseBackground,
    backgroundFeat,
    featSpellChoice,
    featSpellAbility,
    setFeatSpellAbility,
    featCantrips,
    setFeatCantrips,
    featLeveledSpellId,
    setFeatLeveledSpellId,
    grantableCantrips,
    grantableLeveledSpells,
    // species
    race,
    chooseSpecies,
    humanSkill,
    setHumanSkill,
    humanFeatChoice,
    setHumanFeatChoice,
    duplicateOriginFeat,
    lineageOptions,
    lineage,
    setLineageName,
    lineageAbility,
    setLineageAbility,
    speciesExtraChoices,
    setSpeciesChoice,
    previewDerived: preview.derived,
    // abilities
    abilityMethod,
    setAbilityMethod,
    pool,
    rerollPool,
    assignment,
    assignFromPool,
    usedPoolIndexes: () => usedPoolIndexes(assignment),
    clearAssignment: (a: Ability) => setAssignment((prev) => ({ ...prev, [a]: null })),
    pointBuy,
    setPointBuy,
    pointsSpent,
    manualScores,
    setManualScores,
    suggestScores,
    baseScores,
    bonus,
    setBonus,
    bonusMode,
    setBonusMode,
    backgroundBonuses,
    bonusDone,
    finalScores,
    // spells
    isCaster,
    casting,
    cantripOptions,
    levelOneOptions,
    cantripsNeeded,
    spellsNeeded,
    chosenSpells,
    chosenCantrips,
    chosenLevelOne,
    toggleSpell,
    // details
    name,
    setName,
    alignment,
    setAlignment,
    appearance,
    setAppearance,
    backstory,
    setBackstory,
    portrait,
    setPortrait,
    personality,
    setPersonality,
    // result
    built,
    derived,
    finish
  }
}

export type Creator = ReturnType<typeof useCreator>

/** An order to deal scores out in: the class's main abilities, then Constitution, then the usual fallbacks. */
export function abilityPriority(primary: Ability[]): Ability[] {
  const order: Ability[] = [...primary]
  for (const a of ['con', 'dex', 'wis', 'str', 'cha', 'int'] as Ability[]) if (!order.includes(a)) order.push(a)
  return order.slice(0, 6)
}

/** What's left before a step is done, for the footer. */
export function missingFor(c: Creator): string {
  switch (c.step) {
    case 'class':
      if (!c.cls) return 'Pick a class to continue'
      if (c.chosenSkills.length < c.cls.skillChoice.choose) return `Choose ${c.cls.skillChoice.choose - c.chosenSkills.length} more skill${c.cls.skillChoice.choose - c.chosenSkills.length === 1 ? '' : 's'}`
      return 'Make your class’s choices'
    case 'background':
      return c.background ? 'Choose your origin feat’s spells' : 'Pick a background to continue'
    case 'species':
      if (!c.race) return 'Pick one to continue'
      if (c.duplicateOriginFeat) return 'Pick a different Versatile feat'
      return 'Finish your choices above'
    case 'abilities':
      return c.bonusDone ? (c.abilityMethod === 'pointBuy' ? 'You’ve spent too many points' : 'Give every ability a score') : 'Finish your background’s increases'
    case 'spells': {
      const cantrips = c.cantripsNeeded - c.chosenCantrips.length
      const spells = c.spellsNeeded - c.chosenLevelOne.length
      const parts = [cantrips > 0 ? `${cantrips} more cantrip${cantrips === 1 ? '' : 's'}` : '', spells > 0 ? `${spells} more spell${spells === 1 ? '' : 's'}` : ''].filter(Boolean)
      return `Choose ${parts.join(' and ')}`
    }
    case 'details':
      return 'Give your character a name'
    default:
      return ''
  }
}

