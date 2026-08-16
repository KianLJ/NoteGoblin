import type { CSSProperties } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import { CLASSES, CLASS_LEVEL_FEATURES, type CharacterSheetData, type CustomClassFeature } from '@shared/dnd5e'
import { useAutosaveDraft } from '../useAutosaveDraft'

interface ClassTableDraft {
  customClassFeatures: CustomClassFeature[]
}

interface ClassTableTabProps {
  character: CharacterSheet
  onSave: (patch: Partial<CharacterSheetData>) => void
}

/** Read-only curated progression for each of the character's recognized classes, shown in full (levels 1-20) so you can see what's coming — unlocked levels (at or below the character's current level) are highlighted, locked ones are dimmed. Plus an editable table for homebrew/custom classes or levels the curated data doesn't cover. Both feed the level-up prompt (see shared/dnd5e's curatedFeaturesForLevelUp and CharacterSheetEditor's custom-feature filtering). */
export function ClassTableTab({ character, onSave }: ClassTableTabProps): JSX.Element {
  const [draft, setDraft] = useAutosaveDraft<ClassTableDraft>(
    { customClassFeatures: character.customClassFeatures },
    onSave
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
                {table.map((f, i) => {
                  const unlocked = f.level <= c.level
                  return (
                    <div
                      key={i}
                      className="gb-card"
                      style={{
                        padding: 'var(--space-2)',
                        opacity: unlocked ? 1 : 0.45,
                        borderColor: unlocked ? 'var(--accent)' : undefined
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>
                          Lv {f.level} — {f.name}
                        </span>
                        {!unlocked && (
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Locked
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{f.description}</div>
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

const removeBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 18,
  lineHeight: 1,
  padding: '0 6px'
}
