/**
 * Stand-in for src/renderer/src/data/sfxLibrary.ts in the viewer build (see
 * viewer/vite.config.ts) — the real one bundles every soundboard MP3. Only
 * the two cues the roll popup itself reaches for are kept (a natural 20 or
 * 1 on an attack, see RollAnimationOverlay.tsx); with no `oneshot:` cue ever
 * recognised, a note's cue buttons render as plain inline code instead.
 */

export interface SfxCue {
  id: string
  label: string
  urls: string[]
}

const files = import.meta.glob<string>(
  ['../../../src/renderer/src/assets/soundboard/Creatures/Critical Hit/*.mp3', '../../../src/renderer/src/assets/soundboard/Creatures/Miss Whiff/*.mp3'],
  { eager: true, query: '?url', import: 'default' }
)

function cue(label: string): SfxCue {
  const urls = Object.entries(files)
    .filter(([path]) => path.includes(`/${label}/`))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([, url]) => url)
  return { id: `viewer-${label}`, label, urls }
}

const CUES = [cue('Critical Hit'), cue('Miss Whiff')]

export function findSfxCueByLabel(categoryId: string, label: string): SfxCue | undefined {
  return categoryId === 'Creatures' ? CUES.find((c) => c.label === label && c.urls.length > 0) : undefined
}

export function findSfxCue(cueId: string): SfxCue | undefined {
  return CUES.find((c) => c.id === cueId)
}

export function parseOneShotCodeSpan(_text: string): string | null {
  return null
}
