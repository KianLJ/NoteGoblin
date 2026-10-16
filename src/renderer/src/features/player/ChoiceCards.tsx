import { useState } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import type { CharacterSheetData } from '@shared/dnd5e'
import type { DerivedChoice } from '@shared/content/engine'
import { choicePatch } from '@shared/content/legacyMirror'
import { deriveSheet } from '@shared/content/sheet'
import { HoverDetailCard } from './HoverDetailCard'
import { XIcon } from '../../ui/icons'

/**
 * Saves picks for a content-engine choice — natively in sheet.choices, and
 * mirrored into the legacy pick fields for SRD choices so older app
 * versions still see them (see shared/content/legacyMirror.ts).
 */
export function useChoiceEditor(character: CharacterSheet, onSave: (patch: Partial<CharacterSheetData>) => void): (choice: DerivedChoice, picks: string[]) => void {
  return (choice, picks) => {
    const { derived } = deriveSheet(character)
    onSave(choicePatch(character, derived, choice, picks))
  }
}

/** Above this many options the picker gets a search box. */
const SEARCH_THRESHOLD = 12

/** Where a choice came from, for its card header ("Sorcerer 10", "Origin"). */
export function choiceOrigin(choice: DerivedChoice): string {
  if (choice.className) return `${choice.className}${choice.level !== undefined ? ` ${choice.level}` : ''}`
  if (choice.sourceKey.startsWith('species:')) return 'Species'
  if (choice.sourceKey.startsWith('background:')) return 'Background'
  return choice.source
}

/**
 * One choice from the content engine — a feat at an ASI, a Fighting Style,
 * Metamagic, an invocation, a subclass option, a homebrew Innate
 * Technique — with no knowledge of what kind of choice it is. There's no
 * confirm button anywhere: a single pick is a dropdown showing the current
 * pick (changing it is the choice); several picks show as removable chips,
 * and picking from the dropdown adds one. Long lists get a search box and
 * prerequisites are shown but not selectable. Choices that hang off one of
 * this choice's picks (an ASI feat's ability scores) render nested
 * underneath.
 */
export function ChoiceCard({
  choice,
  all,
  readOnly,
  onSetPicks
}: {
  choice: DerivedChoice
  /** Every choice on the sheet — used to find this one's nested choices. */
  all: DerivedChoice[]
  readOnly?: boolean
  onSetPicks: (choice: DerivedChoice, picks: string[]) => void
}): JSX.Element {
  const nested = all.filter((c) => c.parentKey === choice.key)
  const nameOf = (id: string): string => choice.options.find((o) => o.id === id)?.name ?? id
  const descriptionOf = (id: string): string => choice.options.find((o) => o.id === id)?.description ?? ''

  function removeAt(index: number): void {
    onSetPicks(choice, choice.picks.filter((_, i) => i !== index))
  }

  // A single pick is edited in place by its dropdown; chips are for choices with several picks (or read-only views).
  const single = choice.count === 1 && !choice.allowRepeats && !choice.freeform && !readOnly && choice.budget === undefined
  const pointBuy = choice.budget !== undefined

  return (
    <div className="gb-card" style={{ padding: 'var(--space-3)', borderColor: choice.remaining > 0 ? 'var(--accent)' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <strong style={{ flex: 1 }}>{choice.label}</strong>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{choiceOrigin(choice)}</span>
        {pointBuy ? (
          <span className="gb-badge" style={{ fontSize: 10 }} title={`${choice.spent} of ${choice.budget} points spent`}>
            {choice.spent}/{choice.budget} pts
          </span>
        ) : (
          choice.count > 1 && (
            <span className="gb-badge" style={{ fontSize: 10 }} title={`${choice.picks.length} of ${choice.count} picked`}>
              {choice.picks.length}/{choice.count}
            </span>
          )
        )}
      </div>
      {choice.groups && choice.groups.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
          {choice.groups.map((g) => (
            <span key={g.id} style={{ color: g.used > g.max ? 'var(--danger, #e05555)' : undefined }}>
              {g.label} {g.used}/{g.max}
            </span>
          ))}
        </div>
      )}

      {single && <SinglePicker choice={choice} onSet={(id) => onSetPicks(choice, id ? [id] : [])} />}

      {!single && choice.picks.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {choice.picks.map((id, i) => (
            <HoverDetailCard key={`${id}:${i}`} title={nameOf(id)} subtitle={choice.label} fields={[]} description={descriptionOf(id)}>
              <span className="gb-badge gb-badge--accent" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '3px 8px' }}>
                {nameOf(id)}
                {!readOnly && (
                  <button type="button" onClick={() => removeAt(i)} style={removeStyle} title={`Remove ${nameOf(id)}`}>
                    <XIcon size={10} />
                  </button>
                )}
              </span>
            </HoverDetailCard>
          ))}
        </div>
      )}

      {!single && choice.remaining > 0 && !readOnly && <ChoicePicker choice={choice} onPick={(id) => onSetPicks(choice, [...choice.picks, id])} />}

      {nested.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, paddingLeft: 10, borderLeft: '2px solid var(--border-subtle)' }}>
          {nested.map((c) => (
            <ChoiceCard key={c.key} choice={c} all={all} readOnly={readOnly} onSetPicks={onSetPicks} />
          ))}
        </div>
      )}
    </div>
  )
}

/** The options a picker offers, filtered by its search box. */
function useOptionSearch(choice: DerivedChoice, exclude: (id: string) => boolean): {
  query: string
  setQuery: (q: string) => void
  pickable: DerivedChoice['options']
  shown: DerivedChoice['options']
} {
  const [query, setQuery] = useState('')
  const pickable = choice.options.filter((o) => !exclude(o.id))
  const q = query.trim().toLowerCase()
  return { query, setQuery, pickable, shown: q ? pickable.filter((o) => o.name.toLowerCase().includes(q)) : pickable }
}

function OptionSelect({
  options,
  value,
  placeholder,
  onChange
}: {
  options: DerivedChoice['options']
  value: string
  placeholder: string
  onChange: (id: string) => void
}): JSX.Element {
  return (
    <select className="gb-input" value={value} onChange={(e) => onChange(e.target.value)} style={{ fontSize: 12, width: '100%' }}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id} disabled={(!o.available || !!o.blocked) && o.id !== value} title={o.description}>
          {o.name}
          {o.cost !== undefined ? ` (${o.cost} pt${o.cost === 1 ? '' : 's'})` : ''}
          {!o.available ? ' (prerequisite not met)' : o.blocked && o.id !== value ? ` (${o.blocked.toLowerCase()})` : ''}
        </option>
      ))}
    </select>
  )
}

/** A one-pick choice: the dropdown shows the current pick, and changing it (or clearing it) saves straight away. */
function SinglePicker({ choice, onSet }: { choice: DerivedChoice; onSet: (id: string) => void }): JSX.Element {
  const current = choice.picks[0] ?? ''
  const { query, setQuery, pickable, shown } = useOptionSearch(choice, () => false)
  const options = current && !shown.some((o) => o.id === current) ? [...shown, ...pickable.filter((o) => o.id === current)] : shown
  const description = choice.options.find((o) => o.id === current)?.description
  return (
    <div style={{ marginTop: 6 }}>
      {pickable.length > SEARCH_THRESHOLD && (
        <input className="gb-input" placeholder={`Search ${pickable.length} options…`} value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: '100%', fontSize: 12, marginBottom: 6 }} />
      )}
      <OptionSelect options={options} value={current} placeholder="Choose…" onChange={onSet} />
      {description && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>{description}</p>}
    </div>
  )
}

/** Adds one pick to a several-pick choice the moment it's selected (typed choices: on Enter, or when the field loses focus). */
function ChoicePicker({ choice, onPick }: { choice: DerivedChoice; onPick: (id: string) => void }): JSX.Element {
  const [freeText, setFreeText] = useState('')
  const { query, setQuery, pickable, shown } = useOptionSearch(choice, (id) => !choice.allowRepeats && choice.picks.includes(id))

  if (choice.freeform) {
    const commit = (): void => {
      if (!freeText.trim()) return
      onPick(freeText.trim())
      setFreeText('')
    }
    return (
      <input
        className="gb-input"
        placeholder="Type your choice and press Enter…"
        value={freeText}
        onChange={(e) => setFreeText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        onBlur={commit}
        style={{ width: '100%', fontSize: 12, marginTop: 6 }}
      />
    )
  }

  if (pickable.length === 0) {
    return <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>No options left to pick.</p>
  }

  return (
    <div style={{ marginTop: 6 }}>
      {pickable.length > SEARCH_THRESHOLD && (
        <input className="gb-input" placeholder={`Search ${pickable.length} options…`} value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: '100%', fontSize: 12, marginBottom: 6 }} />
      )}
      <OptionSelect options={shown} value="" placeholder={choice.budget !== undefined ? `Add a pick (${choice.remaining} points left)…` : `Add a pick (${choice.remaining} left)…`} onChange={(id) => id && onPick(id)} />
    </div>
  )
}

/**
 * Every top-level choice in `choices` as a ChoiceCard (nested ones render
 * inside their parent). Unresolved choices first, so what still needs a
 * decision is at the top.
 */
export function ChoiceList({
  choices,
  all,
  readOnly,
  onSetPicks
}: {
  choices: DerivedChoice[]
  all: DerivedChoice[]
  readOnly?: boolean
  onSetPicks: (choice: DerivedChoice, picks: string[]) => void
}): JSX.Element | null {
  const top = choices.filter((c) => !c.parentKey)
  if (top.length === 0) return null
  const needsPick = (c: DerivedChoice): boolean => c.remaining > 0 || all.some((n) => n.parentKey === c.key && needsPick(n))
  const ordered = [...top.filter(needsPick), ...top.filter((c) => !needsPick(c))]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
      {ordered.map((c) => (
        <ChoiceCard key={c.key} choice={c} all={all} readOnly={readOnly} onSetPicks={onSetPicks} />
      ))}
    </div>
  )
}

const removeStyle = { background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1, display: 'inline-flex' } as const
