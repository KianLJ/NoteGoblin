import { useEffect, useMemo, useState } from 'react'
import { BESTIARY, BESTIARY_TYPES, formatCr, type BestiaryMonster } from '../../data/bestiary'
import { renderStatblockHtml } from '../../statblock'
import { CloseIcon } from '../campaigns/icons'

interface BestiaryProps {
  onClose: () => void
}

function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * A full-screen SRD monster browser — search + type/CR filters on the left,
 * the selected monster's stat block on the right, reusing the exact same
 * renderStatblockHtml/gb-statblock renderer a DM's ```statblock note block
 * already uses, so a monster looked up here and one pasted into a note look
 * identical. Data is the bundled SRD 5.1 roster (see data/bestiary.ts) —
 * entirely local, no network needed.
 */
export function Bestiary({ onClose }: BestiaryProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [selectedIndex, setSelectedIndex] = useState<string | null>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return BESTIARY.filter((m) => {
      if (typeFilter && m.type !== typeFilter) return false
      if (q && !m.name.toLowerCase().includes(q)) return false
      return true
    }).sort((a, b) => a.crNumeric - b.crNumeric || a.name.localeCompare(b.name))
  }, [query, typeFilter])

  const selected: BestiaryMonster | undefined =
    BESTIARY.find((m) => m.index === selectedIndex) ?? filtered[0]

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20, 17, 12, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
    >
      <div
        className="gb-card"
        style={{
          width: 'calc(100vw - var(--space-6) * 2)',
          height: 'calc(100vh - var(--space-6) * 2)',
          maxWidth: 1100,
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          boxShadow: 'var(--shadow-lg)'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: '1px solid var(--border-subtle)',
            flexShrink: 0
          }}
        >
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16 }}>Bestiary</span>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              padding: 4
            }}
          >
            <CloseIcon />
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <div
            style={{
              width: 280,
              flexShrink: 0,
              borderRight: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0
            }}
          >
            <div style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
              <input
                autoFocus
                className="gb-input"
                placeholder="Search monsters…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ fontSize: 13 }}
              />
              <select
                className="gb-input"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                style={{ fontSize: 13 }}
              >
                <option value="">All types</option>
                {BESTIARY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {toTitleCase(t)}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {filtered.length} monster{filtered.length === 1 ? '' : 's'}
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', borderTop: '1px solid var(--border-subtle)' }}>
              {filtered.map((m) => {
                const active = selected?.index === m.index
                return (
                  <button
                    key={m.index}
                    type="button"
                    onClick={() => setSelectedIndex(m.index)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 6,
                      width: '100%',
                      textAlign: 'left',
                      padding: '6px var(--space-3)',
                      border: 'none',
                      background: active ? 'var(--accent-subtle)' : 'transparent',
                      color: active ? 'var(--accent-hover)' : 'var(--text-primary)',
                      cursor: 'pointer',
                      fontSize: 13
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>CR {formatCr(m.crNumeric)}</span>
                  </button>
                )
              })}
              {filtered.length === 0 && (
                <div style={{ padding: 'var(--space-3)', fontSize: 12, color: 'var(--text-muted)' }}>No matches.</div>
              )}
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-4)' }}>
            {selected ? (
              <div dangerouslySetInnerHTML={{ __html: renderStatblockHtml(selected) }} />
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No monster selected.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
