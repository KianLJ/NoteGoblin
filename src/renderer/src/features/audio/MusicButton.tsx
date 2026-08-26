import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MUSIC_LIBRARY, findTrack } from '../../data/musicLibrary'
import { getMusicState, subscribeMusic, pickMood, playSpecificTrack, togglePlayPause, skipTrack, applyLiveVolume } from './musicEngine'
import { getStoredMusicVolume, setMusicVolume, getStoredMusicBroadcastEnabled, setMusicBroadcastEnabled } from './soundSettings'
import { MusicNoteIcon } from '../shell/icons'
import { ContextMenu, type ContextMenuState } from '../../ui/ContextMenu'
import { ensureCustomMusicLoaded, subscribeCustomMusic, getCustomTracks, findCustomTrack, addCustomTrack, removeCustomTrack } from './customMusicStore'

interface MusicButtonProps {
  /** The DM's hosted session id — null while not hosting, in which case picking a mood always plays locally-only regardless of the broadcast toggle below (nobody's connected to receive it anyway). */
  sessionId: string | null
}

const MAX_FADE_MS = 10000
const FADE_STEP_MS = 250
const DEFAULT_FADE_MS = 2500

/** DM-only header button — Goblin Bard's mood picker. Picking a mood plays a random track from it on loop and (while hosting) broadcasts that exact track to every connected player; picking a different mood, or skipping within one, crossfades. */
export function MusicButton({ sessionId }: MusicButtonProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [musicState, setMusicState] = useState(() => getMusicState())
  const [fadeMs, setFadeMs] = useState(DEFAULT_FADE_MS)
  const [volume, setVolume] = useState(() => getStoredMusicVolume())
  const [broadcastEnabled, setBroadcastEnabledState] = useState(() => getStoredMusicBroadcastEnabled())
  const [trackMenu, setTrackMenu] = useState<ContextMenuState | null>(null)
  const [, setCustomTick] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  function chooseBroadcastEnabled(enabled: boolean): void {
    setMusicBroadcastEnabled(enabled)
    setBroadcastEnabledState(enabled)
  }

  useEffect(() => subscribeMusic(() => setMusicState(getMusicState())), [])
  useEffect(() => subscribeCustomMusic(() => setCustomTick((t) => t + 1)), [])
  useEffect(() => {
    void ensureCustomMusicLoaded()
  }, [])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function handleVolumeChange(next: number): void {
    setVolume(next)
    setMusicVolume(next)
    applyLiveVolume(next)
  }

  const nowPlaying = musicState.groupId ? MUSIC_LIBRARY.find((g) => g.id === musicState.groupId) : null
  const nowPlayingTrack = musicState.trackId ? (findTrack(musicState.trackId) ?? findCustomTrack(musicState.trackId)) : null

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="gb-btn gb-btn--secondary"
        title="Goblin Bard"
        style={{ padding: 'var(--space-2)', display: 'flex', position: 'relative' }}
      >
        <MusicNoteIcon />
        {musicState.playing && (
          <span
            style={{
              position: 'absolute',
              top: 3,
              right: 3,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--accent)'
            }}
          />
        )}
      </button>

      {open && (
        <div
          className="gb-card"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 360,
            padding: 'var(--space-4)',
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Goblin Bard</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {nowPlaying ? nowPlaying.label : 'Silent'}
            </span>
          </div>

          <label
            title="On: every connected player hears the same music, synced. Off: it only plays from this device — for playing in person around one table."
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          >
            <input type="checkbox" checked={broadcastEnabled} onChange={(e) => chooseBroadcastEnabled(e.target.checked)} />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Broadcast to players</span>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
            {MUSIC_LIBRARY.map((group) => {
              const active = musicState.groupId === group.id
              const customTracks = getCustomTracks(group.id)
              const isEmpty = group.tracks.length === 0 && customTracks.length === 0
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => {
                    if (isEmpty) return
                    pickMood(group.id, fadeMs, sessionId)
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    const items: ContextMenuState['items'] = []
                    for (const track of group.tracks) {
                      items.push({ label: track.title, onSelect: () => playSpecificTrack(track.id, fadeMs, sessionId) })
                    }
                    for (const track of customTracks) {
                      items.push({ label: `${track.title} (custom)`, onSelect: () => playSpecificTrack(track.id, fadeMs, sessionId) })
                    }
                    items.push({ label: '+ Add custom track…', onSelect: () => void addCustomTrack(group.id) })
                    for (const track of customTracks) {
                      items.push({
                        label: `Remove "${track.title}"`,
                        danger: true,
                        onSelect: () => void removeCustomTrack(group.id, track.id)
                      })
                    }
                    setTrackMenu({ x: e.clientX, y: e.clientY, items })
                  }}
                  title={`${group.label} — right-click to pick a specific track or add your own`}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    background: active ? 'var(--accent-subtle)' : 'transparent',
                    color: active ? 'var(--accent-hover)' : isEmpty ? 'var(--text-muted)' : 'var(--text-primary)',
                    fontSize: 13,
                    fontWeight: active ? 700 : 400,
                    cursor: isEmpty ? 'default' : 'pointer'
                  }}
                >
                  {group.label}
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <TransportButton
              title="Previous track in this mood"
              disabled={!musicState.groupId}
              onClick={() => skipTrack(-1, fadeMs, sessionId)}
            >
              <SkipIcon direction="prev" />
            </TransportButton>
            <TransportButton
              title={musicState.playing ? 'Pause' : 'Play'}
              disabled={!musicState.trackId}
              onClick={() => togglePlayPause(fadeMs, sessionId)}
              large
            >
              {musicState.playing ? <PauseIcon /> : <PlayIcon />}
            </TransportButton>
            <TransportButton
              title="Next track in this mood"
              disabled={!musicState.groupId}
              onClick={() => skipTrack(1, fadeMs, sessionId)}
            >
              <SkipIcon direction="next" />
            </TransportButton>
          </div>

          <div
            style={{
              textAlign: 'center',
              fontSize: 14,
              fontWeight: 600,
              color: nowPlayingTrack ? 'var(--text-primary)' : 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {nowPlayingTrack ? nowPlayingTrack.title : 'Nothing playing'}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label className="gb-label" style={{ fontSize: 12 }}>
              Crossfade
            </label>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fadeMs === 0 ? 'Cut' : `${(fadeMs / 1000).toFixed(2)}s`}</span>
          </div>
          <input
            type="range"
            min={0}
            max={MAX_FADE_MS}
            step={FADE_STEP_MS}
            value={fadeMs}
            onChange={(e) => setFadeMs(Number(e.target.value))}
          />

          <label className="gb-label" style={{ fontSize: 12 }}>
            Volume
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 13, color: 'var(--text-muted)', width: 38, textAlign: 'right' }}>
              {Math.round(volume * 100)}%
            </span>
          </div>

          <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-muted)' }}>Music by alkakrab</div>
        </div>
      )}
      <ContextMenu state={trackMenu} onClose={() => setTrackMenu(null)} />
    </div>
  )
}

function TransportButton({
  title,
  disabled,
  onClick,
  large,
  children
}: {
  title: string
  disabled?: boolean
  onClick: () => void
  large?: boolean
  children: ReactNode
}): JSX.Element {
  const size = large ? 44 : 36
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        border: '1px solid var(--border-subtle)',
        background: large ? 'var(--accent-subtle)' : 'transparent',
        color: disabled ? 'var(--text-muted)' : large ? 'var(--accent-hover)' : 'var(--text-secondary)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0
      }}
    >
      {children}
    </button>
  )
}

function PlayIcon(): JSX.Element {
  return (
    <svg width="17" height="17" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <path d="M2.5 1.5v9l7-4.5-7-4.5Z" />
    </svg>
  )
}

function PauseIcon(): JSX.Element {
  return (
    <svg width="17" height="17" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <rect x="2.5" y="1.5" width="2.5" height="9" />
      <rect x="7" y="1.5" width="2.5" height="9" />
    </svg>
  )
}

function SkipIcon({ direction }: { direction: 'prev' | 'next' }): JSX.Element {
  const flip = direction === 'prev'
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 12 12"
      fill="currentColor"
      aria-hidden="true"
      style={{ transform: flip ? 'scaleX(-1)' : undefined }}
    >
      <path d="M1.5 1.5v9l6-4.5-6-4.5Z" />
      <rect x="8.2" y="1.5" width="1.8" height="9" />
    </svg>
  )
}
