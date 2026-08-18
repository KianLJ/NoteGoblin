import { useState, type ReactNode } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import {
  CLASSES,
  CLASS_RESOURCES,
  ELDRITCH_INVOCATIONS,
  FAVORED_ENEMY_OPTIONS,
  FAVORED_TERRAIN_OPTIONS,
  METAMAGIC_OPTIONS,
  PACT_BOON_OPTIONS,
  SUBCLASS_CHOICE_FEATURE_NAME,
  abilityModifier,
  asiSlotLevelsUpToLevel,
  curatedFeaturesForLevelUp,
  eldritchInvocationSlotCountAtLevel,
  favoredEnemySlotLevelsUpToLevel,
  favoredTerrainSlotLevelsUpToLevel,
  fightingStyleSlotLevelsUpToLevel,
  metamagicSlotCountAtLevel,
  metamagicSlotUnlockLevel,
  subclassFightingStyleSlotLevelsUpToLevel,
  type Ability,
  type AsiSlotChoice,
  type CharacterSheetData,
  type SubclassFeatureChoice
} from '@shared/dnd5e'
import {
  SPELLS,
  buildAsiSlotResolutionPatch,
  circleSpellLevelsUpToLevel,
  effectiveAbilityScores,
  getSpellById,
  groupedSubclassFeaturesForLevelUp,
  spellSlotsForClassLevel,
  subclassesForClass
} from '@shared/compendium'
import { Modal } from '../../ui/Modal'
import { Button } from '../../ui/Button'
import {
  AsiSlotChooser,
  FavoredEnemyChooser,
  FightingStyleChooser,
  NamedOptionChooser,
  SubclassChooser,
  SubclassFeatureOptionChooser
} from './AsiChoosers'
import { CircleSpellsGrant, MagicalSecretsChooser, MYSTIC_ARCANUM_LEVELS } from './characterSheetTabs/FeaturesTab'

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']

interface LevelUpPopupProps {
  character: CharacterSheet
  className: string
  fromLevel: number
  toLevel: number
  onSave: (patch: Partial<CharacterSheetData>) => void
  onClose: () => void
}

/** One page of the level-up slideshow — either a plain readonly recap (an info card) or an interactive chooser. */
interface Slide {
  key: string
  render: () => ReactNode
}

/**
 * A step-by-step recap of the class level(s) you just crossed, plus every
 * choice that grants — one slide at a time, Next/Back between them, instead
 * of dumping every curated feature, resource change, and open chooser into
 * one long scrolling list. The first slide (if there's anything to recap)
 * is a plain read-only summary; every slide after that is exactly one
 * decision — an Ability Score Improvement, a subclass pick, a Fighting
 * Style, Metamagic, whatever the class grants a choice for — reusing the
 * exact same chooser components FeaturesTab.tsx's permanent (never expires)
 * versions use, so resolving one here and resolving it later in Features
 * are the same action through the same onSave calls.
 *
 * Choice slides are computed from the character's *current* state (not a
 * from/to delta) — anything still unresolved for this class shows up,
 * including something left unresolved from an earlier level-up, so this
 * doubles as a "catch up on what you skipped" flow rather than a strictly
 * one-time recap. Resolving a slide updates the character, which shrinks
 * the recomputed slide list by exactly that one entry — the slide index
 * isn't touched, so the next still-open item naturally slides into view
 * without double-advancing. "Next" without resolving explicitly moves past
 * the current slide, and "Back" can return to it since nothing changed.
 */
export function LevelUpPopup({ character, className, fromLevel, toLevel, onSave, onClose }: LevelUpPopupProps): JSX.Element | null {
  const [slideIndex, setSlideIndex] = useState(0)

  const cls = CLASSES.find((c) => c.name.toLowerCase() === className.toLowerCase())
  if (!cls) return null

  const classIndex = character.classes.findIndex((c) => c.className.toLowerCase() === className.toLowerCase())
  const classLevel = classIndex >= 0 ? character.classes[classIndex] : undefined
  const level = classLevel?.level ?? toLevel

  const subclassChoiceFeatureName = SUBCLASS_CHOICE_FEATURE_NAME[cls.id]
  const isDivineSmiteClass = cls.id === 'paladin' && level >= 2
  const isMetamagicClass = cls.id === 'sorcerer'
  const isPactBoonClass = cls.id === 'warlock'
  const isWizardClass = cls.id === 'wizard'
  const isBardClass = cls.id === 'bard'
  const isRangerClass = cls.id === 'ranger'
  const isDruidClass = cls.id === 'druid'

  function resolveAsiSlot(entry: Omit<AsiSlotChoice, 'id'>): void {
    onSave(buildAsiSlotResolutionPatch(character, entry))
  }

  function chooseSubclass(name: string): void {
    if (classIndex < 0) return
    const nextClasses = character.classes.map((c, i) => (i === classIndex ? { ...c, subclass: name } : c))
    onSave({ classes: nextClasses })
  }

  function resolveSubclassFeatureChoice(entry: Omit<SubclassFeatureChoice, 'id'>): void {
    onSave({ subclassFeatureChoices: [...character.subclassFeatureChoices, { id: crypto.randomUUID(), ...entry }] })
  }

  // ---- Recap (informational only, strictly this level-up's delta) ----
  const curated = curatedFeaturesForLevelUp(className, fromLevel, toLevel).filter(
    (f) =>
      f.name !== 'Ability Score Improvement' &&
      f.name !== 'Fighting Style' &&
      f.name !== subclassChoiceFeatureName &&
      !(isDivineSmiteClass && f.name === 'Divine Smite') &&
      !(isMetamagicClass && f.name === 'Metamagic') &&
      !(isPactBoonClass && f.name === 'Pact Boon') &&
      !(isPactBoonClass && f.name === 'Eldritch Invocations') &&
      !(isPactBoonClass && MYSTIC_ARCANUM_LEVELS.some((m) => m.featureName === f.name)) &&
      !(isWizardClass && f.name === 'Spell Mastery') &&
      !(isWizardClass && f.name === 'Signature Spells') &&
      !(isBardClass && f.name === 'Magical Secrets')
  )
  const subclassOptions = subclassesForClass(cls.id)
  const chosenSubclass = classLevel?.subclass ? subclassOptions.find((s) => s.name === classLevel.subclass) : undefined
  const newSubclassFeatures = chosenSubclass
    ? groupedSubclassFeaturesForLevelUp(cls.id, chosenSubclass.id, fromLevel, toLevel).filter((g) => g.kind === 'single')
    : []
  const abilityMod = (a: Ability): number => abilityModifier(character.abilityScores[a])
  const resourceChanges = (CLASS_RESOURCES[cls.id] ?? []).flatMap((def) => {
    if (toLevel < def.minLevel) return []
    const prevMax = fromLevel >= def.minLevel ? def.max(fromLevel, abilityMod) : 0
    const nextMax = def.max(toLevel, abilityMod)
    if (nextMax <= prevMax) return []
    return [{ def, prevMax, nextMax, isNew: fromLevel < def.minLevel }]
  })
  const slotChanges = cls.spellcastingAbility
    ? spellSlotsForClassLevel(cls.id, toLevel)
        .map((count, i) => ({ level: i + 1, count, prevCount: spellSlotsForClassLevel(cls.id, fromLevel)[i] ?? 0 }))
        .filter((s) => s.count > s.prevCount)
    : []

  const hasRecap = curated.length > 0 || newSubclassFeatures.length > 0 || resourceChanges.length > 0 || slotChanges.length > 0

  // ---- Choice slots (cumulative — every currently-unresolved choice for this class, not just newly unlocked ones) ----
  const slides: Slide[] = []

  if (hasRecap) {
    slides.push({
      key: 'recap',
      render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {curated.length > 0 && (
            <div>
              <div className="gb-label">New Class Features</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {curated.map((f) => (
                  <div key={`${f.level}:${f.name}`} className="gb-card" style={{ padding: 'var(--space-3)' }}>
                    <strong>
                      Lv {f.level} — {f.name}
                    </strong>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{f.description}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {newSubclassFeatures.length > 0 && (
            <div>
              <div className="gb-label">New {classLevel?.subclass} Features</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {newSubclassFeatures.map((g) => {
                  if (g.kind !== 'single') return null
                  return (
                    <div key={`${g.feature.level}:${g.feature.name}`} className="gb-card" style={{ padding: 'var(--space-3)', borderColor: 'var(--accent)' }}>
                      <strong>
                        Lv {g.feature.level} — {g.feature.name}
                      </strong>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{g.feature.desc}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {resourceChanges.length > 0 && (
            <div>
              <div className="gb-label">Resources</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {resourceChanges.map(({ def, prevMax, nextMax, isNew }) => (
                  <div key={def.id} className="gb-card" style={{ padding: 'var(--space-3)' }}>
                    <strong>{def.name}</strong>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {isNew ? `New — ${nextMax} ${def.kind === 'uses' ? 'uses' : 'points'}` : `${prevMax} → ${nextMax} ${def.kind === 'uses' ? 'uses' : 'points'}`}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{def.description}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {slotChanges.length > 0 && (
            <div>
              <div className="gb-label">Spell Slots</div>
              <div className="gb-card" style={{ padding: 'var(--space-3)', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {slotChanges.map((s) => (
                  <div key={s.level} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{ORDINALS[s.level - 1]}:</strong> {s.prevCount} → {s.count}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )
    })
  }

  // Subclass pick
  if (level >= cls.subclassLevel && !classLevel?.subclass && subclassOptions.length > 0) {
    slides.push({
      key: 'subclass',
      render: () => (
        <SubclassChooser
          classLabel={className}
          featureName={subclassChoiceFeatureName ?? 'Subclass'}
          slotLevel={cls.subclassLevel}
          options={subclassOptions}
          onChoose={chooseSubclass}
        />
      )
    })
  }

  // Fighting Style (base + Champion's Additional Fighting Style)
  const chosenFightingStyleFeatIds = character.asiSlotChoices
    .filter((s) => s.className.toLowerCase() === className.toLowerCase() && s.kind === 'feat' && s.featId)
    .map((s) => s.featId!)
  const unresolvedFightingStyleLevels = fightingStyleSlotLevelsUpToLevel(className, level).filter(
    (lvl) => !character.asiSlotChoices.some((s) => s.level === lvl && s.className.toLowerCase() === className.toLowerCase())
  )
  for (const lvl of unresolvedFightingStyleLevels) {
    slides.push({
      key: `fs:${lvl}`,
      render: () => <FightingStyleChooser classLabel={className} level={lvl} onResolve={resolveAsiSlot} />
    })
  }
  const unresolvedAdditionalFightingStyleLevels = subclassFightingStyleSlotLevelsUpToLevel(cls.id, chosenSubclass?.id, level).filter(
    (lvl) => !character.asiSlotChoices.some((s) => s.level === lvl && s.className.toLowerCase() === className.toLowerCase())
  )
  for (const lvl of unresolvedAdditionalFightingStyleLevels) {
    slides.push({
      key: `fs-additional:${lvl}`,
      render: () => <FightingStyleChooser classLabel={className} level={lvl} excludeFeatIds={chosenFightingStyleFeatIds} onResolve={resolveAsiSlot} />
    })
  }

  // Favored Enemy / Natural Explorer (Ranger only)
  if (isRangerClass) {
    const resolvedFavoredEnemies = character.subclassFeatureChoices.filter(
      (c) => c.featureName === 'Favored Enemy' && c.className.toLowerCase() === className.toLowerCase()
    )
    const unresolvedFavoredEnemySlots = favoredEnemySlotLevelsUpToLevel(level).slice(resolvedFavoredEnemies.length)
    for (const lvl of unresolvedFavoredEnemySlots) {
      slides.push({
        key: `favored-enemy:${lvl}`,
        render: () => (
          <FavoredEnemyChooser
            classLabel={className}
            level={lvl}
            options={FAVORED_ENEMY_OPTIONS}
            excludeNames={resolvedFavoredEnemies.map((c) => c.chosenName)}
            onChoose={(chosenName) => resolveSubclassFeatureChoice({ className, level: lvl, featureName: 'Favored Enemy', chosenName })}
          />
        )
      })
    }
    const resolvedFavoredTerrains = character.subclassFeatureChoices.filter(
      (c) => c.featureName === 'Favored Terrain' && c.className.toLowerCase() === className.toLowerCase()
    )
    const unresolvedFavoredTerrainSlots = favoredTerrainSlotLevelsUpToLevel(level).slice(resolvedFavoredTerrains.length)
    for (const lvl of unresolvedFavoredTerrainSlots) {
      slides.push({
        key: `favored-terrain:${lvl}`,
        render: () => (
          <NamedOptionChooser
            classLabel={className}
            level={lvl}
            featureName="Favored Terrain"
            options={FAVORED_TERRAIN_OPTIONS}
            excludeNames={resolvedFavoredTerrains.map((c) => c.chosenName)}
            onChoose={(chosenName) => resolveSubclassFeatureChoice({ className, level: lvl, featureName: 'Favored Terrain', chosenName })}
          />
        )
      })
    }
  }

  // Generic subclass-feature choice groups (Dragon Ancestor, Circle of the Land's terrain, a Ranger archetype's sub-features, ...)
  const unresolvedSubclassChoiceGroups = chosenSubclass
    ? groupedSubclassFeaturesForLevelUp(cls.id, chosenSubclass.id, 0, level).filter(
        (g): g is Extract<typeof g, { kind: 'choice' }> =>
          g.kind === 'choice' &&
          !character.subclassFeatureChoices.some(
            (c) => c.level === g.level && c.className.toLowerCase() === className.toLowerCase() && c.featureName === g.baseName
          )
      )
    : []
  for (const g of unresolvedSubclassChoiceGroups) {
    slides.push({
      key: `scc:${g.level}:${g.baseName}`,
      render: () => (
        <SubclassFeatureOptionChooser
          classLabel={className}
          subclassLabel={classLevel?.subclass ?? ''}
          level={g.level}
          baseName={g.baseName}
          intro={g.intro}
          options={g.options}
          onChoose={(chosenName) => resolveSubclassFeatureChoice({ className, level: g.level, featureName: g.baseName, chosenName })}
        />
      )
    })
  }

  // Circle of the Land's circle spells (Druid)
  if (isDruidClass) {
    const circleTerrainChoice = character.subclassFeatureChoices.find(
      (c) => c.featureName === 'Circle of the Land' && c.className.toLowerCase() === className.toLowerCase()
    )
    const circleTerrain = circleTerrainChoice?.chosenName.split(':')[1]?.trim()
    const grantedCircleSpellLevels = character.subclassFeatureChoices
      .filter((c) => c.featureName === 'Circle Spells' && c.className.toLowerCase() === className.toLowerCase())
      .map((c) => c.level)
    const ungrantedCircleSpellLevels = circleTerrain
      ? circleSpellLevelsUpToLevel(circleTerrain, level).filter((entry) => !grantedCircleSpellLevels.includes(entry.level))
      : []
    for (const { level: lvl, spellIds } of ungrantedCircleSpellLevels) {
      slides.push({
        key: `circle-spells:${lvl}`,
        render: () => (
          <CircleSpellsGrant
            classLabel={className}
            terrain={circleTerrain ?? ''}
            level={lvl}
            spellIds={spellIds}
            onGrant={() => {
              const known = new Set(character.spells.map((s) => s.compendiumId).filter(Boolean))
              const granted = spellIds
                .filter((id) => !known.has(id))
                .map((id) => getSpellById(id))
                .filter((s): s is NonNullable<typeof s> => !!s)
                .map((s) => ({ id: crypto.randomUUID(), name: s.name, level: s.level, description: '', actionType: 'action' as const, compendiumId: s.id, free: true }))
              const names = spellIds.map((id) => getSpellById(id)?.name).filter((n): n is string => !!n)
              onSave({
                spells: [...character.spells, ...granted],
                subclassFeatureChoices: [
                  ...character.subclassFeatureChoices,
                  { id: crypto.randomUUID(), className, level: lvl, featureName: 'Circle Spells', chosenName: names.join(', ') }
                ]
              })
            }}
          />
        )
      })
    }
  }

  // Ability Score Improvement
  const unresolvedAsiLevels = asiSlotLevelsUpToLevel(className, level).filter(
    (lvl) => !character.asiSlotChoices.some((s) => s.level === lvl && s.className.toLowerCase() === className.toLowerCase())
  )
  for (const lvl of unresolvedAsiLevels) {
    slides.push({
      key: `asi:${lvl}`,
      render: () => (
        <AsiSlotChooser
          classLabel={className}
          level={lvl}
          abilityScores={effectiveAbilityScores(character.abilityScores, character.classes, character.asiSlotChoices)}
          onResolve={resolveAsiSlot}
        />
      )
    })
  }

  // Sorcerer Metamagic
  if (isMetamagicClass) {
    const resolvedMetamagic = character.subclassFeatureChoices.filter(
      (c) => c.featureName === 'Metamagic' && c.className.toLowerCase() === className.toLowerCase()
    )
    const unresolvedMetamagicCount = Math.max(0, metamagicSlotCountAtLevel(level) - resolvedMetamagic.length)
    for (let i = 0; i < unresolvedMetamagicCount; i++) {
      const pickIndex = resolvedMetamagic.length + i
      slides.push({
        key: `metamagic:${pickIndex}`,
        render: () => (
          <NamedOptionChooser
            classLabel={className}
            level={metamagicSlotUnlockLevel(pickIndex)}
            featureName="Metamagic"
            options={METAMAGIC_OPTIONS}
            excludeNames={resolvedMetamagic.map((c) => c.chosenName)}
            onChoose={(chosenName) =>
              resolveSubclassFeatureChoice({ className, level: metamagicSlotUnlockLevel(pickIndex), featureName: 'Metamagic', chosenName })
            }
          />
        )
      })
    }
  }

  // Warlock Pact Boon / Eldritch Invocations / Mystic Arcanum
  if (isPactBoonClass) {
    const resolvedPactBoon = character.subclassFeatureChoices.find(
      (c) => c.featureName === 'Pact Boon' && c.className.toLowerCase() === className.toLowerCase()
    )
    if (level >= 3 && !resolvedPactBoon) {
      slides.push({
        key: 'pact-boon',
        render: () => (
          <NamedOptionChooser
            classLabel={className}
            level={3}
            featureName="Pact Boon"
            options={PACT_BOON_OPTIONS}
            excludeNames={[]}
            onChoose={(chosenName) => resolveSubclassFeatureChoice({ className, level: 3, featureName: 'Pact Boon', chosenName })}
          />
        )
      })
    }
    const resolvedInvocations = character.subclassFeatureChoices.filter(
      (c) => c.featureName === 'Eldritch Invocation' && c.className.toLowerCase() === className.toLowerCase()
    )
    const knownSpellIds = new Set(character.spells.map((s) => s.compendiumId).filter((id): id is string => !!id))
    const availableInvocations = ELDRITCH_INVOCATIONS.filter(
      (o) =>
        o.level <= level &&
        (!o.prereqPact || o.prereqPact === resolvedPactBoon?.chosenName) &&
        (!o.prereqSpell || knownSpellIds.has(o.prereqSpell)) &&
        !resolvedInvocations.some((r) => r.chosenName === o.name)
    )
    const unresolvedInvocationCount = Math.max(0, Math.min(eldritchInvocationSlotCountAtLevel(level) - resolvedInvocations.length, availableInvocations.length))
    for (let i = 0; i < unresolvedInvocationCount; i++) {
      slides.push({
        key: `invocation:${resolvedInvocations.length + i}`,
        render: () => (
          <NamedOptionChooser
            classLabel={className}
            level={level}
            featureName="Eldritch Invocation"
            options={availableInvocations}
            excludeNames={[]}
            onChoose={(chosenName) => resolveSubclassFeatureChoice({ className, level, featureName: 'Eldritch Invocation', chosenName })}
          />
        )
      })
    }
    const unresolvedMysticArcana = MYSTIC_ARCANUM_LEVELS.filter(
      (m) =>
        level >= m.charLevel &&
        !character.subclassFeatureChoices.some((c) => c.featureName === m.featureName && c.className.toLowerCase() === className.toLowerCase())
    )
    for (const m of unresolvedMysticArcana) {
      slides.push({
        key: m.featureName,
        render: () => (
          <NamedOptionChooser
            classLabel={className}
            level={m.charLevel}
            featureName={m.featureName}
            options={SPELLS.filter((s) => s.level === m.spellLevel && s.classes.some((c) => c.toLowerCase() === className.toLowerCase())).map((s) => ({
              name: s.name,
              description: s.description
            }))}
            excludeNames={[]}
            onChoose={(chosenName) => resolveSubclassFeatureChoice({ className, level: m.charLevel, featureName: m.featureName, chosenName })}
          />
        )
      })
    }
  }

  // Wizard Spell Mastery / Signature Spells (pick from the wizard's own known spells)
  if (isWizardClass) {
    const knownSpellsByLevel = (lvl: number): { name: string; description: string }[] =>
      character.spells.filter((s) => s.level === lvl).map((s) => ({ name: s.name, description: s.description }))
    const resolvedSpellMastery = character.subclassFeatureChoices.filter(
      (c) => c.featureName === 'Spell Mastery' && c.className.toLowerCase() === className.toLowerCase()
    )
    if (level >= 18) {
      const spellMasteryUnresolvedLevels = [1, 2].filter((lvl) => !resolvedSpellMastery.some((c) => knownSpellsByLevel(lvl).some((s) => s.name === c.chosenName)))
      for (const lvl of spellMasteryUnresolvedLevels) {
        slides.push({
          key: `spell-mastery:${lvl}`,
          render: () => (
            <NamedOptionChooser
              classLabel={className}
              level={18}
              featureName={`Spell Mastery (${lvl === 1 ? '1st' : '2nd'}-level spell)`}
              options={knownSpellsByLevel(lvl)}
              excludeNames={[]}
              onChoose={(chosenName) => resolveSubclassFeatureChoice({ className, level: 18, featureName: 'Spell Mastery', chosenName })}
            />
          )
        })
      }
    }
    const resolvedSignatureSpells = character.subclassFeatureChoices.filter(
      (c) => c.featureName === 'Signature Spells' && c.className.toLowerCase() === className.toLowerCase()
    )
    if (level >= 20) {
      const unresolvedSignatureSpellsCount = Math.max(0, 2 - resolvedSignatureSpells.length)
      for (let i = 0; i < unresolvedSignatureSpellsCount; i++) {
        slides.push({
          key: `signature-spell:${resolvedSignatureSpells.length + i}`,
          render: () => (
            <NamedOptionChooser
              classLabel={className}
              level={20}
              featureName="Signature Spells"
              options={knownSpellsByLevel(3).filter((s) => !resolvedSignatureSpells.some((r) => r.chosenName === s.name))}
              excludeNames={[]}
              onChoose={(chosenName) => resolveSubclassFeatureChoice({ className, level: 20, featureName: 'Signature Spells', chosenName })}
            />
          )
        })
      }
    }
  }

  // Bard Magical Secrets
  if (isBardClass) {
    const resolvedMagicalSecrets = character.subclassFeatureChoices.filter(
      (c) => c.featureName === 'Magical Secrets' && c.className.toLowerCase() === className.toLowerCase()
    )
    const magicalSecretsSlotLevels = [...(level >= 14 ? [14, 14] : []), ...(level >= 18 ? [18, 18] : [])]
    const unresolvedMagicalSecretsLevels = magicalSecretsSlotLevels.slice(resolvedMagicalSecrets.length)
    const bardMaxSpellLevel = spellSlotsForClassLevel(cls.id, level).reduce((max, count, i) => (count > 0 ? i + 1 : max), 0)
    unresolvedMagicalSecretsLevels.forEach((lvl, i) => {
      slides.push({
        key: `magical-secrets:${resolvedMagicalSecrets.length + i}`,
        render: () => (
          <MagicalSecretsChooser
            classLabel={className}
            level={lvl}
            maxSpellLevel={bardMaxSpellLevel}
            excludeSpellNames={resolvedMagicalSecrets.map((c) => c.chosenName)}
            onChoose={(spellId) => {
              const spell = getSpellById(spellId)
              if (!spell) return
              onSave({
                spells: [
                  ...character.spells,
                  { id: crypto.randomUUID(), name: spell.name, level: spell.level, description: '', actionType: 'action', compendiumId: spell.id, free: true }
                ],
                subclassFeatureChoices: [
                  ...character.subclassFeatureChoices,
                  { id: crypto.randomUUID(), className, level: lvl, featureName: 'Magical Secrets', chosenName: spell.name }
                ]
              })
            }}
          />
        )
      })
    })
  }

  const clampedIndex = Math.min(slideIndex, Math.max(0, slides.length - 1))
  const current = slides[clampedIndex]
  const isLast = clampedIndex >= slides.length - 1

  return (
    <Modal onClose={onClose} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 20 }}>Level Up!</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            {className}: {fromLevel} → {toLevel}
            {slides.length > 1 && ` · Step ${clampedIndex + 1} of ${slides.length}`}
          </p>
        </div>

        {current ? (
          current.render()
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Nothing new at this level for {className.toLowerCase()} — check the Class Table tab for the full progression.
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button variant="secondary" onClick={() => setSlideIndex((i) => Math.max(0, i - 1))} disabled={clampedIndex === 0}>
            Back
          </Button>
          {isLast || !current ? (
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setSlideIndex((i) => i + 1)}>
              Next
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
