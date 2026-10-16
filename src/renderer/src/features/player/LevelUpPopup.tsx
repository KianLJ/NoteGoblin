import { useState, type ReactNode } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import type { CharacterSheetData } from '@shared/dnd5e'
import type { DerivedChoice } from '@shared/content/engine'
import { normalizeSheet } from '@shared/content/migrate'
import { deriveSheet } from '@shared/content/sheet'
import { Modal } from '../../ui/Modal'
import { Button } from '../../ui/Button'
import { SubclassChooser } from './AsiChoosers'
import { ChoiceCard, useChoiceEditor } from './ChoiceCards'

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

/** Total slots per spell level across every pool (Pact Magic included), as the sheet shows them. */
function slotTotals(sheet: CharacterSheetData): Record<number, number> {
  const totals: Record<number, number> = {}
  for (const pool of Object.values(deriveSheet(sheet).derived.spellcasting.slots)) {
    for (const [lvl, n] of Object.entries(pool)) totals[Number(lvl)] = (totals[Number(lvl)] ?? 0) + n
  }
  return totals
}

/**
 * A step-by-step recap of the class level(s) you just crossed, plus every
 * choice that grants — one slide at a time, Next/Back between them. The
 * first slide (if there's anything to recap) is a read-only summary of the
 * new features, resources and spell slots; every slide after that is
 * exactly one decision, rendered with the same generic ChoiceCard as the
 * Features tab (so a homebrew class's choices work here too) — resolving
 * one here and resolving it later in Features are the same action.
 *
 * Choice slides are computed from the character's *current* state (not a
 * from/to delta) — anything still unresolved for this class shows up,
 * including something left unresolved from an earlier level-up, so this
 * doubles as a "catch up on what you skipped" flow. Resolving a slide
 * updates the character, which shrinks the recomputed slide list by that
 * one entry — the slide index isn't touched, so the next still-open item
 * slides into view without double-advancing. A choice whose pick opens a
 * nested choice (an ASI's ability scores) stays on its slide until that's
 * done too.
 */
export function LevelUpPopup({ character, className, fromLevel, toLevel, onSave, onClose }: LevelUpPopupProps): JSX.Element | null {
  const [slideIndex, setSlideIndex] = useState(0)
  const setPicks = useChoiceEditor(character, onSave)

  const normalized = normalizeSheet(character)
  const classIndex = normalized.classes.findIndex((c) => c.className.toLowerCase() === className.toLowerCase())
  const classLevel = classIndex >= 0 ? normalized.classes[classIndex] : undefined
  const { derived, registry } = deriveSheet(character)
  const cls = classLevel?.classId ? registry.get('classes', classLevel.classId) : undefined
  if (!classLevel || !cls) return null
  const classId = cls.fullId
  const subclassId = classLevel.subclassId

  function chooseSubclass(name: string): void {
    const nextClasses = character.classes.map((c, i) => (i === classIndex ? { ...c, subclass: name } : c))
    onSave({ classes: nextClasses })
  }

  // ---- Recap (informational only, strictly this level-up's delta) ----
  const isOwn = (key: string): boolean => !key.includes('#') && (key.startsWith(`class:${classId}:`) || (!!subclassId && key.startsWith(`subclass:${subclassId}:`)))
  const newFeatures = derived.features.filter((f) => isOwn(f.key) && f.level !== undefined && f.level > fromLevel && f.level <= toLevel)
  const before: CharacterSheetData = { ...character, classes: character.classes.map((c, i) => (i === classIndex ? { ...c, level: fromLevel } : c)) }
  const derivedBefore = deriveSheet(before).derived
  const resourceChanges = derived.resources
    .filter((r) => r.className === cls.def.name)
    .flatMap((r) => {
      const prev = derivedBefore.resources.find((x) => x.id === r.id)
      if (prev && r.max <= prev.max) return []
      return [{ resource: r, prevMax: prev?.max ?? 0, isNew: !prev }]
    })
  const slotsBefore = slotTotals(before)
  const slotsNow = slotTotals(character)
  const slotChanges = Object.entries(slotsNow)
    .map(([lvl, count]) => ({ level: Number(lvl), count, prevCount: slotsBefore[Number(lvl)] ?? 0 }))
    .filter((s) => s.count > s.prevCount)
    .sort((a, b) => a.level - b.level)

  const hasRecap = newFeatures.length > 0 || resourceChanges.length > 0 || slotChanges.length > 0

  // ---- Choices (cumulative — every currently-unresolved choice for this class, not just newly unlocked ones) ----
  const needsPick = (c: DerivedChoice): boolean => c.remaining > 0 || derived.choices.some((n) => n.parentKey === c.key && needsPick(n))
  const openChoices = derived.choices.filter((c) => !c.parentKey && c.classId === classId && needsPick(c))
  const subclasses = registry.all('subclasses').filter((s) => s.def.classId === cls.def.id || s.def.classId === cls.fullId)
  const subclassLabel = cls.def.subclassLabel ?? 'Subclass'

  const slides: Slide[] = []
  if (hasRecap) {
    slides.push({
      key: 'recap',
      render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {newFeatures.length > 0 && (
            <div>
              <div className="gb-label">New Features</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {newFeatures.map((f) => (
                  <div key={f.key} className="gb-card" style={{ padding: 'var(--space-3)', borderColor: f.key.startsWith('subclass:') ? 'var(--accent)' : undefined }}>
                    <strong>
                      Lv {f.level} — {f.name}
                    </strong>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{f.description}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {resourceChanges.length > 0 && (
            <div>
              <div className="gb-label">Resources</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {resourceChanges.map(({ resource, prevMax, isNew }) => {
                  const unit = resource.display === 'uses' ? 'uses' : 'points'
                  return (
                    <div key={resource.id} className="gb-card" style={{ padding: 'var(--space-3)' }}>
                      <strong>{resource.name}</strong>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {isNew ? `New — ${resource.max} ${unit}` : `${prevMax} → ${resource.max} ${unit}`}
                      </div>
                      {resource.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{resource.description}</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {slotChanges.length > 0 && (
            <div>
              <div className="gb-label">Spell Slots</div>
              <div className="gb-card" style={{ padding: 'var(--space-3)', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {slotChanges.map((s) => (
                  <div key={s.level} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{ORDINALS[s.level - 1] ?? `${s.level}th`}:</strong> {s.prevCount} → {s.count}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )
    })
  }

  if (classLevel.level >= cls.def.subclassLevel && !classLevel.subclass && subclasses.length > 0) {
    slides.push({
      key: 'subclass',
      render: () => (
        <SubclassChooser
          classLabel={className}
          featureName={subclassLabel}
          slotLevel={cls.def.subclassLevel}
          options={subclasses.map((s) => ({ id: s.def.id, name: s.def.name, classId: s.def.classId, flavor: s.def.description }))}
          onChoose={chooseSubclass}
        />
      )
    })
  }

  for (const choice of openChoices) {
    slides.push({ key: choice.key, render: () => <ChoiceCard choice={choice} all={derived.choices} onSetPicks={setPicks} /> })
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
