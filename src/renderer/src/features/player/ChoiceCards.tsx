import { useState } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import type { CharacterSheetData } from '@shared/dnd5e'
import type { DerivedChoice } from '@shared/content/engine'
import { choicePatch } from '@shared/content/legacyMirror'
import { deriveSheet } from '@shared/content/sheet'
import { Button } from '../../ui/Button'
import { HoverDetailCard } from './HoverDetailCard'

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
 * Technique — with no knowledge of what kind of choice it is. Made picks
 * show as removable chips; while picks remain, a picker offers the options
 * (search for long lists, prerequisites shown but not selectable). Choices
 * that hang off one of this choice's picks (an ASI feat's ability scores)
 * render nested underneath.
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

  return (
    <div className="gb-card" style={{ padding: 'var(--space-3)', borderColor: choice.remaining > 0 ? 'var(--accent)' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <strong style={{ flex: 1 }}>{choice.label}</strong>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{choiceOrigin(choice)}</span>
        {choice.count > 1 && (
          <span className="gb-badge" style={{ fontSize: 10 }} title={`${choice.picks.length} of ${choice.count} picked`}>
            {choice.picks.length}/{choice.count}
          </span>
        )}
      </div>

      {choice.picks.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {choice.picks.map((id, i) => (
            <HoverDetailCard key={`${id}:${i}`} title={nameOf(id)} subtitle={choice.label} fields={[]} description={descriptionOf(id)}>
              <span className="gb-badge gb-badge--accent" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '3px 8px' }}>
                {nameOf(id)}
                {!readOnly && (
                  <button type="button" onClick={() => removeAt(i)} style={removeStyle} title={`Remove ${nameOf(id)}`}>
                    ×
                  </button>
                )}
              </span>
            </HoverDetailCard>
          ))}
        </div>
      )}

      {choice.remaining > 0 && !readOnly && <ChoicePicker choice={choice} onPick={(id) => onSetPicks(choice, [...choice.picks, id])} />}

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

function ChoicePicker({ choice, onPick }: { choice: DerivedChoice; onPick: (id: string) => void }): JSX.Element {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [freeText, setFreeText] = useState('')

  if (choice.freeform) {
    return (
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <input className="gb-input" placeholder="Type your choice…" value={freeText} onChange={(e) => setFreeText(e.target.value)} style={{ flex: 1, fontSize: 12 }} />
        <Button variant="primary" disabled={!freeText.trim()} onClick={() => (onPick(freeText.trim()), setFreeText(''))} style={pickButtonStyle}>
          Add
        </Button>
      </div>
    )
  }

  const pickCounts = new Map<string, number>()
  for (const p of choice.picks) pickCounts.set(p, (pickCounts.get(p) ?? 0) + 1)
  const pickable = choice.options.filter((o) => choice.allowRepeats || !pickCounts.has(o.id))
  const q = query.trim().toLowerCase()
  const shown = q ? pickable.filter((o) => o.name.toLowerCase().includes(q)) : pickable
  const selected = shown.find((o) => o.id === selectedId && o.available) ?? shown.find((o) => o.available)

  if (pickable.length === 0) {
    return <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>No options left to pick.</p>
  }

  return (
    <div style={{ marginTop: 6 }}>
      {pickable.length > SEARCH_THRESHOLD && (
        <input className="gb-input" placeholder={`Search ${pickable.length} options…`} value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: '100%', fontSize: 12, marginBottom: 6 }} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <select className="gb-input" value={selected?.id ?? ''} onChange={(e) => setSelectedId(e.target.value)} style={{ fontSize: 12, flex: 1 }}>
          {shown.map((o) => (
            <option key={o.id} value={o.id} disabled={!o.available}>
              {o.name}
              {o.available ? '' : ' (prerequisite not met)'}
            </option>
          ))}
        </select>
        <Button variant="primary" disabled={!selected} onClick={() => selected && onPick(selected.id)} style={pickButtonStyle}>
          Choose
        </Button>
      </div>
      {selected?.description && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>{selected.description}</p>}
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

const pickButtonStyle = { flexShrink: 0, fontSize: 12, padding: '4px 10px' } as const
const removeStyle = { background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1 } as const
