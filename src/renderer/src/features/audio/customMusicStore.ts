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

/** Reads the list again — after syncing with your account added or removed songs (librarySync.ts). */
export async function reloadCustomMusic(): Promise<void> {
  loaded = false
  await ensureCustomMusicLoaded()
}

/** Your own songs, kept as a mood of their own. */
export const YOUR_MUSIC_GROUP = 'custom'
/** Your own sound board sounds — stored with the songs, played as one-shots (see sfxBoardEngine). */
export const YOUR_SOUNDS_GROUP = 'soundboard'

function added(groupId: string, list: { id: string; title: string }[]): number {
  if (list.length === 0) return 0
  const tracks = list.map((a): MusicTrack => ({ id: a.id, title: a.title, url: `custom-music://${a.id}` }))
  tracksByGroup = { ...tracksByGroup, [groupId]: [...(tracksByGroup[groupId] ?? []), ...tracks] }
  notify()
  return tracks.length
}

/** Opens a file picker (several files at once) and adds them to `groupId`; returns how many were added. */
export async function addCustomTrack(groupId: string): Promise<number> {
  return added(groupId, await window.goblin.music.addCustomTrack(groupId))
}

/** Adds audio files dropped onto the app to `groupId`, skipping anything that isn't audio; returns how many were added. */
export async function addCustomFiles(groupId: string, files: FileList | File[]): Promise<number> {
  return added(groupId, await window.goblin.music.addCustomFiles(groupId, [...files]))
}

export async function renameCustomTrack(groupId: string, trackId: string, title: string): Promise<void> {
  const name = title.trim()
  if (!name) return
  await window.goblin.music.renameCustomTrack(groupId, trackId, name)
  tracksByGroup = { ...tracksByGroup, [groupId]: (tracksByGroup[groupId] ?? []).map((t) => (t.id === trackId ? { ...t, title: name } : t)) }
  notify()
}

export async function removeCustomTrack(groupId: string, trackId: string): Promise<void> {
  await window.goblin.music.removeCustomTrack(groupId, trackId)
  tracksByGroup = { ...tracksByGroup, [groupId]: (tracksByGroup[groupId] ?? []).filter((t) => t.id !== trackId) }
  notify()
}
