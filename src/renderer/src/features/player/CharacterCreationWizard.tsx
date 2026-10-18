import { useMemo, useState, type ReactNode } from 'react'
import { deriveSheet, normalizeForActivePacks } from '@shared/content/sheet'
import { choicePatch } from '@shared/content/legacyMirror'
import type { DerivedChoice } from '@shared/content/engine'
import { ChoiceList, PickField } from './ChoiceCards'
import { usePickerContent } from '../content/pickerContent'
import { useTerms } from '../content/terms'
import { Modal } from '../../ui/Modal'
import { Button } from '../../ui/Button'
import { OriginFeatChooser } from './AsiChoosers'
import { generateNpcName } from '../../data/npcNames'
import {
  ABILITIES,
  ALIGNMENTS,
  CLASSES,
  SKILLS,
  STANDARD_ARRAY,
  abilityModifier,
  computeMaxHp,
  emptyCharacterSheet,
  formatModifier,
  lineageOptionsForRace,
  type Ability,
  type AbilityScores,
  type AsiSlotChoice,
  type Appearance,
  type CharacterSheetData,
  type SkillName
} from '@shared/dnd5e'
import { startingEquipmentFor, FEATS, SPELLS, type CompendiumSpell, type FeatEffect } from '@shared/compendium'
import { DiceIcon, IconLabel } from '../../ui/icons'

interface CharacterCreationWizardProps {
  onCreate: (name: string, sheet: CharacterSheetData) => void
  onClose: () => void
}

type AbilityMethod = 'standard' | 'manual'

const STEP_TITLES = ['Name & Details', 'Race', 'Class', 'Background', 'Ability Scores', 'Review']

const RANDOM_EYES = ['Brown', 'Blue', 'Green', 'Hazel', 'Amber', 'Grey', 'Violet', 'Black']
const RANDOM_SKIN = ['Pale', 'Fair', 'Olive', 'Tan', 'Bronze', 'Brown', 'Dark', 'Ashen', 'Grey', 'Green-tinged']
const RANDOM_HAIR = ['Black', 'Brown', 'Auburn', 'Blonde', 'Red', 'Silver', 'White', 'Bald', 'Braided black', 'Curly brown']

function randomOf<T>(pool: readonly T[]): T {
  return pool[Math.floor(Math.random() * pool.length)]
}

function randomAge(): string {
  return `${18 + Math.floor(Math.random() * 60)}`
}

function randomHeight(): string {
  const feet = 4 + Math.floor(Math.random() * 3)
  const inches = Math.floor(Math.random() * 12)
  return `${feet}'${inches}"`
}

function randomWeight(): string {
  return `${100 + Math.floor(Math.random() * 150)} lbs`
}

/**
 * Guided multi-step character builder — name -> race -> class (+ skill
 * picks) -> background -> ability scores -> review. Assembles a full
 * CharacterSheetData with sensible derived defaults (AC, HP, proficiency
 * bonus flows from level via shared/dnd5e helpers) and hands it to
 * onCreate. Everything it produces stays editable afterward in
 * CharacterSheetEditor — this just gets a real 5e character off the
 * ground instead of an empty shell.
 */
export function CharacterCreationWizard({ onCreate, onClose }: CharacterCreationWizardProps): JSX.Element {
  const [step, setStep] = useState(0)
  // Step names and ability names follow the active packs' terminology.
  const terms = useTerms()
  const stepTitles = STEP_TITLES.map((t) => (t === 'Race' ? terms.t('species', 'Race') : t === 'Background' ? terms.t('background') : t))
  const [name, setName] = useState('')
  const [raceId, setRaceId] = useState<string | null>(null)
  // Human's Skillful/Versatile traits (SRD 5.2.1) grant a real skill
  // proficiency and a real Origin feat — only Human has trait-level choices
  // like this among the current species list, so it's handled inline here
  // rather than a generic per-race chooser slot.
  const [humanSkill, setHumanSkill] = useState<SkillName | null>(null)
  const [humanFeatChoice, setHumanFeatChoice] = useState<Omit<AsiSlotChoice, 'id'> | null>(null)
  // Elf/Gnome/Tiefling's lineage/legacy trait — the cantrip(s) are known
  // from level 1 (granted at creation below); the level 3/5 spells aren't
  // chosen yet since the character starts at level 1 — see FeaturesTab.tsx's
  // LineageSpellGrant for where those get picked up later.
  const [lineageName, setLineageName] = useState<string | null>(null)
  const [lineageAbility, setLineageAbility] = useState<Ability>('wis')
  const [classId, setClassId] = useState<string | null>(null)
  const [chosenSkills, setChosenSkills] = useState<SkillName[]>([])
  // Picks for the chosen class's own level-1 choices (a Fighting Style, a homebrew Bloodline…), keyed like
  // sheet.choices. Applied through choicePatch at creation, so SRD ones are mirrored into the legacy fields too.
  const [classChoices, setClassChoices] = useState<Record<string, string[]>>({})
  // Picks for the species' own choices the step below doesn't ask about itself (an Elf's Keen Senses, a High Elf's cantrip).
  const [speciesChoices, setSpeciesChoices] = useState<Record<string, string[]>>({})
  const [backgroundId, setBackgroundId] = useState<string | null>(null)
  // The background's ability score bonus (SRD 5.2.1): either +1 to all
  // three of its listed abilities, or +2 to one and +1 to another —
  // 'focus' picks which ability gets the +2, the other two of the three
  // are implied (the remaining one gets +1, the excluded one gets none).
  const [backgroundAsiMode, setBackgroundAsiMode] = useState<'even' | 'focused'>('even')
  const [backgroundFocusAbility, setBackgroundFocusAbility] = useState<Ability | null>(null)
  // The +1 ability in "focused" mode used to be auto-picked (whichever of
  // the background's three wasn't the +2) — silently applying a bonus the
  // player never actually chose. Now it's a real second pick, excluding
  // whichever ability is currently the +2.
  const [backgroundSecondaryAbility, setBackgroundSecondaryAbility] = useState<Ability | null>(null)
  // Only relevant when the background's Origin feat has a spellChoice effect
  // (Magic Initiate) — same fields AsiSlotChooser uses for the identical
  // choice at a normal ASI slot, since it's the same feat granting the same
  // thing, just always-taken here instead of picked from a list.
  const [featSpellAbility, setFeatSpellAbility] = useState<Ability>('wis')
  const [featCantripAId, setFeatCantripAId] = useState('')
  const [featCantripBId, setFeatCantripBId] = useState('')
  const [featLeveledSpellId, setFeatLeveledSpellId] = useState('')
  const [abilityMethod, setAbilityMethod] = useState<AbilityMethod>('standard')
  const [standardAssignment, setStandardAssignment] = useState<Record<Ability, number | null>>({
    str: null,
    dex: null,
    con: null,
    int: null,
    wis: null,
    cha: null
  })
  const [manualScores, setManualScores] = useState<AbilityScores>({
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10
  })
  const [alignment, setAlignment] = useState('')
  const [appearance, setAppearance] = useState<Appearance>({
    age: '',
    height: '',
    weight: '',
    eyes: '',
    skin: '',
    hair: ''
  })

  // SRD entries plus whatever the active content packs add (see pickerContent.ts) — outside a campaign that's the
  // whole library, so a homebrew class can be picked here.
  const picker = usePickerContent()
  const race = useMemo(() => picker.races.find((r) => r.id === raceId) ?? null, [picker, raceId])
  const lineageOptions = race ? lineageOptionsForRace(race.id) : []
  const lineage = lineageOptions.find((l) => l.name === lineageName) ?? null
  const cls = useMemo(() => picker.classes.find((c) => c.id === classId) ?? null, [picker, classId])
  const background = useMemo(() => picker.backgrounds.find((b) => b.id === backgroundId) ?? null, [picker, backgroundId])

  // The character as built so far, just enough to ask the content engine which choices the chosen class grants
  // at 1st level — so any class (SRD or homebrew) gets its own picks here, rendered generically.
  const previewSheet = useMemo<CharacterSheetData>(
    () => ({
      ...emptyCharacterSheet(),
      race: race?.name ?? '',
      background: background?.name ?? '',
      classes: cls ? [{ className: cls.name, level: 1 }] : [],
      raceLineageChoice: race && lineage ? { raceId: race.id, lineageName: lineage.name, spellcastingAbility: lineageAbility } : null,
      choices: { ...speciesChoices, ...classChoices }
    }),
    [race, background, cls, lineage, lineageAbility, speciesChoices, classChoices]
  )
  const preview = deriveSheet(previewSheet)
  const previewClassId = normalizeForActivePacks(previewSheet).classes[0]?.classId
  const classLevelChoices = preview.derived.choices.filter((c) => !!previewClassId && c.classId === previewClassId)
  const needsPick = (c: DerivedChoice): boolean => c.remaining > 0 || preview.derived.choices.some((n) => n.parentKey === c.key && needsPick(n))
  const classChoicesDone = classLevelChoices.filter((c) => !c.parentKey).every((c) => !needsPick(c))

  // The species' choices beyond the ones this step asks about itself (Human's Skillful/Versatile, the lineage and its
  // ability): shown as cards, a nested one (a lineage's cantrip) on its own since its parent pick is made above.
  const speciesExtraChoices = preview.derived.choices
    .filter((c) => c.key.startsWith('species:') && !/#(lineage|spell-ability)$/.test(c.key) && !(race?.id === 'human' && /#(feat|skill)$/.test(c.key)))
    .filter((c) => !c.parentKey || !c.parentKey.startsWith('species:') || /#lineage$/.test(c.parentKey))
    .map((c) => (c.parentKey && /#lineage$/.test(c.parentKey) ? { ...c, parentKey: undefined } : c))
  const speciesChoicesDone = speciesExtraChoices.filter((c) => !c.parentKey).every((c) => !needsPick(c))

  function setSpeciesChoice(choice: DerivedChoice, picks: string[]): void {
    setSpeciesChoices(choicePatch(previewSheet, preview.derived, choice, picks).choices ?? {})
  }

  function setClassChoice(choice: DerivedChoice, picks: string[]): void {
    // choicePatch's native part already drops picks nested under anything removed.
    setClassChoices(choicePatch(previewSheet, preview.derived, choice, picks).choices ?? {})
  }

  const baseScores: AbilityScores =
    abilityMethod === 'standard'
      ? {
          str: standardAssignment.str ?? 10,
          dex: standardAssignment.dex ?? 10,
          con: standardAssignment.con ?? 10,
          int: standardAssignment.int ?? 10,
          wis: standardAssignment.wis ?? 10,
          cha: standardAssignment.cha ?? 10
        }
      : manualScores

  const backgroundBonuses: Partial<AbilityScores> = useMemo(() => {
    if (!background) return {}
    if (backgroundAsiMode === 'even') {
      return Object.fromEntries(background.abilityScores.map((a) => [a, 1])) as Partial<AbilityScores>
    }
    const focus = backgroundFocusAbility ?? background.abilityScores[0]
    const secondary = backgroundSecondaryAbility && backgroundSecondaryAbility !== focus ? backgroundSecondaryAbility : null
    return { [focus]: 2, ...(secondary ? { [secondary]: 1 } : {}) } as Partial<AbilityScores>
  }, [background, backgroundAsiMode, backgroundFocusAbility, backgroundSecondaryAbility])

  const finalScores: AbilityScores = ABILITIES.reduce((acc, { id }) => {
    acc[id] = baseScores[id] + (race?.abilityBonuses[id] ?? 0) + (backgroundBonuses[id] ?? 0)
    return acc
  }, {} as AbilityScores)

  const backgroundFeat = background ? FEATS.find((f) => f.id === background.featId) : undefined
  // The Human Versatile feat (picked a step earlier) can't be the background's own feat unless that feat is repeatable.
  const duplicateOriginFeat = !!backgroundFeat && !backgroundFeat.repeatable && humanFeatChoice?.featId === backgroundFeat.id
  const backgroundFeatSpellChoice = backgroundFeat?.effects?.find(
    (e): e is Extract<FeatEffect, { kind: 'spellChoice' }> => e.kind === 'spellChoice'
  )
  const grantableCantrips: CompendiumSpell[] = backgroundFeatSpellChoice
    ? SPELLS.filter((s) => s.level === 0 && s.classes.some((c) => backgroundFeatSpellChoice.classes.includes(c)))
    : []
  const grantableLeveledSpells: CompendiumSpell[] = backgroundFeatSpellChoice
    ? SPELLS.filter((s) => s.level === backgroundFeatSpellChoice.spellLevel && s.classes.some((c) => backgroundFeatSpellChoice.classes.includes(c)))
    : []
  const backgroundFeatSpellChoiceReady =
    !backgroundFeatSpellChoice || (!!featCantripAId && !!featCantripBId && featCantripAId !== featCantripBId && !!featLeveledSpellId)

  function canProceed(): boolean {
    if (step === 0) return name.trim().length > 0
    if (step === 1) {
      return (
        raceId !== null &&
        (race?.id !== 'human' || (humanSkill !== null && humanFeatChoice !== null)) &&
        (lineageOptions.length === 0 || lineageName !== null) &&
        speciesChoicesDone
      )
    }
    if (step === 2) return classId !== null && chosenSkills.length === cls?.skillChoice.choose && classChoicesDone
    if (step === 3) {
      return (
        backgroundId !== null &&
        !duplicateOriginFeat &&
        (backgroundAsiMode === 'even' || (backgroundFocusAbility !== null && backgroundSecondaryAbility !== null)) &&
        backgroundFeatSpellChoiceReady
      )
    }
    if (step === 4) {
      if (abilityMethod === 'manual') return true
      return ABILITIES.every(({ id }) => standardAssignment[id] !== null)
    }
    return true
  }

  /** Standard Array: deals 15/14/13/12/10/8 out in a random order. Manual Entry: rolls 4d6 for each ability, dropping the lowest die. */
  function randomizeAbilities(): void {
    if (abilityMethod === 'standard') {
      const shuffled = [...STANDARD_ARRAY]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      setStandardAssignment(Object.fromEntries(ABILITIES.map(({ id }, i) => [id, shuffled[i]])) as Record<Ability, number>)
      return
    }
    const roll4d6DropLowest = (): number => {
      const dice = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1).sort((a, b) => a - b)
      return dice[1] + dice[2] + dice[3]
    }
    setManualScores(Object.fromEntries(ABILITIES.map(({ id }) => [id, roll4d6DropLowest()])) as AbilityScores)
  }

  function usedStandardValues(exceptAbility?: Ability): number[] {
    return ABILITIES.filter(({ id }) => id !== exceptAbility)
      .map(({ id }) => standardAssignment[id])
      .filter((v): v is number => v !== null)
  }

  function toggleSkill(skill: SkillName): void {
    setChosenSkills((prev) => {
      if (prev.includes(skill)) return prev.filter((s) => s !== skill)
      if (cls && prev.length >= cls.skillChoice.choose) return prev
      return [...prev, skill]
    })
  }

  function handleCreate(): void {
    const skillProficiencies: Partial<Record<SkillName, 'proficient' | 'expertise'>> = {}
    for (const skill of background?.skillProficiencies ?? []) skillProficiencies[skill] = 'proficient'
    for (const skill of chosenSkills) skillProficiencies[skill] = 'proficient'
    if (humanSkill) skillProficiencies[humanSkill] = 'proficient'

    const classes = cls ? [{ className: cls.name, level: 1 }] : []
    const className = cls?.name ?? ''

    // Both the background's Origin feat and (for a Human) the Versatile
    // trait's Origin feat are granted through the same AsiSlotChoice
    // mechanism a normal ASI-or-feat pick uses (see AsiChoosers.tsx's
    // AsiSlotChooser/OriginFeatChooser and compendium.ts's
    // buildAsiSlotResolutionPatch) rather than as freeform Features entries
    // — that's what makes them show up in the real Feats section, actually
    // grant Magic Initiate's spells, and feed effectiveAbilityScores/etc.
    // for any feat with a mechanical effect. `level: 0` keeps each
    // permanently active regardless of the class's actual level (see
    // activeAsiSlotChoices — neither is unlocked by leveling, they're just
    // always there).
    // The background's ability score increase is granted the exact same way
    // — as an AsiSlotChoice, `kind: 'ability'` this time — rather than baked
    // directly into the sheet's raw abilityScores. That's what makes it
    // show up in OverviewTab's "Bonuses" breakdown next to the ability
    // score (see abilityBonusSources there), removable the same way an ASI
    // pick is, instead of being an invisible, unlabeled part of the base
    // number — silently baking it in was the actual bug behind "the
    // increase doesn't do anything," not the math itself.
    const grantedFeatChoices: Omit<AsiSlotChoice, 'id'>[] = []
    if (background && Object.keys(backgroundBonuses).length > 0) {
      grantedFeatChoices.push({ className, level: 0, kind: 'ability', abilityIncreases: backgroundBonuses })
    }
    if (background && backgroundFeat) {
      grantedFeatChoices.push({
        className,
        level: 0,
        kind: 'feat',
        featId: backgroundFeat.id,
        chosenAbility: backgroundFeatSpellChoice ? featSpellAbility : undefined,
        chosenSpellIds: backgroundFeatSpellChoice ? [featCantripAId, featCantripBId, featLeveledSpellId] : undefined
      })
    }
    if (humanFeatChoice) grantedFeatChoices.push({ ...humanFeatChoice, className })

    const asiSlotChoices: AsiSlotChoice[] = grantedFeatChoices.map((entry) => ({ id: crypto.randomUUID(), ...entry }))
    const featSpellIds = grantedFeatChoices.flatMap((entry) => entry.chosenSpellIds ?? [])
    // The lineage/legacy cantrip(s) are known from level 1 — granted here,
    // same as a feat's spellChoice, while the level 3/5 spells wait for
    // FeaturesTab.tsx's LineageSpellGrant once the character actually
    // reaches those levels (there's nothing to grant them into yet at
    // creation, since every character starts at level 1).
    // A lineage's cantrips aren't stored: the sheet grants them from the lineage pick (so a High Elf's swap shows correctly).
    const grantedSpells = [...featSpellIds]
      .map((id) => SPELLS.find((s) => s.id === id))
      .filter((s): s is CompendiumSpell => !!s)
      .map((s) => ({ id: crypto.randomUUID(), name: s.name, level: s.level, description: '', actionType: 'action' as const, compendiumId: s.id, free: true }))
    // Whichever spellcasting-granting feat resolves first wins if a
    // non-caster somehow ends up with two (Origin feats don't overlap in
    // practice — Human's Versatile only offers Magic Initiate alongside a
    // background that also grants it in the unlikely case both are chosen).
    const grantedSpellcastingAbility = grantedFeatChoices.find((e) => e.chosenSpellIds)?.chosenAbility ?? (lineage ? lineageAbility : null)

    const sheet: CharacterSheetData = {
      ...emptyCharacterSheet(),
      race: race?.name ?? '',
      classes,
      background: background?.name ?? '',
      alignment,
      appearance,
      // Raw scores only — the background's increase is applied via
      // asiSlotChoices below instead of being baked in here (see the
      // comment above grantedFeatChoices). finalScores (the bonus-inclusive
      // total) is still what determines starting HP, matching how
      // OverviewTab always computes max HP from the bonus-inclusive
      // effScores rather than the raw draft.abilityScores.
      abilityScores: baseScores,
      savingThrowProficiencies: cls?.savingThrowProficiencies ?? [],
      skillProficiencies,
      // Placeholder — replaced below with the content engine's max HP for the finished sheet.
      currentHp: 1,
      spellcastingAbility: cls?.spellcastingAbility ?? grantedSpellcastingAbility,
      equipment: cls ? startingEquipmentFor(cls.id) : [],
      asiSlotChoices,
      spells: grantedSpells,
      raceLineageChoice: race && lineage ? { raceId: race.id, lineageName: lineage.name, spellcastingAbility: lineageAbility } : null
    }

    // The class's level-1 picks, through the same path as the Features tab — parents first, since a nested
    // choice (a feat's own picks) only exists once its parent pick does.
    let built: CharacterSheetData = sheet
    const picked = { ...speciesChoices, ...classChoices }
    for (const key of Object.keys(picked).sort((a, b) => a.length - b.length)) {
      const { derived } = deriveSheet(built)
      const choice = derived.choices.find((c) => c.key === key)
      if (choice) built = { ...built, ...choicePatch(built, derived, choice, picked[key]) }
    }

    // Start at full HP, as the finished sheet's own Overview tab will compute it.
    built.currentHp = deriveSheet(built).derived.maxHp
    onCreate(name.trim(), built)
  }

  return (
    <Modal onClose={onClose} width={760} dismissible={false}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22 }}>Create Character</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            Step {step + 1} of {STEP_TITLES.length}: {stepTitles[step]}
          </p>
        </div>

        <div style={{ minHeight: 320 }}>
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label className="gb-label" htmlFor="wizard-name">
                  Character Name
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    id="wizard-name"
                    className="gb-input"
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Elowen Brightwood"
                    style={{ flex: 1 }}
                  />
                  <RandomButton title="Random name" onClick={() => setName(generateNpcName(race?.name ?? 'Human'))} />
                </div>
              </div>

              <div>
                <label className="gb-label" htmlFor="wizard-alignment">
                  Alignment
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select
                    id="wizard-alignment"
                    className="gb-input"
                    value={alignment}
                    onChange={(e) => setAlignment(e.target.value)}
                    style={{ flex: 1 }}
                  >
                    <option value="">Unaligned</option>
                    {ALIGNMENTS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                  <RandomButton title="Random alignment" onClick={() => setAlignment(randomOf(ALIGNMENTS))} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }}>
                {(['age', 'height', 'weight', 'eyes', 'skin', 'hair'] as const).map((field) => (
                  <div key={field}>
                    <label className="gb-label" htmlFor={`wizard-${field}`} style={{ textTransform: 'capitalize' }}>
                      {field}
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        id={`wizard-${field}`}
                        className="gb-input"
                        value={appearance[field]}
                        onChange={(e) => setAppearance((prev) => ({ ...prev, [field]: e.target.value }))}
                        style={{ flex: 1, minWidth: 0 }}
                      />
                      <RandomButton
                        title={`Random ${field}`}
                        onClick={() =>
                          setAppearance((prev) => ({
                            ...prev,
                            [field]:
                              field === 'age'
                                ? randomAge()
                                : field === 'height'
                                  ? randomHeight()
                                  : field === 'weight'
                                    ? randomWeight()
                                    : field === 'eyes'
                                      ? randomOf(RANDOM_EYES)
                                      : field === 'skin'
                                        ? randomOf(RANDOM_SKIN)
                                        : randomOf(RANDOM_HAIR)
                          }))
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <CardGrid>
                {picker.races.map((r) => (
                  <PickCard
                    key={r.id}
                    selected={raceId === r.id}
                    onClick={() => {
                      setRaceId(r.id)
                      setHumanSkill(null)
                      setHumanFeatChoice(null)
                      setLineageName(null)
                      setSpeciesChoices({})
                    }}
                  >
                    <strong>{r.name}</strong>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {Object.entries(r.abilityBonuses)
                        .map(([a, v]) => `${a.toUpperCase()} +${v}`)
                        .concat(`Speed ${r.speed}`)
                        .join(' · ')}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                      {r.traits.join(', ')}
                    </div>
                  </PickCard>
                ))}
              </CardGrid>

              {race?.id === 'human' && (
                <Section title="Human — Skillful & Versatile">
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <select
                      className="gb-input"
                      value={humanSkill ?? ''}
                      onChange={(e) => setHumanSkill((e.target.value || null) as SkillName | null)}
                      style={{ fontSize: 12, flex: 1 }}
                    >
                      <option value="">Skillful — choose a skill…</option>
                      {SKILLS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.id}
                        </option>
                      ))}
                    </select>
                  </div>
                  <OriginFeatChooser label="Versatile" level={0} onResolve={setHumanFeatChoice} taken={backgroundFeat && !backgroundFeat.repeatable ? [{ id: backgroundFeat.id, why: `Your ${background?.name} background already gives this` }] : []} />
                </Section>
              )}

              {lineageOptions.length > 0 && (
                <Section
                  title={race?.traits.includes('Elven Lineage') ? 'Elven Lineage' : race?.traits.includes('Fiendish Legacy') ? 'Fiendish Legacy' : 'Gnomish Lineage'}
                >
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {lineageOptions.map((l) => (
                      <SkillChip
                        key={l.name}
                        label={l.name}
                        selected={lineageName === l.name}
                        onClick={() => setLineageName(l.name)}
                        title={l.description}
                      />
                    ))}
                  </div>
                  {lineage && (
                    <select
                      className="gb-input"
                      value={lineageAbility}
                      onChange={(e) => setLineageAbility(e.target.value as Ability)}
                      style={{ fontSize: 12 }}
                      title="Spellcasting ability for this lineage's spells"
                    >
                      {(['int', 'wis', 'cha'] as Ability[]).map((a) => (
                        <option key={a} value={a}>
                          {a.toUpperCase()} spellcasting
                        </option>
                      ))}
                    </select>
                  )}
                  {lineage?.level3SpellId && (
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                      Its level 3 and 5 spells are added automatically once your character reaches those levels.
                    </p>
                  )}
                </Section>
              )}

              {race && speciesExtraChoices.length > 0 && (
                <Section title={`${race.name} — your choices`}>
                  <ChoiceList choices={speciesExtraChoices} all={preview.derived.choices} onSetPicks={setSpeciesChoice} />
                </Section>
              )}
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <CardGrid>
                {picker.classes.map((c) => (
                  <PickCard
                    key={c.id}
                    selected={classId === c.id}
                    onClick={() => {
                      setClassId(c.id)
                      setChosenSkills([])
                      setClassChoices({})
                    }}
                  >
                    <strong>{c.name}</strong>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      d{c.hitDie} hit die · Saves: {c.savingThrowProficiencies.map((a) => a.toUpperCase()).join(', ')}
                    </div>
                    {c.spellcastingAbility && (
                      <div style={{ fontSize: 12, color: 'var(--accent)' }}>Spellcaster</div>
                    )}
                  </PickCard>
                ))}
              </CardGrid>

              {cls && (
                <Section title={`Choose ${cls.skillChoice.choose} skills (${chosenSkills.length}/${cls.skillChoice.choose})`}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {cls.skillChoice.from.map((skill) => (
                      <SkillChip
                        key={skill}
                        label={skill}
                        selected={chosenSkills.includes(skill)}
                        onClick={() => toggleSkill(skill)}
                      />
                    ))}
                  </div>
                </Section>
              )}

              {cls && classLevelChoices.some((c) => !c.parentKey) && (
                <Section title={`${cls.name} choices`}>
                  <ChoiceList choices={classLevelChoices} all={preview.derived.choices} onSetPicks={setClassChoice} />
                </Section>
              )}
            </div>
          )}

          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <CardGrid>
                {picker.backgrounds.map((b) => {
                  const feat = FEATS.find((f) => f.id === b.featId)
                  return (
                    <PickCard
                      key={b.id}
                      selected={backgroundId === b.id}
                      onClick={() => {
                        setBackgroundId(b.id)
                        setBackgroundAsiMode('even')
                        setBackgroundFocusAbility(null)
                        setBackgroundSecondaryAbility(null)
                        setFeatCantripAId('')
                        setFeatCantripBId('')
                        setFeatLeveledSpellId('')
                      }}
                    >
                      <strong>{b.name}</strong>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {b.abilityScores.map((a) => a.toUpperCase()).join(', ')} · Skills: {b.skillProficiencies.join(', ')}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                        <em>Origin Feat — {feat?.name ?? b.featId}:</em> {feat?.desc ?? 'No description available.'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        Tool: {b.toolProficiency}
                      </div>
                    </PickCard>
                  )
                })}
              </CardGrid>

              {background && (
                <Section title={`Ability Score Increase — ${background.name}`}>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <Button variant={backgroundAsiMode === 'even' ? 'primary' : 'secondary'} onClick={() => setBackgroundAsiMode('even')}>
                      +1 to all three
                    </Button>
                    <Button
                      variant={backgroundAsiMode === 'focused' ? 'primary' : 'secondary'}
                      onClick={() => setBackgroundAsiMode('focused')}
                    >
                      +2 to one, +1 to another
                    </Button>
                  </div>
                  {backgroundAsiMode === 'focused' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {background.abilityScores.map((a) => (
                          <SkillChip
                            key={a}
                            label={`${a.toUpperCase()} +2`}
                            selected={backgroundFocusAbility === a}
                            onClick={() => {
                              setBackgroundFocusAbility(a)
                              if (backgroundSecondaryAbility === a) setBackgroundSecondaryAbility(null)
                            }}
                          />
                        ))}
                      </div>
                      {backgroundFocusAbility && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          {background.abilityScores
                            .filter((a) => a !== backgroundFocusAbility)
                            .map((a) => (
                              <SkillChip
                                key={a}
                                label={`${a.toUpperCase()} +1`}
                                selected={backgroundSecondaryAbility === a}
                                onClick={() => setBackgroundSecondaryAbility(a)}
                              />
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                </Section>
              )}

              {duplicateOriginFeat && (
                <div className="gb-card" style={{ padding: 'var(--space-2) var(--space-3)', borderColor: 'var(--danger)', fontSize: 12, color: 'var(--text-secondary)' }}>
                  This background gives {backgroundFeat?.name}, which you already picked for Human Versatile, and it can only be taken once. Go back to {stepTitles[1]} and pick a different Versatile feat, or choose another background.
                </div>
              )}

              {backgroundFeatSpellChoice && (
                <Section title={`${backgroundFeat?.name} — choose 2 cantrips and 1 level 1 spell`}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Spellcasting ability</div>
                    <PickField
                      title="Spellcasting ability"
                      options={backgroundFeatSpellChoice.classes.map((c) => {
                        const a = CLASSES.find((k) => k.name === c)?.spellcastingAbility ?? 'int'
                        return { id: a, name: `${c} (${a.toUpperCase()})` }
                      }).filter((o, i, all) => all.findIndex((x) => x.id === o.id) === i)}
                      selected={[featSpellAbility]}
                      onChange={(ids) => ids[0] && setFeatSpellAbility(ids[0] as Ability)}
                    />
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Two cantrips ({[featCantripAId, featCantripBId].filter(Boolean).length}/2)</div>
                    <PickField
                      title="Two cantrips"
                      options={grantableCantrips.map((sp) => ({ id: sp.id, name: sp.name, description: sp.description }))}
                      selected={[featCantripAId, featCantripBId].filter(Boolean)}
                      max={2}
                      onChange={(ids) => {
                        setFeatCantripAId(ids[0] ?? '')
                        setFeatCantripBId(ids[1] ?? '')
                      }}
                    />
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>A level 1 spell</div>
                    <PickField
                      title="A level 1 spell"
                      options={grantableLeveledSpells.map((sp) => ({ id: sp.id, name: sp.name, description: sp.description }))}
                      selected={featLeveledSpellId ? [featLeveledSpellId] : []}
                      onChange={(ids) => setFeatLeveledSpellId(ids[0] ?? '')}
                    />
                  </div>
                </Section>
              )}
            </div>
          )}

          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <Button
                  variant={abilityMethod === 'standard' ? 'primary' : 'secondary'}
                  onClick={() => setAbilityMethod('standard')}
                >
                  Standard Array
                </Button>
                <Button
                  variant={abilityMethod === 'manual' ? 'primary' : 'secondary'}
                  onClick={() => setAbilityMethod('manual')}
                >
                  Manual Entry
                </Button>
                <Button
                  variant="secondary"
                  onClick={randomizeAbilities}
                  style={{ marginLeft: 'auto' }}
                  title={abilityMethod === 'standard' ? 'Deal the standard array out in a random order' : 'Roll 4d6 for each ability, dropping the lowest die'}
                >
                  <IconLabel icon={<DiceIcon size={14} />}>Randomize</IconLabel>
                </Button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)' }}>
                {terms.abilities.map(({ id, label }) => {
                  const raceBonus = race?.abilityBonuses[id] ?? 0
                  const backgroundBonus = backgroundBonuses[id] ?? 0
                  const totalBonus = raceBonus + backgroundBonus
                  return (
                    <div key={id} className="gb-card" style={{ padding: 'var(--space-3)' }}>
                      <div className="gb-label" style={{ marginBottom: 6 }}>
                        {label}
                      </div>
                      {abilityMethod === 'standard' ? (
                        <select
                          className="gb-input"
                          value={standardAssignment[id] ?? ''}
                          onChange={(e) =>
                            setStandardAssignment((prev) => ({
                              ...prev,
                              [id]: e.target.value === '' ? null : Number(e.target.value)
                            }))
                          }
                        >
                          <option value="">—</option>
                          {STANDARD_ARRAY.filter(
                            (v) => v === standardAssignment[id] || !usedStandardValues(id).includes(v)
                          ).map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="number"
                          min={3}
                          max={20}
                          className="gb-input"
                          value={manualScores[id]}
                          onChange={(e) =>
                            setManualScores((prev) => ({ ...prev, [id]: Number(e.target.value) }))
                          }
                        />
                      )}
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        {backgroundBonus > 0 && `+${backgroundBonus} background · `}
                        Total {baseScores[id] + totalBonus} ({formatModifier(abilityModifier(baseScores[id] + totalBonus))})
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="gb-card" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: 13, lineHeight: 1.6 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>{name || 'Unnamed'}</div>
                <div style={{ color: 'var(--text-muted)' }}>
                  {race?.name ?? '?'}
                  {lineage ? ` (${lineage.name})` : ''} {cls?.name ?? '?'} 1 · {background?.name ?? '?'}
                  {alignment ? ` · ${alignment}` : ''}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
                <div>
                  <span className="gb-label">AC</span>
                  <div>{10 + abilityModifier(finalScores.dex)}</div>
                </div>
                <div>
                  <span className="gb-label">HP</span>
                  <div>{computeMaxHp(cls ? [{ className: cls.name, level: 1 }] : [], finalScores)}</div>
                </div>
                <div>
                  <span className="gb-label">Speed</span>
                  <div>{race?.speed ?? 30} ft.</div>
                </div>
                <div>
                  <span className="gb-label">Hit Die</span>
                  <div>d{cls?.hitDie ?? '?'}</div>
                </div>
              </div>

              <div>
                <span className="gb-label">Ability Scores</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginTop: 4 }}>
                  {ABILITIES.map(({ id, label }) => (
                    <div key={id} style={{ textAlign: 'center', padding: '6px 0', borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface-raised)' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label.slice(0, 3).toUpperCase()}</div>
                      <div style={{ fontWeight: 600 }}>{finalScores[id]}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatModifier(abilityModifier(finalScores[id]))}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <span className="gb-label">Skills</span>
                <div style={{ color: 'var(--text-secondary)' }}>
                  {[...chosenSkills, ...(background?.skillProficiencies ?? []), ...(humanSkill ? [humanSkill] : [])].join(', ') || 'None'}
                </div>
              </div>

              {(backgroundFeat || humanFeatChoice) && (
                <div>
                  <span className="gb-label">Feats</span>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    {[backgroundFeat?.name, humanFeatChoice ? FEATS.find((f) => f.id === humanFeatChoice.featId)?.name : null]
                      .filter(Boolean)
                      .join(', ')}
                  </div>
                </div>
              )}

              {lineage && (
                <div>
                  <span className="gb-label">Lineage</span>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    {lineage.name} — knows{' '}
                    {[lineage.cantripId, lineage.secondCantripId, lineage.alwaysPreparedSpellId]
                      .filter((id): id is string => !!id)
                      .map((id) => SPELLS.find((s) => s.id === id)?.name ?? id)
                      .join(' and ')}
                  </div>
                </div>
              )}

              <div>
                <span className="gb-label">Appearance</span>
                <div style={{ color: 'var(--text-secondary)' }}>
                  {(['age', 'height', 'weight', 'eyes', 'skin', 'hair'] as const)
                    .map((field) => (appearance[field] ? `${field[0].toUpperCase()}${field.slice(1)}: ${appearance[field]}` : null))
                    .filter(Boolean)
                    .join(' · ') || 'Not set'}
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {step > 0 && (
              <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            )}
            {step < STEP_TITLES.length - 1 ? (
              <Button variant="primary" disabled={!canProceed()} onClick={() => setStep((s) => s + 1)}>
                Next
              </Button>
            ) : (
              <Button variant="primary" disabled={!name.trim()} onClick={handleCreate}>
                Create Character
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

/** A bordered sub-panel with its own small heading — used to visually separate the "extra" choices a race/background can bring (Human's Skillful+Versatile, a lineage pick, a background's ASI/Origin feat) from each other and from the main pick-a-card grid above them, instead of everything running together as one long stack of loosely-grouped controls. */
function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="gb-card" style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div className="gb-label" style={{ fontSize: 12 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function CardGrid({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 'var(--space-2)',
        maxHeight: 340,
        overflowY: 'auto',
        paddingRight: 4
      }}
    >
      {children}
    </div>
  )
}

function PickCard({
  selected,
  onClick,
  children
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: 'var(--space-3)',
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-subtle)'}`,
        background: selected ? 'var(--accent-subtle)' : 'var(--bg-surface-raised)',
        cursor: 'pointer',
        color: 'var(--text-primary)'
      }}
    >
      {children}
    </button>
  )
}

/** A small dice-icon button that fills in a plausible random value for the field next to it — every field on the Name & Details step gets one, since none of them (name, alignment, appearance) have a mechanically "correct" answer to look up. */
function RandomButton({ title, onClick }: { title: string; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        flexShrink: 0,
        width: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-subtle)',
        background: 'transparent',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        fontSize: 14
      }}
    >
      <DiceIcon size={14} />
    </button>
  )
}

function SkillChip({
  label,
  selected,
  onClick,
  title
}: {
  label: string
  selected: boolean
  onClick: () => void
  title?: string
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        padding: '4px 10px',
        borderRadius: 999,
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-subtle)'}`,
        background: selected ? 'var(--accent-subtle)' : 'transparent',
        color: selected ? 'var(--accent-hover)' : 'var(--text-secondary)',
        fontSize: 12,
        cursor: 'pointer'
      }}
    >
      {label}
    </button>
  )
}
