import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MUSIC_LIBRARY, findTrack } from '../../data/musicLibrary'
import { ambientLayersFor } from '../../data/ambientLibrary'
import { getMusicState, subscribeMusic, pickMood, playSpecificTrack, togglePlayPause, skipTrack, changeVolume, stopPlayersOnly } from './musicEngine'
import { fadeAmbientLayerLevel, switchAmbientMood, broadcastAmbientLayerLevel } from './ambientEngine'
import {
  getStoredMusicVolume,
  setMusicVolume,
  getStoredMusicBroadcastEnabled,
  setMusicBroadcastEnabled,
  getStoredAmbientLevel,
  setStoredAmbientLevel
} from './soundSettings'
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

// Five discrete levels (Off through Max) per ambient layer instead of a
// freely-draggable slider — a small equalizer-style bar row, each bar
// picking its own fixed level; the actual crossfade between levels lives
// in ambientEngine.ts's fadeAmbientLayerLevel.
const AMBIENT_LEVELS = [0, 0.25, 0.5, 0.75, 1]

/** Which of AMBIENT_LEVELS a stored level is closest to — for lighting up the right bars on load, since a level saved before this UI existed (or restored from a mood switch) won't necessarily land exactly on one of the five steps. */
function closestAmbientLevelIndex(level: number): number {
  let bestIndex = 0
  let bestDiff = Infinity
  AMBIENT_LEVELS.forEach((step, i) => {
    const diff = Math.abs(step - level)
    if (diff < bestDiff) {
      bestDiff = diff
      bestIndex = i
    }
  })
  return bestIndex
}

/** DM-only header button — Goblin Bard's mood picker. Picking a mood plays a random track from it on loop and (while hosting) broadcasts that exact track to every connected player; picking a different mood, or skipping within one, crossfades. */
export function MusicButton({ sessionId }: MusicButtonProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [musicState, setMusicState] = useState(() => getMusicState())
  const [fadeMs, setFadeMs] = useState(DEFAULT_FADE_MS)
  const [volume, setVolume] = useState(() => getStoredMusicVolume())
  const [broadcastEnabled, setBroadcastEnabledState] = useState(() => getStoredMusicBroadcastEnabled())
  const [trackMenu, setTrackMenu] = useState<ContextMenuState | null>(null)
  const [, setCustomTick] = useState(0)
  // Placeholder ambient-SFX slider levels (see ambientLibrary.ts) — keyed by
  // "groupId:ambientId" since e.g. "wind" means something different (and
  // keeps its own level) under Desert vs. under Dungeon & Dread. Loaded
  // lazily per option the first time its mood is actually shown, rather
  // than eagerly for every mood in the library up front.
  const [ambientLevels, setAmbientLevels] = useState<Record<string, number>>({})
  const containerRef = useRef<HTMLDivElement>(null)

  function chooseBroadcastEnabled(enabled: boolean): void {
    // Turning it off is the only signal a connected player's client ever
    // gets to stop hearing a synced track — nothing else tells them to,
    // once they're already playing it, so this has to be an explicit
    // "stop" push rather than just letting future picks silently stop
    // reaching them. Only fires when it was actually on before (no-op if
    // it was already off) and doesn't touch this device's own playback.
    if (broadcastEnabled && !enabled) stopPlayersOnly(fadeMs, sessionId)
    setMusicBroadcastEnabled(enabled)
    setBroadcastEnabledState(enabled)
  }

  useEffect(() => subscribeMusic(() => setMusicState(getMusicState())), [])
  useEffect(() => subscribeCustomMusic(() => setCustomTick((t) => t + 1)), [])
  useEffect(() => {
    void ensureCustomMusicLoaded()
  }, [])

  // Loads this mood's ambient levels from storage the first time it's
  // actually selected (only fills in layers not already in state, so a
  // slider the player already touched this session isn't clobbered back to
  // its stored value by re-selecting the same mood), and hands the mood
  // switch itself off to the ambient engine — which pauses the previous
  // mood's layers and resumes this one's wherever they were left, so
  // switching moods and back doesn't require re-raising every slider.
  useEffect(() => {
    const groupId = musicState.groupId
    switchAmbientMood(groupId)
    if (!groupId) return
    setAmbientLevels((prev) => {
      let changed = false
      const next = { ...prev }
      for (const layer of ambientLayersFor(groupId)) {
        const key = `${groupId}:${layer.id}`
        if (!(key in next)) {
          next[key] = getStoredAmbientLevel(groupId, layer.id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [musicState.groupId])

  function handleAmbientChange(groupId: string, layerId: string, url: string, level: number): void {
    setAmbientLevels((prev) => ({ ...prev, [`${groupId}:${layerId}`]: level }))
    setStoredAmbientLevel(groupId, layerId, level)
    fadeAmbientLayerLevel(groupId, layerId, url, level)
    broadcastAmbientLayerLevel(groupId, layerId, level, fadeMs, sessionId)
  }

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
    changeVolume(next, sessionId)
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
            // The ambient section pushed this panel's natural height past
            // the window on a shorter screen (it used to just barely fit
            // without it) — capped and scrollable now instead of running
            // off the bottom with no way to reach what's cut off.
            maxHeight: 'calc(100vh - 80px)',
            overflowY: 'auto',
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
            title="On: every connected player hears the same music and ambiance, synced. Off: it only plays from this device — for playing in person around one table."
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

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <IconPopoverSlider
              title="Volume"
              icon={<SpeakerIcon />}
              value={volume}
              min={0}
              max={1}
              step={0.05}
              displayValue={`${Math.round(volume * 100)}%`}
              onChange={handleVolumeChange}
            />
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
            <IconPopoverSlider
              title="Crossfade"
              icon={<CrossfadeIcon />}
              value={fadeMs}
              min={0}
              max={MAX_FADE_MS}
              step={FADE_STEP_MS}
              displayValue={fadeMs === 0 ? 'Cut' : `${(fadeMs / 1000).toFixed(2)}s`}
              onChange={setFadeMs}
            />
          </div>

          {musicState.groupId &&
            (() => {
              const groupId = musicState.groupId
              const layers = ambientLayersFor(groupId)
              if (layers.length === 0) return null
              return (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    paddingTop: 'var(--space-2)',
                    borderTop: '1px solid var(--border-subtle)'
                  }}
                >
                  <span className="gb-label" style={{ margin: 0 }}>
                    Ambient
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 10, rowGap: 6 }}>
                    {layers.map((layer) => {
                      const level = ambientLevels[`${groupId}:${layer.id}`] ?? 0
                      const activeIndex = closestAmbientLevelIndex(level)
                      return (
                        <div key={layer.id} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <span
                            title={layer.label}
                            style={{
                              fontSize: 12,
                              color: 'var(--text-secondary)',
                              flex: 1,
                              minWidth: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {layer.label}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                            {AMBIENT_LEVELS.map((stepLevel, i) => {
                              const filled = i <= activeIndex
                              return (
                                <button
                                  key={i}
                                  type="button"
                                  title={`${Math.round(stepLevel * 100)}%`}
                                  onClick={() => handleAmbientChange(groupId, layer.id, layer.url, stepLevel)}
                                  style={{
                                    width: 8,
                                    height: 6 + i * 3,
                                    padding: 0,
                                    borderRadius: 2,
                                    border: `1px solid ${filled ? 'var(--accent)' : 'var(--border-subtle)'}`,
                                    background: filled ? 'var(--accent)' : 'transparent',
                                    cursor: 'pointer',
                                    transition: 'background 0.15s ease, border-color 0.15s ease'
                                  }}
                                />
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

          <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-muted)' }}>Music by alkakrab</div>
        </div>
      )}
      <ContextMenu state={trackMenu} onClose={() => setTrackMenu(null)} />
    </div>
  )
}

/**
 * A round icon button that opens a small vertical slider above itself —
 * used for Volume and Crossfade, which used to each be a full-width
 * horizontal row taking up space even when nobody needed to touch them.
 * Closes on an outside click, same pattern as the panel itself.
 */
function IconPopoverSlider({
  title,
  icon,
  value,
  min,
  max,
  step,
  displayValue,
  onChange
}: {
  title: string
  icon: ReactNode
  value: number
  min: number
  max: number
  step: number
  displayValue: string
  onChange: (value: number) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <TransportButton title={title} onClick={() => setOpen((o) => !o)}>
        {icon}
      </TransportButton>
      {open && (
        <div
          className="gb-card"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: 'var(--space-2) var(--space-3)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            zIndex: 30
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{displayValue}</span>
          <input
            className="gb-slider gb-slider--vertical"
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        </div>
      )}
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

function SpeakerIcon(): JSX.Element {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1.5 6h2.8l3.7-3v10l-3.7-3H1.5V6Z" fill="currentColor" stroke="none" />
      <path d="M10.5 5.2c1 .8 1 5.8 0 6.6" />
      <path d="M12.5 3.3c2.3 2.3 2.3 7.1 0 9.4" />
    </svg>
  )
}

/** Two overlapping shapes handing off to each other — stands in for "crossfade" the same way a Venn diagram reads as "blend of two things" at a glance. */
function CrossfadeIcon(): JSX.Element {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="6" cy="8" r="4.5" fill="currentColor" opacity="0.55" />
      <circle cx="10" cy="8" r="4.5" fill="currentColor" opacity="0.55" />
    </svg>
  )
}
