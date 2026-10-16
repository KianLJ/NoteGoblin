import { createContext, useContext, useState, type CSSProperties, type ReactNode } from 'react'
import { formulaSyntaxError } from '@shared/content/formula'
import type { FormulaProbe, ProbeResult } from '@shared/content/engine'
import type { AbilityId } from '@shared/content/schema'
import { slugify } from '@shared/content/workshop'
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from '../../../ui/icons'

// Building blocks for the Workshop's form editors. Every editor works on
// plain JSON objects (the pack draft), keeps keys it doesn't know about, and
// drops optional keys that are emptied — so a form edit and a JSON edit of
// the same entry always agree.

export type Obj = Record<string, unknown>

export const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
export const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
export const arr = <T = unknown,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
export const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {})

/** `o` with `key` set — or removed, when the value is undefined, an empty string or an empty list. */
export function withKey(o: Obj, key: string, value: unknown): Obj {
  const next = { ...o }
  if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) delete next[key]
  else next[key] = value
  return next
}

/** The same, for a required key: an empty string stays (and validation says it's missing). */
export function withRequired(o: Obj, key: string, value: unknown): Obj {
  return { ...o, [key]: value }
}

export const ABILITIES: Array<{ id: AbilityId; label: string }> = [
  { id: 'str', label: 'STR' },
  { id: 'dex', label: 'DEX' },
  { id: 'con', label: 'CON' },
  { id: 'int', label: 'INT' },
  { id: 'wis', label: 'WIS' },
  { id: 'cha', label: 'CHA' }
]

// --- context: formula previews and suggestion lists ------------------------

export interface WorkshopFormContext {
  /** Evaluates a formula against the preview character; undefined while there's no valid pack to preview with. */
  evaluate?: (probe: FormulaProbe) => ProbeResult
  /** "Jujutsu Sorcerer 5" — who the preview numbers are for. */
  previewLabel: string
  /** Where datalist ids point (see Suggestions in WorkshopForm.tsx). */
  lists: Record<string, string[]>
}

export const FormContext = createContext<WorkshopFormContext>({ previewLabel: '', lists: {} })

/** Where a formula sits — inside a class feature (@classLevel, @table) or an archetype (@archetypeLevel). Nested editors inherit it. */
export interface FormulaScope {
  inClass?: boolean
  archetypeId?: string
}
export const ScopeContext = createContext<FormulaScope>({})

export function useSuggestions(list: string): string[] {
  return useContext(FormContext).lists[list] ?? []
}

/** The <datalist> elements every suggestion-backed input points at. Rendered once per form. */
export function Suggestions(): JSX.Element {
  const { lists } = useContext(FormContext)
  return (
    <>
      {Object.entries(lists).map(([id, values]) => (
        <datalist key={id} id={`wk-${id}`}>
          {values.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      ))}
    </>
  )
}

// --- layout -----------------------------------------------------------------

export function Grid({ children, min = 180 }: { children: ReactNode; min?: number }): JSX.Element {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 8, alignItems: 'start' }}>{children}</div>
}

export function Field({ label, hint, children, wide }: { label: string; hint?: ReactNode; children: ReactNode; wide?: boolean }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, gridColumn: wide ? '1 / -1' : undefined }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{hint}</span>}
    </div>
  )
}

/** A titled, optionally collapsible block inside a form. */
export function Group({
  title,
  children,
  actions,
  collapsible,
  defaultOpen = true,
  accent
}: {
  title: ReactNode
  children: ReactNode
  actions?: ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
  accent?: boolean
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ border: `1px solid ${accent ? 'var(--accent)' : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-md)', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {collapsible ? (
          <button type="button" onClick={() => setOpen(!open)} style={{ ...plainButton, flex: 1, textAlign: 'left', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-flex', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}>
              <ChevronIcon />
            </span>
            {title}
          </button>
        ) : (
          <span style={{ flex: 1, fontSize: 12, fontWeight: 700 }}>{title}</span>
        )}
        {actions}
      </div>
      {(!collapsible || open) && children}
    </div>
  )
}

function ChevronIcon(): JSX.Element {
  return (
    <svg width={10} height={10} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3l5 5-5 5" />
    </svg>
  )
}

/** Up / down / remove buttons for a row in a list. */
export function RowActions({ onUp, onDown, onRemove, label }: { onUp?: () => void; onDown?: () => void; onRemove: () => void; label: string }): JSX.Element {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {onUp && (
        <button type="button" onClick={onUp} title="Move up" style={iconButton}>
          <ArrowUpIcon size={11} />
        </button>
      )}
      {onDown && (
        <button type="button" onClick={onDown} title="Move down" style={iconButton}>
          <ArrowDownIcon size={11} />
        </button>
      )}
      <button type="button" onClick={onRemove} title={`Remove ${label}`} style={iconButton}>
        <XIcon size={11} />
      </button>
    </span>
  )
}

export function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }): JSX.Element {
  return (
    <button type="button" className="gb-btn gb-btn--secondary" onClick={onClick} style={{ fontSize: 12, padding: '3px 10px', alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <PlusIcon size={11} />
      {children}
    </button>
  )
}

/** Moves item `i` by `delta` in a list (a new list). */
export function move<T>(list: T[], i: number, delta: number): T[] {
  const j = i + delta
  if (j < 0 || j >= list.length) return list
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

// --- inputs -----------------------------------------------------------------

export function TextInput({
  value,
  onChange,
  placeholder,
  list,
  mono,
  style
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  /** A Suggestions list id. */
  list?: string
  mono?: boolean
  style?: CSSProperties
}): JSX.Element {
  return (
    <input
      className="gb-input"
      value={value}
      placeholder={placeholder}
      list={list ? `wk-${list}` : undefined}
      onChange={(e) => onChange(e.target.value)}
      style={{ fontSize: 12, padding: '4px 8px', minWidth: 0, ...(mono ? monoStyle : {}), ...style }}
    />
  )
}

export function TextArea({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }): JSX.Element {
  return <textarea className="gb-input" value={value} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={{ fontSize: 12, padding: '4px 8px', resize: 'vertical', minHeight: 0 }} />
}

/** A number, or nothing (cleared) when the field is emptied — `onChange(undefined)`. */
export function NumberInput({ value, onChange, min, max, placeholder, width }: { value: number | undefined; onChange: (v: number | undefined) => void; min?: number; max?: number; placeholder?: string; width?: number }): JSX.Element {
  return (
    <input
      className="gb-input"
      type="number"
      value={value ?? ''}
      min={min}
      max={max}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      style={{ fontSize: 12, padding: '4px 8px', width: width ?? '100%', minWidth: 0 }}
    />
  )
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  none
}: {
  value: T | ''
  onChange: (v: T | '') => void
  options: Array<{ value: T; label: string }>
  /** Label for the empty choice; omitted = no empty choice. */
  none?: string
}): JSX.Element {
  return (
    <select className="gb-input" value={value} onChange={(e) => onChange(e.target.value as T | '')} style={{ fontSize: 12, padding: '4px 6px', minWidth: 0 }}>
      {none !== undefined && <option value="">{none}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }): JSX.Element {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

/** A list of short strings as removable chips plus an input (Enter or comma adds). */
export function TagsInput({ value, onChange, placeholder, list }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; list?: string }): JSX.Element {
  const [text, setText] = useState('')
  const commit = (): void => {
    const parts = text
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    if (parts.length) onChange([...value, ...parts.filter((p) => !value.includes(p))])
    setText('')
  }
  return (
    <div className="gb-input" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: 4, alignItems: 'center', minWidth: 0 }}>
      {value.map((t) => (
        <span key={t} className="gb-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
          {t}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} title={`Remove ${t}`} style={{ ...plainButton, display: 'inline-flex' }}>
            <XIcon size={9} />
          </button>
        </span>
      ))}
      <input
        value={text}
        list={list ? `wk-${list}` : undefined}
        placeholder={value.length ? '' : placeholder}
        onChange={(e) => (e.target.value.endsWith(',') ? (setText(e.target.value), undefined) : setText(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1))
        }}
        onBlur={commit}
        style={{ flex: 1, minWidth: 80, border: 'none', outline: 'none', background: 'transparent', color: 'inherit', fontSize: 12 }}
      />
    </div>
  )
}

export function AbilityChips({ value, onChange }: { value: AbilityId[]; onChange: (v: AbilityId[]) => void }): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {ABILITIES.map((a) => {
        const on = value.includes(a.id)
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== a.id) : [...value, a.id])}
            className={`gb-badge${on ? ' gb-badge--accent' : ''}`}
            style={{ cursor: 'pointer', fontSize: 11, border: 'none', opacity: on ? 1 : 0.6 }}
          >
            {a.label}
          </button>
        )
      })}
    </div>
  )
}

export function AbilitySelect({ value, onChange, none }: { value: string; onChange: (v: AbilityId | '') => void; none?: string }): JSX.Element {
  return <Select value={value as AbilityId | ''} onChange={onChange} none={none} options={ABILITIES.map((a) => ({ value: a.id, label: a.label }))} />
}

/** An id field with a button that fills it from a name ("Cursed Strike" → "cursed-strike"). */
export function IdInput({ value, onChange, fromName }: { value: string; onChange: (v: string) => void; fromName?: string }): JSX.Element {
  const suggested = fromName ? slugify(fromName) : ''
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <TextInput value={value} onChange={(v) => onChange(v.trim())} mono style={{ flex: 1 }} />
      {suggested && suggested !== value && (
        <button type="button" className="gb-btn gb-btn--ghost" onClick={() => onChange(suggested)} title={`Use "${suggested}"`} style={{ fontSize: 11, padding: '2px 6px' }}>
          From name
        </button>
      )}
    </div>
  )
}

/**
 * A formula with a syntax check and a live preview of what it works out to
 * for the Workshop's preview character ("= 7 for Jujutsu Sorcerer 5") —
 * dice formulas show their dice. The references it can use are listed on
 * hover of the help mark.
 */
export function FormulaInput({ value, onChange, placeholder, dice }: { value: string; onChange: (v: string) => void; placeholder?: string; dice?: boolean }): JSX.Element {
  const { evaluate, previewLabel } = useContext(FormContext)
  const scope = useContext(ScopeContext)
  const syntax = value.trim() ? formulaSyntaxError(value) : null
  let preview: ReactNode = null
  if (value.trim() && !syntax && evaluate) {
    // Feats and options picked under a class read @classLevel too, so class context is the default; species and backgrounds turn it off.
    const result = evaluate({ formula: value, inClass: true, ...scope })
    preview = result.ok ? (
      <span style={{ color: 'var(--accent)' }}>
        = {result.dice ?? result.value}
        {previewLabel && <span style={{ color: 'var(--text-muted)' }}> for {previewLabel}</span>}
      </span>
    ) : (
      <span style={{ color: 'var(--warning, #d4a017)' }}>{result.error}</span>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <TextInput value={value} onChange={onChange} placeholder={placeholder ?? (dice ? 'e.g. 2d6 + @str.mod' : 'e.g. @prof + @wis.mod')} mono style={{ flex: 1, borderColor: syntax ? 'var(--danger)' : undefined }} />
        <span title={FORMULA_HELP} style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'help', padding: '0 2px' }}>
          ?
        </span>
      </div>
      {(syntax || preview) && <span style={{ fontSize: 11, color: syntax ? 'var(--danger)' : undefined }}>{syntax ?? preview}</span>}
    </div>
  )
}

const FORMULA_HELP = [
  'References:',
  '@level, @prof, @highestClassLevel',
  '@str.mod, @dex.score … (any ability)',
  '@classLevel, @table.<column> (in a class feature)',
  '@class.<id>.level, @class.<id>.table.<column>',
  '@archetypeLevel (in an archetype)',
  '@stat.<id>, @counter.<id>, @alias.<id>.mod',
  '@resource.<id>.max / .remaining / .used',
  '@ac, @hp.max, @spell.dc, @skill.<id>',
  '@spent (variable-spend actions), @slotLevel (spells)',
  '@self.<ability>.mod (companion stats), @value (transforms)',
  '',
  'Functions: floor, ceil, round, abs, sign, min, max, clamp(x, lo, hi)',
  'Operators: + - * / %  < <= > >= == !=  && ||  a ? b : c',
  'Dice: 2d6, (@spent)d8, 1d@table.die'
].join('\n')

export const monoStyle: CSSProperties = { fontFamily: 'var(--font-mono, ui-monospace, Consolas, monospace)' }
export const plainButton: CSSProperties = { background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, font: 'inherit' }
export const iconButton: CSSProperties = { ...plainButton, color: 'var(--text-muted)', padding: 3, display: 'inline-flex' }
