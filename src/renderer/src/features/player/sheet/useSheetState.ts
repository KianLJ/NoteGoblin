// The character sheet's shared editing state: the fields the always-visible
// parts of the sheet edit (identity, hit points, vitals, ability scores,
// saves, skills), one autosave draft for all of them so a change in one
// (raising Constitution) shows up in another (max HP) straight away, plus
// the derived character and every action those parts take. Lifted out of
// the old Overview tab so the rail, ability tiles and skills column can all
// use one copy.
import { useMemo } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import {
  SKILLS,
  type Ability,
  type AbilityScores,
  type CharacterSheetData,
  type ClassLevel,
  type DeathSaves,
  type HitDicePool,
  type SkillName
} from '@shared/dnd5e'
import { deriveSheet, type DerivedSheet } from '@shared/content/sheet'
import { restResources } from '@shared/content/resourceMath'
import { applyDamage, applyHealing, hpAfterMaxChange } from '@shared/hitPoints'
import { useAutosaveDraft } from '../useAutosaveDraft'
import { useDerivedSheet } from '../useDerivedSheet'
import { playSfx } from '../../audio/soundEffects'

export interface SheetDraft {
  race: string
  classes: ClassLevel[]
  experiencePoints: number
  abilityScores: AbilityScores
  savingThrowProficiencies: Ability[]
  skillProficiencies: Partial<Record<SkillName, 'proficient' | 'expertise'>>
  otherProficiencies: string
  currentHp: number
  tempHp: number
  inspiration: boolean
  deathSaves: DeathSaves
  hitDiceUsed: Record<string, number>
  exhaustionLevel: number
  portraitDataUrl: string | null
}

export interface SheetState {
  character: CharacterSheet
  draft: SheetDraft
  patch: (fields: Partial<SheetDraft>) => void
  onSave: (patch: Partial<CharacterSheetData>) => void
  readOnly: boolean
  sessionId: string | null
  derivedSheet: DerivedSheet
  maxHp: number
  /** The 18 SRD skills, then any a content pack adds. */
  skillRows: { id: SkillName; ability: Ability }[]
  updateClass: (index: number, fields: Partial<ClassLevel>) => void
  removeClass: (index: number) => void
  updateAbilityScore: (ability: Ability, value: number) => void
  toggleSave: (ability: Ability) => void
  cycleSkillProficiency: (skill: SkillName) => void
  damage: (amount: number) => void
  heal: (amount: number) => void
  longRest: () => void
  /** Clears death saves and refills short-rest resources; the caller then offers hit dice (rollHitDie). */
  shortRest: () => void
  rollHitDie: (pool: HitDicePool) => void
  setExhaustion: (level: number) => void
  setPortrait: (dataUrl: string) => void
}

function resetAllSlots(slots: Record<number, { total: number; used: number }>): Record<number, { total: number; used: number }> {
  return Object.fromEntries(Object.entries(slots).map(([lvl, s]) => [lvl, { ...s, used: 0 }]))
}

export function useSheetState(
  character: CharacterSheet,
  onSave: (patch: Partial<CharacterSheetData>) => void,
  options: { readOnly?: boolean; sessionId?: string | null; onLevelUp?: (className: string, fromLevel: number, toLevel: number) => void }
): SheetState {
  const readOnly = !!options.readOnly
  const [draft, setDraft] = useAutosaveDraft<SheetDraft>(
    {
      race: character.race,
      classes: character.classes,
      experiencePoints: character.experiencePoints,
      abilityScores: character.abilityScores,
      savingThrowProficiencies: character.savingThrowProficiencies,
      skillProficiencies: character.skillProficiencies,
      otherProficiencies: character.otherProficiencies,
      currentHp: character.currentHp,
      tempHp: character.tempHp,
      inspiration: character.inspiration,
      deathSaves: character.deathSaves,
      hitDiceUsed: character.hitDiceUsed,
      exhaustionLevel: character.exhaustionLevel,
      portraitDataUrl: character.portraitDataUrl
    },
    onSave,
    readOnly
  )
  const patch = (fields: Partial<SheetDraft>): void => setDraft((prev) => ({ ...prev, ...fields }))

  // Every derived number comes from the content engine over the saved sheet with this draft on top, so an edit
  // shows up everywhere before it's saved.
  const liveSheet = useMemo(() => ({ ...character, ...draft }), [character, draft])
  const derivedSheet = useDerivedSheet(liveSheet)
  const { derived } = derivedSheet
  const maxHp = derived.maxHp
  const maxHpWith = (fields: Partial<SheetDraft>): number => deriveSheet({ ...liveSheet, ...fields }).derived.maxHp

  /** A change that moves max HP (a level, a class) moves current HP with it; raising a level opens the level-up popup. */
  function updateClass(index: number, fields: Partial<ClassLevel>): void {
    if (!draft.classes[index]) {
      patch({ classes: [...draft.classes, { className: '', level: 1, ...fields }] })
      return
    }
    const prev = draft.classes[index]
    const nextClasses = draft.classes.map((c, i) => (i === index ? { ...c, ...fields } : c))
    const updates: Partial<SheetDraft> = { classes: nextClasses }
    if (fields.level !== undefined || fields.className !== undefined) {
      const newMax = maxHpWith({ classes: nextClasses })
      if (newMax !== maxHp) updates.currentHp = hpAfterMaxChange(draft.currentHp, maxHp, newMax)
    }
    if (fields.level !== undefined && fields.level > prev.level) {
      playSfx('levelUp')
      options.onLevelUp?.(prev.className || fields.className || '', prev.level, fields.level)
    }
    patch(updates)
  }

  function removeClass(index: number): void {
    const nextClasses = draft.classes.filter((_, i) => i !== index)
    patch({ classes: nextClasses, currentHp: hpAfterMaxChange(draft.currentHp, maxHp, maxHpWith({ classes: nextClasses })) })
  }

  /** Any ability change that moves max HP (usually Constitution) moves current HP with it. */
  function updateAbilityScore(ability: Ability, value: number): void {
    const nextScores = { ...draft.abilityScores, [ability]: value }
    patch({ abilityScores: nextScores, currentHp: hpAfterMaxChange(draft.currentHp, maxHp, maxHpWith({ abilityScores: nextScores })) })
  }

  function toggleSave(ability: Ability): void {
    patch({
      savingThrowProficiencies: draft.savingThrowProficiencies.includes(ability) ? draft.savingThrowProficiencies.filter((a) => a !== ability) : [...draft.savingThrowProficiencies, ability]
    })
  }

  function cycleSkillProficiency(skill: SkillName): void {
    const current = draft.skillProficiencies[skill] ?? 'none'
    const next = current === 'none' ? 'proficient' : current === 'proficient' ? 'expertise' : 'none'
    const nextProficiencies = { ...draft.skillProficiencies }
    if (next === 'none') delete nextProficiencies[skill]
    else nextProficiencies[skill] = next
    patch({ skillProficiencies: nextProficiencies })
  }

  const resetResourcesFor = (rest: 'short' | 'long'): Pick<CharacterSheetData, 'resourceUsed' | 'resourceTemp'> =>
    restResources(rest, derived.resources, { resourceUsed: character.resourceUsed, resourceTemp: character.resourceTemp ?? {} })

  /** Full HP, every slot and spent hit die back, death saves cleared, long- and short-rest resources refilled. Temp HP stays. */
  function longRest(): void {
    playSfx('longRest')
    const updates = { currentHp: maxHp, deathSaves: { successes: 0, failures: 0 }, hitDiceUsed: {} }
    patch(updates)
    onSave({ ...updates, spellSlots: resetAllSlots(character.spellSlots), ...resetResourcesFor('long') })
  }

  function shortRest(): void {
    playSfx('shortRest')
    patch({ deathSaves: { successes: 0, failures: 0 } })
    const isWarlock = draft.classes.some((c) => c.className.toLowerCase() === 'warlock')
    onSave({ deathSaves: { successes: 0, failures: 0 }, ...resetResourcesFor('short'), ...(isWarlock ? { spellSlots: resetAllSlots(character.spellSlots) } : {}) })
  }

  function rollHitDie(pool: HitDicePool): void {
    const roll = Math.floor(Math.random() * pool.hitDie) + 1
    const healed = Math.max(1, roll + derived.abilities.con.mod)
    const nextHp = Math.min(maxHp, draft.currentHp + healed)
    const nextUsed = { ...draft.hitDiceUsed, [pool.className]: pool.used + 1 }
    patch({ currentHp: nextHp, hitDiceUsed: nextUsed })
    onSave({ currentHp: nextHp, hitDiceUsed: nextUsed })
  }

  function setExhaustion(level: number): void {
    const next = Math.max(0, Math.min(6, level))
    patch({ exhaustionLevel: next })
    onSave({ exhaustionLevel: next })
  }

  function setPortrait(dataUrl: string): void {
    patch({ portraitDataUrl: dataUrl })
    onSave({ portraitDataUrl: dataUrl })
  }

  const skillRows: { id: SkillName; ability: Ability }[] = [
    ...SKILLS,
    ...Object.values(derived.skills)
      .filter((sk) => !SKILLS.some((k) => k.id.toLowerCase() === sk.name.toLowerCase()))
      .map((sk) => ({ id: sk.name as SkillName, ability: sk.ability }))
  ]

  return {
    character,
    draft,
    patch,
    onSave,
    readOnly,
    sessionId: options.sessionId ?? null,
    derivedSheet,
    maxHp,
    skillRows,
    updateClass,
    removeClass,
    updateAbilityScore,
    toggleSave,
    cycleSkillProficiency,
    damage: (n) => patch(applyDamage(draft, n)),
    heal: (n) => patch(applyHealing(draft, n, maxHp)),
    longRest,
    shortRest,
    rollHitDie,
    setExhaustion,
    setPortrait
  }
}

