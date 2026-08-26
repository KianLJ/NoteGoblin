/**
 * The bundled Goblin Bard music library — every mood ships as a *group* of
 * several tracks (not one loop per mood), discovered automatically from
 * src/renderer/src/assets/music/** via import.meta.glob rather than one
 * hand-written import per file, since the set grows every time more tracks
 * get curated (see the Goblin Bard checklist). Grouping mirrors the curated
 * folder structure exactly: Combat splits into Skirmish/Boss by filename
 * (both live in one Combat/ folder), Exploration & Travel splits into five
 * biome subfolders — everything else is one folder per mood.
 */
export interface MusicTrack {
  id: string
  title: string
  url: string
}

export interface MusicGroup {
  id: string
  label: string
  tracks: MusicTrack[]
}

const files = import.meta.glob<string>('../assets/music/**/*.mp3', { eager: true, query: '?url', import: 'default' })

interface RawEntry {
  relPath: string
  url: string
}

const raw: RawEntry[] = Object.entries(files).map(([path, url]) => ({
  relPath: path.slice(path.indexOf('assets/music/') + 'assets/music/'.length),
  url
}))

interface GroupDef {
  id: string
  label: string
  match: (relPath: string) => boolean
}

const GROUP_DEFS: GroupDef[] = [
  { id: 'tavernRespite', label: 'Tavern & Respite', match: (p) => p.startsWith('Tavern&Respite/') },
  { id: 'townMarket', label: 'Town & Market', match: (p) => p.startsWith('Town&Market/') },
  { id: 'explorationDesert', label: 'Exploration — Desert', match: (p) => p.startsWith('Exploration&Travel/Desert/') },
  { id: 'explorationForest', label: 'Exploration — Forest', match: (p) => p.startsWith('Exploration&Travel/Forest/') },
  { id: 'explorationMountains', label: 'Exploration — Mountains', match: (p) => p.startsWith('Exploration&Travel/Mountains/') },
  { id: 'explorationNight', label: 'Exploration — Night', match: (p) => p.startsWith('Exploration&Travel/Night/') },
  { id: 'explorationWild', label: 'Exploration — Wild', match: (p) => p.startsWith('Exploration&Travel/Wild/') },
  { id: 'mysteryInvestigation', label: 'Mystery & Investigation', match: (p) => p.startsWith('Mystery&Investigation/') },
  { id: 'combatSkirmish', label: 'Combat — Skirmish', match: (p) => p.startsWith('Combat/Skirmish/') },
  { id: 'combatBoss', label: 'Combat — Boss', match: (p) => p.startsWith('Combat/Boss/') },
  { id: 'victoryTriumph', label: 'Victory & Triumph', match: (p) => p.startsWith('Victory&Triumph/') },
  { id: 'sorrowLoss', label: 'Sorrow & Loss', match: (p) => p.startsWith('Sorrow&Loss/') },
  { id: 'romanceCalm', label: 'Romance & Calm', match: (p) => p.startsWith('Romance&Calm/') },
  { id: 'dungeonDread', label: 'Dungeon & Dread', match: (p) => p.startsWith('Dungeon&Dread/') },
  { id: 'divineSacred', label: 'Divine & Sacred', match: (p) => p.startsWith('Divine&Sacred/') },
  { id: 'epilogueCredits', label: 'Epilogue & Credits', match: (p) => p.startsWith('Epilogue&Credits/') }
]

/**
 * Each file is named "NN - Track Name.mp3" (the NN keeps sort order stable
 * regardless of what the name itself is) — the title shown in the mood grid
 * and the right-click track picker (see MusicButton.tsx) comes straight from
 * that name, not a separate lookup table, so renaming a file *is* renaming
 * the track. Falls back to the bare filename for anything that doesn't
 * follow the "NN - Name" convention, so a not-yet-renamed drop-in file still
 * shows up sanely instead of breaking.
 */
function titleFromFilename(relPath: string): string {
  const base = relPath.slice(relPath.lastIndexOf('/') + 1).replace(/\.mp3$/i, '')
  const match = base.match(/^\d+\s*-\s*(.+)$/)
  return match ? match[1] : base
}

export const MUSIC_LIBRARY: MusicGroup[] = GROUP_DEFS.map((def) => {
  const tracks = raw
    .filter((r) => def.match(r.relPath))
    .sort((a, b) => a.relPath.localeCompare(b.relPath, undefined, { numeric: true }))
    .map((r, i) => ({
      id: `${def.id}-${i + 1}`,
      title: titleFromFilename(r.relPath),
      url: r.url
    }))
  return { id: def.id, label: def.label, tracks }
})

export function findTrack(trackId: string): MusicTrack | undefined {
  for (const group of MUSIC_LIBRARY) {
    const track = group.tracks.find((t) => t.id === trackId)
    if (track) return track
  }
  return undefined
}
