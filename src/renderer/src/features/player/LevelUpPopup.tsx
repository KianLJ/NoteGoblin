import type { CharacterSheet } from '@shared/ipc'
import {
  CLASSES,
  SUBCLASS_CHOICE_FEATURE_NAME,
  asiSlotLevelsUpToLevel,
  curatedFeaturesForLevelUp,
  fightingStyleSlotLevelsUpToLevel,
  type AsiSlotChoice,
  type CharacterSheetData
} from '@shared/dnd5e'
import { subclassesForClass } from '@shared/compendium'
import { Modal } from '../../ui/Modal'
import { Button } from '../../ui/Button'
import { AsiSlotChooser, FightingStyleChooser, SubclassChooser } from './AsiChoosers'

interface LevelUpPopupProps {
  character: CharacterSheet
  className: string
  fromLevel: number
  toLevel: number
  onSave: (patch: Partial<CharacterSheetData>) => void
  onClose: () => void
}

/**
 * A convenience shortcut for the class levels you just crossed — recaps
 * whatever the class table grants there and, if there's a real decision to
 * make (an Ability Score Improvement slot, a subclass pick), lets you
 * resolve it right here instead of hunting for it in Combat's Features
 * tab. It writes through the exact same onResolveAsi/onChooseSubclass
 * calls FeaturesTab.tsx's inline choosers use, so closing this without
 * deciding loses nothing — the slot just sits there unresolved, still
 * available in Features, until you get to it.
 */
export function LevelUpPopup({ character, className, fromLevel, toLevel, onSave, onClose }: LevelUpPopupProps): JSX.Element | null {
  const cls = CLASSES.find((c) => c.name.toLowerCase() === className.toLowerCase())
  if (!cls) return null

  const subclassChoiceFeatureName = SUBCLASS_CHOICE_FEATURE_NAME[cls.id]
  const curated = curatedFeaturesForLevelUp(className, fromLevel, toLevel).filter(
    (f) => f.name !== 'Ability Score Improvement' && f.name !== 'Fighting Style' && f.name !== subclassChoiceFeatureName
  )
  const classIndex = character.classes.findIndex((c) => c.className.toLowerCase() === className.toLowerCase())
  const classLevel = classIndex >= 0 ? character.classes[classIndex] : undefined

  const newlyUnresolvedAsiLevels = asiSlotLevelsUpToLevel(className, toLevel)
    .filter((level) => level > fromLevel)
    .filter((level) => !character.asiSlotChoices.some((s) => s.level === level && s.className.toLowerCase() === className.toLowerCase()))

  const newlyUnresolvedFightingStyleLevels = fightingStyleSlotLevelsUpToLevel(className, toLevel)
    .filter((level) => level > fromLevel)
    .filter((level) => !character.asiSlotChoices.some((s) => s.level === level && s.className.toLowerCase() === className.toLowerCase()))

  const subclassOptions = subclassesForClass(cls.id)
  const subclassNewlyUnresolved = toLevel >= cls.subclassLevel && fromLevel < cls.subclassLevel && !classLevel?.subclass && subclassOptions.length > 0

  function resolveAsiSlot(entry: Omit<AsiSlotChoice, 'id'>): void {
    onSave({ asiSlotChoices: [...character.asiSlotChoices, { id: crypto.randomUUID(), ...entry }] })
  }

  function chooseSubclass(name: string): void {
    if (classIndex < 0) return
    const nextClasses = character.classes.map((c, i) => (i === classIndex ? { ...c, subclass: name } : c))
    onSave({ classes: nextClasses })
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

        {curated.length > 0 && (
          <div>
            <div className="gb-label">New Features</div>
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

        {subclassNewlyUnresolved && (
          <SubclassChooser
            classLabel={className}
            featureName={subclassChoiceFeatureName ?? 'Subclass'}
            slotLevel={cls.subclassLevel}
            options={subclassOptions}
            onChoose={chooseSubclass}
          />
        )}

        {newlyUnresolvedFightingStyleLevels.map((level) => (
          <FightingStyleChooser key={`fs:${level}`} classLabel={className} level={level} onResolve={resolveAsiSlot} />
        ))}

        {newlyUnresolvedAsiLevels.map((level) => (
          <AsiSlotChooser key={level} classLabel={className} level={level} abilityScores={character.abilityScores} onResolve={resolveAsiSlot} />
        ))}

        {curated.length === 0 && !subclassNewlyUnresolved && newlyUnresolvedAsiLevels.length === 0 && newlyUnresolvedFightingStyleLevels.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Nothing new at this level for {className.toLowerCase()} — check the Class Table tab for the full progression.
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  )
}
