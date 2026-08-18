import { useState } from 'react'
import { ABILITIES, type Ability, type AsiSlotChoice, type NamedOption } from '@shared/dnd5e'
import { FEATS, SPELLS, meetsFeatPrerequisite, type CompendiumSpell, type FeatEffect, type SubclassFeatureOption } from '@shared/compendium'
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
  excludeFeatIds,
  readOnly,
  onResolve
}: {
  classLabel: string
  level: number
  /** Already-picked Fighting Style feat ids for this class — hidden here so a Champion's Additional Fighting Style pick can't just re-pick their 1st-level one. */
  excludeFeatIds?: string[]
  readOnly?: boolean
  onResolve: (entry: Omit<AsiSlotChoice, 'id'>) => void
}): JSX.Element {
  const available = FIGHTING_STYLE_FEATS.filter((f) => !excludeFeatIds?.includes(f.id))
  const [featId, setFeatId] = useState<string>(available[0]?.id ?? '')

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
          {available.map((f) => (
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

/** The one Favored Enemy option (FAVORED_ENEMY_OPTIONS' "Humanoids" entry) that itself carries a further choice — "two races of your choice" per the SRD, rather than a single fixed creature type — so it needs two freeform race fields on top of NamedOptionChooser's plain dropdown. Picking anything else behaves exactly like NamedOptionChooser. */
const FAVORED_ENEMY_HUMANOID_NAME = 'Humanoids (two races of your choice)'

export function FavoredEnemyChooser({
  classLabel,
  level,
  options,
  excludeNames,
  readOnly,
  onChoose
}: {
  classLabel: string
  level: number
  options: NamedOption[]
  excludeNames: string[]
  readOnly?: boolean
  onChoose: (name: string) => void
}): JSX.Element {
  const available = options.filter((o) => !excludeNames.includes(o.name))
  const [name, setName] = useState(available[0]?.name ?? '')
  const [raceA, setRaceA] = useState('')
  const [raceB, setRaceB] = useState('')
  const selected = available.find((o) => o.name === name) ?? available[0]
  const isHumanoid = selected?.name === FAVORED_ENEMY_HUMANOID_NAME
  const ready = !isHumanoid || (raceA.trim() && raceB.trim())

  function apply(): void {
    if (!selected) return
    if (isHumanoid) onChoose(`Humanoids: ${raceA.trim()}, ${raceB.trim()}`)
    else onChoose(selected.name)
  }

  return (
    <div className="gb-card" style={{ padding: 'var(--space-3)' }}>
      <strong>
        Favored Enemy — {classLabel} {level}
      </strong>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
        <select className="gb-input" value={selected?.name ?? ''} onChange={(e) => setName(e.target.value)} style={{ fontSize: 12, flex: 1 }}>
          {available.map((o) => (
            <option key={o.name} value={o.name}>
              {o.name}
            </option>
          ))}
        </select>
        <Button variant="primary" onClick={apply} disabled={readOnly || !selected || !ready} style={{ flexShrink: 0, fontSize: 12, padding: '4px 10px' }}>
          Choose
        </Button>
      </div>
      {isHumanoid && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <input
            className="gb-input"
            placeholder="First race (e.g. Orcs)"
            value={raceA}
            onChange={(e) => setRaceA(e.target.value)}
            style={{ fontSize: 12, flex: 1 }}
          />
          <input
            className="gb-input"
            placeholder="Second race (e.g. Goblinoids)"
            value={raceB}
            onChange={(e) => setRaceB(e.target.value)}
            style={{ fontSize: 12, flex: 1 }}
          />
        </div>
      )}
      {selected?.description && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>{selected.description}</p>}
    </div>
  )
}

/** The inline chooser for a subclass feature the SRD writes as several named options (e.g. Draconic Bloodline's dragon ancestor, a Ranger archetype's sub-features) rather than one entry with an embedded choice — see groupedSubclassFeaturesForLevelUp in shared/compendium.ts. Rendered in both FeaturesTab.tsx (permanently, until resolved) and LevelUpPopup.tsx (a shortcut for whichever ones just unlocked) — previously LevelUpPopup.tsx had no equivalent at all, so a subclass whose every post-pick feature is this kind of choice (Ranger's Hunter archetype, whose Defensive Tactics/Multiattack/Superior Hunter's Defense are ALL choice-shaped) looked like it granted nothing at all when leveling up. */
export function SubclassFeatureOptionChooser({
  classLabel,
  subclassLabel,
  level,
  baseName,
  intro,
  options,
  readOnly,
  onChoose
}: {
  classLabel: string
  subclassLabel: string
  level: number
  baseName: string
  intro?: string
  options: SubclassFeatureOption[]
  readOnly?: boolean
  onChoose: (chosenName: string) => void
}): JSX.Element {
  const [chosenName, setChosenName] = useState(options[0]?.name ?? '')
  const chosen = options.find((o) => o.name === chosenName)

  return (
    <div className="gb-card" style={{ padding: 'var(--space-3)' }}>
      <strong>
        {baseName} — {subclassLabel || classLabel} {level}
      </strong>
      {intro && <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 var(--space-2)' }}>{intro}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <select className="gb-input" value={chosenName} onChange={(e) => setChosenName(e.target.value)} style={{ fontSize: 12, flex: 1 }}>
          {options.map((o) => (
            <option key={o.name} value={o.name}>
              {o.label}
            </option>
          ))}
        </select>
        <Button
          variant="primary"
          onClick={() => onChoose(chosenName)}
          disabled={readOnly || !chosenName}
          style={{ flexShrink: 0, fontSize: 12, padding: '4px 10px' }}
        >
          Choose
        </Button>
      </div>
      {chosen && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>{chosen.desc}</p>}
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
