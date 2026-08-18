import { useEffect, useMemo, useState } from 'react'
import { BESTIARY, BESTIARY_TYPES, formatCr, type BestiaryMonster } from '../../data/bestiary'
import { loadCustomMonsters, removeCustomMonster, isCustomMonster } from '../../data/customBestiary'
import { renderStatblockHtml } from '../../statblock'
import { CloseIcon } from '../campaigns/icons'

interface BestiaryProps {
  onClose: () => void
  /** Present only when opened from a note's "Import from Bestiary" toolbar action — swaps the browse-only footer for an "Insert" button and closes automatically once picked. */
  onPick?: (monster: BestiaryMonster) => void
}

function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * A full-screen monster browser — search + type/CR filters on the left, the
 * selected monster's stat block on the right, reusing the exact same
 * renderStatblockHtml/gb-statblock renderer a DM's ```statblock note block
 * already uses, so a monster looked up here and one pasted into a note look
 * identical. The bundled SRD 5.1 roster (data/bestiary.ts) plus any custom
 * creatures saved from a note's rendered statblock (customBestiary.ts,
 * localStorage-backed) — entirely local, no network needed either way.
 */
export function Bestiary({ onClose, onPick }: BestiaryProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [selectedIndex, setSelectedIndex] = useState<string | null>(null)
  const [customMonsters, setCustomMonsters] = useState(() => loadCustomMonsters())

  const allMonsters = useMemo(() => [...customMonsters, ...BESTIARY], [customMonsters])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allMonsters
      .filter((m) => {
        if (typeFilter && m.type !== typeFilter) return false
        if (q && !m.name.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => a.crNumeric - b.crNumeric || a.name.localeCompare(b.name))
  }, [allMonsters, query, typeFilter])

  const selected: BestiaryMonster | undefined =
    allMonsters.find((m) => m.index === selectedIndex) ?? filtered[0]

  function handleDeleteCustom(index: string): void {
    removeCustomMonster(index)
    setCustomMonsters(loadCustomMonsters())
    if (selectedIndex === index) setSelectedIndex(null)
  }

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
                const custom = isCustomMonster(m.index)
                return (
                  <div
                    key={m.index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      background: active ? 'var(--accent-subtle)' : 'transparent'
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedIndex(m.index)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 6,
                        flex: 1,
                        minWidth: 0,
                        textAlign: 'left',
                        padding: '6px var(--space-3)',
                        border: 'none',
                        background: 'none',
                        color: active ? 'var(--accent-hover)' : 'var(--text-primary)',
                        cursor: 'pointer',
                        fontSize: 13
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.name}
                        {custom && (
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 5 }}>· custom</span>
                        )}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>CR {formatCr(m.crNumeric)}</span>
                    </button>
                    {custom && (
                      <button
                        type="button"
                        onClick={() => handleDeleteCustom(m.index)}
                        title="Delete this custom creature"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          fontSize: 14,
                          padding: '0 var(--space-2)',
                          flexShrink: 0
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                )
              })}
              {filtered.length === 0 && (
                <div style={{ padding: 'var(--space-3)', fontSize: 12, color: 'var(--text-muted)' }}>No matches.</div>
              )}
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-4)' }}>
              {selected ? (
                <div dangerouslySetInnerHTML={{ __html: renderStatblockHtml(selected) }} />
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No monster selected.</div>
              )}
            </div>
            {onPick && selected && (
              <div style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                <button
                  type="button"
                  className="gb-btn gb-btn--primary"
                  onClick={() => onPick(selected)}
                  style={{ width: '100%' }}
                >
                  Insert {selected.name}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
