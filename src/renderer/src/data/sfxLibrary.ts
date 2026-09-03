/**
 * One-shot Sound Board cues for the DM's toolbar (see SoundBoardButton.tsx)
 * — magic, weapon, creature, and turn-flow stingers, discovered from
 * src/renderer/src/assets/soundboard/** the same way musicLibrary.ts and
 * ambientLibrary.ts discover their own bundled files. Drop an MP3 into one
 * of the category folders below and it shows up in its menu section
 * automatically — no code change needed. Category ids/labels/order mirror
 * the "Pocket Foley" curation checklist's eight sides, so whatever gets
 * sourced against that list slots straight into the matching section here.
 */
export interface SfxCue {
  /** Unique across the whole library — "<categoryId>-<n>". */
  id: string
  /** Shown on the cue's button — the cue's own subfolder name, not the category's or any one variant's file name. */
  label: string
  /**
   * One or more alternate takes of the same cue (see the doc comment above)
   * — a plain flat file directly in a category folder is just a
   * single-variant cue. `pickSfxVariant` below is how a play picks one.
   */
  urls: string[]
}

export interface SfxCategory {
  id: string
  label: string
  cues: SfxCue[]
}

const files = import.meta.glob<string>('../assets/soundboard/**/*.mp3', { eager: true, query: '?url', import: 'default' })

/**
 * Each cue is curated as its own subfolder of alternate takes of the same
 * sound — e.g. assets/soundboard/WeaponImpacts/Sword Clang Parry/*.mp3 holds
 * several different sword-on-sword recordings — so a repeated cue (a fight
 * with a dozen sword clangs) doesn't sound identical every time; see
 * pickSfxVariant. A flat *.mp3 dropped directly in a category folder (no
 * subfolder) still works as a plain single-variant cue, named from its own
 * filename same as musicLibrary.ts's convention.
 */
interface RawEntry {
  category: string
  /** The cue's display name — its subfolder name, or (for a flat file) the filename itself. */
  cueName: string
  fileName: string
  url: string
}

const raw: RawEntry[] = Object.entries(files)
  .map(([path, url]) => {
    const relPath = path.slice(path.indexOf('assets/soundboard/') + 'assets/soundboard/'.length)
    const parts = relPath.split('/')
    const category = parts[0]
    const fileName = parts[parts.length - 1]
    const cueName = parts.length >= 3 ? parts[1] : labelFromFilename(fileName)
    return { category, cueName, fileName, url }
  })
  // Stable, deterministic variant order within a cue regardless of whatever
  // order import.meta.glob happened to enumerate files in.
  .sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true }))

function labelFromFilename(fileName: string): string {
  const base = fileName.replace(/\.mp3$/i, '')
  // Same "NN - Name" convention as musicLibrary/ambientLibrary — strip a
  // leading ordering number if the curator chose to add one, but don't
  // require it the way those two do, since a Sound Board folder doesn't
  // need a play order.
  const match = base.match(/^\d+\s*-\s*(.+)$/)
  return match ? match[1] : base
}

/** Order here is the menu's display order — see this file's own doc comment for why it mirrors Pocket Foley's eight sides. */
const CATEGORIES: { id: string; label: string }[] = [
  { id: 'WeaponImpacts', label: 'Weapon Impacts' },
  { id: 'Elemental', label: 'Elemental & Damage' },
  { id: 'Spellcasting', label: 'Spellcasting' },
  { id: 'SpellSchools', label: 'Spell Schools' },
  { id: 'ClassFeatures', label: 'Class Features' },
  { id: 'Creatures', label: 'Creatures & Combat' },
  { id: 'Movement', label: 'Footsteps & Movement' },
  { id: 'CombatFlow', label: 'Turn Flow' }
]

/** Every category, in menu order — empty ones are kept (rather than filtered out) so the Sound Board's shape stays stable as cues get added over time; SoundBoardButton.tsx decides whether to hide an empty section. */
export const SFX_LIBRARY: SfxCategory[] = CATEGORIES.map(({ id, label }) => {
  const byCueName = new Map<string, string[]>()
  for (const entry of raw) {
    if (entry.category !== id) continue
    const urls = byCueName.get(entry.cueName)
    if (urls) urls.push(entry.url)
    else byCueName.set(entry.cueName, [entry.url])
  }
  const cues = [...byCueName.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([cueName, urls], i) => ({ id: `${id}-${i + 1}`, label: cueName, urls }))
  return { id, label, cues }
})

export function findSfxCue(cueId: string): SfxCue | undefined {
  for (const category of SFX_LIBRARY) {
    const cue = category.cues.find((c) => c.id === cueId)
    if (cue) return cue
  }
  return undefined
}

/** Picks which of a cue's alternate takes to actually play — called independently by every client on every trigger (never broadcast as part of the cue id), so a synced table still hears a different take from each other by chance, same as it would if the DM triggered the same cue twice in a row locally. */
export function pickSfxVariant(cue: SfxCue): string {
  return cue.urls[Math.floor(Math.random() * cue.urls.length)]
}

export function totalSfxCount(): number {
  return SFX_LIBRARY.reduce((sum, c) => sum + c.cues.length, 0)
}

/**
 * Recognizes an inline `` `oneshot: WeaponImpacts-3` `` code span (see
 * markdown.ts's `codespan` renderer override and MarkdownLiveEditor.tsx's
 * matching Write-mode widget) — the note-authoring counterpart to a
 * `` `dice: 2d6 + 3` `` roll trigger (see shared/dice.ts's
 * parseDiceCodeSpan), written the same deliberate way so it reads as a
 * trigger rather than colliding with ordinary backticked text. Returns the
 * cue id, or null if the span isn't one of these or names a cue that no
 * longer exists (e.g. the file was since removed from assets/soundboard).
 */
export function parseOneShotCodeSpan(text: string): string | null {
  const match = /^oneshot:\s*(.+)$/i.exec(text.trim())
  if (!match) return null
  const cueId = match[1].trim()
  return findSfxCue(cueId) ? cueId : null
}
