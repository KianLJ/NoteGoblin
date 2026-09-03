import { useEffect, useMemo, useRef, useState } from 'react'
import { SFX_LIBRARY, type SfxCue } from '../../data/sfxLibrary'
import { playSfxCue } from './sfxBoardEngine'
import { getStoredSfxBoardBroadcastEnabled, setSfxBoardBroadcastEnabled } from './soundSettings'

interface SoundBoardButtonProps {
  /** The DM's hosted session id — null while not hosting, in which case a cue always plays locally-only regardless of the broadcast toggle below (nobody's connected to receive it anyway). */
  sessionId: string | null
}

/** DM-only header button — a searchable, categorized board of one-shot combat/magic/creature cues (see sfxLibrary.ts). Clicking a cue plays it immediately and (while hosting with broadcasting on) tells every connected player to play the same one. */
export function SoundBoardButton({ sessionId }: SoundBoardButtonProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [broadcastEnabled, setBroadcastEnabledState] = useState(() => getStoredSfxBoardBroadcastEnabled())
  const containerRef = useRef<HTMLDivElement>(null)

  const totalCues = useMemo(() => SFX_LIBRARY.reduce((sum, c) => sum + c.cues.length, 0), [])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function toggleCategory(id: string): void {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handlePlay(cue: SfxCue): void {
    playSfxCue(cue.id, sessionId)
  }

  const trimmedQuery = query.trim().toLowerCase()
  const searching = trimmedQuery.length > 0

  // While searching, every matching cue across every category — flattened,
  // since hunting through collapsed sections defeats the point of typing a
  // search in the first place.
  const searchResults: { cue: SfxCue; categoryLabel: string }[] = searching
    ? SFX_LIBRARY.flatMap((category) =>
        category.cues.filter((cue) => cue.label.toLowerCase().includes(trimmedQuery)).map((cue) => ({ cue, categoryLabel: category.label }))
      )
    : []

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="gb-btn gb-btn--secondary"
        title="Sound Board"
        style={{ padding: 'var(--space-2)', display: 'flex' }}
      >
        <SoundBoardIcon />
      </button>

      {open && (
        <div
          className="gb-card"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 340,
            maxHeight: 'calc(100vh - 80px)',
            overflow: 'hidden',
            padding: 'var(--space-4)',
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Sound Board</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{totalCues} cues</span>
          </div>

          <label
            title="On: every connected player hears the same cue you trigger. Off: it only plays from this device — for playing in person around one table."
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={broadcastEnabled}
              onChange={(e) => {
                setSfxBoardBroadcastEnabled(e.target.checked)
                setBroadcastEnabledState(e.target.checked)
              }}
            />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Broadcast to players</span>
          </label>

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cues…"
            className="gb-input"
            style={{ width: '100%' }}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', maxHeight: 380 }}>
            {searching ? (
              searchResults.length === 0 ? (
                <span style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 2px' }}>No cues match &ldquo;{query}&rdquo;</span>
              ) : (
                searchResults.map(({ cue, categoryLabel }) => <CueRow key={cue.id} cue={cue} sublabel={categoryLabel} onPlay={() => handlePlay(cue)} />)
              )
            ) : (
              SFX_LIBRARY.map((category) => {
                const isOpen = expanded.has(category.id)
                const isEmpty = category.cues.length === 0
                return (
                  <div key={category.id}>
                    <button
                      type="button"
                      onClick={() => !isEmpty && toggleCategory(category.id)}
                      disabled={isEmpty}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '7px 4px',
                        background: 'none',
                        border: 'none',
                        borderBottom: '1px solid var(--border-subtle)',
                        cursor: isEmpty ? 'default' : 'pointer',
                        color: isEmpty ? 'var(--text-muted)' : 'var(--text-primary)'
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                        {!isEmpty && <ChevronIcon open={isOpen} />}
                        {category.label}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{category.cues.length}</span>
                    </button>
                    {isEmpty && (
                      <div style={{ padding: '6px 4px 10px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        No cues yet — drop MP3s into <code>assets/soundboard/{category.id}</code>
                      </div>
                    )}
                    {!isEmpty && isOpen && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 0 8px' }}>
                        {category.cues.map((cue) => (
                          <CueRow key={cue.id} cue={cue} onPlay={() => handlePlay(cue)} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function CueRow({ cue, sublabel, onPlay }: { cue: SfxCue; sublabel?: string; onPlay: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onPlay}
      title={`Play "${cue.label}"`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        textAlign: 'left',
        padding: '6px 8px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid transparent',
        background: 'transparent',
        color: 'var(--text-primary)',
        fontSize: 13,
        cursor: 'pointer'
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-sunken)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <PlayPadIcon />
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cue.label}</span>
      {sublabel && <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{sublabel}</span>}
    </button>
  )
}

function ChevronIcon({ open }: { open: boolean }): JSX.Element {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform 0.12s ease', flexShrink: 0 }}
    >
      <path d="M4 2l4 4-4 4" />
    </svg>
  )
}

function PlayPadIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0, opacity: 0.7 }}>
      <path d="M2.5 1.5v9l7-4.5-7-4.5Z" />
    </svg>
  )
}

/** A 2x2 grid of pads — reads as "soundboard" the way a music note reads as "music." */
function SoundBoardIcon(): JSX.Element {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.2" fill="currentColor" opacity="0.85" />
      <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.2" fill="currentColor" opacity="0.55" />
      <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.2" fill="currentColor" opacity="0.55" />
      <rect x="9" y="9" width="5.5" height="5.5" rx="1.2" fill="currentColor" opacity="0.85" />
    </svg>
  )
}
