import type { CSSProperties } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import {
  CLASSES,
  CLASS_LEVEL_FEATURES,
  CLASS_RESOURCES,
  abilityModifier,
  type Ability,
  type AsiSlotChoice,
  type CharacterSheetData,
  type CustomClassFeature
} from '@shared/dnd5e'
import { FEATS, spellSlotsForClassLevel, spellsKnownForClassLevel } from '@shared/compendium'
import { useAutosaveDraft } from '../useAutosaveDraft'

/** A short human summary of one resolved ASI slot — "+2 STR", "+1 STR, +1 DEX", or the feat's name. */
function asiChoiceSummary(choice: AsiSlotChoice): string {
  if (choice.kind === 'ability' && choice.abilityIncreases) {
    return Object.entries(choice.abilityIncreases)
      .map(([ability, amount]) => `+${amount} ${ability.toUpperCase()}`)
      .join(', ')
  }
  const feat = FEATS.find((f) => f.id === choice.featId)
  return feat ? `Feat: ${feat.name}` : 'Feat'
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']

function proficiencyBonusAtLevel(level: number): number {
  return 2 + Math.floor((level - 1) / 4)
}

interface ClassTableDraft {
  customClassFeatures: CustomClassFeature[]
}

interface ClassTableTabProps {
  character: CharacterSheet
  onSave: (patch: Partial<CharacterSheetData>) => void
  readOnly?: boolean
}

/** Read-only curated progression for each of the character's recognized classes, shown in full (levels 1-20) so you can see what's coming — unlocked levels (at or below the character's current level) are highlighted, locked ones are dimmed. Plus an editable table for homebrew/custom classes or levels the curated data doesn't cover. Both feed the level-up prompt (see shared/dnd5e's curatedFeaturesForLevelUp and CharacterSheetEditor's custom-feature filtering). */
export function ClassTableTab({ character, onSave, readOnly }: ClassTableTabProps): JSX.Element {
  const [draft, setDraft] = useAutosaveDraft<ClassTableDraft>(
    { customClassFeatures: character.customClassFeatures },
    onSave,
    readOnly
  )

  function patch(fields: Partial<ClassTableDraft>): void {
    setDraft((prev) => ({ ...prev, ...fields }))
  }

  function updateCustom(id: string, fields: Partial<CustomClassFeature>): void {
    patch({ customClassFeatures: draft.customClassFeatures.map((f) => (f.id === id ? { ...f, ...fields } : f)) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {character.classes.map((c) => {
        const cls = CLASSES.find((k) => k.name.toLowerCase() === c.className.toLowerCase())
        const table = cls ? CLASS_LEVEL_FEATURES[cls.id] ?? [] : []
        const resourceDefs = cls ? CLASS_RESOURCES[cls.id] ?? [] : []
        const abilityMod = (a: Ability): number => abilityModifier(character.abilityScores[a])
        // Every level 1-20 gets a row, not just the ones with a named feature — proficiency bonus and spell
        // slots/resources still step up on "blank" levels (e.g. a wizard's spell slots growing between feature
        // levels), and the user asked to see the whole progression, not just where a feature happens to land.
        const levels = Array.from({ length: 20 }, (_, i) => i + 1)
        const classIndex = character.classes.findIndex((k) => k.className === c.className)

        function removeAsiChoice(id: string): void {
          onSave({ asiSlotChoices: character.asiSlotChoices.filter((s) => s.id !== id) })
        }
        function removeSubclassFeatureChoice(id: string): void {
          onSave({ subclassFeatureChoices: character.subclassFeatureChoices.filter((s) => s.id !== id) })
        }
        function clearSubclass(): void {
          onSave({ classes: character.classes.map((k, i) => (i === classIndex ? { ...k, subclass: undefined } : k)) })
        }
        return (
          <div key={c.className}>
            <div className="gb-label">
              {c.className || 'Unnamed Class'} — Level {c.level}
            </div>
            {!cls ? (
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Not a recognized class — add its progression below as custom features.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {levels.map((level) => {
                  const unlocked = level <= c.level
                  const features = table.filter((f) => f.level === level)
                  const slots = cls.spellcastingAbility ? spellSlotsForClassLevel(cls.id, level) : []
                  const hasSlots = slots.some((n) => n > 0)
                  const known = cls.spellcastingAbility ? spellsKnownForClassLevel(cls.id, level) : null
                  const resources = resourceDefs.filter((r) => r.minLevel <= level)
                  const resolvedAsi = character.asiSlotChoices.find(
                    (s) => s.level === level && s.className.toLowerCase() === c.className.toLowerCase()
                  )
                  const resolvedFeatureChoices = character.subclassFeatureChoices.filter(
                    (s) => s.level === level && s.className.toLowerCase() === c.className.toLowerCase()
                  )
                  const isSubclassPick = level === cls.subclassLevel && !!c.subclass
                  const hasStats =
                    features.length > 0 ||
                    hasSlots ||
                    known !== null ||
                    resources.length > 0 ||
                    !!resolvedAsi ||
                    resolvedFeatureChoices.length > 0 ||
                    isSubclassPick
                  if (!hasStats) return null
                  return (
                    <div
                      key={level}
                      className="gb-card"
                      style={{
                        padding: 'var(--space-2)',
                        opacity: unlocked ? 1 : 0.45,
                        borderColor: unlocked ? 'var(--accent)' : undefined
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>Lv {level}</span>
                        <span className="gb-badge" style={{ fontSize: 10 }}>
                          PB +{proficiencyBonusAtLevel(level)}
                        </span>
                        {!unlocked && (
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Locked
                          </span>
                        )}
                      </div>

                      {features.map((f, i) => (
                        <div key={i} style={{ marginTop: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{f.name}</span>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{f.description}</div>
                        </div>
                      ))}

                      {isSubclassPick && !readOnly && (
                        <ResolvedChoiceRow label={`Subclass: ${c.subclass}`} onChange={clearSubclass} />
                      )}
                      {resolvedAsi && !readOnly && (
                        <ResolvedChoiceRow label={`Ability Score Improvement: ${asiChoiceSummary(resolvedAsi)}`} onChange={() => removeAsiChoice(resolvedAsi.id)} />
                      )}
                      {resolvedFeatureChoices.map((choice) => (
                        <ResolvedChoiceRow
                          key={choice.id}
                          label={`${choice.featureName}: ${choice.chosenName}`}
                          onChange={() => removeSubclassFeatureChoice(choice.id)}
                        />
                      ))}

                      {(hasSlots || known !== null) && (
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                          {known !== null && <span>Spells known: {known}. </span>}
                          {hasSlots && (
                            <span>
                              Spell slots:{' '}
                              {slots.map((n, i) => (n > 0 ? `${ORDINALS[i]} ×${n}` : null)).filter(Boolean).join(', ')}
                            </span>
                          )}
                        </div>
                      )}

                      {resources.map((r) => (
                        <div key={r.id} style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                          {r.name}: {r.max(level, abilityMod)}
                          {r.kind === 'uses' ? ' uses' : ''}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      <div>
        <div className="gb-label">Custom Class Features</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 6px' }}>
          For homebrew classes or anything the curated table doesn't cover — these show up in the level-up prompt too.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {draft.customClassFeatures.map((feature) => (
            <div key={feature.id} className="gb-card" style={{ padding: 'var(--space-2)' }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                <input
                  className="gb-input"
                  style={{ flex: 2 }}
                  placeholder="Class"
                  value={feature.className}
                  onChange={(e) => updateCustom(feature.id, { className: e.target.value })}
                />
                <input
                  type="number"
                  min={1}
                  max={20}
                  className="gb-input"
                  style={{ width: 70 }}
                  placeholder="Lvl"
                  value={feature.level}
                  onChange={(e) => updateCustom(feature.id, { level: Number(e.target.value) })}
                />
                <input
                  className="gb-input"
                  style={{ flex: 2 }}
                  placeholder="Feature name"
                  value={feature.name}
                  onChange={(e) => updateCustom(feature.id, { name: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() =>
                    patch({ customClassFeatures: draft.customClassFeatures.filter((f) => f.id !== feature.id) })
                  }
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
                onChange={(e) => updateCustom(feature.id, { description: e.target.value })}
              />
            </div>
          ))}
          <button
            type="button"
            className="gb-btn gb-btn--secondary"
            style={{ alignSelf: 'flex-start' }}
            onClick={() =>
              patch({
                customClassFeatures: [
                  ...draft.customClassFeatures,
                  { id: crypto.randomUUID(), className: character.classes[0]?.className ?? '', level: 1, name: '', description: '' }
                ]
              })
            }
          >
            + Add Custom Feature
          </button>
        </div>
      </div>
    </div>
  )
}

/** One resolved level-up decision, with a "Change" button to clear it — clearing just deletes the underlying record, the same as removing it from wherever else it's editable (Overview's ability hover for an ASI, Features' chips for everything else); the inline chooser reappears there afterward so the player can re-pick. */
function ResolvedChoiceRow({ label, onChange }: { label: string; onChange: () => void }): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>{label}</span>
      <button
        type="button"
        onClick={onChange}
        title="Clear this choice so you can pick again"
        style={{
          background: 'none',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          fontSize: 10,
          padding: '2px 6px',
          flexShrink: 0
        }}
      >
        Change
      </button>
    </div>
  )
}

const removeBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 18,
  lineHeight: 1,
  padding: '0 6px'
}
