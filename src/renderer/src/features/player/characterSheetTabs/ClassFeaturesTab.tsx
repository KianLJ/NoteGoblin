import type { CSSProperties } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import type { CharacterSheetData, Feature } from '@shared/dnd5e'
import { useAutosaveDraft } from '../useAutosaveDraft'

interface ClassFeaturesDraft {
  features: Feature[]
}

interface ClassFeaturesTabProps {
  character: CharacterSheet
  onSave: (patch: Partial<CharacterSheetData>) => void
  readOnly?: boolean
}

/** Racial traits, class features, and feats you've actually picked up — separate from the reference-only Class Table tab. The level-up prompt appends here when you accept a suggested feature. */
export function ClassFeaturesTab({ character, onSave, readOnly }: ClassFeaturesTabProps): JSX.Element {
  const [draft, setDraft] = useAutosaveDraft<ClassFeaturesDraft>({ features: character.features }, onSave, readOnly)

  function patch(fields: Partial<ClassFeaturesDraft>): void {
    setDraft((prev) => ({ ...prev, ...fields }))
  }

  function updateFeature(id: string, fields: Partial<Feature>): void {
    patch({ features: draft.features.map((f) => (f.id === id ? { ...f, ...fields } : f)) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {draft.features.map((feature) => (
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
            <button type="button" onClick={() => patch({ features: draft.features.filter((f) => f.id !== feature.id) })} style={removeBtnStyle}>
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
      <button
        type="button"
        className="gb-btn gb-btn--secondary"
        style={{ alignSelf: 'flex-start' }}
        onClick={() =>
          patch({
            features: [...draft.features, { id: crypto.randomUUID(), name: '', source: '', description: '' }]
          })
        }
      >
        + Add Feature
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
