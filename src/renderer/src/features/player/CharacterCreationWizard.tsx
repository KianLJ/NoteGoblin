import { useMemo, useState, type ReactNode } from 'react'
import { Modal } from '../../ui/Modal'
import { Button } from '../../ui/Button'
import {
  ABILITIES,
  ALIGNMENTS,
  BACKGROUNDS,
  CLASSES,
  RACES,
  STANDARD_ARRAY,
  abilityModifier,
  computeMaxHp,
  emptyCharacterSheet,
  formatModifier,
  type Ability,
  type AbilityScores,
  type Appearance,
  type CharacterSheetData,
  type SkillName
} from '@shared/dnd5e'

interface CharacterCreationWizardProps {
  onCreate: (name: string, sheet: CharacterSheetData) => void
  onClose: () => void
}

type AbilityMethod = 'standard' | 'manual'

const STEP_TITLES = ['Name', 'Race', 'Class', 'Background', 'Ability Scores', 'Review']

/**
 * Guided multi-step character builder — name -> race -> class (+ skill
 * picks) -> background -> ability scores -> review. Assembles a full
 * CharacterSheetData with sensible derived defaults (AC, HP, proficiency
 * bonus flows from level via shared/dnd5e helpers) and hands it to
 * onCreate. Everything it produces stays editable afterward in
 * CharacterSheetEditor — this just gets a real 5e character off the
 * ground instead of an empty shell.
 */
export function CharacterCreationWizard({ onCreate, onClose }: CharacterCreationWizardProps): JSX.Element {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [raceId, setRaceId] = useState<string | null>(null)
  const [classId, setClassId] = useState<string | null>(null)
  const [chosenSkills, setChosenSkills] = useState<SkillName[]>([])
  const [backgroundId, setBackgroundId] = useState<string | null>(null)
  const [abilityMethod, setAbilityMethod] = useState<AbilityMethod>('standard')
  const [standardAssignment, setStandardAssignment] = useState<Record<Ability, number | null>>({
    str: null,
    dex: null,
    con: null,
    int: null,
    wis: null,
    cha: null
  })
  const [manualScores, setManualScores] = useState<AbilityScores>({
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10
  })
  const [alignment, setAlignment] = useState('')
  const [appearance, setAppearance] = useState<Appearance>({
    age: '',
    height: '',
    weight: '',
    eyes: '',
    skin: '',
    hair: ''
  })

  const race = useMemo(() => RACES.find((r) => r.id === raceId) ?? null, [raceId])
  const cls = useMemo(() => CLASSES.find((c) => c.id === classId) ?? null, [classId])
  const background = useMemo(() => BACKGROUNDS.find((b) => b.id === backgroundId) ?? null, [backgroundId])

  const baseScores: AbilityScores =
    abilityMethod === 'standard'
      ? {
          str: standardAssignment.str ?? 10,
          dex: standardAssignment.dex ?? 10,
          con: standardAssignment.con ?? 10,
          int: standardAssignment.int ?? 10,
          wis: standardAssignment.wis ?? 10,
          cha: standardAssignment.cha ?? 10
        }
      : manualScores

  const finalScores: AbilityScores = ABILITIES.reduce((acc, { id }) => {
    acc[id] = baseScores[id] + (race?.abilityBonuses[id] ?? 0)
    return acc
  }, {} as AbilityScores)

  function canProceed(): boolean {
    if (step === 0) return name.trim().length > 0
    if (step === 1) return raceId !== null
    if (step === 2) return classId !== null && chosenSkills.length === cls?.skillChoice.choose
    if (step === 3) return backgroundId !== null
    if (step === 4) {
      if (abilityMethod === 'manual') return true
      return ABILITIES.every(({ id }) => standardAssignment[id] !== null)
    }
    return true
  }

  function usedStandardValues(exceptAbility?: Ability): number[] {
    return ABILITIES.filter(({ id }) => id !== exceptAbility)
      .map(({ id }) => standardAssignment[id])
      .filter((v): v is number => v !== null)
  }

  function toggleSkill(skill: SkillName): void {
    setChosenSkills((prev) => {
      if (prev.includes(skill)) return prev.filter((s) => s !== skill)
      if (cls && prev.length >= cls.skillChoice.choose) return prev
      return [...prev, skill]
    })
  }

  function handleCreate(): void {
    const skillProficiencies: Partial<Record<SkillName, 'proficient' | 'expertise'>> = {}
    for (const skill of background?.skillProficiencies ?? []) skillProficiencies[skill] = 'proficient'
    for (const skill of chosenSkills) skillProficiencies[skill] = 'proficient'

    const classes = cls ? [{ className: cls.name, level: 1 }] : []

    const sheet: CharacterSheetData = {
      ...emptyCharacterSheet(),
      race: race?.name ?? '',
      classes,
      background: background?.name ?? '',
      alignment,
      appearance,
      abilityScores: finalScores,
      savingThrowProficiencies: cls?.savingThrowProficiencies ?? [],
      skillProficiencies,
      currentHp: computeMaxHp(classes, finalScores),
      spellcastingAbility: cls?.spellcastingAbility ?? null,
      features: background
        ? [{ id: crypto.randomUUID(), name: background.feature.name, source: background.name, description: background.feature.description }]
        : []
    }

    onCreate(name.trim(), sheet)
  }

  return (
    <Modal onClose={onClose} width={640}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22 }}>Create Character</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            Step {step + 1} of {STEP_TITLES.length}: {STEP_TITLES[step]}
          </p>
        </div>

        <div style={{ minHeight: 320 }}>
          {step === 0 && (
            <div>
              <label className="gb-label" htmlFor="wizard-name">
                Character Name
              </label>
              <input
                id="wizard-name"
                className="gb-input"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Elowen Brightwood"
              />
            </div>
          )}

          {step === 1 && (
            <CardGrid>
              {RACES.map((r) => (
                <PickCard key={r.id} selected={raceId === r.id} onClick={() => setRaceId(r.id)}>
                  <strong>{r.name}</strong>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {Object.entries(r.abilityBonuses)
                      .map(([a, v]) => `${a.toUpperCase()} +${v}`)
                      .join(', ')}
                    {' · Speed '}
                    {r.speed}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {r.traits.join(', ')}
                  </div>
                </PickCard>
              ))}
            </CardGrid>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <CardGrid>
                {CLASSES.map((c) => (
                  <PickCard
                    key={c.id}
                    selected={classId === c.id}
                    onClick={() => {
                      setClassId(c.id)
                      setChosenSkills([])
                    }}
                  >
                    <strong>{c.name}</strong>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      d{c.hitDie} hit die · Saves: {c.savingThrowProficiencies.map((a) => a.toUpperCase()).join(', ')}
                    </div>
                    {c.spellcastingAbility && (
                      <div style={{ fontSize: 12, color: 'var(--accent)' }}>Spellcaster</div>
                    )}
                  </PickCard>
                ))}
              </CardGrid>

              {cls && (
                <div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 6px' }}>
                    Choose {cls.skillChoice.choose} skills ({chosenSkills.length}/{cls.skillChoice.choose})
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {cls.skillChoice.from.map((skill) => (
                      <SkillChip
                        key={skill}
                        label={skill}
                        selected={chosenSkills.includes(skill)}
                        onClick={() => toggleSkill(skill)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <CardGrid>
              {BACKGROUNDS.map((b) => (
                <PickCard key={b.id} selected={backgroundId === b.id} onClick={() => setBackgroundId(b.id)}>
                  <strong>{b.name}</strong>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Skills: {b.skillProficiencies.join(', ')}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                    <em>{b.feature.name}:</em> {b.feature.description}
                  </div>
                </PickCard>
              ))}
            </CardGrid>
          )}

          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <Button
                  variant={abilityMethod === 'standard' ? 'primary' : 'secondary'}
                  onClick={() => setAbilityMethod('standard')}
                >
                  Standard Array
                </Button>
                <Button
                  variant={abilityMethod === 'manual' ? 'primary' : 'secondary'}
                  onClick={() => setAbilityMethod('manual')}
                >
                  Manual Entry
                </Button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)' }}>
                {ABILITIES.map(({ id, label }) => {
                  const raceBonus = race?.abilityBonuses[id] ?? 0
                  return (
                    <div key={id} className="gb-card" style={{ padding: 'var(--space-3)' }}>
                      <div className="gb-label" style={{ marginBottom: 6 }}>
                        {label}
                      </div>
                      {abilityMethod === 'standard' ? (
                        <select
                          className="gb-input"
                          value={standardAssignment[id] ?? ''}
                          onChange={(e) =>
                            setStandardAssignment((prev) => ({
                              ...prev,
                              [id]: e.target.value === '' ? null : Number(e.target.value)
                            }))
                          }
                        >
                          <option value="">—</option>
                          {STANDARD_ARRAY.filter(
                            (v) => v === standardAssignment[id] || !usedStandardValues(id).includes(v)
                          ).map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="number"
                          min={3}
                          max={20}
                          className="gb-input"
                          value={manualScores[id]}
                          onChange={(e) =>
                            setManualScores((prev) => ({ ...prev, [id]: Number(e.target.value) }))
                          }
                        />
                      )}
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        {raceBonus > 0 && `+${raceBonus} racial · `}
                        Total {baseScores[id] + raceBonus} ({formatModifier(abilityModifier(baseScores[id] + raceBonus))})
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {step === 5 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label className="gb-label" htmlFor="wizard-alignment">
                  Alignment
                </label>
                <select
                  id="wizard-alignment"
                  className="gb-input"
                  value={alignment}
                  onChange={(e) => setAlignment(e.target.value)}
                >
                  <option value="">Unaligned</option>
                  {ALIGNMENTS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }}>
                {(['age', 'height', 'weight', 'eyes', 'skin', 'hair'] as const).map((field) => (
                  <div key={field}>
                    <label className="gb-label" htmlFor={`wizard-${field}`} style={{ textTransform: 'capitalize' }}>
                      {field}
                    </label>
                    <input
                      id={`wizard-${field}`}
                      className="gb-input"
                      value={appearance[field]}
                      onChange={(e) => setAppearance((prev) => ({ ...prev, [field]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>

              <div className="gb-card" style={{ padding: 'var(--space-3)', fontSize: 13, lineHeight: 1.7 }}>
                <strong>{name || 'Unnamed'}</strong> — {race?.name ?? '?'} {cls?.name ?? '?'} 1, {background?.name ?? '?'}
                <br />
                AC {10 + abilityModifier(finalScores.dex)} · HP {computeMaxHp(cls ? [{ className: cls.name, level: 1 }] : [], finalScores)} · Speed{' '}
                {race?.speed ?? 30}
                <br />
                {ABILITIES.map(({ id, label }) => `${label.slice(0, 3)} ${finalScores[id]} (${formatModifier(abilityModifier(finalScores[id]))})`).join(' · ')}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {step > 0 && (
              <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            )}
            {step < STEP_TITLES.length - 1 ? (
              <Button variant="primary" disabled={!canProceed()} onClick={() => setStep((s) => s + 1)}>
                Next
              </Button>
            ) : (
              <Button variant="primary" disabled={!name.trim()} onClick={handleCreate}>
                Create Character
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

function CardGrid({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 'var(--space-2)',
        maxHeight: 340,
        overflowY: 'auto',
        paddingRight: 4
      }}
    >
      {children}
    </div>
  )
}

function PickCard({
  selected,
  onClick,
  children
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: 'var(--space-3)',
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-subtle)'}`,
        background: selected ? 'var(--accent-subtle)' : 'var(--bg-surface-raised)',
        cursor: 'pointer',
        color: 'var(--text-primary)'
      }}
    >
      {children}
    </button>
  )
}

function SkillChip({
  label,
  selected,
  onClick
}: {
  label: string
  selected: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 10px',
        borderRadius: 999,
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-subtle)'}`,
        background: selected ? 'var(--accent-subtle)' : 'transparent',
        color: selected ? 'var(--accent-hover)' : 'var(--text-secondary)',
        fontSize: 12,
        cursor: 'pointer'
      }}
    >
      {label}
    </button>
  )
}
