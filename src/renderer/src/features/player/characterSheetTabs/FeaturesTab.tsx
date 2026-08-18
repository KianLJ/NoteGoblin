import { useState, type CSSProperties } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import {
  CLASSES,
  RACES,
  RACE_TRAIT_DESCRIPTIONS,
  SUBCLASS_CHOICE_FEATURE_NAME,
  activeFeatIds,
  asiSlotLevelsUpToLevel,
  curatedFeaturesForLevelUp,
  fightingStyleSlotLevelsUpToLevel,
  resourcesForCharacter,
  type AsiSlotChoice,
  type CharacterSheetData,
  type ClassLevel,
  type Feature,
  type SubclassFeatureChoice
} from '@shared/dnd5e'
import {
  FEATS,
  effectiveAbilityScores,
  groupedSubclassFeaturesForLevelUp,
  spellSlotsForClasses,
  subclassesForClass,
  type FeatEffect,
  type SubclassFeatureOption
} from '@shared/compendium'
import { Button } from '../../../ui/Button'
import { HoverDetailCard } from '../HoverDetailCard'
import { useAutosaveDraft } from '../useAutosaveDraft'
import { AsiSlotChooser, FightingStyleChooser, SubclassChooser } from '../AsiChoosers'

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

  function rest(kinds: Array<'short' | 'long'>): void {
    setResourceDraft((prev) => {
      const next = { ...prev.resourceUsed }
      for (const r of resources) {
        if (kinds.includes(r.recharge)) next[r.id] = 0
      }
      return { resourceUsed: next }
    })
  }

  function updateFeature(id: string, fields: Partial<Feature>): void {
    setFeatureDraft((prev) => ({ features: prev.features.map((f) => (f.id === id ? { ...f, ...fields } : f)) }))
  }

  function resolveAsiSlot(entry: Omit<AsiSlotChoice, 'id'>): void {
    onSave({ asiSlotChoices: [...character.asiSlotChoices, { id: crypto.randomUUID(), ...entry }] })
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div className="gb-label" style={{ margin: 0 }}>
              Class Resources
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button variant="secondary" onClick={() => rest(['short'])} disabled={readOnly} style={{ fontSize: 12, padding: '4px 10px' }}>
                Short Rest
              </Button>
              <Button variant="secondary" onClick={() => rest(['short', 'long'])} disabled={readOnly} style={{ fontSize: 12, padding: '4px 10px' }}>
                Long Rest
              </Button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
            {resources.map((r) => {
              const used = Math.min(resourceDraft.resourceUsed[r.id] ?? 0, r.currentMax)
              const remaining = r.currentMax - used
              return (
                <div key={r.id} className="gb-card" style={{ padding: 'var(--space-3)' }}>
                  <HoverDetailCard title={r.name} subtitle={r.className} fields={[]} description={r.fullDescription}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, cursor: 'default' }}>
                      <strong style={{ flex: 1 }}>{r.name}</strong>
                      <span className="gb-badge" style={{ fontSize: 10 }}>
                        {r.className}
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 var(--space-2)' }}>{r.description}</p>

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
  const curated = curatedFeaturesForLevelUp(classLevel.className, 0, classLevel.level).filter(
    (f) =>
      f.name !== 'Ability Score Improvement' &&
      f.name !== 'Fighting Style' &&
      f.name !== subclassChoiceFeatureName &&
      !(isDivineSmiteClass && f.name === 'Divine Smite')
  )
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
  const customFeatures = character.customClassFeatures.filter(
    (f) => f.className.toLowerCase() === classLevel.className.toLowerCase() && f.level <= classLevel.level
  )

  const nothingYet =
    curated.length === 0 &&
    groupedSubclassFeatures.length === 0 &&
    unresolvedAsiLevels.length === 0 &&
    unresolvedFightingStyleLevels.length === 0 &&
    customFeatures.length === 0 &&
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
            <InfoChip key={`${f.level}:${f.name}`} title={f.name} subtitle={`${classLevel.className} ${f.level}`} description={f.description} />
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

        {unresolvedAsiLevels.map((level) => (
          <AsiSlotChooser
            key={`asi:${level}`}
            classLabel={classLevel.className}
            level={level}
            abilityScores={character.abilityScores}
            readOnly={readOnly}
            onResolve={(entry) => onResolveAsi(entry)}
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

function UsesTracker({
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

function PoolTracker({
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
