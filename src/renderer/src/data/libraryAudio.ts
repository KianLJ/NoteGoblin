import manifest from './audioManifest.json'

/**
 * The built-in music, ambience and Sound Board audio, as listed by scripts/audio-manifest.mjs. The app ships
 * this list, not the files: each plays from `library-audio://` — the copy you downloaded if there is one, else
 * streamed from the relay (main/libraryAudio.ts). Ids, titles and order still come from the file paths, exactly
 * as when the files were bundled, so your renames and scene cues keep pointing at the same songs.
 */
export type LibraryFolder = 'music' | 'ambient' | 'soundboard'

export interface LibraryFile {
  /** "music/Tavern&Respite/01 - The Merry Hearth.mp3" */
  path: string
  size: number
}

export const LIBRARY_FILES: LibraryFile[] = manifest.files

// The dev-only browser preview (vite.sheet-preview.config.ts) isn't Electron: it plays the repo's own files.
const IN_ELECTRON = typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')

/** Where a built-in file plays from. */
export function libraryUrl(path: string): string {
  return IN_ELECTRON ? `library-audio://file/${encodeURIComponent(path)}` : `/src/assets/${path.split('/').map(encodeURIComponent).join('/')}`
}

/** Which built-in file a `library-audio://` address is, or null for anything else (your own songs, say). */
export function libraryPathOf(url: string): string | null {
  return url.startsWith('library-audio://file/') ? decodeURIComponent(url.slice('library-audio://file/'.length)) : null
}

/**
 * A folder's files keyed the way `import.meta.glob('../assets/<folder>/**')` keyed them, to their addresses —
 * so the libraries read them exactly as before.
 */
export function libraryFiles(folder: LibraryFolder): Record<string, string> {
  return Object.fromEntries(LIBRARY_FILES.filter((f) => f.path.startsWith(`${folder}/`)).map((f) => [`../assets/${f.path}`, libraryUrl(f.path)]))
}
