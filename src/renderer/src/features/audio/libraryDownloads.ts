import { useSyncExternalStore } from 'react'
import { LIBRARY_FILES, libraryPathOf } from '../../data/libraryAudio'

/**
 * Which built-in songs, ambience and sounds are downloaded to this computer (main/libraryAudio.ts), and
 * downloading or removing a set of them — a mood, a Sound Board category, or everything. Anything not
 * downloaded still plays, streamed, while online.
 */
interface Busy {
  paths: Set<string>
  done: number
  total: number
}

let downloaded = new Set<string>()
let busy: Busy | null = null
let loaded = false
const listeners = new Set<() => void>()
let snapshot: { downloaded: Set<string>; busy: Busy | null } = { downloaded, busy }

function notify(): void {
  snapshot = { downloaded, busy }
  for (const l of listeners) l()
}

function ensureLoaded(): void {
  if (loaded || typeof window === 'undefined' || !window.goblin?.library) return
  loaded = true
  void window.goblin.library.downloaded().then((paths) => {
    downloaded = new Set(Array.isArray(paths) ? paths : [])
    notify()
  })
  window.goblin.library.onProgress((p) => {
    downloaded = new Set(downloaded).add(p.path)
    if (busy) busy = { ...busy, done: p.done }
    notify()
  })
}

export function useLibraryDownloads(): { downloaded: Set<string>; busy: Busy | null } {
  ensureLoaded()
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => snapshot
  )
}

/** The library files behind some tracks' or layers' addresses (your own songs have none). */
export function pathsOf(urls: string[]): string[] {
  return [...new Set(urls.map(libraryPathOf).filter((p): p is string => !!p))]
}

/** All of a folder's files ("music", "ambient", "soundboard"). */
export function folderPaths(...folders: string[]): string[] {
  return LIBRARY_FILES.filter((f) => folders.some((folder) => f.path.startsWith(`${folder}/`))).map((f) => f.path)
}

/** How big a set of files is, in MB, rounded for a button. */
export function sizeLabel(paths: string[]): string {
  const sizes = new Map(LIBRARY_FILES.map((f) => [f.path, f.size]))
  const mb = paths.reduce((n, p) => n + (sizes.get(p) ?? 0), 0) / 1024 / 1024
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`
}

/** Downloads whichever of these aren't here yet. Resolves with how many couldn't be. */
export async function downloadLibrary(paths: string[]): Promise<number> {
  const missing = paths.filter((p) => !downloaded.has(p))
  if (missing.length === 0 || busy) return 0
  busy = { paths: new Set(missing), done: 0, total: missing.length }
  notify()
  try {
    const result = await window.goblin.library.download(missing)
    return result.failed.length
  } finally {
    busy = null
    notify()
  }
}

/** Frees the space: they go back to streaming. */
export async function removeLibrary(paths: string[]): Promise<void> {
  await window.goblin.library.remove(paths)
  downloaded = new Set([...downloaded].filter((p) => !paths.includes(p)))
  notify()
}
