/**
 * Real, looping ambient-SFX layers for the Goblin Bard panel's Ambient
 * section (MusicButton.tsx) — several categories (Campfire, Cave Drips,
 * Desert Wind, Thunderstorm, etc.), each with a couple of alternate takes,
 * discovered from src/renderer/src/assets/ambient/** the same way
 * musicLibrary.ts discovers the music tracks. Each mood then picks 2-3 of
 * these categories that actually fit it (an outdoors/exploration mood gets
 * Wind/Rain/Thunder-style layers, a tavern gets its own Fire/Crowd layers,
 * a dungeon gets Drips/Echo, and so on) rather than one generic set shared
 * by every mood.
 */
export interface AmbientLayer {
  /** Unique across the whole library — "<categoryId>-<n>". */
  id: string
  /** Shown next to the slider — the specific take's own name (e.g. "Crackling Fire"), not the category's. */
  label: string
  url: string
}

interface AmbientCategory {
  id: string
  layers: AmbientLayer[]
}

const files = import.meta.glob<string>('../assets/ambient/**/*.mp3', { eager: true, query: '?url', import: 'default' })

interface RawEntry {
  relPath: string
  url: string
}

const raw: RawEntry[] = Object.entries(files).map(([path, url]) => ({
  relPath: path.slice(path.indexOf('assets/ambient/') + 'assets/ambient/'.length),
  url
}))

/** Same "NN - Name.mp3" convention as musicLibrary.ts's titleFromFilename. */
function titleFromFilename(relPath: string): string {
  const base = relPath.slice(relPath.lastIndexOf('/') + 1).replace(/\.mp3$/i, '')
  const match = base.match(/^\d+\s*-\s*(.+)$/)
  return match ? match[1] : base
}

const CATEGORY_IDS = [
  'Campfire',
  'CaveDrips',
  'CityStreet',
  'DesertWind',
  'DistantBattle',
  'ForestWind',
  'LightRain',
  'MountainWind',
  'NightCrickets',
  'OceanWaves',
  'TavernCrowd',
  'Thunderstorm'
]

const CATEGORIES: Record<string, AmbientCategory> = Object.fromEntries(
  CATEGORY_IDS.map((id) => {
    const layers = raw
      .filter((r) => r.relPath.startsWith(`${id}/`))
      .sort((a, b) => a.relPath.localeCompare(b.relPath, undefined, { numeric: true }))
      .map((r, i) => ({ id: `${id}-${i + 1}`, label: titleFromFilename(r.relPath), url: r.url }))
    return [id, { id, layers }]
  })
)

/**
 * Which ambient categories each mood offers, in display order. Not every
 * category is a perfect thematic fit for every mood (there's no dedicated
 * "cheering crowd" or "temple bell" recording to draw on yet) — where
 * nothing matches closely, the nearest reasonable stand-in is used instead
 * of leaving that mood with only one layer or none at all.
 */
const MOOD_CATEGORIES: Record<string, string[]> = {
  explorationDesert: ['DesertWind'],
  explorationForest: ['ForestWind', 'LightRain'],
  explorationMountains: ['MountainWind', 'Thunderstorm'],
  explorationNight: ['NightCrickets'],
  explorationWild: ['ForestWind', 'LightRain', 'Thunderstorm'],
  tavernRespite: ['TavernCrowd', 'Campfire'],
  townMarket: ['CityStreet'],
  mysteryInvestigation: ['CaveDrips', 'LightRain'],
  combatSkirmish: ['DistantBattle'],
  combatBoss: ['DistantBattle', 'Thunderstorm'],
  victoryTriumph: ['TavernCrowd', 'CityStreet'],
  sorrowLoss: ['LightRain', 'Thunderstorm'],
  romanceCalm: ['Campfire', 'NightCrickets'],
  dungeonDread: ['CaveDrips'],
  divineSacred: ['CaveDrips', 'Campfire'],
  epilogueCredits: ['OceanWaves']
}

/** Every ambient layer a given mood offers — flattened across its assigned categories, each category contributing all of its own takes (so a mood assigned one category still gets multiple layers/sliders, not just one). Empty for a mood with no mapping, or one not yet mapped above. */
export function ambientLayersFor(groupId: string | null): AmbientLayer[] {
  if (!groupId) return []
  const categoryIds = MOOD_CATEGORIES[groupId] ?? []
  return categoryIds.flatMap((id) => CATEGORIES[id]?.layers ?? [])
}

export function findAmbientLayer(layerId: string): AmbientLayer | undefined {
  for (const category of Object.values(CATEGORIES)) {
    const layer = category.layers.find((l) => l.id === layerId)
    if (layer) return layer
  }
  return undefined
}

/** A layer's own category id, recovered from its "<categoryId>-<n>" id — used by isRainLayer/isWindLayer below to tell what a layer actually is without needing its own separate "kind" field. */
function categoryIdOf(layer: AmbientLayer): string {
  return layer.id.replace(/-\d+$/, '')
}

/** Whether a layer belongs to one of the rain-flavored categories — used by MusicButton.tsx's calendar-driven auto-ambience (see its own doc comment) to find which of a mood's own layers to raise when the campaign calendar says today's weather calls for it. */
export function isRainLayer(layer: AmbientLayer): boolean {
  return categoryIdOf(layer).includes('Rain')
}

/** Same idea as isRainLayer, for the wind-flavored categories (DesertWind, ForestWind, MountainWind). */
export function isWindLayer(layer: AmbientLayer): boolean {
  return categoryIdOf(layer).includes('Wind')
}
