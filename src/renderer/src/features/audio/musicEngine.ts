import { MUSIC_LIBRARY, findTrack, type MusicTrack } from '../../data/musicLibrary'
import { getStoredMusicVolume, getStoredMusicBroadcastEnabled } from './soundSettings'
import { getCustomTracks, findCustomTrack, findCustomTrackGroupId } from './customMusicStore'

/**
 * Goblin Bard's playback engine — a module-level singleton (same shape as
 * diceLogStore.ts), not React state, since it has to keep looping/crossfading
 * regardless of which component tree happens to be mounted or which window
 * this is (the DM's own pick, or a player's client reacting to a broadcast).
 * Only ever holds a track id + a live HTMLAudioElement; the actual audio
 * data never leaves this machine — see shared MusicChangedFrame's doc
 * comment for why that's safe to sync over the relay as just an id.
 */

interface MusicState {
  /** The last track picked/skipped to — stays set while paused, so "resume" and the skip buttons still know where they are. */
  trackId: string | null
  groupId: string | null
  playing: boolean
}

let currentAudio: HTMLAudioElement | null = null
let currentTrackId: string | null = null
let currentGroupId: string | null = null
let currentTrackIndex = 0
let playing = false
let fadeTimer: ReturnType<typeof setInterval> | undefined
let listening = false

const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

export function subscribeMusic(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getMusicState(): MusicState {
  return { trackId: currentTrackId, groupId: currentGroupId, playing }
}

function groupIdForTrack(trackId: string): string | null {
  for (const group of MUSIC_LIBRARY) {
    if (group.tracks.some((t) => t.id === trackId)) return group.id
  }
  return findCustomTrackGroupId(trackId)
}

/** Bundled + this DM's own local additions for a mood, in the same order the right-click track picker and skip both use — see MusicButton.tsx. */
function tracksForGroup(groupId: string): MusicTrack[] {
  const group = MUSIC_LIBRARY.find((g) => g.id === groupId)
  return [...(group?.tracks ?? []), ...getCustomTracks(groupId)]
}

/** Fades one element's volume toward `to` and calls `onDone` once it arrives — the building block both crossfadeTo (two elements swapping) and pause/resume (one element, no swap) use. */
function fadeElementVolume(el: HTMLAudioElement, to: number, fadeMs: number, onDone?: () => void): void {
  const from = el.volume
  const stepMs = 50
  const steps = Math.max(1, Math.round(fadeMs / stepMs))
  let step = 0
  const timer = setInterval(() => {
    step++
    const t = Math.min(1, step / steps)
    el.volume = from + (to - from) * t
    if (t >= 1) {
      clearInterval(timer)
      onDone?.()
    }
  }, stepMs)
}

/** Crossfades from whatever's currently playing to a brand-new element for `url` (or to silence, if `url` is null) — used only for an actual track change (a new mood, a skip), never for pause/resume, which keep the same element (and its playback position) alive instead. */
function crossfadeTo(url: string | null, fadeMs: number): void {
  const targetVolume = getStoredMusicVolume()
  const outgoing = currentAudio
  let incoming: HTMLAudioElement | null = null

  if (url) {
    incoming = new Audio(url)
    incoming.loop = true
    incoming.volume = 0
    void incoming.play().catch(() => {
      /* autoplay blocked or similar — not worth surfacing */
    })
  }
  currentAudio = incoming

  if (fadeTimer) clearInterval(fadeTimer)
  const stepMs = 50
  const steps = Math.max(1, Math.round(fadeMs / stepMs))
  let step = 0
  fadeTimer = setInterval(() => {
    step++
    const t = Math.min(1, step / steps)
    if (outgoing) outgoing.volume = Math.max(0, targetVolume * (1 - t))
    if (incoming) incoming.volume = Math.min(targetVolume, targetVolume * t)
    if (t >= 1) {
      clearInterval(fadeTimer)
      if (outgoing) {
        outgoing.pause()
        outgoing.src = ''
      }
    }
  }, stepMs)
}

/** Applies a new volume to whatever's currently playing immediately — separate from the fade above, for when the DM just drags the volume slider mid-track. */
export function applyLiveVolume(volume: number): void {
  if (currentAudio) currentAudio.volume = volume
}

/** Plays a specific track by id from the top — used for an actual track change (pickMood/skip, or an incoming broadcast for a *different* track than whatever's already loaded). Leaves currentGroupId/currentTrackIndex pointing at it so pause/resume/skip all stay consistent regardless of how the track was reached. */
/** Tracks a connected player has received from the DM's own broadcast (see MusicChangedFrame's doc comment) — decoded once into a blob URL and cached here by trackId, never persisted (a fresh session gets a fresh cache; the DM re-sends the data every time regardless, since the relay never stores anything either). */
const receivedCustomTracks = new Map<string, MusicTrack>()

function base64ToBlobUrl(base64: string, mimeType: string): string {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }))
}

function findAnyTrack(trackId: string): MusicTrack | undefined {
  return findTrack(trackId) ?? findCustomTrack(trackId) ?? receivedCustomTracks.get(trackId)
}

function setTrack(trackId: string, fadeMs: number): void {
  const track = findAnyTrack(trackId)
  if (!track) return
  currentTrackId = trackId
  currentGroupId = groupIdForTrack(trackId)
  currentTrackIndex = currentGroupId ? tracksForGroup(currentGroupId).findIndex((t) => t.id === trackId) : 0
  playing = true
  crossfadeTo(track.url, fadeMs)
  notify()
}

/** Fades the current element down and pauses it in place — its playback position is untouched, so resumeCurrent picks up right where this left off rather than restarting the track. Keeps the current selection (trackId/groupId), unlike an actual track change. */
function pauseCurrent(fadeMs: number): void {
  playing = false
  if (fadeTimer) clearInterval(fadeTimer)
  const el = currentAudio
  if (el) fadeElementVolume(el, 0, fadeMs, () => el.pause())
  notify()
}

/** Resumes the current element from wherever it was paused — no new Audio object, so this is a true unpause, not a restart. Falls back to a fresh setTrack only if there's somehow no element to resume (e.g. this client never actually loaded the track before receiving a "resume" broadcast). */
function resumeCurrent(fadeMs: number): void {
  if (!currentTrackId) return
  playing = true
  if (!currentAudio) {
    // This device never actually loaded the track locally (e.g. local
    // playback was off when it was first picked) — nothing to resume from
    // a paused position, so start it fresh instead.
    setTrack(currentTrackId, fadeMs)
    return
  }
  if (fadeTimer) clearInterval(fadeTimer)
  void currentAudio.play().catch(() => {
    /* autoplay blocked or similar — not worth surfacing */
  })
  fadeElementVolume(currentAudio, getStoredMusicVolume(), fadeMs)
  notify()
}

/** Wires the one process-wide "the DM changed the music" listener — idempotent, safe to call from every mount point that might be the first one up (same convention as diceLogStore's ensureDiceLogListening). Every window (DM's own, and every joined player's) should call this once so Goblin Bard actually plays for them. */
export function ensureMusicListening(): void {
  if (listening) return
  listening = true
  window.goblin.music.onChange(({ trackId, fadeMs, customTrack }) => {
    if (trackId && customTrack) {
      receivedCustomTracks.set(trackId, {
        id: trackId,
        title: customTrack.title,
        url: base64ToBlobUrl(customTrack.dataBase64, customTrack.mimeType)
      })
    }
    if (!trackId) {
      pauseCurrent(fadeMs)
    } else if (trackId === currentTrackId) {
      // Same track already loaded — this is a resume, not a new pick, so
      // continue from wherever it was rather than restarting from the top.
      resumeCurrent(fadeMs)
    } else {
      setTrack(trackId, fadeMs)
    }
  })
}

/**
 * The single gate every DM-facing action below goes through before it ever
 * calls `window.goblin.music.broadcast` — centralizing this here (rather
 * than each caller computing its own "should I broadcast?" value) means the
 * "Broadcast to players" toggle in MusicButton.tsx and a scene's linked
 * mood (SessionDeckPanel.tsx) automatically agree with each other, instead
 * of the scene-link needing to duplicate the same logic.
 */
function effectiveSessionId(sessionId: string | null): string | null {
  return getStoredMusicBroadcastEnabled() ? sessionId : null
}

/** DM-only — picks a random track from the mood and plays it locally, then (while hosting, and broadcasting is on) broadcasts that exact track id so every connected player crossfades to the same one. */
export function pickMood(groupId: string, fadeMs: number, sessionId: string | null): void {
  const tracks = tracksForGroup(groupId)
  if (tracks.length === 0) return
  const track = tracks[Math.floor(Math.random() * tracks.length)]
  setTrack(track.id, fadeMs)
  const target = effectiveSessionId(sessionId)
  if (target) void window.goblin.music.broadcast(track.id, fadeMs)
}

/** DM-only — same as pickMood, but for a specific track rather than a random one from its mood (see MusicButton.tsx's right-click track picker). */
export function playSpecificTrack(trackId: string, fadeMs: number, sessionId: string | null): void {
  setTrack(trackId, fadeMs)
  const target = effectiveSessionId(sessionId)
  if (target) void window.goblin.music.broadcast(trackId, fadeMs)
}

/** DM-only — pause fades out and holds position in place; resume fades the same element back in from exactly there, never restarting the track. Both sync to every connected player while hosting and broadcasting. */
export function togglePlayPause(fadeMs: number, sessionId: string | null): void {
  const target = effectiveSessionId(sessionId)
  if (playing) {
    pauseCurrent(fadeMs)
    if (target) void window.goblin.music.broadcast(null, fadeMs)
  } else if (currentTrackId) {
    resumeCurrent(fadeMs)
    if (target) void window.goblin.music.broadcast(currentTrackId, fadeMs)
  }
}

/** DM-only — moves to the previous/next track within the currently selected mood (wrapping around), always resuming playback if it was paused. A no-op if no mood has been picked yet. */
export function skipTrack(direction: -1 | 1, fadeMs: number, sessionId: string | null): void {
  if (!currentGroupId) return
  const tracks = tracksForGroup(currentGroupId)
  if (tracks.length === 0) return
  const nextIndex = (currentTrackIndex + direction + tracks.length) % tracks.length
  const track = tracks[nextIndex]
  setTrack(track.id, fadeMs)
  const target = effectiveSessionId(sessionId)
  if (target) void window.goblin.music.broadcast(track.id, fadeMs)
}
