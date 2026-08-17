import type { ReactNode } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import { ALIGNMENTS, type Appearance, type CharacterSheetData } from '@shared/dnd5e'
import { useAutosaveDraft } from '../useAutosaveDraft'

interface BackgroundDraft {
  background: string
  alignment: string
  appearance: Appearance
  personalityTraits: string
  ideals: string
  bonds: string
  flaws: string
  backstory: string
  notes: string
}

interface BackgroundTabProps {
  character: CharacterSheet
  onSave: (patch: Partial<CharacterSheetData>) => void
  readOnly?: boolean
}

const APPEARANCE_FIELDS: (keyof Appearance)[] = ['age', 'height', 'weight', 'eyes', 'skin', 'hair']

export function BackgroundTab({ character, onSave, readOnly }: BackgroundTabProps): JSX.Element {
  const [draft, setDraft] = useAutosaveDraft<BackgroundDraft>(
    {
      background: character.background,
      alignment: character.alignment,
      appearance: character.appearance,
      personalityTraits: character.personalityTraits,
      ideals: character.ideals,
      bonds: character.bonds,
      flaws: character.flaws,
      backstory: character.backstory,
      notes: character.notes
    },
    onSave,
    readOnly
  )

  function patch(fields: Partial<BackgroundDraft>): void {
    setDraft((prev) => ({ ...prev, ...fields }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
        <Field label="Background">
          <input className="gb-input" value={draft.background} onChange={(e) => patch({ background: e.target.value })} />
        </Field>
        <Field label="Alignment">
          <select className="gb-input" value={draft.alignment} onChange={(e) => patch({ alignment: e.target.value })}>
            <option value="">Unaligned</option>
            {ALIGNMENTS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div>
        <div className="gb-label">Appearance</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }}>
          {APPEARANCE_FIELDS.map((field) => (
            <Field key={field} label={field}>
              <input
                className="gb-input"
                value={draft.appearance[field]}
                onChange={(e) => patch({ appearance: { ...draft.appearance, [field]: e.target.value } })}
              />
            </Field>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
        <Field label="Personality Traits">
          <textarea className="gb-input" style={{ minHeight: 60, resize: 'vertical' }} value={draft.personalityTraits} onChange={(e) => patch({ personalityTraits: e.target.value })} />
        </Field>
        <Field label="Ideals">
          <textarea className="gb-input" style={{ minHeight: 60, resize: 'vertical' }} value={draft.ideals} onChange={(e) => patch({ ideals: e.target.value })} />
        </Field>
        <Field label="Bonds">
          <textarea className="gb-input" style={{ minHeight: 60, resize: 'vertical' }} value={draft.bonds} onChange={(e) => patch({ bonds: e.target.value })} />
        </Field>
        <Field label="Flaws">
          <textarea className="gb-input" style={{ minHeight: 60, resize: 'vertical' }} value={draft.flaws} onChange={(e) => patch({ flaws: e.target.value })} />
        </Field>
      </div>

      <Field label="Backstory">
        <textarea className="gb-input" style={{ minHeight: 100, resize: 'vertical' }} value={draft.backstory} onChange={(e) => patch({ backstory: e.target.value })} />
      </Field>

      <Field label="Notes">
        <textarea
          className="gb-input"
          style={{ minHeight: 80, resize: 'vertical' }}
          value={draft.notes}
          onChange={(e) => patch({ notes: e.target.value })}
          placeholder="Anything else you're tracking…"
        />
      </Field>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div>
      <div className="gb-label" style={{ textTransform: 'capitalize' }}>
        {label}
      </div>
      {children}
    </div>
  )
}

