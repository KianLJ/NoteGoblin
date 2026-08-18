import { useState, type CSSProperties, type ReactNode } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import {
  ABILITIES,
  ABILITY_DESCRIPTIONS,
  CLASSES,
  SKILLS,
  abilityModifier,
  activeAsiSlotChoices,
  activeFeatIds,
  computeInitiative,
  computeMaxHp,
  computeSpeed,
  formatModifier,
  hitDiceDisplay,
  hitDicePools,
  passivePerception,
  proficiencyBonus,
  savingThrowBonus,
  skillBonus,
  type Ability,
  type AbilityScores,
  type CharacterSheetData,
  type ClassLevel,
  type DeathSaves,
  type HitDicePool,
  type SkillName
} from '@shared/dnd5e'
import {
  FEATS,
  armorSpeedPenalty,
  computeArmorClassFromEquipment,
  effectiveAbilityScores,
  effectiveSavingThrowProficiencies,
  effectiveSkillAdvantage,
  effectiveSkillProficiencies,
  featNotes,
  featSpeedBonus,
  subclassesForClass
} from '@shared/compendium'
import { Button } from '../../../ui/Button'
import { Modal } from '../../../ui/Modal'
import { useAutosaveDraft } from '../useAutosaveDraft'
import { HoverDetailCard } from '../HoverDetailCard'
import { CombatTab } from './CombatTab'
import { AbilityIcon, HeartIcon, HitDiceIcon, InitiativeIcon, MoonIcon, PencilIcon, ShieldIcon, SpeedIcon, SunIcon } from './icons'

interface OverviewDraft {
  race: string
  classes: ClassLevel[]
  experiencePoints: number
  abilityScores: AbilityScores
  savingThrowProficiencies: Ability[]
  skillProficiencies: Partial<Record<SkillName, 'proficient' | 'expertise'>>
  otherProficiencies: string
  currentHp: number
  tempHp: number
  deathSaves: DeathSaves
  hitDiceUsed: Record<string, number>
}

interface OverviewTabProps {
  character: CharacterSheet
  onSave: (patch: Partial<CharacterSheetData>) => void
  /** Fired when a class's level is raised (not lowered) — CharacterSheetEditor pops LevelUpPopup, a shortcut for whatever the level you just crossed unlocked. Purely a convenience: the same choice is always available inline in Combat's Features tab (see FeaturesTab.tsx) whether or not this fires. */
  onLevelUp?: (className: string, fromLevel: number, toLevel: number) => void
  readOnly?: boolean
}

const CLASS_NAMES = CLASSES.map((c) => c.name)
const CUSTOM_CLASS = '__custom__'

function resetAllSlots(slots: Record<number, { total: number; used: number }>): Record<number, { total: number; used: number }> {
  return Object.fromEntries(Object.entries(slots).map(([lvl, s]) => [lvl, { ...s, used: 0 }]))
}

export function OverviewTab({ character, onSave, onLevelUp, readOnly }: OverviewTabProps): JSX.Element {
  const [customRows, setCustomRows] = useState<Set<number>>(new Set())
  const [shortRestOpen, setShortRestOpen] = useState(false)
  const [abilityEditMode, setAbilityEditMode] = useState(false)
  const [draft, setDraft] = useAutosaveDraft<OverviewDraft>(
    {
      race: character.race,
      classes: character.classes,
      experiencePoints: character.experiencePoints,
      abilityScores: character.abilityScores,
      savingThrowProficiencies: character.savingThrowProficiencies,
      skillProficiencies: character.skillProficiencies,
      otherProficiencies: character.otherProficiencies,
      currentHp: character.currentHp,
      tempHp: character.tempHp,
      deathSaves: character.deathSaves,
      hitDiceUsed: character.hitDiceUsed
    },
    onSave,
    readOnly
  )

  function patch(fields: Partial<OverviewDraft>): void {
    setDraft((prev) => ({ ...prev, ...fields }))
  }

  // Every taken feat's mechanical effects folded on top of the base sheet
  // values — every derived stat below reads from these, never from
  // draft.abilityScores/skillProficiencies/savingThrowProficiencies
  // directly, so a feat that grants an ability bonus or a proficiency
  // actually cascades into max HP, AC, initiative, saves, skills, passive
  // perception. The ability score *input fields* still bind to the raw
  // draft values — only derived, read-only numbers use the effective ones.
  const activeFeats = activeFeatIds(draft.classes, character.asiSlotChoices)
  const effScores = effectiveAbilityScores(draft.abilityScores, draft.classes, character.asiSlotChoices)
  const effSkillProficiencies = effectiveSkillProficiencies(draft.skillProficiencies, activeFeats)
  const effSaveProficiencies = effectiveSavingThrowProficiencies(draft.savingThrowProficiencies, activeFeats)
  const speedBonus = featSpeedBonus(activeFeats) + armorSpeedPenalty(character.equipment, effScores)
  const notes = featNotes(activeFeats)
  const skillAdvantage = effectiveSkillAdvantage(activeFeats, character.equipment)

  const maxHp = computeMaxHp(draft.classes, effScores)

  /** Raising a class's level bumps current HP by however much the (fully derived) max just went up, matching the 5e rule that HP gained on level-up is immediate, not just a higher ceiling. Whatever else the new level grants (class features, an ASI/feat slot, a subclass-choice slot) just appears on its own in Combat's Features tab — see FeaturesTab.tsx, which derives all of that live from class/level instead of requiring it to be accepted here. */
  function updateClass(index: number, fields: Partial<ClassLevel>): void {
    if (!draft.classes[index]) {
      patch({ classes: [...draft.classes, { className: '', level: 1, ...fields }] })
      return
    }
    const prev = draft.classes[index]
    const nextClasses = draft.classes.map((c, i) => (i === index ? { ...c, ...fields } : c))
    const updates: Partial<OverviewDraft> = { classes: nextClasses }

    if (fields.level !== undefined && fields.level > prev.level) {
      const prevMax = computeMaxHp(draft.classes, draft.abilityScores)
      const newMax = computeMaxHp(nextClasses, draft.abilityScores)
      updates.currentHp = draft.currentHp + (newMax - prevMax)
      onLevelUp?.(prev.className || fields.className || '', prev.level, fields.level)
    }

    patch(updates)
  }

  /** Any ability score can change here, but only Con affects max HP — computing the delta unconditionally (instead of special-casing Con) keeps this simple, and it's a no-op for the other five since their change contributes 0 to computeMaxHp. This is what makes an ability score improvement to Con retroactively raise HP, per the 5e rule. */
  function updateAbilityScore(ability: Ability, value: number): void {
    const prevMax = computeMaxHp(draft.classes, draft.abilityScores)
    const nextScores = { ...draft.abilityScores, [ability]: value }
    const newMax = computeMaxHp(draft.classes, nextScores)
    patch({ abilityScores: nextScores, currentHp: Math.max(0, draft.currentHp + (newMax - prevMax)) })
  }

  /** Every active bonus currently bumping one ability score — an ASI slot's flat increase, or a feat's fixed/chosen ability bonus — used both for the little hover tag on each ability card and for the removable list shown in edit mode. Removing one here deletes the underlying asiSlotChoices record (same effect as removing it from Features), since that record is the only place this bump lives. */
  function abilityBonusSources(ability: Ability): { slotId: string; label: string; amount: number }[] {
    const sources: { slotId: string; label: string; amount: number }[] = []
    for (const slot of activeAsiSlotChoices(draft.classes, character.asiSlotChoices)) {
      if (slot.kind === 'ability' && slot.abilityIncreases?.[ability]) {
        sources.push({ slotId: slot.id, label: `Ability Score Improvement (Lv ${slot.level})`, amount: slot.abilityIncreases[ability]! })
      } else if (slot.kind === 'feat') {
        const feat = FEATS.find((f) => f.id === slot.featId)
        for (const effect of feat?.effects ?? []) {
          if (effect.kind === 'abilityScore' && effect.ability === ability) sources.push({ slotId: slot.id, label: feat!.name, amount: effect.amount })
          else if (effect.kind === 'abilityScoreChoice' && slot.chosenAbility === ability) sources.push({ slotId: slot.id, label: feat!.name, amount: effect.amount })
        }
      }
    }
    return sources
  }

  function removeAbilityBonusSource(slotId: string): void {
    onSave({ asiSlotChoices: character.asiSlotChoices.filter((s) => s.id !== slotId) })
  }

  function toggleSave(ability: Ability): void {
    patch({
      savingThrowProficiencies: draft.savingThrowProficiencies.includes(ability)
        ? draft.savingThrowProficiencies.filter((a) => a !== ability)
        : [...draft.savingThrowProficiencies, ability]
    })
  }

  function cycleSkillProficiency(skill: SkillName): void {
    const current = draft.skillProficiencies[skill] ?? 'none'
    const next = current === 'none' ? 'proficient' : current === 'proficient' ? 'expertise' : 'none'
    const nextProficiencies = { ...draft.skillProficiencies }
    if (next === 'none') delete nextProficiencies[skill]
    else nextProficiencies[skill] = next
    patch({ skillProficiencies: nextProficiencies })
  }

  /** Long rest: full HP, all spell slots refresh, death saves clear, and all spent hit dice are fully restored (a house-rule simplification of the 5e default, which only recovers half). Short rest clears death saves, refreshes Warlock Pact Magic (the one class that recharges slots on a short rest), and opens the hit-die picker below so the player can choose which dice to spend. Neither one touches temp HP, which RAW only goes away when it's reduced to 0, not on a rest. */
  function longRest(): void {
    const updates = { currentHp: maxHp, deathSaves: { successes: 0, failures: 0 }, hitDiceUsed: {} }
    patch(updates)
    onSave({ ...updates, spellSlots: resetAllSlots(character.spellSlots) })
  }

  function shortRest(): void {
    patch({ deathSaves: { successes: 0, failures: 0 } })
    const isWarlock = draft.classes.some((c) => c.className.toLowerCase() === 'warlock')
    onSave({
      deathSaves: { successes: 0, failures: 0 },
      ...(isWarlock ? { spellSlots: resetAllSlots(character.spellSlots) } : {})
    })
    setShortRestOpen(true)
  }

  function rollHitDie(pool: HitDicePool): void {
    const conMod = abilityModifier(effScores.con)
    const roll = Math.floor(Math.random() * pool.hitDie) + 1
    const healed = Math.max(1, roll + conMod)
    const nextHp = Math.min(maxHp, draft.currentHp + healed)
    const nextUsed = { ...draft.hitDiceUsed, [pool.className]: pool.used + 1 }
    patch({ currentHp: nextHp, hitDiceUsed: nextUsed })
    onSave({ currentHp: nextHp, hitDiceUsed: nextUsed })
  }

  function setPrimaryClass(name: string): void {
    if (draft.classes.length === 0) patch({ classes: [{ className: name, level: 1 }] })
    else updateClass(0, { className: name })
  }

  const pb = proficiencyBonus(draft.classes)
  const primary = draft.classes[0]
  const additionalClasses = draft.classes.slice(1)
  const primaryIsCustom = customRows.has(0) || (!!primary && primary.className.trim() !== '' && !CLASS_NAMES.includes(primary.className))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {shortRestOpen && (
        <Modal onClose={() => setShortRestOpen(false)} width={380}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18 }}>Short Rest</h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                Spend hit dice to heal — roll and add your Constitution modifier. Death saves are already cleared.
              </p>
            </div>
            {hitDicePools(draft.classes, draft.hitDiceUsed).length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No recognized class to draw hit dice from.</p>
            ) : (
              hitDicePools(draft.classes, draft.hitDiceUsed).map((pool) => {
                const remaining = pool.total - pool.used
                return (
                  <div key={pool.className} className="gb-card" style={{ padding: 'var(--space-2) var(--space-3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13 }}>
                      {pool.className} — d{pool.hitDie}{' '}
                      <span style={{ color: 'var(--text-muted)' }}>
                        ({remaining}/{pool.total} left)
                      </span>
                    </span>
                    <Button variant="secondary" disabled={remaining <= 0} onClick={() => rollHitDie(pool)} style={{ fontSize: 12 }}>
                      Roll d{pool.hitDie}
                    </Button>
                  </div>
                )
              })
            )}
            <Button variant="primary" onClick={() => setShortRestOpen(false)}>
              Done
            </Button>
          </div>
        </Modal>
      )}

      <div
        style={{
          display: 'inline-flex',
          alignSelf: 'flex-start',
          maxWidth: '100%',
          width: 'fit-content',
          gap: 'var(--space-4)',
          alignItems: 'center',
          flexWrap: 'wrap',
          padding: 'var(--space-3) var(--space-4)',
          background: 'var(--bg-surface-raised)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)'
        }}
      >
        <HeaderField label="Race">
          <input className="gb-input" style={boxedInputStyle} value={draft.race} onChange={(e) => patch({ race: e.target.value })} />
        </HeaderField>

        <HeaderField label="Class">
          <select
            className="gb-input"
            style={boxedInputStyle}
            value={primaryIsCustom ? CUSTOM_CLASS : primary?.className ?? ''}
            onChange={(e) => {
              const v = e.target.value
              if (v === CUSTOM_CLASS) {
                setCustomRows((prev) => new Set(prev).add(0))
                setPrimaryClass('')
              } else {
                setCustomRows((prev) => {
                  const next = new Set(prev)
                  next.delete(0)
                  return next
                })
                setPrimaryClass(v)
              }
            }}
          >
            <option value="">Select…</option>
            {CLASS_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value={CUSTOM_CLASS}>Custom…</option>
          </select>
        </HeaderField>
        {primaryIsCustom && (
          <HeaderField label="Class Name">
            <input
              className="gb-input"
              style={boxedInputStyle}
              value={primary?.className ?? ''}
              onChange={(e) => setPrimaryClass(e.target.value)}
              placeholder="Class name"
              autoFocus
            />
          </HeaderField>
        )}
        <HeaderField label="Level">
          <input
            type="number"
            min={1}
            max={20}
            className="gb-input"
            style={{ ...boxedInputStyle, width: 52 }}
            value={primary?.level ?? 1}
            onChange={(e) => updateClass(0, { level: Number(e.target.value) })}
          />
        </HeaderField>
        <HeaderField label="Subclass">
          <SubclassField
            className={primary?.className ?? ''}
            level={primary?.level ?? 1}
            value={primary?.subclass ?? ''}
            onChange={(v) => updateClass(0, { subclass: v })}
            style={boxedInputStyle}
          />
        </HeaderField>

        <Divider />

        <HeaderField label="Experience">
          <input
            type="number"
            min={0}
            className="gb-input"
            style={{ ...boxedInputStyle, width: 80 }}
            value={draft.experiencePoints}
            onChange={(e) => patch({ experiencePoints: Number(e.target.value) })}
          />
        </HeaderField>
        <VitalStat label="Proficiency" value={formatModifier(pb)} />
        <VitalStat label="Perception" value={String(passivePerception(effScores, effSkillProficiencies, draft.classes))} />

        <Divider />

        <VitalStat
          label="AC"
          value={String(computeArmorClassFromEquipment(character.equipment, effScores))}
          icon={<ShieldIcon size={22} style={{ color: 'var(--accent)' }} />}
          accent
        />
        <VitalStat label="Initiative" value={formatModifier(computeInitiative(effScores))} icon={<InitiativeIcon />} />
        <VitalStat label="Speed" value={`${computeSpeed(draft.race) + speedBonus} ft`} icon={<SpeedIcon />} />
        <VitalStat label="Hit Dice" value={hitDiceDisplay(draft.classes)} icon={<HitDiceIcon />} />

        <Divider />

        <div
          className="gb-card"
          style={{
            padding: 'var(--space-2) var(--space-3)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            borderColor: 'var(--accent)',
            minWidth: 150
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <HeartIcon size={16} style={{ color: 'var(--danger)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Hit Points</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
            <input
              type="number"
              className="gb-input"
              style={{ width: 48, textAlign: 'center', fontSize: 18, fontWeight: 700, padding: '2px 4px' }}
              value={draft.currentHp}
              onChange={(e) => patch({ currentHp: Number(e.target.value) })}
            />
            <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>/</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', minWidth: 24, textAlign: 'center' }}>{maxHp}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <HeartIcon size={11} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Temp</span>
            <input
              type="number"
              className="gb-input"
              style={{ width: 40, textAlign: 'center', fontSize: 11, padding: '1px 4px' }}
              value={draft.tempHp}
              onChange={(e) => patch({ tempHp: Number(e.target.value) })}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <RestButton onClick={shortRest} icon={<SunIcon />}>
            Short
          </RestButton>
          <RestButton onClick={longRest} icon={<MoonIcon />}>
            Long
          </RestButton>
        </div>
      </div>

      {additionalClasses.length > 0 && (
        <div>
          <div className="gb-label">Additional Classes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {additionalClasses.map((c, offset) => {
              const i = offset + 1
              const isCustom = customRows.has(i) || (c.className.trim() !== '' && !CLASS_NAMES.includes(c.className))
              const selectValue = isCustom ? CUSTOM_CLASS : c.className
              return (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select
                    className="gb-input"
                    style={{ width: 150 }}
                    value={selectValue}
                    onChange={(e) => {
                      const v = e.target.value
                      if (v === CUSTOM_CLASS) {
                        setCustomRows((prev) => new Set(prev).add(i))
                        updateClass(i, { className: '' })
                      } else {
                        setCustomRows((prev) => {
                          const next = new Set(prev)
                          next.delete(i)
                          return next
                        })
                        updateClass(i, { className: v })
                      }
                    }}
                  >
                    <option value="">Select class…</option>
                    {CLASS_NAMES.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                    <option value={CUSTOM_CLASS}>Custom…</option>
                  </select>
                  {isCustom && (
                    <input
                      className="gb-input"
                      style={{ width: 130 }}
                      value={c.className}
                      onChange={(e) => updateClass(i, { className: e.target.value })}
                      placeholder="Class name"
                      autoFocus
                    />
                  )}
                  <input
                    type="number"
                    min={1}
                    max={20}
                    className="gb-input"
                    style={{ width: 56 }}
                    value={c.level}
                    onChange={(e) => updateClass(i, { level: Number(e.target.value) })}
                  />
                  <SubclassField
                    className={c.className}
                    level={c.level}
                    value={c.subclass ?? ''}
                    onChange={(v) => updateClass(i, { subclass: v })}
                    style={{ width: 150 }}
                  />
                  <button
                    type="button"
                    onClick={() => patch({ classes: draft.classes.filter((_, idx) => idx !== i) })}
                    style={removeBtnStyle}
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <button
        type="button"
        className="gb-btn gb-btn--ghost"
        style={{ alignSelf: 'flex-start', fontSize: 12 }}
        onClick={() => patch({ classes: [...draft.classes, { className: '', level: 1 }] })}
      >
        + Add Class (Multiclass)
      </button>

      {notes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {notes.map((n, i) => (
            <div
              key={i}
              className="gb-card"
              style={{ padding: 'var(--space-2) var(--space-3)', borderColor: 'var(--accent)', fontSize: 12 }}
            >
              <strong style={{ color: 'var(--accent-hover)' }}>{n.featName}.</strong> {n.text}
            </div>
          ))}
        </div>
      )}

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <div className="gb-label" style={{ margin: 0 }}>
            Ability Scores
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={() => setAbilityEditMode((v) => !v)}
              title={abilityEditMode ? 'Done editing' : 'Edit ability scores'}
              style={{
                background: 'none',
                border: 'none',
                color: abilityEditMode ? 'var(--accent-hover)' : 'var(--text-muted)',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <PencilIcon />
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 'var(--space-2)' }}>
          {ABILITIES.map(({ id, label }) => {
            const bonuses = abilityBonusSources(id)
            const bonusExtra =
              bonuses.length > 0
                ? { label: 'Bonuses', value: bonuses.map((b) => `+${b.amount} — ${b.label}`).join('; ') }
                : undefined
            return (
              <HoverDetailCard key={id} title={label} fields={[]} description={ABILITY_DESCRIPTIONS[id]} extra={bonusExtra}>
                <div className="gb-card" style={{ padding: 'var(--space-2)', textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                    <AbilityIcon ability={id} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label.slice(0, 3)}</span>
                  </div>
                  {abilityEditMode ? (
                    <input
                      type="number"
                      min={1}
                      max={30}
                      className="gb-input"
                      style={{ textAlign: 'center', marginTop: 4 }}
                      value={draft.abilityScores[id]}
                      onChange={(e) => updateAbilityScore(id, Number(e.target.value))}
                    />
                  ) : (
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4, cursor: 'default' }}>
                      {effScores[id]}
                      {bonuses.length > 0 && (
                        <span
                          style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', verticalAlign: 'super', marginLeft: 2 }}
                          title={bonusExtra?.value}
                        >
                          +{bonuses.reduce((sum, b) => sum + b.amount, 0)}
                        </span>
                      )}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{formatModifier(abilityModifier(effScores[id]))}</div>
                  {abilityEditMode && bonuses.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
                      {bonuses.map((b) => (
                        <div
                          key={b.slotId}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 4,
                            fontSize: 10,
                            color: 'var(--text-muted)',
                            background: 'var(--bg-sunken)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '2px 4px'
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            +{b.amount} {b.label}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeAbilityBonusSource(b.slotId)}
                            title="Remove"
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, padding: 0 }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </HoverDetailCard>
            )
          })}
        </div>
      </div>

      <div>
        <div className="gb-label">Saving Throws</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 'var(--space-2)' }}>
          {ABILITIES.map(({ id, label }) => {
            const proficient = effSaveProficiencies.includes(id)
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleSave(id)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                  padding: '6px 2px',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${proficient ? 'var(--accent)' : 'var(--border-subtle)'}`,
                  background: proficient ? 'var(--accent-subtle)' : 'transparent',
                  cursor: 'pointer'
                }}
              >
                <span style={{ fontSize: 10, textTransform: 'uppercase', color: proficient ? 'var(--accent-hover)' : 'var(--text-muted)' }}>
                  {label.slice(0, 3)}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: proficient ? 'var(--accent-hover)' : 'var(--text-primary)' }}>
                  {formatModifier(savingThrowBonus(id, effScores, effSaveProficiencies, draft.classes))}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {draft.currentHp <= 0 && (
        <div>
          <div className="gb-label">Death Saves</div>
          <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
            <DeathSaveRow
              label="Successes"
              count={draft.deathSaves.successes}
              onChange={(n) => patch({ deathSaves: { ...draft.deathSaves, successes: n } })}
            />
            <DeathSaveRow
              label="Failures"
              count={draft.deathSaves.failures}
              onChange={(n) => patch({ deathSaves: { ...draft.deathSaves, failures: n } })}
            />
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 'var(--space-4)', alignItems: 'start' }}>
        <div>
          <div className="gb-label">Skills</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', rowGap: 5, columnGap: 'var(--space-2)', alignItems: 'center' }}>
            {SKILLS.map(({ id, ability }) => (
              <div key={id} style={{ display: 'contents' }}>
                <span style={{ fontSize: 12 }}>
                  {id} <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>({ability.toUpperCase()})</span>
                  {skillAdvantage[id] && <AdvantageTag kind={skillAdvantage[id]!} skill={id} />}
                </span>
                <ProficiencyDot value={effSkillProficiencies[id] ?? 'none'} onClick={() => cycleSkillProficiency(id)} />
                <span style={{ fontSize: 12, width: 28, textAlign: 'right' }}>
                  {formatModifier(skillBonus(id, effScores, effSkillProficiencies, draft.classes))}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="gb-label">Combat</div>
          <CombatTab character={character} onSave={onSave} readOnly={readOnly} />
        </div>
      </div>

      <Field label="Other Proficiencies &amp; Languages">
        <textarea
          className="gb-input"
          style={{ minHeight: 70, resize: 'vertical' }}
          value={draft.otherProficiencies}
          onChange={(e) => patch({ otherProficiencies: e.target.value })}
          placeholder="Armor, weapons, tools, languages…"
        />
      </Field>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div>
      <div className="gb-label">{label}</div>
      {children}
    </div>
  )
}

/** SRD-backed subclass picker — a dropdown of the real SRD subclass(es) for a recognized class (just one per class, per the SRD's own scope; see shared/compendium.ts), falling back to a freeform text input for an unrecognized/homebrew class name. A legacy or homebrew value that doesn't match any SRD option is kept as an extra "(custom)" option instead of being silently dropped. */
function SubclassField({
  className,
  level,
  value,
  onChange,
  style
}: {
  className: string
  /** This class's current level — gates the dropdown until the class's real subclass-choice level, since normal D&D doesn't let you pick one early. Ignored for homebrew classes (no SRD data to gate against anyway). */
  level: number
  value: string
  onChange: (value: string) => void
  style?: CSSProperties
}): JSX.Element {
  const cls = CLASSES.find((c) => c.name.toLowerCase() === className.trim().toLowerCase())
  const options = cls ? subclassesForClass(cls.id) : []
  if (options.length === 0) {
    return <input className="gb-input" style={style} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Subclass" />
  }
  // Not yet chosen and not yet eligible — normal 5e picks a subclass via
  // the inline chooser that auto-appears in Combat's Features tab once the
  // class reaches subclassLevel (see FeaturesTab.tsx's SubclassChooser),
  // not freely here. Once it's been set (or the eligible level is reached,
  // e.g. an existing character that predates this gate), the field opens
  // back up so a mistaken pick is still correctable.
  if (!value && cls && level < cls.subclassLevel) {
    return (
      <div
        style={{ ...style, padding: '5px 8px', fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}
        title={`Chosen via Level Up at ${cls.name} level ${cls.subclassLevel}`}
      >
        Chosen at level {cls.subclassLevel}
      </div>
    )
  }
  const isKnownOrEmpty = value === '' || options.some((o) => o.name === value)
  return (
    <select className="gb-input" style={style} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select subclass…</option>
      {!isKnownOrEmpty && <option value={value}>{value} (custom)</option>}
      {options.map((o) => (
        <option key={o.id} value={o.name}>
          {o.name}
        </option>
      ))}
    </select>
  )
}

function HeaderField({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div>
      <div className="gb-label" style={{ fontSize: 11, marginBottom: 2 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

/** Read-only — AC/Initiative/Speed/Hit Dice/Proficiency/Perception are all fully derived from ability scores/race/classes (see shared/dnd5e's compute* helpers), so there's nothing to type in here. */
function VitalStat({ label, value, icon, accent }: { label: string; value: string; icon?: ReactNode; accent?: boolean }): JSX.Element {
  return (
    <div style={{ textAlign: 'center', minWidth: 48 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginBottom: 2 }}>
        {icon}
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: accent ? 'var(--accent)' : 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}

/** A small green "A" / red "D" badge — advantage or disadvantage currently in effect on a skill (from a feat's skillAdvantage/skillDisadvantage effect, or equipped armor's Stealth disadvantage; see effectiveSkillAdvantage in shared/compendium.ts). Purely informational, same read-only hover-for-detail spirit as the rest of the sheet. */
function AdvantageTag({ kind, skill }: { kind: 'advantage' | 'disadvantage'; skill: string }): JSX.Element {
  return (
    <span
      title={kind === 'advantage' ? `Advantage on ${skill} checks` : `Disadvantage on ${skill} checks`}
      style={{
        display: 'inline-block',
        marginLeft: 3,
        width: 12,
        height: 12,
        lineHeight: '12px',
        textAlign: 'center',
        fontSize: 9,
        fontWeight: 700,
        borderRadius: '50%',
        color: '#fff',
        background: kind === 'advantage' ? 'var(--success)' : 'var(--danger)'
      }}
    >
      {kind === 'advantage' ? 'A' : 'D'}
    </span>
  )
}

/** Cycles none -> proficient (filled) -> expertise (filled + ring) -> none on each click, instead of a dropdown. */
function ProficiencyDot({ value, onClick }: { value: 'none' | 'proficient' | 'expertise'; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={value === 'none' ? 'Not proficient (click to cycle)' : value === 'proficient' ? 'Proficient' : 'Expertise'}
      style={{
        width: 16,
        height: 16,
        borderRadius: '50%',
        border: '1.5px solid var(--border-strong)',
        background: value !== 'none' ? 'var(--accent)' : 'transparent',
        boxShadow: value === 'expertise' ? '0 0 0 2px var(--bg-surface), 0 0 0 3.5px var(--accent)' : 'none',
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0
      }}
    />
  )
}

function RestButton({ onClick, icon, children }: { onClick: () => void; icon: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.02em',
        padding: '6px 10px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--accent)',
        background: 'var(--accent-subtle)',
        color: 'var(--accent-hover)',
        cursor: 'pointer',
        whiteSpace: 'nowrap'
      }}
    >
      {icon}
      {children}
    </button>
  )
}

function DeathSaveRow({ label, count, onChange }: { label: string; count: number; onChange: (n: number) => void }): JSX.Element {
  return (
    <div>
      <div className="gb-label" style={{ fontSize: 10 }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {[1, 2, 3].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(count === i ? i - 1 : i)}
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              border: '1px solid var(--border-strong)',
              background: i <= count ? 'var(--accent)' : 'transparent',
              cursor: 'pointer'
            }}
          />
        ))}
      </div>
    </div>
  )
}

function Divider(): JSX.Element {
  return <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-subtle)' }} />
}

const boxedInputStyle: CSSProperties = { fontSize: 14, padding: '5px 8px', width: 110 }

const removeBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 18,
  lineHeight: 1,
  padding: '0 6px'
}
