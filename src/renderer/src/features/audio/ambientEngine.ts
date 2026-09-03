import { getStoredAmbientLevel, setStoredAmbientLevel, getStoredMusicBroadcastEnabled } from './soundSettings'
import { ambientLayersFor, findAmbientLayer } from '../../data/ambientLibrary'

/**
 * A tiny local-only mixer for the Goblin Bard panel's Ambient layers — one
 * looping HTMLAudioElement per layer, volume set straight from that layer's
 * own slider. Deliberately much simpler than musicEngine.ts: no
 * crossfading between moods (layers just fade in/out on their own slider,
 * one at a time, which is already smooth enough for a background loop) and
 * no session broadcast (this is a per-listener mix, not something that
 * needs to be identical for everyone at the table the way the actual music
 * track does).
 */

const elements = new Map<string, HTMLAudioElement>()
// One fade-in-progress per element at most — the same reasoning as
// musicEngine.ts's own activeFades map: picking a new level while an
// earlier fade toward a different level is still running needs to replace
// that fade's target, not fight it for control of `.volume` every tick.
const activeFades = new Map<HTMLAudioElement, ReturnType<typeof setInterval>>()
// Which layer keys belong to the currently-selected mood — everything else
// gets paused on a mood switch, even though its element (and last volume)
// stays cached in case that mood gets picked again later.
let activeGroupId: string | null = null

function keyFor(groupId: string, layerId: string): string {
  return `${groupId}:${layerId}`
}

function elementFor(url: string, key: string): HTMLAudioElement {
  let el = elements.get(key)
  if (!el) {
    el = new Audio(url)
    el.loop = true
    elements.set(key, el)
  }
  return el
}

/** Ramps one element's volume toward `to` over `fadeMs`, same step-interval approach as musicEngine.ts's fadeElementVolume. */
function fadeElementVolume(el: HTMLAudioElement, to: number, fadeMs: number, onDone?: () => void): void {
  const existing = activeFades.get(el)
  if (existing) clearInterval(existing)
  const from = el.volume
  const stepMs = 40
  const steps = Math.max(1, Math.round(fadeMs / stepMs))
  let step = 0
  const timer = setInterval(() => {
    step++
    const t = Math.min(1, step / steps)
    el.volume = from + (to - from) * t
    if (t >= 1) {
      clearInterval(timer)
      activeFades.delete(el)
      onDone?.()
    }
  }, stepMs)
  activeFades.set(el, timer)
}

/** Sets one layer's volume (0-1) immediately and starts/stops its loop to match — used to silently restore a mood's layers to their stored levels on a mood switch (see switchAmbientMood), where a fade would be redundant since nothing was audible a moment ago anyway. For a player-driven level change, see fadeAmbientLayerLevel instead. */
export function setAmbientLayerLevel(groupId: string, layerId: string, url: string, level: number): void {
  const key = keyFor(groupId, layerId)
  const el = elementFor(url, key)
  el.volume = Math.min(1, Math.max(0, level))
  if (level > 0) {
    if (el.paused) void el.play().catch(() => {})
  } else {
    el.pause()
  }
}

// A stray level snap read as jarring on a loop that's already playing —
// the five level buttons crossfade to their target over this long instead.
const LEVEL_FADE_MS = 450

/** Smoothly crossfades one layer to a new level (see the five level buttons in MusicButton.tsx) instead of snapping straight to it — starts the loop first at silence if it wasn't already playing, so a 0→X change fades in cleanly instead of starting at full volume for one tick. `fadeMs` defaults to this device's own LEVEL_FADE_MS; a received broadcast passes the DM's own crossfade setting instead, so a player's ambiance settles in step with whatever music crossfade the DM picked. */
export function fadeAmbientLayerLevel(groupId: string, layerId: string, url: string, level: number, fadeMs: number = LEVEL_FADE_MS): void {
  const key = keyFor(groupId, layerId)
  const el = elementFor(url, key)
  const target = Math.min(1, Math.max(0, level))
  if (target > 0 && el.paused) {
    el.volume = 0
    void el.play().catch(() => {})
  }
  fadeElementVolume(el, target, fadeMs, () => {
    if (target === 0) el.pause()
  })
}

/**
 * Call when the selected mood changes: pauses every layer belonging to the
 * *previous* mood (their elements and volumes stay cached, just silent),
 * then starts whichever of the new mood's layers already have a stored
 * level above 0 — so switching moods and back doesn't require re-raising
 * every slider by hand.
 */
export function switchAmbientMood(groupId: string | null): void {
  if (activeGroupId && activeGroupId !== groupId) {
    const prefix = `${activeGroupId}:`
    for (const [key, el] of elements) {
      if (key.startsWith(prefix)) el.pause()
    }
  }
  activeGroupId = groupId
  if (!groupId) return
  for (const layer of ambientLayersFor(groupId)) {
    const level = getStoredAmbientLevel(groupId, layer.id)
    if (level > 0) setAmbientLayerLevel(groupId, layer.id, layer.url, level)
  }
}

/** Pauses every ambient layer regardless of mood — e.g. if the panel/feature is ever given an "all off" control. Not currently wired to anything. */
export function stopAllAmbient(): void {
  for (const el of elements.values()) el.pause()
  activeGroupId = null
}

/** DM-only — applies a layer's new level locally and, while hosting with broadcasting on, syncs it to every connected player too (see MusicButton.tsx's level buttons). Shares the same "Broadcast to players" toggle as music, since ambient lives in the same Goblin Bard panel. */
export function broadcastAmbientLayerLevel(groupId: string, layerId: string, level: number, fadeMs: number, sessionId: string | null): void {
  if (sessionId && getStoredMusicBroadcastEnabled()) void window.goblin.ambient.broadcast(groupId, layerId, level, fadeMs)
}

let listening = false

/**
 * Wires the one process-wide "the DM changed an Ambient layer" listener —
 * idempotent, safe to call from every mount point that might be the first
 * one up (same convention as musicEngine's ensureMusicListening). Every
 * window (DM's own, and every joined player's) should call this once so a
 * connected player actually hears the DM's ambiance, not just their music —
 * this closes that gap.
 */
export function ensureAmbientListening(): void {
  if (listening) return
  listening = true
  window.goblin.ambient.onChange(({ groupId, layerId, level, fadeMs }) => {
    const layer = findAmbientLayer(layerId)
    if (!layer) return
    setStoredAmbientLevel(groupId, layerId, level)
    fadeAmbientLayerLevel(groupId, layerId, layer.url, level, fadeMs)
  })
}
