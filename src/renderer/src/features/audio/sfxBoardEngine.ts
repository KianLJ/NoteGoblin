import { findSfxCue, pickSfxVariant, findClassFeatureSfxCue } from '../../data/sfxLibrary'
import { getStoredSfxBoardVolume, getStoredSfxBoardBroadcastEnabled } from './soundSettings'

/**
 * Sound Board's playback — deliberately much simpler than musicEngine.ts or
 * ambientEngine.ts: a one-shot cue has no "currently playing" state to track
 * or resume, so this is just a play function plus the broadcast/listen
 * plumbing, the same "everyone already has the file, just sync an id" shape
 * as a Goblin Bard mood pick.
 */

// A cue played back-to-back at the exact same pitch every time reads as an
// obvious loop even with several different variant takes to draw from (see
// pickSfxVariant) — a small random detune per play keeps repeats of the same
// take, or even just the same cue in general, from sounding identical.
// ±6% is deliberately subtle: enough to break the "canned" feel, not enough
// to sound like a pitch-shift effect the way e.g. RollAnimationOverlay's
// crit/fumble stingers deliberately do.
const PITCH_VARIATION = 0.06

function randomPitch(): number {
  return 1 + (Math.random() * 2 - 1) * PITCH_VARIATION
}

/** Plays one cue locally — a fresh Audio element each time (unlike soundEffects.ts's cached-and-cloned UI cues) since Sound Board cues are triggered far less often and never need the cloning trick's low-latency guarantee. Each play gets its own small random pitch variation (see PITCH_VARIATION) — picked independently here, not broadcast, so a synced table hears a slightly different detune from each other too, same as the variant-take pick already does. */
function playLocal(url: string): void {
  const instance = new Audio(url)
  instance.volume = getStoredSfxBoardVolume()
  // Chromium defaults preservesPitch to true, which time-stretches to keep
  // pitch constant as playbackRate changes — the opposite of what a pitch
  // variation needs (see soundEffects.ts's playSfx for the same fix).
  instance.preservesPitch = false
  instance.playbackRate = randomPitch()
  void instance.play().catch(() => {
    /* autoplay blocked or similar — not worth surfacing */
  })
}

/**
 * Plays a cue locally (a random one of its variants — see pickSfxVariant)
 * and, while connected to a session with Sound Board broadcasting on, tells
 * every other connected client to play the same cue id, each independently
 * picking their own random variant. Not DM-only — the toolbar Sound Board
 * itself only ever mounts for the DM, but a note's inline
 * `` `oneshot: ...` `` button and a character sheet ability (see
 * CombatTab.tsx's class-feature buttons) can call this from a player's
 * client too; `window.goblin.sfxBoard.broadcast` (see registerIpc.ts) picks
 * the right path either way — straight to the relay while hosting, or via
 * the DM as a relay hub while joined.
 */
export function playSfxCue(cueId: string, sessionId: string | null): void {
  const cue = findSfxCue(cueId)
  if (!cue) return
  playLocal(pickSfxVariant(cue))
  if (sessionId && getStoredSfxBoardBroadcastEnabled()) void window.goblin.sfxBoard.broadcast(cueId)
}

/** Plays and broadcasts the Class Features cue matching a character sheet ability's display name (see findClassFeatureSfxCue) — a silent no-op if that ability has no cue mapped, or its mapped cue hasn't been curated yet, so it's safe to call from every activate/use button regardless of what's actually in assets/soundboard/ClassFeatures right now. */
export function playAbilitySfx(abilityName: string, sessionId: string | null): void {
  const cue = findClassFeatureSfxCue(abilityName)
  if (cue) playSfxCue(cue.id, sessionId)
}

let listening = false

/** Wires the one process-wide "someone at the table fired a Sound Board cue" listener — idempotent, safe to call from every mount point that might be the first one up (same convention as musicEngine's ensureMusicListening). Every window (DM's own, and every joined player's) should call this once so everyone actually hears it. */
export function ensureSfxBoardListening(): void {
  if (listening) return
  listening = true
  window.goblin.sfxBoard.onPlay((cueId) => {
    const cue = findSfxCue(cueId)
    if (cue) playLocal(pickSfxVariant(cue))
  })
}
