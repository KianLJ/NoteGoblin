/**
 * A campaign's maps (the World Map box): the world, a region, a city — each a picture with pins on it (a place, or a
 * link to a note, a quest or someone in the reputation tracker), where the party is and the trail they've travelled,
 * and — with fog on — the parts the party has explored. Positions are fractions of the picture (0…1 across and
 * down), so they stay put whatever size it's shown at. The pictures are kept and sent apart (they're big); this is
 * the small rest, one JSON document per campaign, written by the DM. A player gets the maps shown to the party, with
 * their shown pins, and — under fog — a copy of the picture with the fog burned in, so nothing hidden reaches them.
 */

export type PinKind = 'place' | 'note' | 'quest' | 'rep'

export interface MapPin {
  id: string
  x: number
  y: number
  label: string
  kind: PinKind
  /** What it links to: a note's title, a quest's id, or a reputation entry's id. */
  ref?: string
  /** One of the pin colours. */
  color: string
  /** Players can see it. */
  shared: boolean
  /** It goes round another pin as the campaign's calendar moves on (a planet round its sun, a moon round its planet). */
  orbit?: PinOrbit
  /** Drawn as a sphere (a planet, a sun) this big across from its centre, as a fraction of the picture's width; otherwise a pin. */
  size?: number
}

/**
 * A circular orbit round another pin: `radius` as a fraction of the picture's width, once round every `period` days,
 * at angle `phase` (radians) on day 0 of the calendar — anticlockwise unless `clockwise`. The pin's own x and y are
 * where it was put, used when it has nothing to go round.
 */
export interface PinOrbit {
  around: string
  radius: number
  period: number
  phase: number
  clockwise?: boolean
  /** Dragging it only moves it round its orbit, never further in or out. */
  locked?: boolean
}

/** The picture is `across` of `unit` from its left edge to its right. */
export interface MapScale {
  across: number
  unit: string
}

export interface MapPoint {
  x: number
  y: number
}

/** A point on the party's trail; `gap` starts a new stretch (they were set down here, not walked here). */
export interface TrailPoint extends MapPoint {
  gap?: boolean
}

/** A revealed circle through the fog: its centre, and its radius as a fraction of the picture's width. */
export interface RevealedArea extends MapPoint {
  r: number
}

export interface WorldMapDoc {
  id: string
  name: string
  /** The party can see this map. */
  shared: boolean
  /** The picture's fingerprint (shared/battleMap.ts's imageIdOf) — none until the DM loads one. */
  imageId: string | null
  /** Its shape, width over height, for laying it out before it arrives. */
  aspect: number
  pins: MapPin[]
  party: MapPoint | null
  /** Where the party has been, oldest first. */
  trail: TrailPoint[]
  /** Players see only what's been revealed. */
  fog: boolean
  revealed: RevealedArea[]
  /** How far the picture reaches, left to right, in whatever unit the DM likes (km, mi, leagues…) — for distances. */
  scale?: MapScale
}

export const PIN_COLORS = ['#c0533a', '#d39a2b', '#4f8a4a', '#3f7aa8', '#8a5bb0', '#5a5a5a'] as const

export const EMPTY_WORLD_MAP: WorldMapDoc = { id: 'map', name: 'Map', shared: false, imageId: null, aspect: 1.5, pins: [], party: null, trail: [], fog: false, revealed: [] }

export interface CampaignMaps {
  maps: WorldMapDoc[]
}

const MAX_MAPS = 40

const MAX_PINS = 400
const MAX_TRAIL = 600
const MAX_REVEALED = 800

const unit = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : null)
const point = (v: unknown): MapPoint | null => {
  if (typeof v !== 'object' || v === null) return null
  const x = unit((v as MapPoint).x)
  const y = unit((v as MapPoint).y)
  return x === null || y === null ? null : { x, y }
}

/** A world map as it can be trusted. */
export function normalizeWorldMap(raw: unknown): WorldMapDoc {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const pins: MapPin[] = []
  for (const x of Array.isArray(r.pins) ? r.pins.slice(0, MAX_PINS) : []) {
    const p = point(x)
    const o = x as Record<string, unknown>
    if (!p || typeof o.id !== 'string' || !o.id) continue
    const kind: PinKind = o.kind === 'note' || o.kind === 'quest' || o.kind === 'rep' ? o.kind : 'place'
    const pin: MapPin = {
      id: o.id.slice(0, 64),
      ...p,
      label: typeof o.label === 'string' ? o.label.trim().slice(0, 120) : '',
      kind,
      // Any colour the DM picks, as #rrggbb.
      color: typeof o.color === 'string' && /^#[0-9a-f]{6}$/i.test(o.color) ? o.color.toLowerCase() : PIN_COLORS[0],
      shared: o.shared === true
    }
    if (kind !== 'place' && typeof o.ref === 'string' && o.ref.trim()) pin.ref = o.ref.trim().slice(0, 240)
    const orbit = readOrbit(o.orbit, pin.id)
    if (orbit) pin.orbit = orbit
    // Real-scale planets on a solar system are vanishingly small next to it: any size above nothing.
    if (typeof o.size === 'number' && o.size > 0 && o.size <= 0.5) pin.size = o.size
    pins.push(pin)
  }
  const aspect = typeof r.aspect === 'number' && Number.isFinite(r.aspect) && r.aspect > 0.05 && r.aspect < 20 ? r.aspect : EMPTY_WORLD_MAP.aspect
  const revealed: RevealedArea[] = []
  for (const x of Array.isArray(r.revealed) ? r.revealed.slice(-MAX_REVEALED) : []) {
    const p = point(x)
    const rad = unit((x as RevealedArea)?.r)
    if (p && rad) revealed.push({ ...p, r: Math.max(0.005, rad) })
  }
  return {
    id: typeof r.id === 'string' && r.id ? r.id.slice(0, 64) : EMPTY_WORLD_MAP.id,
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 80) : EMPTY_WORLD_MAP.name,
    shared: r.shared === true,
    imageId: typeof r.imageId === 'string' && r.imageId ? r.imageId.slice(0, 64) : null,
    aspect,
    pins,
    party: point(r.party),
    trail: (Array.isArray(r.trail) ? r.trail.slice(-MAX_TRAIL) : []).flatMap((t): TrailPoint[] => {
      const p = point(t)
      return p ? [(t as TrailPoint).gap === true ? { ...p, gap: true } : p] : []
    }),
    fog: r.fog === true,
    revealed,
    ...readScale(r.scale)
  }
}

/** Moves the party to `to`, adding it to their trail (unless they haven't really moved). */
export function moveParty(map: WorldMapDoc, to: MapPoint): WorldMapDoc {
  const last = map.trail[map.trail.length - 1]
  const moved = !last || Math.hypot(last.x - to.x, last.y - to.y) > 0.002
  return { ...map, party: to, trail: moved ? [...map.trail, to].slice(-MAX_TRAIL) : map.trail }
}

/** Covers up again whatever revealed circles take in `at`. */
export function coverAt(map: WorldMapDoc, at: MapPoint, aspect: number): WorldMapDoc {
  // Radii are fractions of the width; heights are scaled to match.
  const inside = (a: RevealedArea): boolean => Math.hypot(a.x - at.x, (a.y - at.y) / aspect) <= a.r
  return { ...map, revealed: map.revealed.filter((a) => !inside(a)) }
}

/** A campaign's maps as they can be trusted, each with its own id. */
export function normalizeMaps(raw: unknown): CampaignMaps {
  const list = (raw as { maps?: unknown })?.maps
  const seen = new Set<string>()
  const maps: WorldMapDoc[] = []
  for (const m of Array.isArray(list) ? list.slice(0, MAX_MAPS) : []) {
    const map = normalizeWorldMap(m)
    if (seen.has(map.id)) continue
    seen.add(map.id)
    maps.push(map)
  }
  return { maps }
}

/** Sets the party down there without walking them: the trail they had stays, and a new stretch starts here. */
export function placeParty(map: WorldMapDoc, to: MapPoint): WorldMapDoc {
  return { ...map, party: to, trail: [...map.trail, { ...to, gap: true }].slice(-MAX_TRAIL) }
}

/** The trail as separate lines: a new one at every place the party was set down. */
export function trailLines(trail: TrailPoint[]): MapPoint[][] {
  const lines: MapPoint[][] = []
  for (const p of trail) {
    if (p.gap || !lines.length) lines.push([])
    lines[lines.length - 1].push({ x: p.x, y: p.y })
  }
  return lines.filter((l) => l.length > 1)
}

/** What a player is sent of one map: only its shown pins. */
export function worldMapForPlayer(map: WorldMapDoc): WorldMapDoc {
  return { ...map, pins: map.pins.filter((p) => p.shared) }
}

/** What a player is sent: the maps shown to the party, each with only its shown pins. */
export function mapsForPlayer(doc: CampaignMaps): CampaignMaps {
  return { maps: doc.maps.filter((m) => m.shared).map(worldMapForPlayer) }
}

function readScale(raw: unknown): { scale?: MapScale } {
  const r = raw as Partial<MapScale> | undefined
  // Any size at all: a city block, a continent, a solar system.
  const across = typeof r?.across === 'number' && Number.isFinite(r.across) && r.across > 0 ? r.across : 0
  const unit = typeof r?.unit === 'string' ? r.unit.trim().slice(0, 24) : ''
  return across && unit ? { scale: { across, unit } } : {}
}

/** How far apart two points on the map are, in its scale's unit — null with no scale set. */
export function distanceBetween(map: Pick<WorldMapDoc, 'scale' | 'aspect'>, a: MapPoint, b: MapPoint): number | null {
  if (!map.scale) return null
  // Positions are fractions of the width and of the height; the height is the width over the aspect.
  const dx = (b.x - a.x) * map.scale.across
  const dy = ((b.y - a.y) * map.scale.across) / map.aspect
  return Math.hypot(dx, dy)
}

/** How long a route is in widths of the map (a whole width is 1) — what a known length of it sets the scale from. */
export function routeWidths(map: Pick<WorldMapDoc, 'aspect'>, points: MapPoint[]): number {
  const unscaled = { aspect: map.aspect, scale: { across: 1, unit: '' } }
  return points.slice(1).reduce((sum, b, i) => sum + distanceBetween(unscaled, points[i], b)!, 0)
}

/** A round length for a scale bar about `target` long, in the scale's unit: 1, 2 or 5 times a power of ten. */
export function niceLength(target: number): number {
  const p = 10 ** Math.floor(Math.log10(target))
  const m = target / p
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p
}

/** How far the party has walked along their trail (not counting where they were set down), in the scale's unit. */
export function trailDistance(map: Pick<WorldMapDoc, 'scale' | 'aspect' | 'trail'>): number | null {
  if (!map.scale) return null
  let total = 0
  for (const line of trailLines(map.trail)) for (let i = 1; i < line.length; i++) total += distanceBetween(map, line[i - 1], line[i]) ?? 0
  return total
}

const COMPACT = new Intl.NumberFormat('en', { notation: 'compact', compactDisplay: 'long', maximumSignificantDigits: 3 })

/** A distance to read: "12.4 km", "350 m", "1,204 mi", "18.6 trillion mi", "0.0042 mm". */
export function formatDistance(n: number, unit: string): string {
  let shown: string
  if (n >= 1e6) shown = COMPACT.format(n)
  else if (n >= 100) shown = Math.round(n).toLocaleString('en')
  else if (n >= 10) shown = (Math.round(n * 10) / 10).toLocaleString('en')
  else if (n >= 0.01 || n === 0) shown = (Math.round(n * 100) / 100).toLocaleString('en')
  else shown = n.toPrecision(2)
  return `${shown} ${unit}`
}

const WORDS: Record<string, number> = { thousand: 1e3, k: 1e3, million: 1e6, m: 1e6, mil: 1e6, billion: 1e9, b: 1e9, bn: 1e9, trillion: 1e12, t: 1e12, tn: 1e12, quadrillion: 1e15, q: 1e15 }

/**
 * An amount as someone types it: "300", "1,500", "18.6 trillion", "18.6t", "4.5 billion", "1.86e13". Null if it isn't
 * a positive number.
 */
export function parseAmount(text: string): number | null {
  const m = /^\s*([\d,]*\.?\d+(?:e[+-]?\d+)?)\s*([a-z]*)\s*$/i.exec(text)
  if (!m) return null
  const word = m[2].toLowerCase()
  const times = word ? WORDS[word] : 1
  if (!times) return null
  const n = Number(m[1].replace(/,/g, '')) * times
  return Number.isFinite(n) && n > 0 ? n : null
}

function readOrbit(raw: unknown, self: string): PinOrbit | undefined {
  const o = raw as Partial<PinOrbit> | undefined
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const radius = num(o?.radius)
  const period = num(o?.period)
  const phase = num(o?.phase)
  if (typeof o?.around !== 'string' || !o.around || o.around === self || radius === null || radius <= 0 || period === null || period <= 0 || phase === null) return undefined
  return { around: o.around.slice(0, 64), radius: Math.min(radius, 10), period, phase, ...(o.clockwise === true ? { clockwise: true } : {}), ...(o.locked === true ? { locked: true } : {}) }
}

/**
 * Where every pin is on day `day` of the campaign's calendar (a day count, fractions for the time of day): a pin
 * with an orbit is round its centre — wherever that is itself, so moons follow their planets — and the rest where
 * they were put. Circles look round on the picture whatever its shape.
 */
export function pinPositionsAt(map: Pick<WorldMapDoc, 'pins' | 'aspect'>, day: number): Map<string, MapPoint> {
  const byId = new Map(map.pins.map((p) => [p.id, p]))
  const placed = new Map<string, MapPoint>()
  const place = (pin: MapPin, depth: number): MapPoint => {
    const known = placed.get(pin.id)
    if (known) return known
    const centrePin = pin.orbit ? byId.get(pin.orbit.around) : undefined
    let at: MapPoint = { x: pin.x, y: pin.y }
    // Orbits round orbits, but not round in circles: a loop or a missing centre leaves the pin where it was put.
    if (pin.orbit && centrePin && depth < 12) {
      const c = place(centrePin, depth + 1)
      const turn = (2 * Math.PI * day) / pin.orbit.period
      const angle = pin.orbit.phase + (pin.orbit.clockwise ? turn : -turn)
      at = { x: c.x + pin.orbit.radius * Math.cos(angle), y: c.y + pin.orbit.radius * Math.sin(angle) * map.aspect }
    }
    placed.set(pin.id, at)
    return at
  }
  for (const pin of map.pins) place(pin, 0)
  return placed
}

/**
 * An orbit round `aroundId` that has the pin at `at` on day `day` — for putting a pin into orbit, or moving one that's
 * already going round, from wherever it's dropped. Keeps its period and direction.
 */
export function orbitThrough(map: Pick<WorldMapDoc, 'pins' | 'aspect'>, aroundId: string, at: MapPoint, day: number, period: number, clockwise = false): PinOrbit | null {
  const centre = pinPositionsAt(map, day).get(aroundId)
  if (!centre || !(period > 0)) return null
  const dx = at.x - centre.x
  const dy = (at.y - centre.y) / map.aspect
  const radius = Math.hypot(dx, dy)
  if (radius <= 0) return null
  const turn = (2 * Math.PI * day) / period
  const phase = Math.atan2(dy, dx) - (clockwise ? turn : -turn)
  return { around: aroundId, radius, period, phase, ...(clockwise ? { clockwise: true } : {}) }
}
