import { useState } from 'react'
import type { Ability, AsiSlotChoice } from '@shared/dnd5e'
import { FEATS, SPELLS, type CompendiumSpell, type FeatEffect } from '@shared/compendium'
import { PickField } from './ChoiceCards'

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
  onResolve,
  taken = []
}: {
  label: string
  level: number
  readOnly?: boolean
  /** Feats already granted elsewhere (the background's), shown locked with why. */
  taken?: Array<{ id: string; why: string }>
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
      <PickField
        title="Origin feat"
        options={ORIGIN_FEATS.map((f) => ({ id: f.id, name: f.name, description: f.desc, locked: taken.find((t) => t.id === f.id)?.why }))}
        selected={featId ? [featId] : []}
        readOnly={readOnly}
        onChange={(ids) => update({ featId: ids[0] ?? '' })}
      />
      {spellChoiceEffect && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            Choose your spellcasting ability for this feat's spells, plus {spellChoiceEffect.cantripCount} cantrips and{' '}
            {spellChoiceEffect.spellCount} level-{spellChoiceEffect.spellLevel} spell from the {spellChoiceEffect.classes.join('/')} list — always
            prepared, and they don't count against your normal spells known.
          </div>
          <div style={subLabel}>Spellcasting ability</div>
          <PickField
            title="Spellcasting ability"
            options={(['int', 'wis', 'cha'] as Ability[]).map((a) => ({ id: a, name: ABILITY_NAME[a] }))}
            selected={[spellCasterAbility]}
            readOnly={readOnly}
            onChange={(ids) => ids[0] && update({ spellCasterAbility: ids[0] as Ability })}
          />
          <div style={subLabel}>Two cantrips ({[cantripAId, cantripBId].filter(Boolean).length}/2)</div>
          <PickField
            title="Two cantrips"
            options={grantableCantrips.map((sp) => ({ id: sp.id, name: sp.name, description: sp.description }))}
            selected={[cantripAId, cantripBId].filter(Boolean)}
            max={2}
            readOnly={readOnly}
            onChange={(ids) => update({ cantripAId: ids[0] ?? '', cantripBId: ids[1] ?? '' })}
          />
          <div style={subLabel}>A level-{spellChoiceEffect.spellLevel} spell</div>
          <PickField
            title={`A level-${spellChoiceEffect.spellLevel} spell`}
            options={grantableLeveledSpells.map((sp) => ({ id: sp.id, name: sp.name, description: sp.description }))}
            selected={leveledSpellId ? [leveledSpellId] : []}
            readOnly={readOnly}
            onChange={(ids) => update({ leveledSpellId: ids[0] ?? '' })}
          />
        </div>
      )}
    </div>
  )
}

/** The inline subclass picker — every subclass the enabled content packs have for this class, as tiles (description on hover). Rendered both in FeaturesTab.tsx (permanently, until resolved) and LevelUpPopup.tsx (a shortcut). Clicking one is the choice — no confirm button. */
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
  return (
    <div className="gb-card" style={{ padding: 'var(--space-3)' }}>
      <strong>
        {featureName} — {classLabel} {slotLevel}
      </strong>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 var(--space-2)' }}>Choose your {classLabel.toLowerCase()} subclass.</div>
      <PickField
        title={`${featureName} — ${classLabel}`}
        options={options.map((o) => ({ id: o.id, name: o.name, description: o.flavor }))}
        selected={[]}
        readOnly={readOnly}
        onChange={(ids) => {
          const option = options.find((o) => o.id === ids[0])
          if (option) onChoose(option.name)
        }}
      />
    </div>
  )
}

const subLabel = { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 } as const
const ABILITY_NAME: Record<string, string> = { int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }
