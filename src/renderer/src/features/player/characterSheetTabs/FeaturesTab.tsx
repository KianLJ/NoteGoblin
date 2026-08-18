import { useState, type CSSProperties } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import {
  CLASSES,
  ELDRITCH_INVOCATIONS,
  FAVORED_ENEMY_OPTIONS,
  FAVORED_TERRAIN_OPTIONS,
  METAMAGIC_OPTIONS,
  PACT_BOON_OPTIONS,
  RACES,
  RACE_TRAIT_DESCRIPTIONS,
  SUBCLASS_CHOICE_FEATURE_NAME,
  activeFeatIds,
  asiSlotLevelsUpToLevel,
  curatedFeaturesForLevelUp,
  eldritchInvocationSlotCountAtLevel,
  favoredEnemySlotLevelsUpToLevel,
  favoredTerrainSlotLevelsUpToLevel,
  fightingStyleSlotLevelsUpToLevel,
  metamagicSlotCountAtLevel,
  metamagicSlotUnlockLevel,
  resourcesForCharacter,
  sneakAttackDice,
  subclassFightingStyleSlotLevelsUpToLevel,
  type AsiSlotChoice,
  type CharacterSheetData,
  type ClassLevel,
  type Feature,
  type Spell,
  type SubclassFeatureChoice
} from '@shared/dnd5e'
import {
  FEATS,
  SPELLS,
  circleSpellLevelsUpToLevel,
  effectiveAbilityScores,
  getSpellById,
  groupedSubclassFeaturesForLevelUp,
  isActivatableResource,
  spellSlotsForClasses,
  subclassesForClass,
  type FeatEffect,
  type SubclassFeatureOption
} from '@shared/compendium'
import { Button } from '../../../ui/Button'
import { HoverDetailCard } from '../HoverDetailCard'
import { useAutosaveDraft } from '../useAutosaveDraft'
import { AsiSlotChooser, FightingStyleChooser, NamedOptionChooser, SubclassChooser } from '../AsiChoosers'

/** Warlock Mystic Arcanum — one specific spell of each level, chosen once each at 11th/13th/15th/17th, castable once per long rest without a slot. featureName matches the curated CLASS_LEVEL_FEATURES entry exactly, so resolving one both marks that row done and drives the chip/chooser below. */
const MYSTIC_ARCANUM_LEVELS = [
  { charLevel: 11, spellLevel: 6, featureName: 'Mystic Arcanum (6th level)' },
  { charLevel: 13, spellLevel: 7, featureName: 'Mystic Arcanum (7th level)' },
  { charLevel: 15, spellLevel: 8, featureName: 'Mystic Arcanum (8th level)' },
  { charLevel: 17, spellLevel: 9, featureName: 'Mystic Arcanum (9th level)' }
]

interface ResourcesDraft {
  resourceUsed: Record<string, number>
}

interface FeaturesDraft {
  features: Feature[]
}

interface FeaturesTabProps {
  character: CharacterSheet
  onSave: (patch: Partial<CharacterSheetData>) => void
  readOnly?: boolean
}

function effectLabel(effect: FeatEffect): string {
  switch (effect.kind) {
    case 'abilityScore':
      return `+${effect.amount} ${effect.ability.toUpperCase()}`
    case 'abilityScoreChoice':
      return `+${effect.amount} ${effect.options.map((a) => a.toUpperCase()).join('/')} (chosen)`
    case 'skillProficiency':
      return `Proficient: ${effect.skill}`
    case 'savingThrowProficiency':
      return `Proficient save: ${effect.ability.toUpperCase()}`
    case 'speed':
      return `${effect.amount >= 0 ? '+' : ''}${effect.amount} ft. speed`
    case 'note':
      return ''
    case 'skillAdvantage':
      return `Advantage: ${effect.skill}`
    case 'skillDisadvantage':
      return `Disadvantage: ${effect.skill}`
    case 'abilityCheckAdvantage':
      return `Advantage: ${effect.ability.toUpperCase()} checks`
    case 'abilityCheckDisadvantage':
      return `Disadvantage: ${effect.ability.toUpperCase()} checks`
    case 'savingThrowAdvantage':
      return `Advantage: ${effect.ability.toUpperCase()} saves`
    case 'savingThrowDisadvantage':
      return `Disadvantage: ${effect.ability.toUpperCase()} saves`
    case 'attackAdvantage':
      return 'Advantage: attack rolls'
    case 'attackDisadvantage':
      return 'Disadvantage: attack rolls'
    case 'initiativeAdvantage':
      return 'Advantage: Initiative'
    case 'initiativeDisadvantage':
      return 'Disadvantage: Initiative'
    case 'armorClass':
      return `${effect.amount >= 0 ? '+' : ''}${effect.amount} AC`
    case 'spellChoice':
      return `${effect.cantripCount} cantrips + ${effect.spellCount} level-${effect.spellLevel} spell (${effect.classes.join('/')})`
  }
}

/** A compact, always-hoverable chip — the one visual language every card in this tab shares, whether it's a class resource's name, a racial trait, a curated class feature, a feat, or a resolved ASI slot. Hovering shows the full text; the chip itself never does. */
function InfoChip({
  title,
  subtitle,
  description,
  fields,
  accent,
  onRemove
}: {
  title: string
  subtitle?: string
  description: string
  fields?: { label: string; value: string }[]
  accent?: boolean
  onRemove?: () => void
}): JSX.Element {
  return (
    <HoverDetailCard title={title} subtitle={subtitle} fields={fields ?? []} description={description}>
      <div
        className="gb-card"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderColor: accent ? 'var(--accent)' : undefined,
          cursor: 'default'
        }}
      >
        <strong style={{ color: accent ? 'var(--accent-hover)' : 'var(--text-primary)', fontSize: 13 }}>{title}</strong>
        {onRemove && (
          <button type="button" onClick={onRemove} style={removeBtnStyle} title="Remove">
            ×
          </button>
        )}
      </div>
    </HoverDetailCard>
  )
}

/**
 * Everything you can *do* with your character beyond attacking or casting —
 * class resources, racial traits, class/subclass features, Ability Score
 * Improvements, and feats — as hoverable cards, all derived live from
 * race/class/level every render. Nothing here needs an "add to sheet" step:
 * raising a class's level in Overview is enough for its features to show up
 * on their own, and lowering it makes them disappear the same way, since
 * they're computed from the current level, not stored as accepted history.
 *
 * The one thing that genuinely needs a decision — an Ability Score
 * Improvement slot (pick a flat bump or a feat instead) or a subclass pick
 * — renders as an interactive card with the choice inline, right where the
 * slot appears; once resolved, the choice itself is a compact hover chip
 * like everything else. Choices are stored in `asiSlotChoices` tagged with
 * (className, level), so they're only ever "active" while the class is
 * still at or above that level — see activeAsiSlotChoices in
 * shared/dnd5e.ts. Only a small "Custom Notes" section at the bottom stays
 * fully freeform/manual, for anything outside this automatic system.
 */
export function FeaturesTab({ character, onSave, readOnly }: FeaturesTabProps): JSX.Element {
  const [resourceDraft, setResourceDraft] = useAutosaveDraft<ResourcesDraft>(
    { resourceUsed: character.resourceUsed },
    onSave,
    readOnly
  )
  const [featureDraft, setFeatureDraft] = useAutosaveDraft<FeaturesDraft>({ features: character.features }, onSave, readOnly)

  const effScores = effectiveAbilityScores(character.abilityScores, character.classes, character.asiSlotChoices)
  const resources = resourcesForCharacter(character.classes, effScores)
  const activeFeats = activeFeatIds(character.classes, character.asiSlotChoices)
  const feats = activeFeats.map((id) => FEATS.find((f) => f.id === id)).filter((f): f is NonNullable<typeof f> => !!f)
  const race = RACES.find((r) => r.name.toLowerCase() === character.race.trim().toLowerCase())

  function setUsed(id: string, used: number, max: number): void {
    setResourceDraft((prev) => ({ resourceUsed: { ...prev.resourceUsed, [id]: Math.max(0, Math.min(used, max)) } }))
  }

  /** Activating spends a use, same as any other use of this resource (so Rage's uses tracker and its "active" state never drift apart) — deactivating never refunds it, matching how raging doesn't give the use back when it ends. */
  function toggleBuff(resourceId: string, kind: 'uses' | 'pool', currentUsed: number, max: number): void {
    if (readOnly) return
    const active = character.activeBuffs.includes(resourceId)
    if (active) {
      onSave({ activeBuffs: character.activeBuffs.filter((id) => id !== resourceId) })
      return
    }
    if (kind === 'uses' && currentUsed >= max) return
    if (kind === 'uses') setUsed(resourceId, currentUsed + 1, max)
    onSave({ activeBuffs: [...character.activeBuffs, resourceId] })
  }

  function updateFeature(id: string, fields: Partial<Feature>): void {
    setFeatureDraft((prev) => ({ features: prev.features.map((f) => (f.id === id ? { ...f, ...fields } : f)) }))
  }

  /**
   * A feat with a `spellChoice` effect (Magic Initiate) resolves through
   * this same ASI/feat flow (see AsiSlotChooser), but needs two extra
   * side effects beyond just recording the choice: the picked spells
   * become real, castable entries on character.spells (marked `free` so
   * they don't eat into the class's normal known/prepared cap), and if the
   * character had no spellcasting ability at all yet (a non-caster taking
   * the feat), this is what turns that on automatically instead of making
   * them separately hit the "+ Enable Spellcasting" button.
   */
  function resolveAsiSlot(entry: Omit<AsiSlotChoice, 'id'>): void {
    const patch: Partial<CharacterSheetData> = { asiSlotChoices: [...character.asiSlotChoices, { id: crypto.randomUUID(), ...entry }] }
    if (entry.kind === 'feat' && entry.chosenSpellIds?.length) {
      const known = new Set(character.spells.map((s) => s.compendiumId).filter(Boolean))
      const granted: Spell[] = entry.chosenSpellIds
        .filter((id) => !known.has(id))
        .map((id) => getSpellById(id))
        .filter((s): s is NonNullable<typeof s> => !!s)
        .map((s) => ({ id: crypto.randomUUID(), name: s.name, level: s.level, description: '', actionType: 'action', compendiumId: s.id, free: true }))
      patch.spells = [...character.spells, ...granted]
      if (!character.spellcastingAbility && entry.chosenAbility) patch.spellcastingAbility = entry.chosenAbility
    }
    onSave(patch)
  }

  function removeAsiSlot(id: string): void {
    onSave({ asiSlotChoices: character.asiSlotChoices.filter((s) => s.id !== id) })
  }

  function chooseSubclass(classIndex: number, subclassName: string): void {
    const nextClasses = character.classes.map((c, i) => (i === classIndex ? { ...c, subclass: subclassName } : c))
    onSave({ classes: nextClasses })
  }

  function resolveSubclassFeatureChoice(entry: Omit<SubclassFeatureChoice, 'id'>): void {
    onSave({ subclassFeatureChoices: [...character.subclassFeatureChoices, { id: crypto.randomUUID(), ...entry }] })
  }

  function removeSubclassFeatureChoice(id: string): void {
    onSave({ subclassFeatureChoices: character.subclassFeatureChoices.filter((c) => c.id !== id) })
  }

  const hasAnyContent =
    resources.length > 0 ||
    feats.length > 0 ||
    (race?.traits.length ?? 0) > 0 ||
    character.classes.length > 0 ||
    featureDraft.features.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {resources.length > 0 && (
        <div>
          <div className="gb-label" style={{ margin: '0 0 4px' }}>
            Class Resources
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
            {resources.map((r) => {
              const used = Math.min(resourceDraft.resourceUsed[r.id] ?? 0, r.currentMax)
              const remaining = r.currentMax - used
              const activatable = isActivatableResource(r.id)
              const active = character.activeBuffs.includes(r.id)
              return (
                <div key={r.id} className="gb-card" style={{ padding: 'var(--space-3)', borderColor: active ? 'var(--accent)' : undefined }}>
                  <HoverDetailCard title={r.name} subtitle={r.className} fields={[]} description={r.fullDescription}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, cursor: 'default' }}>
                      <strong style={{ flex: 1 }}>{r.name}</strong>
                      {active && (
                        <span className="gb-badge gb-badge--accent" style={{ fontSize: 10 }}>
                          Active
                        </span>
                      )}
                      <span className="gb-badge" style={{ fontSize: 10 }}>
                        {r.className}
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px' }}>{r.description}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em', margin: '0 0 var(--space-2)' }}>
                      Recharges: {r.currentRecharge === 'short' ? 'Short or Long Rest' : 'Long Rest'}
                    </p>

                    {r.kind === 'uses' ? (
                      <UsesTracker
                        max={r.currentMax}
                        used={used}
                        remaining={remaining}
                        readOnly={readOnly}
                        onSetUsed={(n) => setUsed(r.id, n, r.currentMax)}
                      />
                    ) : (
                      <PoolTracker
                        max={r.currentMax}
                        used={used}
                        remaining={remaining}
                        readOnly={readOnly}
                        onSetUsed={(n) => setUsed(r.id, n, r.currentMax)}
                      />
                    )}

                    {activatable && (
                      <Button
                        variant={active ? 'secondary' : 'primary'}
                        onClick={() => toggleBuff(r.id, r.kind, used, r.currentMax)}
                        disabled={readOnly || (!active && r.kind === 'uses' && remaining <= 0)}
                        style={{ width: '100%', marginTop: 6, fontSize: 12, padding: '4px 10px' }}
                        title={active ? `End ${r.name} — its bonuses stop applying immediately` : `Activate ${r.name} — applies its bonuses across the sheet until you end it`}
                      >
                        {active ? `End ${r.name}` : `Activate ${r.name}`}
                      </Button>
                    )}
                  </HoverDetailCard>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {race && race.traits.length > 0 && (
        <div>
          <div className="gb-label">Racial Traits — {race.name}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {race.traits.map((trait) => (
              <InfoChip key={trait} title={trait} subtitle={race.name} description={RACE_TRAIT_DESCRIPTIONS[trait] ?? 'No description available.'} />
            ))}
          </div>
        </div>
      )}

      {character.classes.map((classLevel, index) => (
        <ClassFeatureSection
          key={index}
          classLevel={classLevel}
          classIndex={index}
          character={character}
          onSave={onSave}
          readOnly={readOnly}
          onResolveAsi={resolveAsiSlot}
          onChooseSubclass={chooseSubclass}
          onResolveSubclassFeatureChoice={resolveSubclassFeatureChoice}
          onRemoveSubclassFeatureChoice={removeSubclassFeatureChoice}
        />
      ))}

      {feats.length > 0 && (
        <div>
          <div className="gb-label">Feats</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {feats.map((feat) => {
              const badges = (feat.effects ?? []).filter((e) => e.kind !== 'note')
              const fields = badges.map((e) => ({ label: 'Effect', value: effectLabel(e) }))
              if (feat.prerequisite) fields.unshift({ label: 'Prerequisite', value: feat.prerequisite })
              const slot = character.asiSlotChoices.find((s) => s.kind === 'feat' && s.featId === feat.id)
              return (
                <InfoChip
                  key={feat.id}
                  title={feat.name}
                  subtitle={feat.category}
                  fields={fields}
                  description={feat.desc}
                  accent
                  onRemove={!readOnly && slot ? () => removeAsiSlot(slot.id) : undefined}
                />
              )
            })}
          </div>
        </div>
      )}

      <div>
        <div className="gb-label">Custom Notes</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {featureDraft.features.map((feature) => (
            <div key={feature.id} className="gb-card" style={{ padding: 'var(--space-2)' }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                <input
                  className="gb-input"
                  style={{ flex: 2 }}
                  placeholder="Name"
                  value={feature.name}
                  onChange={(e) => updateFeature(feature.id, { name: e.target.value })}
                />
                <input
                  className="gb-input"
                  style={{ flex: 1 }}
                  placeholder="Source"
                  value={feature.source}
                  onChange={(e) => updateFeature(feature.id, { source: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setFeatureDraft((prev) => ({ features: prev.features.filter((f) => f.id !== feature.id) }))}
                  style={removeBtnStyle}
                >
                  ×
                </button>
              </div>
              <textarea
                className="gb-input"
                style={{ minHeight: 44, resize: 'vertical' }}
                placeholder="Description"
                value={feature.description}
                onChange={(e) => updateFeature(feature.id, { description: e.target.value })}
              />
            </div>
          ))}
          {featureDraft.features.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              {hasAnyContent
                ? 'Anything outside the automatic system above — DM-granted boons, reflavored abilities, homebrew — goes here.'
                : 'Nothing here yet — set a race and class in Overview to see racial traits, class features, and Ability Score Improvements show up automatically.'}
            </p>
          )}
          <button
            type="button"
            className="gb-btn gb-btn--secondary"
            style={{ alignSelf: 'flex-start' }}
            onClick={() =>
              setFeatureDraft((prev) => ({
                features: [...prev.features, { id: crypto.randomUUID(), name: '', source: '', description: '' }]
              }))
            }
          >
            + Add Note
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Everything one class contributes — its curated feature table (minus the
 * ASI/subclass-choice rows, handled specially below), its subclass pick
 * (inline chooser once unresolved, else a compact card), its subclass's own
 * feature table once chosen (grouped so a feature the SRD writes as several
 * named options, like Draconic Bloodline's dragon ancestor, becomes one
 * inline chooser instead of showing every option as if the character had
 * them all), and every unresolved ASI slot up to the class's current level.
 * A *resolved* ASI slot isn't shown here at all — see the ability score
 * hover card in Overview instead, which is where that bump now shows up.
 */
function ClassFeatureSection({
  classLevel,
  classIndex,
  character,
  onSave,
  readOnly,
  onResolveAsi,
  onChooseSubclass,
  onResolveSubclassFeatureChoice,
  onRemoveSubclassFeatureChoice
}: {
  classLevel: ClassLevel
  classIndex: number
  character: CharacterSheet
  onSave: (patch: Partial<CharacterSheetData>) => void
  readOnly?: boolean
  onResolveAsi: (entry: Omit<AsiSlotChoice, 'id'>) => void
  onChooseSubclass: (classIndex: number, subclassName: string) => void
  onResolveSubclassFeatureChoice: (entry: Omit<SubclassFeatureChoice, 'id'>) => void
  onRemoveSubclassFeatureChoice: (id: string) => void
}): JSX.Element | null {
  const cls = CLASSES.find((c) => c.name.toLowerCase() === classLevel.className.trim().toLowerCase())
  if (!cls || !classLevel.className.trim()) return null

  const subclassChoiceFeatureName = SUBCLASS_CHOICE_FEATURE_NAME[cls.id]
  const isDivineSmiteClass = cls.id === 'paladin' && classLevel.level >= 2
  const isMetamagicClass = cls.id === 'sorcerer'
  const isPactBoonClass = cls.id === 'warlock'
  const isWizardClass = cls.id === 'wizard'
  const curated = curatedFeaturesForLevelUp(classLevel.className, 0, classLevel.level).filter(
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
      !(isWizardClass && f.name === 'Signature Spells')
  )
  const resolvedMetamagic = isMetamagicClass
    ? character.subclassFeatureChoices.filter((c) => c.featureName === 'Metamagic' && c.className.toLowerCase() === classLevel.className.toLowerCase())
    : []
  const unresolvedMetamagicCount = isMetamagicClass ? Math.max(0, metamagicSlotCountAtLevel(classLevel.level) - resolvedMetamagic.length) : 0
  const resolvedPactBoon = isPactBoonClass
    ? character.subclassFeatureChoices.find((c) => c.featureName === 'Pact Boon' && c.className.toLowerCase() === classLevel.className.toLowerCase())
    : undefined
  const pactBoonUnresolved = isPactBoonClass && classLevel.level >= 3 && !resolvedPactBoon
  const resolvedInvocations = isPactBoonClass
    ? character.subclassFeatureChoices.filter(
        (c) => c.featureName === 'Eldritch Invocation' && c.className.toLowerCase() === classLevel.className.toLowerCase()
      )
    : []
  const knownSpellIds = new Set(character.spells.map((s) => s.compendiumId).filter((id): id is string => !!id))
  const availableInvocations = isPactBoonClass
    ? ELDRITCH_INVOCATIONS.filter(
        (o) =>
          o.level <= classLevel.level &&
          (!o.prereqPact || o.prereqPact === resolvedPactBoon?.chosenName) &&
          (!o.prereqSpell || knownSpellIds.has(o.prereqSpell)) &&
          !resolvedInvocations.some((r) => r.chosenName === o.name)
      )
    : []
  const unresolvedInvocationCount = isPactBoonClass
    ? Math.max(0, Math.min(eldritchInvocationSlotCountAtLevel(classLevel.level) - resolvedInvocations.length, availableInvocations.length))
    : 0
  const unresolvedMysticArcana = isPactBoonClass
    ? MYSTIC_ARCANUM_LEVELS.filter(
        (m) =>
          classLevel.level >= m.charLevel &&
          !character.subclassFeatureChoices.some(
            (c) => c.featureName === m.featureName && c.className.toLowerCase() === classLevel.className.toLowerCase()
          )
      )
    : []
  const resolvedMysticArcana = isPactBoonClass
    ? character.subclassFeatureChoices.filter(
        (c) => MYSTIC_ARCANUM_LEVELS.some((m) => m.featureName === c.featureName) && c.className.toLowerCase() === classLevel.className.toLowerCase()
      )
    : []
  // Spell Mastery/Signature Spells pick from the wizard's OWN known spells (not the full compendium) — a spell has
  // to actually be in the spellbook before it can be designated "always castable without a slot."
  const knownSpellsByLevel = (lvl: number): { name: string; description: string }[] =>
    character.spells.filter((s) => s.level === lvl).map((s) => ({ name: s.name, description: s.description }))
  const resolvedSpellMastery = isWizardClass
    ? character.subclassFeatureChoices.filter((c) => c.featureName === 'Spell Mastery' && c.className.toLowerCase() === classLevel.className.toLowerCase())
    : []
  const spellMasteryUnresolvedLevels = isWizardClass && classLevel.level >= 18 ? [1, 2].filter((lvl) => !resolvedSpellMastery.some((c) => knownSpellsByLevel(lvl).some((s) => s.name === c.chosenName))) : []
  const resolvedSignatureSpells = isWizardClass
    ? character.subclassFeatureChoices.filter(
        (c) => c.featureName === 'Signature Spells' && c.className.toLowerCase() === classLevel.className.toLowerCase()
      )
    : []
  const unresolvedSignatureSpellsCount = isWizardClass && classLevel.level >= 20 ? Math.max(0, 2 - resolvedSignatureSpells.length) : 0
  const subclassOptions = subclassesForClass(cls.id)
  const chosenSubclass = subclassOptions.find((s) => s.name === classLevel.subclass)
  const groupedSubclassFeatures =
    chosenSubclass && classLevel.subclass ? groupedSubclassFeaturesForLevelUp(cls.id, chosenSubclass.id, 0, classLevel.level) : []
  const asiLevels = asiSlotLevelsUpToLevel(classLevel.className, classLevel.level)
  const unresolvedAsiLevels = asiLevels.filter(
    (level) => !character.asiSlotChoices.some((s) => s.level === level && s.className.toLowerCase() === classLevel.className.toLowerCase())
  )
  const fightingStyleLevels = fightingStyleSlotLevelsUpToLevel(classLevel.className, classLevel.level)
  const unresolvedFightingStyleLevels = fightingStyleLevels.filter(
    (level) => !character.asiSlotChoices.some((s) => s.level === level && s.className.toLowerCase() === classLevel.className.toLowerCase())
  )
  const chosenFightingStyleFeatIds = character.asiSlotChoices
    .filter((s) => s.className.toLowerCase() === classLevel.className.toLowerCase() && s.kind === 'feat' && s.featId)
    .map((s) => s.featId!)
    .filter((id) => FEATS.find((f) => f.id === id)?.category === 'Fighting Style')
  const additionalFightingStyleLevels = subclassFightingStyleSlotLevelsUpToLevel(cls.id, chosenSubclass?.id, classLevel.level)
  const unresolvedAdditionalFightingStyleLevels = additionalFightingStyleLevels.filter(
    (level) => !character.asiSlotChoices.some((s) => s.level === level && s.className.toLowerCase() === classLevel.className.toLowerCase())
  )

  const isRangerClass = cls.id === 'ranger'
  const resolvedFavoredEnemies = isRangerClass
    ? character.subclassFeatureChoices.filter((c) => c.featureName === 'Favored Enemy' && c.className.toLowerCase() === classLevel.className.toLowerCase())
    : []
  const favoredEnemySlots = isRangerClass ? favoredEnemySlotLevelsUpToLevel(classLevel.level) : []
  const unresolvedFavoredEnemySlots = favoredEnemySlots.slice(resolvedFavoredEnemies.length)
  const resolvedFavoredTerrains = isRangerClass
    ? character.subclassFeatureChoices.filter((c) => c.featureName === 'Favored Terrain' && c.className.toLowerCase() === classLevel.className.toLowerCase())
    : []
  const favoredTerrainSlots = isRangerClass ? favoredTerrainSlotLevelsUpToLevel(classLevel.level) : []
  const unresolvedFavoredTerrainSlots = favoredTerrainSlots.slice(resolvedFavoredTerrains.length)

  const isDruidClass = cls.id === 'druid'
  const circleTerrainChoice = isDruidClass
    ? character.subclassFeatureChoices.find((c) => c.featureName === 'Circle of the Land' && c.className.toLowerCase() === classLevel.className.toLowerCase())
    : undefined
  const circleTerrain = circleTerrainChoice?.chosenName.split(':')[1]?.trim()
  const circleSpellLevels = circleTerrain ? circleSpellLevelsUpToLevel(circleTerrain, classLevel.level) : []
  const grantedCircleSpellLevels = character.subclassFeatureChoices
    .filter((c) => c.featureName === 'Circle Spells' && c.className.toLowerCase() === classLevel.className.toLowerCase())
    .map((c) => c.level)
  const ungrantedCircleSpellLevels = circleSpellLevels.filter((entry) => !grantedCircleSpellLevels.includes(entry.level))

  const customFeatures = character.customClassFeatures.filter(
    (f) => f.className.toLowerCase() === classLevel.className.toLowerCase() && f.level <= classLevel.level
  )

  const nothingYet =
    curated.length === 0 &&
    groupedSubclassFeatures.length === 0 &&
    unresolvedAsiLevels.length === 0 &&
    unresolvedFightingStyleLevels.length === 0 &&
    customFeatures.length === 0 &&
    resolvedMetamagic.length === 0 &&
    unresolvedMetamagicCount === 0 &&
    !resolvedPactBoon &&
    !pactBoonUnresolved &&
    resolvedInvocations.length === 0 &&
    unresolvedInvocationCount === 0 &&
    unresolvedMysticArcana.length === 0 &&
    resolvedMysticArcana.length === 0 &&
    spellMasteryUnresolvedLevels.length === 0 &&
    resolvedSpellMastery.length === 0 &&
    unresolvedSignatureSpellsCount === 0 &&
    resolvedSignatureSpells.length === 0 &&
    unresolvedAdditionalFightingStyleLevels.length === 0 &&
    resolvedFavoredEnemies.length === 0 &&
    unresolvedFavoredEnemySlots.length === 0 &&
    resolvedFavoredTerrains.length === 0 &&
    unresolvedFavoredTerrainSlots.length === 0 &&
    ungrantedCircleSpellLevels.length === 0 &&
    grantedCircleSpellLevels.length === 0 &&
    !(classLevel.level >= cls.subclassLevel)

  if (nothingYet) return null

  return (
    <div>
      <div className="gb-label">
        {classLevel.className} Features
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {curated.map((f) => (
            <InfoChip
              key={`${f.level}:${f.name}`}
              title={f.name === 'Sneak Attack' ? `Sneak Attack (${sneakAttackDice(classLevel.level)})` : f.name}
              subtitle={`${classLevel.className} ${f.level}`}
              description={f.description}
            />
          ))}
          {groupedSubclassFeatures
            .filter((g) => g.kind === 'single')
            .map((g) => {
              const f = g.kind === 'single' ? g.feature : null
              if (!f) return null
              return <InfoChip key={`sc:${f.level}:${f.name}`} title={f.name} subtitle={`${classLevel.subclass} ${f.level}`} description={f.desc} accent />
            })}
          {groupedSubclassFeatures
            .filter((g) => g.kind === 'choice')
            .map((g) => {
              if (g.kind !== 'choice') return null
              const resolved = character.subclassFeatureChoices.find(
                (c) => c.level === g.level && c.className.toLowerCase() === classLevel.className.toLowerCase() && c.featureName === g.baseName
              )
              if (!resolved) return null
              const option = g.options.find((o) => o.name === resolved.chosenName)
              return (
                <InfoChip
                  key={`scc:${g.level}:${g.baseName}`}
                  title={`${g.baseName}: ${option?.label ?? resolved.chosenName}`}
                  subtitle={`${classLevel.subclass} ${g.level}`}
                  description={option?.desc ?? resolved.chosenName}
                  accent
                  onRemove={readOnly ? undefined : () => onRemoveSubclassFeatureChoice(resolved.id)}
                />
              )
            })}
          {resolvedMetamagic.map((choice) => {
            const option = METAMAGIC_OPTIONS.find((o) => o.name === choice.chosenName)
            return (
              <InfoChip
                key={choice.id}
                title={choice.chosenName}
                subtitle={`Metamagic — ${classLevel.className} ${choice.level}`}
                description={option?.description ?? ''}
                accent
                onRemove={readOnly ? undefined : () => onRemoveSubclassFeatureChoice(choice.id)}
              />
            )
          })}
          {resolvedPactBoon && (
            <InfoChip
              title={resolvedPactBoon.chosenName}
              subtitle={`Pact Boon — ${classLevel.className} ${resolvedPactBoon.level}`}
              description={PACT_BOON_OPTIONS.find((o) => o.name === resolvedPactBoon.chosenName)?.description ?? ''}
              accent
              onRemove={readOnly ? undefined : () => onRemoveSubclassFeatureChoice(resolvedPactBoon.id)}
            />
          )}
          {resolvedInvocations.map((choice) => {
            const option = ELDRITCH_INVOCATIONS.find((o) => o.name === choice.chosenName)
            return (
              <InfoChip
                key={choice.id}
                title={choice.chosenName}
                subtitle={`Eldritch Invocation — ${classLevel.className} ${choice.level}`}
                description={option?.description ?? ''}
                accent
                onRemove={readOnly ? undefined : () => onRemoveSubclassFeatureChoice(choice.id)}
              />
            )
          })}
          {resolvedMysticArcana.map((choice) => (
            <InfoChip
              key={choice.id}
              title={choice.chosenName}
              subtitle={`${choice.featureName} — ${classLevel.className} ${choice.level}`}
              description={SPELLS.find((s) => s.name === choice.chosenName)?.description ?? ''}
              accent
              onRemove={readOnly ? undefined : () => onRemoveSubclassFeatureChoice(choice.id)}
            />
          ))}
          {[...resolvedSpellMastery, ...resolvedSignatureSpells].map((choice) => (
            <InfoChip
              key={choice.id}
              title={choice.chosenName}
              subtitle={`${choice.featureName} — ${classLevel.className} ${choice.level}`}
              description={character.spells.find((s) => s.name === choice.chosenName)?.description ?? ''}
              accent
              onRemove={readOnly ? undefined : () => onRemoveSubclassFeatureChoice(choice.id)}
            />
          ))}
          {resolvedFavoredEnemies.map((choice) => (
            <InfoChip
              key={choice.id}
              title={choice.chosenName}
              subtitle={`Favored Enemy — ${classLevel.className} ${choice.level}`}
              description={FAVORED_ENEMY_OPTIONS.find((o) => o.name === choice.chosenName)?.description ?? ''}
              accent
              onRemove={readOnly ? undefined : () => onRemoveSubclassFeatureChoice(choice.id)}
            />
          ))}
          {resolvedFavoredTerrains.map((choice) => (
            <InfoChip
              key={choice.id}
              title={choice.chosenName}
              subtitle={`Favored Terrain — ${classLevel.className} ${choice.level}`}
              description={FAVORED_TERRAIN_OPTIONS.find((o) => o.name === choice.chosenName)?.description ?? ''}
              accent
              onRemove={readOnly ? undefined : () => onRemoveSubclassFeatureChoice(choice.id)}
            />
          ))}
          {isDruidClass &&
            character.subclassFeatureChoices
              .filter((c) => c.featureName === 'Circle Spells' && c.className.toLowerCase() === classLevel.className.toLowerCase())
              .map((choice) => (
                <InfoChip
                  key={choice.id}
                  title={`Circle Spells (${classLevel.subclass} ${choice.level})`}
                  subtitle="Always prepared"
                  description={choice.chosenName}
                  accent
                />
              ))}
          {customFeatures.map((f) => (
            <InfoChip key={f.id} title={f.name} subtitle={`${classLevel.className} ${f.level} (custom)`} description={f.description} />
          ))}
          {classLevel.level >= cls.subclassLevel && classLevel.subclass && (
            <InfoChip
              title={classLevel.subclass}
              subtitle={`${subclassChoiceFeatureName ?? 'Subclass'} — ${classLevel.className} ${cls.subclassLevel}`}
              description={chosenSubclass?.flavor ?? `Your ${classLevel.className.toLowerCase()} subclass.`}
              accent
            />
          )}
        </div>

        {isDivineSmiteClass && <DivineSmiteCard character={character} onSave={onSave} readOnly={readOnly} />}

        {classLevel.level >= cls.subclassLevel && !classLevel.subclass && subclassOptions.length > 0 && (
          <SubclassChooser
            classLabel={classLevel.className}
            featureName={subclassChoiceFeatureName ?? 'Subclass'}
            slotLevel={cls.subclassLevel}
            options={subclassOptions}
            readOnly={readOnly}
            onChoose={(name) => onChooseSubclass(classIndex, name)}
          />
        )}

        {groupedSubclassFeatures
          .filter((g) => g.kind === 'choice')
          .map((g) => {
            if (g.kind !== 'choice') return null
            const resolved = character.subclassFeatureChoices.some(
              (c) => c.level === g.level && c.className.toLowerCase() === classLevel.className.toLowerCase() && c.featureName === g.baseName
            )
            if (resolved) return null
            return (
              <SubclassFeatureOptionChooser
                key={`scc-chooser:${g.level}:${g.baseName}`}
                classLabel={classLevel.className}
                subclassLabel={classLevel.subclass ?? ''}
                level={g.level}
                baseName={g.baseName}
                intro={g.intro}
                options={g.options}
                readOnly={readOnly}
                onChoose={(chosenName) =>
                  onResolveSubclassFeatureChoice({ className: classLevel.className, level: g.level, featureName: g.baseName, chosenName })
                }
              />
            )
          })}

        {unresolvedFightingStyleLevels.map((level) => (
          <FightingStyleChooser
            key={`fs:${level}`}
            classLabel={classLevel.className}
            level={level}
            readOnly={readOnly}
            onResolve={(entry) => onResolveAsi(entry)}
          />
        ))}

        {unresolvedAdditionalFightingStyleLevels.map((level) => (
          <FightingStyleChooser
            key={`fs-additional:${level}`}
            classLabel={classLevel.className}
            level={level}
            excludeFeatIds={chosenFightingStyleFeatIds}
            readOnly={readOnly}
            onResolve={(entry) => onResolveAsi(entry)}
          />
        ))}

        {unresolvedFavoredEnemySlots.map((level) => (
          <NamedOptionChooser
            key={`favored-enemy:${level}`}
            classLabel={classLevel.className}
            level={level}
            featureName="Favored Enemy"
            options={FAVORED_ENEMY_OPTIONS}
            excludeNames={resolvedFavoredEnemies.map((c) => c.chosenName)}
            readOnly={readOnly}
            onChoose={(chosenName) => onResolveSubclassFeatureChoice({ className: classLevel.className, level, featureName: 'Favored Enemy', chosenName })}
          />
        ))}

        {unresolvedFavoredTerrainSlots.map((level) => (
          <NamedOptionChooser
            key={`favored-terrain:${level}`}
            classLabel={classLevel.className}
            level={level}
            featureName="Favored Terrain"
            options={FAVORED_TERRAIN_OPTIONS}
            excludeNames={resolvedFavoredTerrains.map((c) => c.chosenName)}
            readOnly={readOnly}
            onChoose={(chosenName) => onResolveSubclassFeatureChoice({ className: classLevel.className, level, featureName: 'Favored Terrain', chosenName })}
          />
        ))}

        {ungrantedCircleSpellLevels.map(({ level, spellIds }) => (
          <CircleSpellsGrant
            key={`circle-spells:${level}`}
            classLabel={classLevel.className}
            terrain={circleTerrain ?? ''}
            level={level}
            spellIds={spellIds}
            readOnly={readOnly}
            onGrant={() => {
              const known = new Set(character.spells.map((s) => s.compendiumId).filter(Boolean))
              const granted: Spell[] = spellIds
                .filter((id) => !known.has(id))
                .map((id) => getSpellById(id))
                .filter((s): s is NonNullable<typeof s> => !!s)
                .map((s) => ({ id: crypto.randomUUID(), name: s.name, level: s.level, description: '', actionType: 'action', compendiumId: s.id, free: true }))
              const names = spellIds.map((id) => getSpellById(id)?.name).filter((n): n is string => !!n)
              onSave({
                spells: [...character.spells, ...granted],
                subclassFeatureChoices: [
                  ...character.subclassFeatureChoices,
                  { id: crypto.randomUUID(), className: classLevel.className, level, featureName: 'Circle Spells', chosenName: names.join(', ') }
                ]
              })
            }}
          />
        ))}

        {unresolvedAsiLevels.map((level) => (
          <AsiSlotChooser
            key={`asi:${level}`}
            classLabel={classLevel.className}
            level={level}
            abilityScores={effectiveAbilityScores(character.abilityScores, character.classes, character.asiSlotChoices)}
            readOnly={readOnly}
            onResolve={(entry) => onResolveAsi(entry)}
          />
        ))}

        {Array.from({ length: unresolvedMetamagicCount }).map((_, i) => (
          <NamedOptionChooser
            key={`metamagic:${resolvedMetamagic.length + i}`}
            classLabel={classLevel.className}
            level={metamagicSlotUnlockLevel(resolvedMetamagic.length + i)}
            featureName="Metamagic"
            options={METAMAGIC_OPTIONS}
            excludeNames={resolvedMetamagic.map((c) => c.chosenName)}
            readOnly={readOnly}
            onChoose={(chosenName) =>
              onResolveSubclassFeatureChoice({
                className: classLevel.className,
                level: metamagicSlotUnlockLevel(resolvedMetamagic.length + i),
                featureName: 'Metamagic',
                chosenName
              })
            }
          />
        ))}

        {pactBoonUnresolved && (
          <NamedOptionChooser
            classLabel={classLevel.className}
            level={3}
            featureName="Pact Boon"
            options={PACT_BOON_OPTIONS}
            excludeNames={[]}
            readOnly={readOnly}
            onChoose={(chosenName) =>
              onResolveSubclassFeatureChoice({ className: classLevel.className, level: 3, featureName: 'Pact Boon', chosenName })
            }
          />
        )}

        {Array.from({ length: unresolvedInvocationCount }).map((_, i) => (
          <NamedOptionChooser
            key={`invocation:${resolvedInvocations.length + i}`}
            classLabel={classLevel.className}
            level={classLevel.level}
            featureName="Eldritch Invocation"
            options={availableInvocations}
            excludeNames={[]}
            readOnly={readOnly}
            onChoose={(chosenName) =>
              onResolveSubclassFeatureChoice({ className: classLevel.className, level: classLevel.level, featureName: 'Eldritch Invocation', chosenName })
            }
          />
        ))}

        {unresolvedMysticArcana.map((m) => (
          <NamedOptionChooser
            key={m.featureName}
            classLabel={classLevel.className}
            level={m.charLevel}
            featureName={m.featureName}
            options={SPELLS.filter((s) => s.level === m.spellLevel && s.classes.some((c) => c.toLowerCase() === classLevel.className.toLowerCase())).map(
              (s) => ({ name: s.name, description: s.description })
            )}
            excludeNames={[]}
            readOnly={readOnly}
            onChoose={(chosenName) =>
              onResolveSubclassFeatureChoice({ className: classLevel.className, level: m.charLevel, featureName: m.featureName, chosenName })
            }
          />
        ))}

        {spellMasteryUnresolvedLevels.map((lvl) => (
          <NamedOptionChooser
            key={`spell-mastery:${lvl}`}
            classLabel={classLevel.className}
            level={18}
            featureName={`Spell Mastery (${lvl === 1 ? '1st' : '2nd'}-level spell)`}
            options={knownSpellsByLevel(lvl)}
            excludeNames={[]}
            readOnly={readOnly}
            onChoose={(chosenName) => onResolveSubclassFeatureChoice({ className: classLevel.className, level: 18, featureName: 'Spell Mastery', chosenName })}
          />
        ))}

        {Array.from({ length: unresolvedSignatureSpellsCount }).map((_, i) => (
          <NamedOptionChooser
            key={`signature-spell:${resolvedSignatureSpells.length + i}`}
            classLabel={classLevel.className}
            level={20}
            featureName="Signature Spells"
            options={knownSpellsByLevel(3).filter((s) => !resolvedSignatureSpells.some((r) => r.chosenName === s.name))}
            excludeNames={[]}
            readOnly={readOnly}
            onChoose={(chosenName) =>
              onResolveSubclassFeatureChoice({ className: classLevel.className, level: 20, featureName: 'Signature Spells', chosenName })
            }
          />
        ))}
      </div>
    </div>
  )
}

const DIVINE_SMITE_DESCRIPTION =
  "Starting at 2nd level, when you hit a creature with a melee weapon attack, you can expend one spell slot to deal radiant damage to the target, in addition to the weapon's damage. The extra damage is 2d8 for a 1st-level spell slot, plus 1d8 for each spell level higher than 1st, to a maximum of 5d8. The damage increases by 1d8 if the target is an undead or a fiend."

/**
 * The one class resource that's actually spent from spell slots instead of
 * its own pool — so unlike Rage/Ki/Sorcery Points (see CLASS_RESOURCES in
 * shared/dnd5e.ts), this doesn't track its own "uses"; "casting" it here
 * just marks a spell slot as used, the same as SpellsTab's own slot tracker
 * would, and shows what that slot's damage roll comes out to.
 */
function DivineSmiteCard({
  character,
  onSave,
  readOnly
}: {
  character: CharacterSheet
  onSave: (patch: Partial<CharacterSheetData>) => void
  readOnly?: boolean
}): JSX.Element {
  const slotTotals = spellSlotsForClasses(character.classes)
  const availableLevels = Object.keys(slotTotals)
    .map(Number)
    .filter((level) => slotTotals[level] > (character.spellSlots[level]?.used ?? 0))
    .sort((a, b) => a - b)

  const [slotLevel, setSlotLevel] = useState<number>(availableLevels[0] ?? 1)
  const [vsUndeadOrFiend, setVsUndeadOrFiend] = useState(false)
  const [lastCast, setLastCast] = useState<string | null>(null)

  const effectiveLevel = availableLevels.includes(slotLevel) ? slotLevel : availableLevels[0]
  const dice = effectiveLevel ? Math.min(5, effectiveLevel + 1) + (vsUndeadOrFiend ? 1 : 0) : 0

  function cast(): void {
    if (readOnly || !effectiveLevel) return
    const used = (character.spellSlots[effectiveLevel]?.used ?? 0) + 1
    onSave({ spellSlots: { ...character.spellSlots, [effectiveLevel]: { total: slotTotals[effectiveLevel], used } } })
    setLastCast(`${dice}d8 radiant damage (spent a level ${effectiveLevel} slot).`)
  }

  return (
    <div className="gb-card" style={{ padding: 'var(--space-3)' }}>
      <HoverDetailCard title="Divine Smite" subtitle="Paladin 2" fields={[]} description={DIVINE_SMITE_DESCRIPTION}>
        <strong style={{ cursor: 'default' }}>Divine Smite</strong>
      </HoverDetailCard>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 var(--space-2)' }}>
        Expend a spell slot on a melee hit for extra radiant damage.
      </div>
      {availableLevels.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>No spell slots available — rest to recover some.</p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <select
              className="gb-input"
              value={effectiveLevel}
              onChange={(e) => setSlotLevel(Number(e.target.value))}
              style={{ fontSize: 12, flex: 1 }}
              disabled={readOnly}
            >
              {availableLevels.map((level) => (
                <option key={level} value={level}>
                  Level {level} slot ({slotTotals[level] - (character.spellSlots[level]?.used ?? 0)} left)
                </option>
              ))}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={vsUndeadOrFiend} onChange={(e) => setVsUndeadOrFiend(e.target.checked)} disabled={readOnly} />
              vs. undead/fiend
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <Button variant="primary" onClick={cast} disabled={readOnly} style={{ fontSize: 12, padding: '4px 10px' }}>
              Cast ({dice}d8 radiant)
            </Button>
          </div>
        </>
      )}
      {lastCast && <p style={{ fontSize: 11, color: 'var(--accent)', margin: '6px 0 0' }}>{lastCast}</p>}
    </div>
  )
}

/** The inline chooser for a subclass feature the SRD writes as several named options (e.g. Draconic Bloodline's dragon ancestor) rather than one entry with an embedded choice — see groupedSubclassFeaturesForLevelUp in shared/compendium.ts. */
function SubclassFeatureOptionChooser({
  classLabel,
  subclassLabel,
  level,
  baseName,
  intro,
  options,
  readOnly,
  onChoose
}: {
  classLabel: string
  subclassLabel: string
  level: number
  baseName: string
  intro?: string
  options: SubclassFeatureOption[]
  readOnly?: boolean
  onChoose: (chosenName: string) => void
}): JSX.Element {
  const [chosenName, setChosenName] = useState(options[0]?.name ?? '')
  const chosen = options.find((o) => o.name === chosenName)

  return (
    <div className="gb-card" style={{ padding: 'var(--space-3)' }}>
      <strong>
        {baseName} — {subclassLabel || classLabel} {level}
      </strong>
      {intro && <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 var(--space-2)' }}>{intro}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <select className="gb-input" value={chosenName} onChange={(e) => setChosenName(e.target.value)} style={{ fontSize: 12, flex: 1 }}>
          {options.map((o) => (
            <option key={o.name} value={o.name}>
              {o.label}
            </option>
          ))}
        </select>
        <Button
          variant="primary"
          onClick={() => onChoose(chosenName)}
          disabled={readOnly || !chosenName}
          style={{ flexShrink: 0, fontSize: 12, padding: '4px 10px' }}
        >
          Choose
        </Button>
      </div>
      {chosen && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>{chosen.desc}</p>}
    </div>
  )
}

/** Circle of the Land's "circle spells" aren't a choice (the two spells for a given terrain/level are fixed) — just a one-click grant once the terrain is known and the level threshold is reached, matching how a real player would just add them to their prepared list. */
function CircleSpellsGrant({
  classLabel,
  terrain,
  level,
  spellIds,
  readOnly,
  onGrant
}: {
  classLabel: string
  terrain: string
  level: number
  spellIds: string[]
  readOnly?: boolean
  onGrant: () => void
}): JSX.Element {
  const names = spellIds.map((id) => SPELLS.find((s) => s.id === id)?.name ?? id)
  return (
    <div className="gb-card" style={{ padding: 'var(--space-3)' }}>
      <strong>
        Circle Spells — {classLabel} {level}
      </strong>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 var(--space-2)' }}>
        Your {terrain} circle grants {names.join(' and ')}, always prepared, at no cost against your normal spells known.
      </div>
      <Button variant="primary" onClick={onGrant} disabled={readOnly} style={{ fontSize: 12, padding: '4px 10px' }}>
        + Add to Spells
      </Button>
    </div>
  )
}

export function UsesTracker({
  max,
  used,
  remaining,
  readOnly,
  onSetUsed
}: {
  max: number
  used: number
  remaining: number
  readOnly?: boolean
  onSetUsed: (used: number) => void
}): JSX.Element {
  // A rage-at-20 style "unlimited" max renders as a plain counter instead
  // of 99 individual pips, which would just be noise.
  if (max > 20) {
    return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Unlimited</span>
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {Array.from({ length: max }, (_, i) => (
          <button
            key={i}
            type="button"
            disabled={readOnly}
            onClick={() => onSetUsed(i < used ? i : i + 1)}
            title={i < used ? 'Used' : 'Available'}
            style={{
              width: 16,
              height: 16,
              border: '1.5px solid var(--border-strong)',
              borderRadius: 3,
              background: i < used ? 'transparent' : 'var(--accent)',
              cursor: readOnly ? 'default' : 'pointer',
              padding: 0
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {remaining} / {max}
      </span>
    </div>
  )
}

export function PoolTracker({
  max,
  used,
  remaining,
  readOnly,
  onSetUsed
}: {
  max: number
  used: number
  remaining: number
  readOnly?: boolean
  onSetUsed: (used: number) => void
}): JSX.Element {
  const [amount, setAmount] = useState(1)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)', minWidth: 56 }}>
        {remaining} / {max}
      </span>
      <input
        type="number"
        min={1}
        max={max}
        className="gb-input"
        value={amount}
        disabled={readOnly}
        onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
        style={{ width: 52, fontSize: 12 }}
      />
      <button
        type="button"
        disabled={readOnly || remaining < amount}
        onClick={() => onSetUsed(used + amount)}
        className="gb-btn gb-btn--secondary"
        style={spendButtonStyle}
      >
        Spend
      </button>
      <button
        type="button"
        disabled={readOnly || used <= 0}
        onClick={() => onSetUsed(Math.max(0, used - amount))}
        className="gb-btn gb-btn--secondary"
        style={spendButtonStyle}
        title="Restore this many points"
      >
        Restore
      </button>
    </div>
  )
}

const spendButtonStyle: CSSProperties = { fontSize: 11, padding: '4px 8px' }
const removeBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 16,
  lineHeight: 1,
  padding: '0 2px'
}
