import { useState } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import type { CharacterSheetData } from '@shared/dnd5e'
import type { DerivedChoice } from '@shared/content/engine'
import { choicePatch } from '@shared/content/legacyMirror'
import { deriveSheet } from '@shared/content/sheet'
import { HoverDetailCard } from './HoverDetailCard'
import { PickerWindow, type PickOption } from './PickerWindow'
import { MinusIcon, PlusIcon, XIcon } from '../../ui/icons'

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

const ABILITY_IDS = ['str', 'dex', 'con', 'int', 'wis', 'cha']

/** Where a choice came from, for its card header ("Sorcerer 10", "Origin"). */
export function choiceOrigin(choice: DerivedChoice): string {
  if (choice.className) return `${choice.className}${choice.level !== undefined ? ` ${choice.level}` : ''}`
  if (choice.sourceKey.startsWith('species:')) return 'Species'
  if (choice.sourceKey.startsWith('background:')) return 'Background'
  return choice.source
}

type Option = DerivedChoice['options'][number]

/** Why an option can't be added right now, if it can't. */
function lockedReason(o: Option): string | undefined {
  if (!o.available) return 'Prerequisite not met'
  return o.blocked
}

/** How many times each option is picked. */
function countPicks(picks: string[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const p of picks) m.set(p, (m.get(p) ?? 0) + 1)
  return m
}

/** The picks with one `id` removed (the last one, so the others keep their order and keys). */
function withoutOne(picks: string[], id: string): string[] {
  const i = picks.lastIndexOf(id)
  return i < 0 ? picks : [...picks.slice(0, i), ...picks.slice(i + 1)]
}

/**
 * One choice from the content engine — a feat at an ASI, a Fighting Style,
 * Metamagic, an invocation, an ability score increase, a homebrew
 * bloodline — whatever kind of choice it is. The card stays small: it
 * shows what's picked and a Choose / Change button; the full list opens in
 * a PickerWindow (search, the full description of each option, one click
 * to pick). Ability-score picks are the exception — six compact −/+ cells
 * right on the card. Choices hanging off a pick (an ASI feat's ability
 * scores) sit inside this card, under its summary.
 */
export function ChoiceCard({
  choice,
  all,
  readOnly,
  onSetPicks,
  nested: isNested
}: {
  choice: DerivedChoice
  /** Every choice on the sheet — used to find this one's nested choices. */
  all: DerivedChoice[]
  readOnly?: boolean
  onSetPicks: (choice: DerivedChoice, picks: string[]) => void
  /** Rendered inside its parent's card, without a card of its own. */
  nested?: boolean
}): JSX.Element {
  const children = all.filter((c) => c.parentKey === choice.key)
  const [picking, setPicking] = useState(false)
  const pointBuy = choice.budget !== undefined
  const single = choice.count === 1 && !choice.allowRepeats && !choice.freeform && !pointBuy
  const done = choice.remaining <= 0 && choice.picks.length > 0
  const set = (picks: string[]): void => onSetPicks(choice, picks)
  const abilityPick = choice.options.length === 6 && choice.options.every((o) => ABILITY_IDS.includes(o.id))

  const status = pointBuy ? `${choice.spent}/${choice.budget} pts` : choice.count > 1 ? `${choice.picks.length}/${choice.count}` : done ? 'Chosen' : 'Choose 1'

  const body = (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <strong style={{ flex: 1, fontSize: isNested ? 12 : undefined }}>{choice.label}</strong>
        {!isNested && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{choiceOrigin(choice)}</span>}
        <span className={`gb-badge${done ? '' : ' gb-badge--accent'}`} style={{ fontSize: 10 }}>
          {status}
        </span>
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

      {choice.freeform ? (
        <FreeformPicks choice={choice} readOnly={readOnly} onSet={set} />
      ) : abilityPick && (choice.allowRepeats || choice.count > 1) && !readOnly ? (
        <AbilityRow choice={choice} onSet={set} />
      ) : (
        <Summary choice={choice} action={readOnly ? undefined : choice.picks.length === 0 ? 'Choose…' : done ? 'Change' : 'Add more…'} onAction={() => setPicking(true)} />
      )}
      {picking && (
        <PickerWindow
          title={choice.label}
          status={pointBuy ? `${choice.remaining} point${choice.remaining === 1 ? '' : 's'} left` : choice.count > 1 ? `${choice.picks.length} of ${choice.count} picked` : undefined}
          options={choice.options.map((o) => ({
            id: o.id,
            name: o.name,
            description: o.description,
            meta: [o.cost !== undefined ? `${o.cost} pt${o.cost === 1 ? '' : 's'}` : '', o.group ?? ''].filter(Boolean).join(' · ') || undefined,
            locked: lockedReason(o)
          }))}
          picks={choice.picks}
          mode={single ? 'single' : choice.allowRepeats || pointBuy ? 'count' : 'multi'}
          max={choice.count}
          canAdd={(id, picks) => {
            const o = choice.options.find((x) => x.id === id)
            if (!o || lockedReason(o)) return false
            if (!choice.allowRepeats && picks.includes(id)) return false
            return pointBuy || single || picks.length < choice.count
          }}
          onChange={set}
          onClose={() => setPicking(false)}
        />
      )}

      {children.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
          {children.map((c) => (
            <ChoiceCard key={c.key} choice={c} all={all} readOnly={readOnly} onSetPicks={onSetPicks} nested />
          ))}
        </div>
      )}
    </>
  )

  if (isNested) return <div data-choice-key={choice.key}>{body}</div>
  return (
    <div data-choice-key={choice.key} className="gb-card" style={{ padding: 'var(--space-3)', borderColor: choice.remaining > 0 ? 'var(--accent)' : undefined }}>
      {body}
    </div>
  )
}

/** What's picked, as chips (description on hover), with the button that opens the picker. */
function Summary({ choice, action, onAction }: { choice: DerivedChoice; action?: string; onAction: () => void }): JSX.Element {
  const counts = [...countPicks(choice.picks)]
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, alignItems: 'center' }}>
      {counts.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Not chosen yet</span>}
      {counts.map(([id, n]) => {
        const o = choice.options.find((x) => x.id === id)
        return (
          <HoverDetailCard key={id} title={o?.name ?? id} subtitle={choice.label} fields={[]} description={o?.description ?? ''}>
            <span className="gb-badge gb-badge--accent" style={{ fontSize: 12, padding: '3px 8px' }}>
              {o?.name ?? id}
              {n > 1 ? ` ×${n}` : ''}
            </span>
          </HoverDetailCard>
        )
      })}
      {action && (
        <button
          type="button"
          className={`gb-btn ${counts.length === 0 ? 'gb-btn--primary' : 'gb-btn--ghost'}`}
          onClick={onAction}
          style={{ fontSize: 11, padding: '3px 10px', marginLeft: 'auto' }}
        >
          {action}
        </button>
      )}
    </div>
  )
}

/** Ability scores as one row of six with −/+ — for "+1 to two abilities" style choices. */
function AbilityRow({ choice, onSet }: { choice: DerivedChoice; onSet: (picks: string[]) => void }): JSX.Element {
  const counts = countPicks(choice.picks)
  const full = choice.picks.length >= choice.count
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 4, marginTop: 6 }}>
      {choice.options.map((o) => {
        const n = counts.get(o.id) ?? 0
        const canAdd = !full && !lockedReason(o) && (choice.allowRepeats || n === 0)
        return (
          <div
            key={o.id}
            className="gb-card"
            style={{ padding: '4px 2px', textAlign: 'center', borderColor: n ? 'var(--accent)' : undefined, background: n ? 'var(--accent-subtle)' : undefined }}
            title={o.name}
          >
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: n ? 'var(--accent-hover)' : 'var(--text-muted)' }}>{o.id.toUpperCase()}</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{n ? `+${n}` : '–'}</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
              <button type="button" style={stepButton} disabled={n === 0} onClick={() => onSet(withoutOne(choice.picks, o.id))} title={`One less on ${o.name}`}>
                <MinusIcon size={9} />
              </button>
              <button type="button" style={stepButton} disabled={!canAdd} onClick={() => onSet([...choice.picks, o.id])} title={`+1 ${o.name}`}>
                <PlusIcon size={9} />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** A typed choice (a language, a favoured enemy): chips plus a box that adds on Enter or when it loses focus. */
function FreeformPicks({ choice, readOnly, onSet }: { choice: DerivedChoice; readOnly?: boolean; onSet: (picks: string[]) => void }): JSX.Element {
  const [text, setText] = useState('')
  const commit = (): void => {
    if (!text.trim()) return
    onSet([...choice.picks, text.trim()])
    setText('')
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, alignItems: 'center' }}>
      {choice.picks.map((p, i) => (
        <span key={`${p}:${i}`} className="gb-badge gb-badge--accent" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '3px 8px' }}>
          {p}
          {!readOnly && (
            <button type="button" onClick={() => onSet(choice.picks.filter((_, j) => j !== i))} style={removeStyle} title={`Remove ${p}`}>
              <XIcon size={10} />
            </button>
          )}
        </span>
      ))}
      {!readOnly && choice.remaining > 0 && (
        <input
          className="gb-input"
          placeholder="Type and press Enter…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          onBlur={commit}
          style={{ flex: 1, minWidth: 140, fontSize: 12 }}
        />
      )}
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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8, alignItems: 'start' }}>
      {ordered.map((c) => (
        <ChoiceCard key={c.key} choice={c} all={all} readOnly={readOnly} onSetPicks={onSetPicks} />
      ))}
    </div>
  )
}

const removeStyle = { background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1, display: 'inline-flex' } as const
const stepButton = {
  background: 'var(--bg-sunken)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  padding: '2px 4px',
  display: 'inline-flex',
  alignItems: 'center'
} as const

/**
 * A compact pick for pickers that aren't engine choices (a subclass, an
 * origin feat and its spells): what's picked, and a button that opens the
 * PickerWindow. `max` above 1 picks several.
 */
export function PickField({
  title,
  options,
  selected,
  max = 1,
  readOnly,
  onChange
}: {
  title: string
  options: PickOption[]
  selected: string[]
  max?: number
  readOnly?: boolean
  onChange: (selected: string[]) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const names = selected.map((id) => options.find((o) => o.id === id)).filter((o): o is PickOption => !!o)
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {names.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Not chosen yet</span>}
      {names.map((o) => (
        <HoverDetailCard key={o.id} title={o.name} fields={[]} description={o.description ?? ''}>
          <span className="gb-badge gb-badge--accent" style={{ fontSize: 12, padding: '3px 8px' }}>
            {o.name}
          </span>
        </HoverDetailCard>
      ))}
      {!readOnly && (
        <button
          type="button"
          className={`gb-btn ${names.length === 0 ? 'gb-btn--primary' : 'gb-btn--ghost'}`}
          onClick={() => setOpen(true)}
          style={{ fontSize: 11, padding: '3px 10px', marginLeft: 'auto' }}
        >
          {names.length === 0 ? 'Choose…' : names.length < max ? 'Add more…' : 'Change'}
        </button>
      )}
      {open && (
        <PickerWindow
          title={title}
          status={max > 1 ? `${selected.length} of ${max} picked` : undefined}
          options={options}
          picks={selected}
          mode={max > 1 ? 'multi' : 'single'}
          max={max}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
