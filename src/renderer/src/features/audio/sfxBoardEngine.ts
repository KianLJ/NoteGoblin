import { findSfxCue, pickSfxVariant } from '../../data/sfxLibrary'
import { getStoredSfxBoardVolume, getStoredSfxBoardBroadcastEnabled } from './soundSettings'

/**
 * Sound Board's playback — deliberately much simpler than musicEngine.ts or
 * ambientEngine.ts: a one-shot cue has no "currently playing" state to track
 * or resume, so this is just a play function plus the broadcast/listen
 * plumbing, the same "everyone already has the file, just sync an id" shape
 * as a Goblin Bard mood pick.
 */

/** Plays one cue locally — a fresh Audio element each time (unlike soundEffects.ts's cached-and-cloned UI cues) since Sound Board cues are triggered far less often and never need the cloning trick's low-latency guarantee. */
function playLocal(url: string): void {
  const instance = new Audio(url)
  instance.volume = getStoredSfxBoardVolume()
  void instance.play().catch(() => {
    /* autoplay blocked or similar — not worth surfacing */
  })
}

/** DM-only — plays a cue locally (a random one of its variants — see pickSfxVariant) and, while hosting with Sound Board broadcasting on, tells every connected player to play the same cue id, each independently picking their own random variant. */
export function playSfxCue(cueId: string, sessionId: string | null): void {
  const cue = findSfxCue(cueId)
  if (!cue) return
  playLocal(pickSfxVariant(cue))
  if (sessionId && getStoredSfxBoardBroadcastEnabled()) void window.goblin.sfxBoard.broadcast(cueId)
}

let listening = false

/** Wires the one process-wide "the DM fired a Sound Board cue" listener — idempotent, safe to call from every mount point that might be the first one up (same convention as musicEngine's ensureMusicListening). Every window (DM's own, and every joined player's) should call this once so a connected player actually hears the DM's one-shots. */
export function ensureSfxBoardListening(): void {
  if (listening) return
  listening = true
  window.goblin.sfxBoard.onPlay((cueId) => {
    const cue = findSfxCue(cueId)
    if (cue) playLocal(pickSfxVariant(cue))
  })
}
