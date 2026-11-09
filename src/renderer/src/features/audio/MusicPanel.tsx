import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MUSIC_LIBRARY, findTrack } from '../../data/musicLibrary'
import { ambientLayersFor, isRainLayer, isWindLayer } from '../../data/ambientLibrary'
import { getMusicState, subscribeMusic, pickMood, playSpecificTrack, togglePlayPause, skipTrack, changeVolume, stopPlayersOnly } from './musicEngine'
import { fadeAmbientLayerLevel, switchAmbientMood, broadcastAmbientLayerLevel } from './ambientEngine'
import { getStoredMusicVolume, setMusicVolume, getStoredMusicBroadcastEnabled, setMusicBroadcastEnabled, getStoredAmbientLevel, setStoredAmbientLevel } from './soundSettings'
import {
  ensureCustomMusicLoaded,
  subscribeCustomMusic,
  getCustomTracks,
  findCustomTrack,
  addCustomTrack,
  addCustomFiles,
  removeCustomTrack,
  renameCustomTrack,
  YOUR_MUSIC_GROUP
} from './customMusicStore'
import { ContextMenu, type ContextMenuState } from '../../ui/ContextMenu'
import { useAudioDrop } from './useAudioDrop'
import { audioName, isRenamed, setAudioName, subscribeAudioNames } from './audioNames'
import { audioGroups, createAudioGroup, deleteAudioGroup, renameAudioGroup, subscribeAudioGroups } from './audioGroups'
import './audio.css'
import { useCalendar } from '../campaigns/useCalendar'
import { weatherForDate, type RainLevel } from '@shared/calendar'

interface MusicPanelProps {
  /** The DM's hosted session id — null while not hosting, in which case picking a mood always plays locally-only regardless of the broadcast toggle below (nobody's connected to receive it anyway). */
  sessionId: string | null
  /** The DM's active campaign, if any — read only to check that campaign's calendar for today's weather (see the calendar-driven ambience effect below). Null skips that entirely, same as a campaign with no calendar configured. */
  campaignId?: string | null
}

// Rain's level scales with how hard it's actually coming down — mirrors the
// same 0/25/50/75/100 steps the level buttons use, just picked by weather
// instead of a click. Any rain at all counts (rain is already gated by the
// climate's own rainChance, so a rolled rain day is worth reflecting), heavy
// rain gets the full mix.
const AUTO_RAIN_LEVEL: Record<RainLevel, number> = {
  none: 0,
  light: 0.25,
  moderate: 0.5,
  heavy: 1
}

// Wind has no built-in gate the way rain's rainChance provides — it's a
// continuous mph value, so it needs its own real floor before it's worth
// reflecting at all, then scales up from there: 25% at the floor, +25% for
// every 5 mph above it, capping at 100%.
const AUTO_WIND_MPH_FLOOR = 10
const AUTO_WIND_MPH_STEP = 5

function autoWindLevel(windMph: number): number {
  if (windMph < AUTO_WIND_MPH_FLOOR) return 0
  const tier = Math.floor((windMph - AUTO_WIND_MPH_FLOOR) / AUTO_WIND_MPH_STEP)
  return Math.min(1, 0.25 + tier * 0.25)
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

/** DM-only — Goblin Bard: what's playing, the moods, each mood's songs (your own added by button or by dropping files), and its ambience. Picking a mood plays a random track from it on loop and (while hosting) broadcasts that exact track to every connected player; picking a different mood, or skipping within one, crossfades. */
export function MusicPanel({ sessionId, campaignId = null }: MusicPanelProps): JSX.Element {
  const [musicState, setMusicState] = useState(() => getMusicState())
  const [fadeMs, setFadeMs] = useState(DEFAULT_FADE_MS)
  const [volume, setVolume] = useState(() => getStoredMusicVolume())
  const [broadcastEnabled, setBroadcastEnabledState] = useState(() => getStoredMusicBroadcastEnabled())
  // Which mood's songs are listed: the one you last picked, or the one playing.
  const [viewGroup, setViewGroup] = useState<string | null>(null)
  const [dropGroup, setDropGroup] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [, setCustomTick] = useState(0)
  // Placeholder ambient-SFX slider levels (see ambientLibrary.ts) — keyed by
  // "groupId:ambientId" since e.g. "wind" means something different (and
  // keeps its own level) under Desert vs. under Dungeon & Dread. Loaded
  // lazily per option the first time its mood is actually shown, rather
  // than eagerly for every mood in the library up front.
  const [ambientLevels, setAmbientLevels] = useState<Record<string, number>>({})
  // Every ambient layer key ("groupId:layerId") this session's weather
  // effect has itself raised and hasn't been manually overridden since —
  // see that effect's own doc comment for why tracking this (rather than
  // just "is the layer currently above 0") is what lets it raise and lower
  // a layer symmetrically without ever fighting the DM's own manual choice.
  const autoAppliedLayersRef = useRef<Set<string>>(new Set())
  const { calendar } = useCalendar(sessionId ?? undefined, campaignId)

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
  useEffect(() => subscribeAudioNames(() => setCustomTick((t) => t + 1)), [])
  useEffect(() => subscribeAudioGroups(() => setCustomTick((t) => t + 1)), [])
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

  function applyAmbientLevel(groupId: string, layerId: string, url: string, level: number): void {
    setAmbientLevels((prev) => ({ ...prev, [`${groupId}:${layerId}`]: level }))
    setStoredAmbientLevel(groupId, layerId, level)
    fadeAmbientLayerLevel(groupId, layerId, url, level)
    broadcastAmbientLayerLevel(groupId, layerId, level, fadeMs, sessionId)
  }

  /** The player-driven path (the level-button row below) — unlike the weather effect's own applyAmbientLevel calls, a manual change always forgets this layer was ever auto-set (see autoAppliedLayersRef), so it's treated as the DM's own deliberate pick from now on and the weather effect never touches it again, in either direction, until a mood switch clears the slate. */
  function handleAmbientChange(groupId: string, layerId: string, url: string, level: number): void {
    autoAppliedLayersRef.current.delete(`${groupId}:${layerId}`)
    applyAmbientLevel(groupId, layerId, url, level)
  }

  // Matches the active campaign's own weather for today against whatever
  // mood is currently selected — if that mood happens to offer a Rain/Wind
  // layer, sets its level to match the weather's own intensity (see
  // AUTO_RAIN_LEVEL/autoWindLevel above), raising it, adjusting it as the
  // weather changes day to day, and lowering it back to 0 once the weather
  // no longer calls for it at all. Deliberately does nothing unless a mood
  // is already selected AND playing (per the feature request this was built
  // for) — this never picks a mood on its own or turns anything on while
  // Goblin Bard is silent, it only nudges an already-running ambience mix.
  //
  // autoAppliedLayersRef (not just "is this layer currently at 0") is what
  // makes raising, adjusting, and lowering all safe without ever fighting a
  // manual choice: it's the set of layer keys this effect itself is
  // currently responsible for. A layer only starts being auto-managed if it
  // isn't already in that set and isn't already above 0 (so it never
  // overwrites a level the DM picked by hand); once it IS in the set, this
  // effect freely adjusts or clears it as the weather changes, since it
  // knows that level is its own doing — until handleAmbientChange removes
  // it from the set (any manual touch), after which this effect leaves it
  // alone in both directions.
  useEffect(() => {
    if (!musicState.groupId) return
    const groupId = musicState.groupId
    const layers = ambientLayersFor(groupId)

    const weather = musicState.playing && calendar ? weatherForDate(calendar.config, calendar.config.currentDate, calendar.config.selectedLocationId) : null
    const rainLevel = weather ? AUTO_RAIN_LEVEL[weather.rain] : 0
    const windLevel = weather ? autoWindLevel(weather.windMph) : 0

    for (const layer of layers) {
      const key = `${groupId}:${layer.id}`
      const targetLevel = isRainLayer(layer) ? rainLevel : isWindLayer(layer) ? windLevel : null
      if (targetLevel === null) continue // not a layer this effect has any opinion about
      const isAutoApplied = autoAppliedLayersRef.current.has(key)

      if (targetLevel > 0) {
        if (!isAutoApplied) {
          const currentLevel = ambientLevels[key] ?? getStoredAmbientLevel(groupId, layer.id)
          if (currentLevel > 0) continue // already something else's choice — don't take it over
          autoAppliedLayersRef.current.add(key)
          applyAmbientLevel(groupId, layer.id, layer.url, targetLevel)
        } else if ((ambientLevels[key] ?? getStoredAmbientLevel(groupId, layer.id)) !== targetLevel) {
          applyAmbientLevel(groupId, layer.id, layer.url, targetLevel)
        }
      } else if (isAutoApplied) {
        autoAppliedLayersRef.current.delete(key)
        applyAmbientLevel(groupId, layer.id, layer.url, 0)
      }
    }
    // ambientLevels/applyAmbientLevel deliberately excluded — this should
    // only ever re-evaluate when the mood, playback state, or the
    // calendar's weather actually changes, not on every ambientLevels
    // update this same effect's own applyAmbientLevel calls trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicState.playing, musicState.groupId, calendar])

  function handleVolumeChange(next: number): void {
    setVolume(next)
    setMusicVolume(next)
    changeVolume(next, sessionId)
  }

  const moods: { id: string; label: string; tracks: { id: string; title: string; url: string }[]; own?: boolean }[] = [
    ...MUSIC_LIBRARY,
    { id: YOUR_MUSIC_GROUP, label: 'Your music', tracks: [] },
    ...audioGroups('mood').map((g) => ({ id: g.id, label: g.label, tracks: [], own: true }))
  ]

  function flash(message: string): void {
    setToast(message)
    setTimeout(() => setToast((t) => (t === message ? null : t)), 3000)
  }
  // A save that fails (the app not restarted since an update, a file gone) says so instead of quietly doing nothing.
  const failed =
    (what: string) =>
    (e: unknown): void =>
      flash(`Couldn't ${what}: ${e instanceof Error ? e.message : String(e)}`)

  function newMood(): void {
    const group = createAudioGroup('mood', 'New mood')
    setViewGroup(group.id)
    setRenaming(group.id)
  }

  async function deleteMood(id: string): Promise<void> {
    try {
      for (const t of getCustomTracks(id)) await removeCustomTrack(id, t.id)
      deleteAudioGroup('mood', id)
      if (viewGroup === id) setViewGroup(null)
    } catch (e) {
      failed('delete it')(e)
    }
  }
  const nowPlaying = musicState.groupId ? moods.find((g) => g.id === musicState.groupId) : null
  const nowPlayingTrack = musicState.trackId ? (findTrack(musicState.trackId) ?? findCustomTrack(musicState.trackId)) : null
  const shownGroup = moods.find((g) => g.id === (viewGroup ?? musicState.groupId)) ?? null
  const shownTracks = shownGroup
    ? [...shownGroup.tracks.map((t) => ({ ...t, title: audioName(t.id, t.title), mine: false })), ...getCustomTracks(shownGroup.id).map((t) => ({ ...t, mine: true }))]
    : []

  async function addSongs(groupId: string, files?: File[]): Promise<void> {
    let n: number
    try {
      n = files ? await addCustomFiles(groupId, files) : await addCustomTrack(groupId)
    } catch (e) {
      failed('add those')(e)
      return
    }
    const label = moods.find((g) => g.id === groupId)?.label ?? 'Your music'
    if (files && n === 0) flash("Those weren't audio files (mp3, wav, ogg, m4a or flac)")
    else if (n > 0) flash(`Added ${n} ${n === 1 ? 'song' : 'songs'} to ${label}`)
    else return
    setViewGroup(groupId)
  }

  const moodUnder = (el: EventTarget): string | null => (el as HTMLElement).closest<HTMLElement>('[data-mood]')?.dataset.mood ?? null
  const drop = useAudioDrop((files, target) => {
    void addSongs(moodUnder(target) ?? shownGroup?.id ?? YOUR_MUSIC_GROUP, files)
    setDropGroup(null)
  })
  const dropTarget = moods.find((g) => g.id === (dropGroup ?? shownGroup?.id ?? YOUR_MUSIC_GROUP))

  return (
    <div
      className="ab-panel"
      {...drop.handlers}
      onDragOver={(e) => {
        drop.handlers.onDragOver(e)
        // Over a mood: the files go there.
        const over = moodUnder(e.target)
        if (e.dataTransfer.types.includes('Files') && over !== dropGroup) setDropGroup(over)
      }}
    >
      <div className={`ab-now${musicState.playing ? ' ab-now--playing' : ''}`}>
        <div className="ab-now-top">
          <div className="ab-now-art" aria-hidden="true">
            <span className="ab-eq-bar" />
            <span className="ab-eq-bar" />
            <span className="ab-eq-bar" />
            <span className="ab-eq-bar" />
          </div>
          <div className="ab-now-text">
            <div className="ab-now-title">{nowPlayingTrack ? audioName(nowPlayingTrack.id, nowPlayingTrack.title) : 'Nothing playing'}</div>
            <div className="ab-now-sub">{nowPlaying ? `${nowPlaying.label}${musicState.playing ? '' : ' · paused'}` : 'Pick a mood below to start'}</div>
          </div>
        </div>
        <div className="ab-transport">
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
          <button type="button" className="ab-round" title="Previous song" disabled={!musicState.groupId} onClick={() => skipTrack(-1, fadeMs, sessionId)}>
            <SkipIcon direction="prev" />
          </button>
          <button
            type="button"
            className="ab-round ab-round--big"
            title={musicState.playing ? 'Pause' : 'Play'}
            disabled={!musicState.trackId}
            onClick={() => togglePlayPause(fadeMs, sessionId)}
          >
            {musicState.playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button type="button" className="ab-round" title="Next song" disabled={!musicState.groupId} onClick={() => skipTrack(1, fadeMs, sessionId)}>
            <SkipIcon direction="next" />
          </button>
          <IconPopoverSlider
            title="Crossfade between songs"
            icon={<CrossfadeIcon />}
            value={fadeMs}
            min={0}
            max={MAX_FADE_MS}
            step={FADE_STEP_MS}
            displayValue={fadeMs === 0 ? 'Cut' : `${(fadeMs / 1000).toFixed(2)}s fade`}
            onChange={setFadeMs}
          />
        </div>
      </div>

      <label className="ab-switch" title="On: everyone in your session hears the music and ambience with you. Off: it only plays here, for a table in one room.">
        <input type="checkbox" checked={broadcastEnabled} onChange={(e) => chooseBroadcastEnabled(e.target.checked)} />
        <span className="ab-switch-track" />
        Players hear the music
      </label>

      <div className="ab-section">
        <div className="ab-section-head">
          <span>Moods</span>
        </div>
        <div className="ab-moods">
          {moods.map((group) => {
            const count = group.tracks.length + getCustomTracks(group.id).length
            const isEmpty = count === 0
            if (renaming === group.id)
              return (
                <RenameField
                  key={group.id}
                  value={group.label}
                  className="ab-mood-rename"
                  onDone={(label) => {
                    setRenaming(null)
                    if (label) renameAudioGroup('mood', group.id, label)
                  }}
                />
              )
            return (
              <button
                onContextMenu={(e) => {
                  if (!group.own) return
                  e.preventDefault()
                  setMenu({
                    x: e.clientX,
                    y: e.clientY,
                    items: [
                      { label: 'Rename', onSelect: () => setRenaming(group.id) },
                      { label: 'Delete mood and its songs', danger: true, onSelect: () => void deleteMood(group.id) }
                    ]
                  })
                }}
                key={group.id}
                type="button"
                data-mood={group.id}
                className={[
                  'ab-mood',
                  musicState.groupId === group.id && 'ab-mood--on',
                  isEmpty && 'ab-mood--empty',
                  drop.dragging && dropTarget?.id === group.id && 'ab-mood--drop'
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  setViewGroup(group.id)
                  if (isEmpty) void addSongs(group.id)
                  else pickMood(group.id, fadeMs, sessionId)
                }}
                title={isEmpty ? `Add songs to ${group.label}` : `Play ${group.label}`}
              >
                <span className="ab-mood-name">{group.label}</span>
                <span className="ab-mood-count">{isEmpty ? 'Add songs' : `${count} ${count === 1 ? 'song' : 'songs'}`}</span>
              </button>
            )
          })}
          <button type="button" className="ab-mood ab-mood--empty ab-mood--new" onClick={newMood} title="Make a mood of your own">
            <span className="ab-mood-name">
              <PlusSmallIcon /> New mood
            </span>
          </button>
        </div>
      </div>

      {shownGroup && (
        <div className="ab-section">
          <div className="ab-section-head">
            <span>{shownGroup.label}</span>
          </div>
          {shownTracks.length > 0 && (
            <div className="ab-tracks">
              {shownTracks.map((track) => (
                <div
                  key={track.id}
                  className={`ab-track${musicState.trackId === track.id ? ' ab-track--on' : ''}`}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setMenu({
                      x: e.clientX,
                      y: e.clientY,
                      items: [
                        { label: 'Rename', onSelect: () => setRenaming(track.id) },
                        ...(track.mine
                          ? [{ label: 'Remove', danger: true, onSelect: () => void removeCustomTrack(shownGroup.id, track.id).catch(failed('remove it')) }]
                          : isRenamed(track.id)
                            ? [{ label: 'Use its original name', onSelect: () => setAudioName(track.id, null) }]
                            : [])
                      ]
                    })
                  }}
                >
                  {renaming === track.id ? (
                    <RenameField
                      value={track.title}
                      onDone={(title) => {
                        setRenaming(null)
                        if (!title) return
                        if (track.mine) void renameCustomTrack(shownGroup.id, track.id, title).catch(failed('rename it'))
                        else setAudioName(track.id, title)
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="ab-track-play"
                      onClick={() => playSpecificTrack(track.id, fadeMs, sessionId)}
                      title={`Play ${track.title} (right-click to rename)`}
                    >
                      <PlayIcon size={11} />
                      <span>{track.title}</span>
                    </button>
                  )}
                  {track.mine && <span className="ab-mine">Yours</span>}
                  {track.mine && (
                    <button
                      type="button"
                      className="ab-x"
                      onClick={() => void removeCustomTrack(shownGroup.id, track.id).catch(failed('remove it'))}
                      title={`Remove ${track.title}`}
                      aria-label={`Remove ${track.title}`}
                    >
                      <XSmallIcon />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <button type="button" className="ab-add" onClick={() => void addSongs(shownGroup.id)}>
            <PlusSmallIcon />
            Add your own songs to {shownGroup.label}
          </button>
          <span className="ab-hint">Or drop audio files anywhere here. Players hear your songs too.</span>
        </div>
      )}

      {musicState.groupId && ambientLayersFor(musicState.groupId).length > 0 && (
        <div className="ab-section">
          <div className="ab-section-head">
            <span>Ambience</span>
          </div>
          <div className="ab-layers">
            {ambientLayersFor(musicState.groupId).map((layer) => {
              const groupId = musicState.groupId!
              const activeIndex = closestAmbientLevelIndex(ambientLevels[`${groupId}:${layer.id}`] ?? 0)
              return (
                <div key={layer.id} className="ab-layer">
                  <span title={layer.label}>{layer.label}</span>
                  <div className="ab-levels">
                    {AMBIENT_LEVELS.map((stepLevel, i) => (
                      <button
                        key={i}
                        type="button"
                        title={`${layer.label}: ${stepLevel === 0 ? 'off' : `${Math.round(stepLevel * 100)}%`}`}
                        onClick={() => handleAmbientChange(groupId, layer.id, layer.url, stepLevel)}
                      >
                        <i className={i > 0 && i <= activeIndex ? 'ab-on' : undefined} style={{ height: 5 + i * 3 }} />
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="ab-hint" style={{ textAlign: 'center' }}>
        Music by alkakrab
      </div>

      {drop.dragging && <div className="ab-drop">Drop to add to {dropTarget?.label ?? 'Your music'}</div>}
      {toast && (
        <div className="ab-toast" role="status">
          {toast}
        </div>
      )}
      <ContextMenu state={menu} onClose={() => setMenu(null)} />
    </div>
  )
}

/** A name edited in place: Enter or clicking away keeps it, Escape leaves it as it was (`onDone(null)`). */
export function RenameField({ value, onDone, className }: { value: string; onDone: (title: string | null) => void; className?: string }): JSX.Element {
  const [draft, setDraft] = useState(value)
  const done = useRef(false)
  const finish = (title: string | null): void => {
    if (done.current) return
    done.current = true
    const name = title?.trim()
    onDone(name && name !== value ? name : null)
  }
  return (
    <input
      className={`gb-input ab-rename${className ? ` ${className}` : ''}`}
      value={draft}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => finish(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(draft)
        if (e.key === 'Escape') finish(null)
      }}
      aria-label="New name"
    />
  )
}

/** A round button that opens a small vertical slider above itself (volume, crossfade). Closes on a click elsewhere. */
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
      <button type="button" className="ab-round" title={title} onClick={() => setOpen((o) => !o)}>
        {icon}
      </button>
      {open && (
        <div className="gb-card ab-slider-pop">
          <span>{displayValue}</span>
          <input
            className="gb-slider gb-slider--vertical"
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-label={title}
          />
        </div>
      )}
    </div>
  )
}

function PlayIcon({ size = 17 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M3 1.5v9l7-4.5-7-4.5Z" />
    </svg>
  )
}

function PauseIcon(): JSX.Element {
  return (
    <svg width="17" height="17" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <rect x="2.5" y="1.5" width="2.5" height="9" rx="0.6" />
      <rect x="7" y="1.5" width="2.5" height="9" rx="0.6" />
    </svg>
  )
}

function SkipIcon({ direction }: { direction: 'prev' | 'next' }): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" style={{ transform: direction === 'prev' ? 'scaleX(-1)' : undefined }}>
      <path d="M1.5 1.5v9l6-4.5-6-4.5Z" />
      <rect x="8.2" y="1.5" width="1.8" height="9" rx="0.5" />
    </svg>
  )
}

function SpeakerIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1.5 6h2.8l3.7-3v10l-3.7-3H1.5V6Z" fill="currentColor" stroke="none" />
      <path d="M10.5 5.2c1 .8 1 5.8 0 6.6" />
      <path d="M12.5 3.3c2.3 2.3 2.3 7.1 0 9.4" />
    </svg>
  )
}

/** Two overlapping circles: one song blending into the next. */
function CrossfadeIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="6" cy="8" r="4.5" fill="currentColor" opacity="0.55" />
      <circle cx="10" cy="8" r="4.5" fill="currentColor" opacity="0.55" />
    </svg>
  )
}

export function PlusSmallIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M6 2v8M2 6h8" />
    </svg>
  )
}

export function XSmallIcon(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M3 3l6 6M9 3l-6 6" />
    </svg>
  )
}
