import { useState } from 'react'
import { Modal } from '../../ui/Modal'
import { Button } from '../../ui/Button'
import type { CharacterSheet } from '@shared/ipc'
import {
  ABILITIES,
  CLASSES,
  curatedFeaturesForLevelUp,
  type Ability,
  type AbilityScores,
  type CharacterSheetData
} from '@shared/dnd5e'
import { FEATS, meetsFeatPrerequisite, SUBCLASSES, subclassFeaturesForLevelUp } from '@shared/compendium'

interface LevelUpPromptProps {
  character: CharacterSheet
  className: string
  fromLevel: number
  toLevel: number
  onSave: (patch: Partial<CharacterSheetData>) => void
  onClose: () => void
}

const ASI_NAME = 'Ability Score Improvement'
/** Generic "gain a feature from your Subclass" rows in CLASS_LEVEL_FEATURES — dropped from the curated list whenever real subclass content (see below) is available to show instead, so the prompt doesn't show a vague placeholder next to the actual feature it's standing in for. */
const PLACEHOLDER_FEATURE_RE = / Feature$/

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

  const classId = CLASSES.find((c) => c.name.toLowerCase() === className.toLowerCase())?.id
  const subclassName = character.classes.find((c) => c.className.toLowerCase() === className.toLowerCase())?.subclass
  const subclassId = classId ? SUBCLASSES.find((s) => s.classId === classId && s.name === subclassName)?.id : undefined

  const subclassCandidates: Candidate[] = subclassId
    ? subclassFeaturesForLevelUp(classId!, subclassId, fromLevel, toLevel).map((f) => ({
        key: `subclass:${f.level}:${f.name}`,
        level: f.level,
        name: f.name,
        description: f.desc
      }))
    : []

  // Generic "gain a feature from your X" rows are only worth dropping once
  // there's real subclass content to show in their place — with no subclass
  // chosen yet, the placeholder is still the only signal that something was
  // gained here at all.
  const curated: Candidate[] = curatedFeaturesForLevelUp(className, fromLevel, toLevel)
    .filter((f) => !(subclassId && PLACEHOLDER_FEATURE_RE.test(f.name)))
    .map((f) => ({
      key: `curated:${f.level}:${f.name}`,
      level: f.level,
      name: f.name,
      description: f.description
    }))

  const custom: Candidate[] = character.customClassFeatures
    .filter((f) => f.className.toLowerCase() === className.toLowerCase() && f.level > fromLevel && f.level <= toLevel)
    .map((f) => ({ key: `custom:${f.id}`, level: f.level, name: f.name, description: f.description }))

  const candidates = [...curated, ...subclassCandidates, ...custom].sort((a, b) => a.level - b.level)

  function addFeature(candidate: Candidate): void {
    onSave({
      features: [
        ...character.features,
        { id: crypto.randomUUID(), name: candidate.name, source: `${className} ${candidate.level}`, description: candidate.description }
      ]
    })
    setAdded((prev) => new Set(prev).add(candidate.key))
  }

  /** Applies the chosen ASI numerically (immediately reflected everywhere ability scores feed into — skills, saves, spell DC, AC, ...) instead of just noting it as a feature. */
  function applyAbilityIncrease(candidate: Candidate, increases: Partial<Record<Ability, number>>): void {
    const abilityScores = { ...character.abilityScores }
    for (const [ability, amount] of Object.entries(increases) as [Ability, number][]) {
      abilityScores[ability] += amount
    }
    const summary = Object.entries(increases)
      .map(([a, n]) => `${a.toUpperCase()} +${n}`)
      .join(', ')
    onSave({
      abilityScores,
      features: [
        ...character.features,
        {
          id: crypto.randomUUID(),
          name: ASI_NAME,
          source: `${className} ${candidate.level}`,
          description: `Increased ${summary}.`
        }
      ]
    })
    setAdded((prev) => new Set(prev).add(candidate.key))
  }

  /** Takes a feat instead of the numeric ability increase — tracked on the sheet (character.feats) and added to Features with its real SRD text, same as any other gained feature. */
  function applyFeat(candidate: Candidate, featId: string): void {
    const feat = FEATS.find((f) => f.id === featId)
    if (!feat) return
    onSave({
      feats: [...character.feats, feat.id],
      features: [
        ...character.features,
        { id: crypto.randomUUID(), name: feat.name, source: `${className} ${candidate.level} (Feat)`, description: feat.desc }
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
            {candidates.map((c) =>
              c.name === ASI_NAME ? (
                <AsiChooser
                  key={c.key}
                  candidate={c}
                  added={added.has(c.key)}
                  abilityScores={character.abilityScores}
                  onApplyAbility={applyAbilityIncrease}
                  onApplyFeat={applyFeat}
                />
              ) : (
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
              )
            )}
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

/** The one candidate row that's an actual choice with real mechanical weight — +2 to one ability, +1 to two, or a feat instead (gated on its prerequisite). Everything else in the list is "add this text to Features"; this one changes the sheet's numbers. */
function AsiChooser({
  candidate,
  added,
  abilityScores,
  onApplyAbility,
  onApplyFeat
}: {
  candidate: Candidate
  added: boolean
  abilityScores: AbilityScores
  onApplyAbility: (candidate: Candidate, increases: Partial<Record<Ability, number>>) => void
  onApplyFeat: (candidate: Candidate, featId: string) => void
}): JSX.Element {
  const [mode, setMode] = useState<'plus2' | 'plus1plus1' | 'feat'>('plus2')
  const [abilityA, setAbilityA] = useState<Ability>('str')
  const [abilityB, setAbilityB] = useState<Ability>('dex')
  const [featId, setFeatId] = useState<string>(FEATS[0]?.id ?? '')

  function apply(): void {
    if (mode === 'plus2') onApplyAbility(candidate, { [abilityA]: 2 })
    else if (mode === 'plus1plus1') onApplyAbility(candidate, { [abilityA]: 1, [abilityB]: 1 })
    else if (featId) onApplyFeat(candidate, featId)
  }

  const selectedFeat = FEATS.find((f) => f.id === featId)
  const featBlocked = mode === 'feat' && selectedFeat && !meetsFeatPrerequisite(selectedFeat, abilityScores)

  return (
    <div className="gb-card" style={{ padding: 'var(--space-3)' }}>
      <strong>
        Lv {candidate.level} — {candidate.name}
      </strong>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 var(--space-2)' }}>
        {candidate.description}
      </div>

      {added ? (
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Applied.</span>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            {(
              [
                ['plus2', '+2 to one'],
                ['plus1plus1', '+1 to two'],
                ['feat', 'Take a feat']
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                style={{
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  background: mode === m ? 'var(--accent-subtle)' : 'transparent',
                  color: mode === m ? 'var(--accent-hover)' : 'var(--text-secondary)',
                  fontSize: 11,
                  cursor: 'pointer'
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {mode === 'plus2' && (
              <select className="gb-input" value={abilityA} onChange={(e) => setAbilityA(e.target.value as Ability)} style={{ fontSize: 12, flex: 1 }}>
                {ABILITIES.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} ({abilityScores[a.id]} → {abilityScores[a.id] + 2})
                  </option>
                ))}
              </select>
            )}
            {mode === 'plus1plus1' && (
              <>
                <select className="gb-input" value={abilityA} onChange={(e) => setAbilityA(e.target.value as Ability)} style={{ fontSize: 12, flex: 1 }}>
                  {ABILITIES.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label} ({abilityScores[a.id]} → {abilityScores[a.id] + 1})
                    </option>
                  ))}
                </select>
                <select className="gb-input" value={abilityB} onChange={(e) => setAbilityB(e.target.value as Ability)} style={{ fontSize: 12, flex: 1 }}>
                  {ABILITIES.filter((a) => a.id !== abilityA).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label} ({abilityScores[a.id]} → {abilityScores[a.id] + 1})
                    </option>
                  ))}
                </select>
              </>
            )}
            {mode === 'feat' && (
              <select className="gb-input" value={featId} onChange={(e) => setFeatId(e.target.value)} style={{ fontSize: 12, flex: 1 }}>
                {FEATS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                    {f.prerequisite ? ` (requires ${f.prerequisite})` : ''}
                  </option>
                ))}
              </select>
            )}
            <Button
              variant="primary"
              onClick={apply}
              disabled={!!featBlocked}
              style={{ flexShrink: 0, fontSize: 12, padding: '4px 10px' }}
            >
              Apply
            </Button>
          </div>
          {featBlocked && (
            <p style={{ fontSize: 11, color: 'var(--danger)', margin: '4px 0 0' }}>
              Doesn't meet the prerequisite ({selectedFeat!.prerequisite}).
            </p>
          )}
        </>
      )}
    </div>
  )
}
