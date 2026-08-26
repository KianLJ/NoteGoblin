import type { MusicTrack } from '../../data/musicLibrary'

/**
 * A DM's own local additions to a mood — module-level singleton (same shape
 * as musicEngine.ts/diceLogStore.ts), backed by main/customMusic.ts's
 * per-machine JSON config. Kept separate from the bundled MUSIC_LIBRARY
 * (which is computed once at import time from files shipped with the app)
 * since this list only exists once the DM has actually added something, and
 * changes at runtime.
 */

let tracksByGroup: Record<string, MusicTrack[]> = {}
let loaded = false

const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

export function subscribeCustomMusic(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getCustomTracks(groupId: string): MusicTrack[] {
  return tracksByGroup[groupId] ?? []
}

export function findCustomTrack(trackId: string): MusicTrack | undefined {
  for (const tracks of Object.values(tracksByGroup)) {
    const found = tracks.find((t) => t.id === trackId)
    if (found) return found
  }
  return undefined
}

export function findCustomTrackGroupId(trackId: string): string | null {
  for (const [groupId, tracks] of Object.entries(tracksByGroup)) {
    if (tracks.some((t) => t.id === trackId)) return groupId
  }
  return null
}

/** Idempotent, safe to call from every mount that might be the first one up — same convention as musicEngine's ensureMusicListening. */
export async function ensureCustomMusicLoaded(): Promise<void> {
  if (loaded) return
  loaded = true
  const raw = await window.goblin.music.listCustom()
  tracksByGroup = Object.fromEntries(
    Object.entries(raw).map(([groupId, list]) => [
      groupId,
      list.map((t) => ({ id: t.id, title: t.title, url: `custom-music://${t.id}` }))
    ])
  )
  notify()
}

/** Opens a native file picker (see registerIpc.ts's music:add-custom-track) scoped to that mood — a no-op if the DM cancels. */
export async function addCustomTrack(groupId: string): Promise<void> {
  const added = await window.goblin.music.addCustomTrack(groupId)
  if (!added) return
  const track: MusicTrack = { id: added.id, title: added.title, url: `custom-music://${added.id}` }
  tracksByGroup = { ...tracksByGroup, [groupId]: [...(tracksByGroup[groupId] ?? []), track] }
  notify()
}

export async function removeCustomTrack(groupId: string, trackId: string): Promise<void> {
  await window.goblin.music.removeCustomTrack(groupId, trackId)
  tracksByGroup = { ...tracksByGroup, [groupId]: (tracksByGroup[groupId] ?? []).filter((t) => t.id !== trackId) }
  notify()
}
