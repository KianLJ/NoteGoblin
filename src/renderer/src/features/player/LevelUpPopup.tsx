import type { CharacterSheet } from '@shared/ipc'
import {
  CLASSES,
  CLASS_RESOURCES,
  SUBCLASS_CHOICE_FEATURE_NAME,
  abilityModifier,
  asiSlotLevelsUpToLevel,
  curatedFeaturesForLevelUp,
  fightingStyleSlotLevelsUpToLevel,
  type Ability,
  type AsiSlotChoice,
  type CharacterSheetData
} from '@shared/dnd5e'
import { effectiveAbilityScores, groupedSubclassFeaturesForLevelUp, spellSlotsForClassLevel, subclassesForClass } from '@shared/compendium'
import { Modal } from '../../ui/Modal'
import { Button } from '../../ui/Button'
import { AsiSlotChooser, FightingStyleChooser, SubclassChooser } from './AsiChoosers'

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']

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

  // Subclass features gained this level-up — only meaningful once a subclass is actually chosen; a "choice"-shaped
  // one (e.g. Draconic Bloodline's ancestor) surfaces as its own resolvable slot rather than trying to cram a
  // chooser into this recap, same "resolve it in Features whenever you get to it" deal as ASI/Fighting Style.
  const chosenSubclass = classLevel?.subclass ? subclassOptions.find((s) => s.name === classLevel.subclass) : undefined
  const newSubclassFeatures = chosenSubclass
    ? groupedSubclassFeaturesForLevelUp(cls.id, chosenSubclass.id, fromLevel, toLevel).filter((g) => g.kind === 'single')
    : []

  // Every class resource whose max actually changed crossing these levels — newly gained (wasn't available at
  // fromLevel, is now) or simply grew (Rage's uses going from 2 to 3, say).
  const abilityMod = (a: Ability): number => abilityModifier(character.abilityScores[a])
  const resourceChanges = (CLASS_RESOURCES[cls.id] ?? []).flatMap((def) => {
    if (toLevel < def.minLevel) return []
    const prevMax = fromLevel >= def.minLevel ? def.max(fromLevel, abilityMod) : 0
    const nextMax = def.max(toLevel, abilityMod)
    if (nextMax <= prevMax) return []
    return [{ def, prevMax, nextMax, isNew: fromLevel < def.minLevel }]
  })

  // Every spell slot level whose count grew this level-up.
  const slotChanges = cls.spellcastingAbility
    ? spellSlotsForClassLevel(cls.id, toLevel)
        .map((count, i) => ({ level: i + 1, count, prevCount: spellSlotsForClassLevel(cls.id, fromLevel)[i] ?? 0 }))
        .filter((s) => s.count > s.prevCount)
    : []

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
            <div className="gb-label">New Class Features</div>
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

        {newSubclassFeatures.length > 0 && (
          <div>
            <div className="gb-label">New {classLevel?.subclass} Features</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {newSubclassFeatures.map((g) => {
                if (g.kind !== 'single') return null
                return (
                  <div key={`${g.feature.level}:${g.feature.name}`} className="gb-card" style={{ padding: 'var(--space-3)', borderColor: 'var(--accent)' }}>
                    <strong>
                      Lv {g.feature.level} — {g.feature.name}
                    </strong>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{g.feature.desc}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {resourceChanges.length > 0 && (
          <div>
            <div className="gb-label">Resources</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {resourceChanges.map(({ def, prevMax, nextMax, isNew }) => (
                <div key={def.id} className="gb-card" style={{ padding: 'var(--space-3)' }}>
                  <strong>{def.name}</strong>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {isNew ? `New — ${nextMax} ${def.kind === 'uses' ? 'uses' : 'points'}` : `${prevMax} → ${nextMax} ${def.kind === 'uses' ? 'uses' : 'points'}`}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{def.description}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {slotChanges.length > 0 && (
          <div>
            <div className="gb-label">Spell Slots</div>
            <div className="gb-card" style={{ padding: 'var(--space-3)', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {slotChanges.map((s) => (
                <div key={s.level} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{ORDINALS[s.level - 1]}:</strong> {s.prevCount} → {s.count}
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
          <AsiSlotChooser
            key={level}
            classLabel={className}
            level={level}
            abilityScores={effectiveAbilityScores(character.abilityScores, character.classes, character.asiSlotChoices)}
            onResolve={resolveAsiSlot}
          />
        ))}

        {curated.length === 0 &&
          newSubclassFeatures.length === 0 &&
          resourceChanges.length === 0 &&
          slotChanges.length === 0 &&
          !subclassNewlyUnresolved &&
          newlyUnresolvedAsiLevels.length === 0 &&
          newlyUnresolvedFightingStyleLevels.length === 0 && (
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
