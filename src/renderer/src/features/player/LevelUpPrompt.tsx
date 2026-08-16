import { useState } from 'react'
import { Modal } from '../../ui/Modal'
import { Button } from '../../ui/Button'
import type { CharacterSheet } from '@shared/ipc'
import { curatedFeaturesForLevelUp, type CharacterSheetData } from '@shared/dnd5e'

interface LevelUpPromptProps {
  character: CharacterSheet
  className: string
  fromLevel: number
  toLevel: number
  onSave: (patch: Partial<CharacterSheetData>) => void
  onClose: () => void
}

interface Candidate {
  key: string
  level: number
  name: string
  description: string
}

/** Pops when a class level increases in OverviewTab. Lists whatever the curated class table (shared/dnd5e's CLASS_LEVEL_FEATURES) and the player's own custom class-table entries (ClassTableTab) say was gained between the old and new level, each addable straight into Class Features with one click. Purely informational for choice-based stuff (fighting styles, subclass picks) — there's no mechanic here for making that choice, just a nudge to remember it. */
export function LevelUpPrompt({ character, className, fromLevel, toLevel, onSave, onClose }: LevelUpPromptProps): JSX.Element {
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [customName, setCustomName] = useState('')
  const [customDescription, setCustomDescription] = useState('')

  const curated: Candidate[] = curatedFeaturesForLevelUp(className, fromLevel, toLevel).map((f) => ({
    key: `curated:${f.level}:${f.name}`,
    level: f.level,
    name: f.name,
    description: f.description
  }))

  const custom: Candidate[] = character.customClassFeatures
    .filter((f) => f.className.toLowerCase() === className.toLowerCase() && f.level > fromLevel && f.level <= toLevel)
    .map((f) => ({ key: `custom:${f.id}`, level: f.level, name: f.name, description: f.description }))

  const candidates = [...curated, ...custom].sort((a, b) => a.level - b.level)

  function addFeature(candidate: Candidate): void {
    onSave({
      features: [
        ...character.features,
        { id: crypto.randomUUID(), name: candidate.name, source: `${className} ${candidate.level}`, description: candidate.description }
      ]
    })
    setAdded((prev) => new Set(prev).add(candidate.key))
  }

  function addCustom(): void {
    if (!customName.trim()) return
    onSave({
      features: [
        ...character.features,
        { id: crypto.randomUUID(), name: customName.trim(), source: `${className} ${toLevel}`, description: customDescription.trim() }
      ]
    })
    setCustomName('')
    setCustomDescription('')
  }

  return (
    <Modal onClose={onClose} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 20 }}>Level Up!</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            {className}: {fromLevel} → {toLevel}
          </p>
        </div>

        {candidates.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            No class table entries for this level range yet. Add one below, or fill in the Class Table tab for next time.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {candidates.map((c) => (
              <div key={c.key} className="gb-card" style={{ padding: 'var(--space-3)', display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <strong>
                    Lv {c.level} — {c.name}
                  </strong>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{c.description}</div>
                </div>
                <Button
                  variant={added.has(c.key) ? 'secondary' : 'primary'}
                  disabled={added.has(c.key)}
                  onClick={() => addFeature(c)}
                  style={{ flexShrink: 0, fontSize: 12, padding: '4px 10px' }}
                >
                  {added.has(c.key) ? 'Added' : 'Add to sheet'}
                </Button>
              </div>
            ))}
          </div>
        )}

        <div>
          <div className="gb-label">Add Something Else</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="gb-input"
              placeholder="Feature name"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              style={{ flex: 1 }}
            />
            <input
              className="gb-input"
              placeholder="Description (optional)"
              value={customDescription}
              onChange={(e) => setCustomDescription(e.target.value)}
              style={{ flex: 2 }}
            />
            <Button variant="secondary" onClick={addCustom} disabled={!customName.trim()}>
              Add
            </Button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  )
}
