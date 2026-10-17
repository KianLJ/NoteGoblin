import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { MinusIcon, PlusIcon, XIcon } from '../../ui/icons'

export interface PickOption {
  id: string
  name: string
  description?: string
  /** Short facts shown under the name ("2 pts"). */
  meta?: string
  /** Why it can't be added right now, if it can't ("Prerequisite not met"). */
  locked?: string
}

/**
 * The full list for a pick, in its own window so the card it belongs to
 * stays small: a searchable list on the left, the highlighted option's
 * full description on the right.
 *
 * - `single`: clicking an option picks it and closes the window.
 * - `multi`: options toggle, up to `max`; Done closes.
 * - `count`: each option has −/+ (repeatable picks, point-buy); `canAdd`
 *   decides whether + is allowed.
 *
 * Rendered into the page body (like the hover cards), with the app's font
 * scale re-applied, so it isn't clipped by a modal it's opened from.
 */
export function PickerWindow({
  title,
  status,
  options,
  picks,
  mode,
  max = 1,
  canAdd,
  onChange,
  onClose
}: {
  title: string
  /** "2 of 3 picked", "3 points left". */
  status?: string
  options: PickOption[]
  picks: string[]
  mode: 'single' | 'multi' | 'count'
  max?: number
  canAdd?: (id: string, picks: string[]) => boolean
  onChange: (picks: string[]) => void
  onClose: () => void
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [focus, setFocus] = useState<string | null>(picks[0] ?? null)
  const q = query.trim().toLowerCase()
  const shown = q ? options.filter((o) => o.name.toLowerCase().includes(q) || (o.description ?? '').toLowerCase().includes(q)) : options
  const focused = options.find((o) => o.id === focus) ?? shown[0]
  const count = (id: string): number => picks.filter((p) => p === id).length
  const addable = (o: PickOption): boolean => !o.locked && (canAdd ? canAdd(o.id, picks) : mode === 'single' || picks.length < max)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function choose(o: PickOption): void {
    const picked = count(o.id) > 0
    if (mode === 'single') {
      if (!picked && !addable(o)) return
      onChange(picked ? [] : [o.id])
      if (!picked) onClose()
      return
    }
    if (mode === 'multi') {
      if (picked) onChange(picks.filter((p) => p !== o.id))
      else if (addable(o)) onChange([...picks, o.id])
    }
  }
  const removeOne = (id: string): void => {
    const i = picks.lastIndexOf(id)
    if (i >= 0) onChange([...picks.slice(0, i), ...picks.slice(i + 1)])
  }

  const stepper = (o: PickOption, size = 10): JSX.Element => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button type="button" style={stepButton} disabled={count(o.id) === 0} onClick={() => removeOne(o.id)} title={`One less ${o.name}`}>
        <MinusIcon size={size} />
      </button>
      <strong style={{ minWidth: 14, textAlign: 'center' }}>{count(o.id)}</strong>
      <button type="button" style={stepButton} disabled={!addable(o)} onClick={() => onChange([...picks, o.id])} title={`Add ${o.name}`}>
        <PlusIcon size={size} />
      </button>
    </span>
  )

  return createPortal(
    <div
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 2500, background: 'rgba(20, 17, 12, 0.5)' }}
    >
      <div
        onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        style={{
          width: 'calc(100% / var(--font-scale, 1))',
          height: 'calc(100% / var(--font-scale, 1))',
          transform: 'scale(var(--font-scale, 1))',
          transformOrigin: 'top left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <div
          className="gb-card"
          role="dialog"
          aria-label={title}
          style={{ width: 760, maxWidth: 'calc(100% - 48px)', height: 'min(560px, calc(100% - 48px))', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border-subtle)' }}>
            <strong style={{ flex: 1, fontSize: 15 }}>{title}</strong>
            {status && <span className="gb-badge gb-badge--accent" style={{ fontSize: 11 }}>{status}</span>}
            <button type="button" onClick={onClose} title="Close" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'inline-flex', padding: 4 }}>
              <XIcon size={13} />
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ padding: 'var(--space-2) var(--space-3)' }}>
                <input className="gb-input" autoFocus placeholder={`Search ${options.length}…`} value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: '100%', fontSize: 12 }} />
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-2) var(--space-2)' }}>
                {shown.map((o) => {
                  const n = count(o.id)
                  const locked = n === 0 && !addable(o)
                  return (
                    <div
                      key={o.id}
                      onMouseEnter={() => setFocus(o.id)}
                      onClick={() => {
                        setFocus(o.id)
                        if (mode !== 'count') choose(o)
                      }}
                      role="option"
                      aria-selected={n > 0}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 8px',
                        borderRadius: 'var(--radius-sm)',
                        cursor: mode === 'count' || locked ? 'default' : 'pointer',
                        background: n > 0 ? 'var(--accent-subtle)' : focused?.id === o.id ? 'var(--bg-sunken)' : 'transparent',
                        opacity: locked ? 0.55 : 1
                      }}
                    >
                      {mode === 'multi' && <input type="checkbox" readOnly checked={n > 0} disabled={locked} style={{ pointerEvents: 'none' }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: n > 0 ? 700 : 500, color: n > 0 ? 'var(--accent-hover)' : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</div>
                        {(o.meta || (locked && o.locked)) && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{[o.meta, locked ? o.locked : ''].filter(Boolean).join(' · ')}</div>}
                      </div>
                      {mode === 'count' && stepper(o)}
                    </div>
                  )
                })}
                {shown.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '0 8px' }}>No matches.</p>}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 'var(--space-4)' }}>
              {focused ? (
                <>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>{focused.name}</div>
                  {(focused.meta || focused.locked) && (
                    <div style={{ fontSize: 12, color: focused.locked && count(focused.id) === 0 ? 'var(--danger)' : 'var(--text-muted)', marginTop: 2 }}>
                      {[focused.meta, count(focused.id) === 0 ? focused.locked : ''].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  <p style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>{focused.description || 'No description.'}</p>
                  <div style={{ marginTop: 'var(--space-3)' }}>
                    {mode === 'count' ? (
                      stepper(focused, 12)
                    ) : (
                      <button
                        type="button"
                        className={`gb-btn ${count(focused.id) ? 'gb-btn--secondary' : 'gb-btn--primary'}`}
                        disabled={count(focused.id) === 0 && !addable(focused)}
                        onClick={() => choose(focused)}
                        style={{ fontSize: 12, padding: '5px 14px' }}
                      >
                        {count(focused.id) ? 'Remove' : mode === 'single' ? `Choose ${focused.name}` : 'Add'}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nothing to choose from.</p>
              )}
            </div>
          </div>
          {mode !== 'single' && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 'var(--space-2) var(--space-4)', borderTop: '1px solid var(--border-subtle)' }}>
              <button type="button" className="gb-btn gb-btn--primary" onClick={onClose} style={{ fontSize: 12, padding: '5px 16px' }}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

const stepButton = {
  background: 'var(--bg-sunken)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  padding: '3px 5px',
  display: 'inline-flex',
  alignItems: 'center'
} as const
