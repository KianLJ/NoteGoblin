import { useState } from 'react'
import type { Ability, AsiSlotChoice } from '@shared/dnd5e'
import { FEATS, SPELLS, type CompendiumSpell, type FeatEffect } from '@shared/compendium'

const ORIGIN_FEATS = FEATS.filter((f) => f.category === 'Origin')

/**
 * A free pick from just the Origin category — SRD 5.2.1's Human "Versatile"
 * trait ("gain an Origin feat of your choice") is the only case right now.
 * Handles a spellChoice-effect feat (Magic Initiate) inline — its
 * spellcasting ability and spells. There's no confirm button: every change
 * reports the pick straight away once it's complete (and null while it
 * isn't), so the selection itself is the choice. Writes the asiSlotChoices
 * shape, so Magic Initiate actually grants real, castable spells.
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
  /** Called on every change: the complete pick, or null while something is still unpicked. */
  onResolve: (entry: Omit<AsiSlotChoice, 'id'> | null) => void
}): JSX.Element {
  const [state, setState] = useState({ featId: '', spellCasterAbility: 'wis' as Ability, cantripAId: '', cantripBId: '', leveledSpellId: '' })
  const { featId, spellCasterAbility, cantripAId, cantripBId, leveledSpellId } = state

  const selectedFeat = FEATS.find((f) => f.id === featId)
  const spellChoiceEffect = selectedFeat?.effects?.find((e): e is Extract<FeatEffect, { kind: 'spellChoice' }> => e.kind === 'spellChoice')
  const grantableCantrips: CompendiumSpell[] = spellChoiceEffect
    ? SPELLS.filter((s) => s.level === 0 && s.classes.some((c) => spellChoiceEffect.classes.includes(c)))
    : []
  const grantableLeveledSpells: CompendiumSpell[] = spellChoiceEffect
    ? SPELLS.filter((s) => s.level === spellChoiceEffect.spellLevel && s.classes.some((c) => spellChoiceEffect.classes.includes(c)))
    : []

  function update(fields: Partial<typeof state>): void {
    if (readOnly) return
    const next = { ...state, ...fields }
    // Switching feats starts its spell picks over.
    if (fields.featId !== undefined && fields.featId !== state.featId) Object.assign(next, { cantripAId: '', cantripBId: '', leveledSpellId: '' })
    setState(next)
    const feat = FEATS.find((f) => f.id === next.featId)
    const spells = feat?.effects?.some((e) => e.kind === 'spellChoice')
    const ready = !!feat && (!spells || (!!next.cantripAId && !!next.cantripBId && next.cantripAId !== next.cantripBId && !!next.leveledSpellId))
    onResolve(
      ready
        ? {
            className: '',
            level,
            kind: 'feat',
            featId: next.featId,
            chosenAbility: spells ? next.spellCasterAbility : undefined,
            chosenSpellIds: spells ? [next.cantripAId, next.cantripBId, next.leveledSpellId] : undefined
          }
        : null
    )
  }

  return (
    <div className="gb-card" style={{ padding: 'var(--space-3)' }}>
      <strong>{label}</strong>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 var(--space-2)' }}>Gain an Origin feat of your choice.</div>
      <select className="gb-input" value={featId} disabled={readOnly} onChange={(e) => update({ featId: e.target.value })} style={{ fontSize: 12, width: '100%' }}>
        <option value="">Choose an Origin feat…</option>
        {ORIGIN_FEATS.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      {selectedFeat?.desc && !spellChoiceEffect && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>{selectedFeat.desc}</p>}
      {spellChoiceEffect && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            Choose your spellcasting ability for this feat's spells, plus {spellChoiceEffect.cantripCount} cantrips and{' '}
            {spellChoiceEffect.spellCount} level-{spellChoiceEffect.spellLevel} spell from the {spellChoiceEffect.classes.join('/')} list — always
            prepared, and they don't count against your normal spells known.
          </div>
          <select className="gb-input" value={spellCasterAbility} onChange={(e) => update({ spellCasterAbility: e.target.value as Ability })} style={{ fontSize: 12 }}>
            {(['int', 'wis', 'cha'] as Ability[]).map((a) => (
              <option key={a} value={a}>
                {a.toUpperCase()}
              </option>
            ))}
          </select>
          <select className="gb-input" value={cantripAId} onChange={(e) => update({ cantripAId: e.target.value })} style={{ fontSize: 12 }}>
            <option value="">Choose a cantrip…</option>
            {grantableCantrips.map((s) => (
              <option key={s.id} value={s.id} disabled={s.id === cantripBId}>
                {s.name}
              </option>
            ))}
          </select>
          <select className="gb-input" value={cantripBId} onChange={(e) => update({ cantripBId: e.target.value })} style={{ fontSize: 12 }}>
            <option value="">Choose a second cantrip…</option>
            {grantableCantrips.map((s) => (
              <option key={s.id} value={s.id} disabled={s.id === cantripAId}>
                {s.name}
              </option>
            ))}
          </select>
          <select className="gb-input" value={leveledSpellId} onChange={(e) => update({ leveledSpellId: e.target.value })} style={{ fontSize: 12 }}>
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

/** The inline subclass picker — every subclass the enabled content packs have for this class. Rendered both in FeaturesTab.tsx (permanently, until resolved) and LevelUpPopup.tsx (a shortcut). Picking one from the list is the choice — no confirm button. */
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
  const [preview, setPreview] = useState('')
  const previewed = options.find((o) => o.id === preview)

  return (
    <div className="gb-card" style={{ padding: 'var(--space-3)' }}>
      <strong>
        {featureName} — {classLabel} {slotLevel}
      </strong>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 var(--space-2)' }}>Choose your {classLabel.toLowerCase()} subclass.</div>
      <select
        className="gb-input"
        value=""
        disabled={readOnly}
        onChange={(e) => {
          const option = options.find((o) => o.id === e.target.value)
          if (option) onChoose(option.name)
        }}
        style={{ fontSize: 12, width: '100%' }}
      >
        <option value="">Choose a subclass…</option>
        {options.map((o) => (
          <option key={o.id} value={o.id} title={o.flavor}>
            {o.name}
          </option>
        ))}
      </select>
      {options.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
          {options.map((o) => (
            <span
              key={o.id}
              className="gb-badge"
              style={{ fontSize: 11, cursor: 'help' }}
              onMouseEnter={() => setPreview(o.id)}
              onMouseLeave={() => setPreview('')}
            >
              {o.name}
            </span>
          ))}
        </div>
      )}
      {previewed?.flavor && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>{previewed.flavor}</p>}
    </div>
  )
}
