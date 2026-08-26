/** localStorage-backed on/off + volume for UI sound effects and Goblin Bard music — same pattern as theme.ts's font settings. */
const ENABLED_KEY = 'gb-sfx-enabled'
const VOLUME_KEY = 'gb-sfx-volume'
const MUSIC_VOLUME_KEY = 'gb-music-volume'
const DEFAULT_MUSIC_VOLUME = 0.4
const MUSIC_BROADCAST_KEY = 'gb-music-broadcast-enabled'

export function getStoredSfxEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== 'false'
  } catch {
    return true
  }
}

export function setSfxEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, String(enabled))
  } catch {
    /* best-effort */
  }
}

export function getStoredSfxVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY)
    const parsed = raw ? Number(raw) : 0.6
    return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 0.6
  } catch {
    return 0.6
  }
}

export function setSfxVolume(volume: number): void {
  try {
    localStorage.setItem(VOLUME_KEY, String(Math.min(1, Math.max(0, volume))))
  } catch {
    /* best-effort */
  }
}

/** Separate volume from sound effects — music plays continuously in the background, so it wants its own level (typically lower) rather than sharing one slider with short one-shot cues. */
export function getStoredMusicVolume(): number {
  try {
    const raw = localStorage.getItem(MUSIC_VOLUME_KEY)
    const parsed = raw ? Number(raw) : DEFAULT_MUSIC_VOLUME
    return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : DEFAULT_MUSIC_VOLUME
  } catch {
    return DEFAULT_MUSIC_VOLUME
  }
}

export function setMusicVolume(volume: number): void {
  try {
    localStorage.setItem(MUSIC_VOLUME_KEY, String(Math.min(1, Math.max(0, volume))))
  } catch {
    /* best-effort */
  }
}

/**
 * DM-only, lives in the Goblin Bard panel itself (not the general Sound
 * settings) — a single switch instead of asking every player to configure
 * their own device. Off (in-person play): the DM's picks/pauses/skips only
 * ever play on the DM's own machine, nothing goes out over the relay. On
 * (remote play): every connected player's client crossfades along with the
 * DM, same as any other broadcast in the app.
 */
export function getStoredMusicBroadcastEnabled(): boolean {
  try {
    return localStorage.getItem(MUSIC_BROADCAST_KEY) !== 'false'
  } catch {
    return true
  }
}

export function setMusicBroadcastEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(MUSIC_BROADCAST_KEY, String(enabled))
  } catch {
    /* best-effort */
  }
}
