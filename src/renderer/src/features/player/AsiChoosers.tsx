import { useState } from 'react'
import { ABILITIES, type Ability, type AsiSlotChoice } from '@shared/dnd5e'
import { FEATS, SPELLS, meetsFeatPrerequisite, type CompendiumSpell, type FeatEffect } from '@shared/compendium'
import { Button } from '../../ui/Button'

// The native +2/+1+1 ASI slot already covers this feat's entire effect (a
// flat ability-score bump, no other benefit) — offering it again in the
// feat picker would just be a confusing duplicate path to the same outcome.
export const SELECTABLE_FEATS = FEATS.filter((f) => f.id !== 'ability-score-improvement')

/**
 * The one interactive choice with real mechanical weight in the whole
 * automatic feature system — +2 to one ability, +1 to two, or a feat
 * instead (gated on its prerequisite, including a feat's own level
 * requirement against this slot's level). Rendered both inline in
 * FeaturesTab.tsx (where the slot lives permanently until resolved) and in
 * LevelUpPopup.tsx (a convenience shortcut for the slot you just unlocked)
 * — both call the same onResolve, so there's exactly one way this data
 * actually gets written.
 */
export function AsiSlotChooser({
  classLabel,
  level,
  abilityScores,
  readOnly,
  onResolve
}: {
  classLabel: string
  level: number
  abilityScores: Record<Ability, number>
  readOnly?: boolean
  onResolve: (entry: Omit<AsiSlotChoice, 'id'>) => void
}): JSX.Element {
  const [mode, setMode] = useState<'plus2' | 'plus1plus1' | 'feat'>('plus2')
  const [abilityA, setAbilityA] = useState<Ability>('str')
  const [abilityB, setAbilityB] = useState<Ability>('dex')
  const [featId, setFeatId] = useState<string>(SELECTABLE_FEATS[0]?.id ?? '')
  const [featAbility, setFeatAbility] = useState<Ability>('str')
  const [spellCasterAbility, setSpellCasterAbility] = useState<Ability>('wis')
  const [cantripAId, setCantripAId] = useState('')
  const [cantripBId, setCantripBId] = useState('')
  const [leveledSpellId, setLeveledSpellId] = useState('')

  const selectedFeat = FEATS.find((f) => f.id === featId)
  const choiceEffect = selectedFeat?.effects?.find(
    (e): e is Extract<FeatEffect, { kind: 'abilityScoreChoice' }> => e.kind === 'abilityScoreChoice'
  )
  const spellChoiceEffect = selectedFeat?.effects?.find((e): e is Extract<FeatEffect, { kind: 'spellChoice' }> => e.kind === 'spellChoice')
  const effectiveFeatAbility = choiceEffect
    ? choiceEffect.options.includes(featAbility)
      ? featAbility
      : choiceEffect.options[0]
    : featAbility
  const featBlocked = selectedFeat && !meetsFeatPrerequisite(selectedFeat, abilityScores, level)

  const grantableCantrips: CompendiumSpell[] = spellChoiceEffect
    ? SPELLS.filter((s) => s.level === 0 && s.classes.some((c) => spellChoiceEffect.classes.includes(c)))
    : []
  const grantableLeveledSpells: CompendiumSpell[] = spellChoiceEffect
    ? SPELLS.filter((s) => s.level === spellChoiceEffect.spellLevel && s.classes.some((c) => spellChoiceEffect.classes.includes(c)))
    : []
  const spellChoiceReady = !spellChoiceEffect || (!!cantripAId && !!cantripBId && cantripAId !== cantripBId && !!leveledSpellId)

  function apply(): void {
    if (readOnly) return
    if (mode === 'plus2') onResolve({ className: classLabel, level, kind: 'ability', abilityIncreases: { [abilityA]: 2 } })
    else if (mode === 'plus1plus1') onResolve({ className: classLabel, level, kind: 'ability', abilityIncreases: { [abilityA]: 1, [abilityB]: 1 } })
    else if (featId && spellChoiceReady) {
      onResolve({
        className: classLabel,
        level,
        kind: 'feat',
        featId,
        chosenAbility: choiceEffect ? effectiveFeatAbility : spellChoiceEffect ? spellCasterAbility : undefined,
        chosenSpellIds: spellChoiceEffect ? [cantripAId, cantripBId, leveledSpellId] : undefined
      })
    }
  }

  return (
    <div className="gb-card" style={{ padding: 'var(--space-3)' }}>
      <strong>
        Ability Score Improvement — {classLabel} {level}
      </strong>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 var(--space-2)' }}>
        Increase one ability score by 2, or two scores by 1 each — or take a feat instead.
      </div>

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

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
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
          <>
            <select className="gb-input" value={featId} onChange={(e) => setFeatId(e.target.value)} style={{ fontSize: 12, flex: 1 }}>
              {SELECTABLE_FEATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                  {f.prerequisite ? ` (requires ${f.prerequisite})` : ''}
                </option>
              ))}
            </select>
            {choiceEffect && (
              <select
                className="gb-input"
                value={effectiveFeatAbility}
                onChange={(e) => setFeatAbility(e.target.value as Ability)}
                style={{ fontSize: 12, flex: 1 }}
                title={`Which ability this feat's +${choiceEffect.amount} applies to`}
              >
                {choiceEffect.options.map((a) => (
                  <option key={a} value={a}>
                    {a.toUpperCase()} ({abilityScores[a]} → {abilityScores[a] + choiceEffect.amount})
                  </option>
                ))}
              </select>
            )}
          </>
        )}
        <Button
          variant="primary"
          onClick={apply}
          disabled={readOnly || (mode === 'feat' && (!!featBlocked || !spellChoiceReady))}
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
      {mode === 'feat' && spellChoiceEffect && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            Choose your spellcasting ability for this feat's spells, plus {spellChoiceEffect.cantripCount} cantrips and{' '}
            {spellChoiceEffect.spellCount} level-{spellChoiceEffect.spellLevel} spell from the {spellChoiceEffect.classes.join('/')} list — always
            prepared, and they don't count against your normal spells known.
          </div>
          <select className="gb-input" value={spellCasterAbility} onChange={(e) => setSpellCasterAbility(e.target.value as Ability)} style={{ fontSize: 12 }}>
            {(['int', 'wis', 'cha'] as Ability[]).map((a) => (
              <option key={a} value={a}>
                {a.toUpperCase()}
              </option>
            ))}
          </select>
          <select className="gb-input" value={cantripAId} onChange={(e) => setCantripAId(e.target.value)} style={{ fontSize: 12 }}>
            <option value="">Choose a cantrip…</option>
            {grantableCantrips.map((s) => (
              <option key={s.id} value={s.id} disabled={s.id === cantripBId}>
                {s.name}
              </option>
            ))}
          </select>
          <select className="gb-input" value={cantripBId} onChange={(e) => setCantripBId(e.target.value)} style={{ fontSize: 12 }}>
            <option value="">Choose a second cantrip…</option>
            {grantableCantrips.map((s) => (
              <option key={s.id} value={s.id} disabled={s.id === cantripAId}>
                {s.name}
              </option>
            ))}
          </select>
          <select className="gb-input" value={leveledSpellId} onChange={(e) => setLeveledSpellId(e.target.value)} style={{ fontSize: 12 }}>
            <option value="">Choose a level-{spellChoiceEffect.spellLevel} spell…</option>
            {grantableLeveledSpells.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

const ORIGIN_FEATS = FEATS.filter((f) => f.category === 'Origin')

/**
 * A free pick from just the Origin category — SRD 5.2.1's Human "Versatile"
 * trait ("gain an Origin feat of your choice") is the only case right now.
 * Handles a spellChoice-effect feat (Magic Initiate) the same inline way
 * AsiSlotChooser's feat mode does, since it's the same feat/effect, just
 * reached from a species trait instead of an ASI slot — writes the same
 * asiSlotChoices shape so it shows up in Features' Feats section and (for
 * Magic Initiate) actually grants real, castable spells.
 */
export function OriginFeatChooser({
  label,
  level,
  readOnly,
  onResolve
}: {
  label: string
  level: number
  readOnly?: boolean
  onResolve: (entry: Omit<AsiSlotChoice, 'id'>) => void
}): JSX.Element {
  const [featId, setFeatId] = useState<string>(ORIGIN_FEATS[0]?.id ?? '')
  const [spellCasterAbility, setSpellCasterAbility] = useState<Ability>('wis')
  const [cantripAId, setCantripAId] = useState('')
  const [cantripBId, setCantripBId] = useState('')
  const [leveledSpellId, setLeveledSpellId] = useState('')

  const selectedFeat = FEATS.find((f) => f.id === featId)
  const spellChoiceEffect = selectedFeat?.effects?.find((e): e is Extract<FeatEffect, { kind: 'spellChoice' }> => e.kind === 'spellChoice')
  const grantableCantrips: CompendiumSpell[] = spellChoiceEffect
    ? SPELLS.filter((s) => s.level === 0 && s.classes.some((c) => spellChoiceEffect.classes.includes(c)))
    : []
  const grantableLeveledSpells: CompendiumSpell[] = spellChoiceEffect
    ? SPELLS.filter((s) => s.level === spellChoiceEffect.spellLevel && s.classes.some((c) => spellChoiceEffect.classes.includes(c)))
    : []
  const spellChoiceReady = !spellChoiceEffect || (!!cantripAId && !!cantripBId && cantripAId !== cantripBId && !!leveledSpellId)

  function apply(): void {
    if (readOnly || !featId || !spellChoiceReady) return
    onResolve({
      className: '',
      level,
      kind: 'feat',
      featId,
      chosenAbility: spellChoiceEffect ? spellCasterAbility : undefined,
      chosenSpellIds: spellChoiceEffect ? [cantripAId, cantripBId, leveledSpellId] : undefined
    })
  }

  return (
    <div className="gb-card" style={{ padding: 'var(--space-3)' }}>
      <strong>{label}</strong>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 var(--space-2)' }}>Gain an Origin feat of your choice.</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <select className="gb-input" value={featId} onChange={(e) => setFeatId(e.target.value)} style={{ fontSize: 12, flex: 1 }}>
          {ORIGIN_FEATS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <Button variant="primary" onClick={apply} disabled={readOnly || !featId || !spellChoiceReady} style={{ flexShrink: 0, fontSize: 12, padding: '4px 10px' }}>
          Choose
        </Button>
      </div>
      {selectedFeat?.desc && !spellChoiceEffect && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>{selectedFeat.desc}</p>}
      {spellChoiceEffect && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            Choose your spellcasting ability for this feat's spells, plus {spellChoiceEffect.cantripCount} cantrips and{' '}
            {spellChoiceEffect.spellCount} level-{spellChoiceEffect.spellLevel} spell from the {spellChoiceEffect.classes.join('/')} list — always
            prepared, and they don't count against your normal spells known.
          </div>
          <select className="gb-input" value={spellCasterAbility} onChange={(e) => setSpellCasterAbility(e.target.value as Ability)} style={{ fontSize: 12 }}>
            {(['int', 'wis', 'cha'] as Ability[]).map((a) => (
              <option key={a} value={a}>
                {a.toUpperCase()}
              </option>
            ))}
          </select>
          <select className="gb-input" value={cantripAId} onChange={(e) => setCantripAId(e.target.value)} style={{ fontSize: 12 }}>
            <option value="">Choose a cantrip…</option>
            {grantableCantrips.map((s) => (
              <option key={s.id} value={s.id} disabled={s.id === cantripBId}>
                {s.name}
              </option>
            ))}
          </select>
          <select className="gb-input" value={cantripBId} onChange={(e) => setCantripBId(e.target.value)} style={{ fontSize: 12 }}>
            <option value="">Choose a second cantrip…</option>
            {grantableCantrips.map((s) => (
              <option key={s.id} value={s.id} disabled={s.id === cantripAId}>
                {s.name}
              </option>
            ))}
          </select>
          <select className="gb-input" value={leveledSpellId} onChange={(e) => setLeveledSpellId(e.target.value)} style={{ fontSize: 12 }}>
            <option value="">Choose a level-{spellChoiceEffect.spellLevel} spell…</option>
            {grantableLeveledSpells.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

/** The inline subclass picker — real SRD subclass(es) for a recognized class (just one per class, per the SRD's own scope). Rendered both in FeaturesTab.tsx (permanently, until resolved) and LevelUpPopup.tsx (a shortcut). */
export function SubclassChooser({
  classLabel,
  featureName,
  slotLevel,
  options,
  readOnly,
  onChoose
}: {
  classLabel: string
  featureName: string
  slotLevel: number
  options: { id: string; name: string; flavor?: string }[]
  readOnly?: boolean
  onChoose: (name: string) => void
}): JSX.Element {
  const [subclassName, setSubclassName] = useState(options[0]?.name ?? '')
  const chosen = options.find((o) => o.name === subclassName)

  return (
    <div className="gb-card" style={{ padding: 'var(--space-3)' }}>
      <strong>
        {featureName} — {classLabel} {slotLevel}
      </strong>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 var(--space-2)' }}>Choose your {classLabel.toLowerCase()} subclass.</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <select className="gb-input" value={subclassName} onChange={(e) => setSubclassName(e.target.value)} style={{ fontSize: 12, flex: 1 }}>
          {options.map((o) => (
            <option key={o.id} value={o.name}>
              {o.name}
            </option>
          ))}
        </select>
        <Button
          variant="primary"
          onClick={() => onChoose(subclassName)}
          disabled={readOnly || !subclassName}
          style={{ flexShrink: 0, fontSize: 12, padding: '4px 10px' }}
        >
          Choose
        </Button>
      </div>
      {chosen?.flavor && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>{chosen.flavor}</p>}
    </div>
  )
}
