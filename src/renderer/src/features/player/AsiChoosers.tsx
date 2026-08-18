import { useState } from 'react'
import { ABILITIES, type Ability, type AsiSlotChoice, type NamedOption } from '@shared/dnd5e'
import { FEATS, meetsFeatPrerequisite, type FeatEffect } from '@shared/compendium'
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

  const selectedFeat = FEATS.find((f) => f.id === featId)
  const choiceEffect = selectedFeat?.effects?.find(
    (e): e is Extract<FeatEffect, { kind: 'abilityScoreChoice' }> => e.kind === 'abilityScoreChoice'
  )
  const effectiveFeatAbility = choiceEffect
    ? choiceEffect.options.includes(featAbility)
      ? featAbility
      : choiceEffect.options[0]
    : featAbility
  const featBlocked = selectedFeat && !meetsFeatPrerequisite(selectedFeat, abilityScores, level)

  function apply(): void {
    if (readOnly) return
    if (mode === 'plus2') onResolve({ className: classLabel, level, kind: 'ability', abilityIncreases: { [abilityA]: 2 } })
    else if (mode === 'plus1plus1') onResolve({ className: classLabel, level, kind: 'ability', abilityIncreases: { [abilityA]: 1, [abilityB]: 1 } })
    else if (featId) onResolve({ className: classLabel, level, kind: 'feat', featId, chosenAbility: choiceEffect ? effectiveFeatAbility : undefined })
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
        <Button variant="primary" onClick={apply} disabled={readOnly || !!featBlocked} style={{ flexShrink: 0, fontSize: 12, padding: '4px 10px' }}>
          Apply
        </Button>
      </div>
      {featBlocked && (
        <p style={{ fontSize: 11, color: 'var(--danger)', margin: '4px 0 0' }}>
          Doesn't meet the prerequisite ({selectedFeat!.prerequisite}).
        </p>
      )}
    </div>
  )
}

const FIGHTING_STYLE_FEATS = FEATS.filter((f) => f.category === 'Fighting Style')

/**
 * The inline picker for a class's free Fighting Style pick (Fighter 1,
 * Paladin 2, Ranger 2) — a plain dropdown over just the "Fighting Style"
 * category feats (no ability-score gate, unlike a real ASI-into-a-feat
 * pick), writing the exact same asiSlotChoices shape (kind: 'feat') so it
 * shows up in Features' Feats section and its notes surface in Overview
 * like any other feat, automatically.
 */
export function FightingStyleChooser({
  classLabel,
  level,
  readOnly,
  onResolve
}: {
  classLabel: string
  level: number
  readOnly?: boolean
  onResolve: (entry: Omit<AsiSlotChoice, 'id'>) => void
}): JSX.Element {
  const [featId, setFeatId] = useState<string>(FIGHTING_STYLE_FEATS[0]?.id ?? '')

  return (
    <div className="gb-card" style={{ padding: 'var(--space-3)' }}>
      <strong>
        Fighting Style — {classLabel} {level}
      </strong>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 var(--space-2)' }}>
        Adopt a specialized style of combat.
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <select className="gb-input" value={featId} onChange={(e) => setFeatId(e.target.value)} style={{ fontSize: 12, flex: 1 }}>
          {FIGHTING_STYLE_FEATS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <Button
          variant="primary"
          onClick={() => featId && onResolve({ className: classLabel, level, kind: 'feat', featId })}
          disabled={readOnly || !featId}
          style={{ flexShrink: 0, fontSize: 12, padding: '4px 10px' }}
        >
          Choose
        </Button>
      </div>
      {FIGHTING_STYLE_FEATS.find((f) => f.id === featId)?.desc && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>{FIGHTING_STYLE_FEATS.find((f) => f.id === featId)!.desc}</p>
      )}
    </div>
  )
}

/**
 * A generic "pick one from a fixed named list" chooser — used for Sorcerer
 * Metamagic (rendered once per still-open pick, since the count grows with
 * level — see metamagicSlotCountAtLevel) and Warlock Pact Boon (a single
 * pick). Writes through the same subclassFeatureChoices mechanism a real
 * subclass feature choice does; despite the name, that field is just "a
 * resolved named choice for a named feature at a level," which fits any of
 * these class-table choices equally well.
 */
export function NamedOptionChooser({
  classLabel,
  level,
  featureName,
  options,
  excludeNames,
  readOnly,
  onChoose
}: {
  classLabel: string
  level: number
  featureName: string
  options: NamedOption[]
  /** Names already picked for an earlier slot of this same feature — hidden here so the same option can't be chosen twice. */
  excludeNames: string[]
  readOnly?: boolean
  onChoose: (name: string) => void
}): JSX.Element {
  const available = options.filter((o) => !excludeNames.includes(o.name))
  const [name, setName] = useState(available[0]?.name ?? '')
  const selected = available.find((o) => o.name === name) ?? available[0]

  return (
    <div className="gb-card" style={{ padding: 'var(--space-3)' }}>
      <strong>
        {featureName} — {classLabel} {level}
      </strong>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
        <select className="gb-input" value={selected?.name ?? ''} onChange={(e) => setName(e.target.value)} style={{ fontSize: 12, flex: 1 }}>
          {available.map((o) => (
            <option key={o.name} value={o.name}>
              {o.name}
            </option>
          ))}
        </select>
        <Button
          variant="primary"
          onClick={() => selected && onChoose(selected.name)}
          disabled={readOnly || !selected}
          style={{ flexShrink: 0, fontSize: 12, padding: '4px 10px' }}
        >
          Choose
        </Button>
      </div>
      {selected?.description && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>{selected.description}</p>}
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
