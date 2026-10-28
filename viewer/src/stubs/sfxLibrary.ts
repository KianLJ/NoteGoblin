/**
 * Stand-in for src/renderer/src/data/sfxLibrary.ts in the viewer build (see
 * viewer/vite.config.ts) — the real one bundles every soundboard MP3. With
 * no cue ever recognised, a note's `oneshot:` code spans render as plain
 * inline code instead of play buttons.
 */
export function parseOneShotCodeSpan(_text: string): string | null {
  return null
}

export function findSfxCue(_cueId: string): { label: string } | undefined {
  return undefined
}
