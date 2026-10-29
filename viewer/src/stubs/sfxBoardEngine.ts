import { getStoredSfxBoardVolume } from '@renderer/features/audio/soundSettings'
import { findSfxCue } from './sfxLibrary'

/**
 * Stand-in for src/renderer/src/features/audio/sfxBoardEngine.ts in the
 * viewer build — the same local playback (a random take, at the Sound Board
 * volume, with the same small pitch variation), minus broadcasting to a
 * session the viewer isn't part of.
 */
const PITCH_VARIATION = 0.06

export function playSfxCue(cueId: string, _sessionId: string | null): void {
  const cue = findSfxCue(cueId)
  if (!cue || cue.urls.length === 0) return
  const instance = new Audio(cue.urls[Math.floor(Math.random() * cue.urls.length)])
  instance.volume = getStoredSfxBoardVolume()
  instance.preservesPitch = false
  instance.playbackRate = 1 + (Math.random() * 2 - 1) * PITCH_VARIATION
  void instance.play().catch(() => undefined)
}
