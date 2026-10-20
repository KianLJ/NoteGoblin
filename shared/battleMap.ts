// The Combat tab's battle map: an endless grid, with map images the DM
// places and sizes on it, where each initiative combatant stands as a token,
// spell area templates, and fog the DM reveals. Pure data and math — the renderer
// draws it (features/combat/BattleMapView.tsx).
import type { Combatant } from './encounter'
import { lightsOf, tokenSeen, viewerKey, viewerSources, visibleCells, visionActive, type LightSource, type VisionSource } from './vision'

export interface MapToken {
  /** The top-left square it covers. */
  x: number
  y: number
  /** Squares across: 1 for Medium, 2 Large, 3 Huge, 4 Gargantuan. */
  size: number
  /** Locked in place: can't be dragged until unlocked. */
  locked?: boolean
  /** A light it carries (a torch, a lantern), in feet: bright light, then dim light beyond it. */
  light?: { bright: number; dim: number }
}

/** A wall (or door) along the map, from one point to another, in squares — it stops tokens and sight. */
export interface MapWall {
  id: string
  a: Pt
  b: Pt
  /** A door: open, it lets tokens and sight through. */
  door?: boolean
  /** A window: glass, so sight and light always pass; closed it stops tokens, open they can climb through. */
  window?: boolean
  open?: boolean
  /** Locked in place: can't be moved or deleted until unlocked (a door still opens). */
  locked?: boolean
}

/** A light placed on the map (a brazier, a glowing crystal), in feet: bright light, then dim light beyond it. */
export interface MapLight {
  id: string
  x: number
  y: number
  bright: number
  dim: number
  /** Put out for now: it lights nothing. */
  off?: boolean
  locked?: boolean
}

/** How lit the whole map is before any lights: bright (daylight), dim (twilight) or dark (a dungeon, night). */
export type Ambient = 'bright' | 'dim' | 'dark'

export type TemplateKind = 'cone' | 'sphere' | 'line' | 'cube'

/** A spell's area left on the map. Points are in squares (a square's centre is x + 0.5). */
export interface MapTemplate {
  id: string
  kind: TemplateKind
  origin: { x: number; y: number }
  /** Where it points (cone, line), its centre's edge (sphere) or opposite corner (cube) — only the direction and the size below matter for most. */
  toward: { x: number; y: number }
  /** Length of a cone or line, radius of a sphere, side of a cube. */
  sizeFt: number
  /** Locked in place: can't be moved, resized or deleted until unlocked. */
  locked?: boolean
  /** Hidden from players until the DM reveals it. */
  hidden?: boolean
}

/** A map image placed on the grid, in squares (it can be moved and sized to line up with the grid). */
export interface MapImage {
  id: string
  /** The image itself, as a data URL. */
  src: string
  x: number
  y: number
  w: number
  h: number
  /** Its size in pixels, for sizing it by "pixels per square". */
  naturalW?: number
  naturalH?: number
  locked?: boolean
  /** Hidden from players until the DM reveals it. */
  hidden?: boolean
}

/** A square-aligned area of the map: from (x0, y0) up to, not including, (x1, y1). */
export interface Bounds {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Where something stood on this map last time (by its slot, see slotOf), and whether it was hidden. */
export interface Placement {
  x: number
  y: number
  size: number
  hidden?: boolean
}

export type Pt = { x: number; y: number }

/**
 * One stroke of fog, in squares. `add` paints fog, `cut` clears it; they
 * apply in order, so a cut opens a hole in fog drawn before it and fog drawn
 * after covers it again.
 */
export type FogShape = { id: string; op: 'add' | 'cut'; locked?: boolean } & (
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  /** A shape drawn point by point. */
  | { kind: 'poly'; points: Pt[] }
  /** A freehand brush stroke or a straight line, this wide. */
  | { kind: 'stroke'; points: Pt[]; width: number }
)

export interface BattleMap {
  /** The area a new map starts with (where tokens are first placed); the grid itself goes on for ever. */
  cols: number
  rows: number
  feetPerCell: number
  /** Map images on the grid, bottom first. */
  images: MapImage[]
  /** Combatant id → where its token stands. */
  tokens: Record<string, MapToken>
  /** Fog hidden from players, drawn and cut in order; the DM sees it dimmed. */
  fog: FogShape[]
  templates: MapTemplate[]
  /** Where each enemy, vehicle and player stood (by slot), so loading the battle again puts them back. */
  placements: Record<string, Placement>
  /** The squares the party starts on (top-left of each), in order — set while prepping, so players don't appear mid-map. */
  partyStarts: Pt[]
  walls: MapWall[]
  lights: MapLight[]
  ambient: Ambient
  /** Players see what any of the party sees (the default); false: each only what their own character sees. */
  sharedVision?: boolean
  /** What each viewer has seen so far ('party', or 'user:<id>' without shared vision), as encoded squares (see vision.ts's encodeCells) — shown dimmed once out of sight. */
  explored: Record<string, string>
}

export function emptyBattleMap(): BattleMap {
  return { cols: 24, rows: 16, feetPerCell: 5, images: [], tokens: {}, fog: [], templates: [], placements: {}, partyStarts: [], walls: [], lights: [], ambient: 'bright', explored: {} }
}

/** A fog shape's outer edges. */
function fogBox(f: FogShape): Bounds {
  if (f.kind === 'rect') return { x0: f.x, y0: f.y, x1: f.x + f.w, y1: f.y + f.h }
  if (f.kind === 'circle') return { x0: f.cx - f.r, y0: f.cy - f.r, x1: f.cx + f.r, y1: f.cy + f.r }
  const pad = f.kind === 'stroke' ? f.width / 2 : 0
  const xs = f.points.map((q) => q.x)
  const ys = f.points.map((q) => q.y)
  return { x0: Math.min(...xs) - pad, y0: Math.min(...ys) - pad, x1: Math.max(...xs) + pad, y1: Math.max(...ys) + pad }
}

/**
 * How far the map reaches: its starting area and everything on it (images,
 * tokens, walls, lights, fog, shapes), widened by `pad` squares, in whole
 * squares. The grid is endless; this is just the part worth working out
 * sight and fog over. A fog over everything isn't counted (it's sized from this).
 */
export function mapBounds(map: Pick<BattleMap, 'cols' | 'rows' | 'images' | 'tokens' | 'walls' | 'lights' | 'fog' | 'templates' | 'partyStarts'>, pad = 0): Bounds {
  let x0 = 0
  let y0 = 0
  let x1 = map.cols
  let y1 = map.rows
  const add = (b: Bounds): void => {
    if (![b.x0, b.y0, b.x1, b.y1].every(Number.isFinite)) return
    x0 = Math.min(x0, b.x0)
    y0 = Math.min(y0, b.y0)
    x1 = Math.max(x1, b.x1)
    y1 = Math.max(y1, b.y1)
  }
  for (const i of map.images) add({ x0: i.x, y0: i.y, x1: i.x + i.w, y1: i.y + i.h })
  for (const t of Object.values(map.tokens)) add({ x0: t.x, y0: t.y, x1: t.x + t.size, y1: t.y + t.size })
  for (const w of map.walls) add({ x0: Math.min(w.a.x, w.b.x), y0: Math.min(w.a.y, w.b.y), x1: Math.max(w.a.x, w.b.x), y1: Math.max(w.a.y, w.b.y) })
  for (const l of map.lights) add({ x0: l.x, y0: l.y, x1: l.x, y1: l.y })
  for (const f of map.fog) if (!f.id.startsWith('all-')) add(fogBox(f))
  for (const t of map.templates) add({ x0: t.origin.x, y0: t.origin.y, x1: t.origin.x, y1: t.origin.y })
  for (const q of map.partyStarts) add({ x0: q.x, y0: q.y, x1: q.x + 1, y1: q.y + 1 })
  return { x0: Math.floor(x0) - pad, y0: Math.floor(y0) - pad, x1: Math.ceil(x1) + pad, y1: Math.ceil(y1) + pad }
}

export const cellKey = (x: number, y: number): string => `${x},${y}`

/** Distance between two squares the 5e way: every square of movement, diagonals included, is one square (5 ft). */
export function gridDistanceFt(a: { x: number; y: number }, b: { x: number; y: number }, feetPerCell = 5): number {
  return Math.max(Math.abs(Math.round(a.x) - Math.round(b.x)), Math.abs(Math.round(a.y) - Math.round(b.y))) * feetPerCell
}

/** Squares across for a creature size ("Large" → 2); unknown sizes take one square. */
export function sizeInSquares(size: string | undefined): number {
  switch ((size ?? '').toLowerCase()) {
    case 'large':
      return 2
    case 'huge':
      return 3
    case 'gargantuan':
    case 'colossal':
      return 4
    default:
      return 1
  }
}

function overlaps(a: MapToken, b: MapToken): boolean {
  return a.x < b.x + b.size && b.x < a.x + a.size && a.y < b.y + b.size && b.y < a.y + a.size
}

/** Whether a token can stand here: not on top of another token (`ignore`: the token being moved). The grid has no edge; walls are checked by vision.ts's canReach. */
export function canStand(map: Pick<BattleMap, 'tokens'>, token: MapToken, ignore?: string): boolean {
  return Object.entries(map.tokens).every(([id, t]) => id === ignore || !overlaps(t, token))
}

/**
 * A stable name for a combatant's spot on a map, the same each time the
 * battle is loaded (combatant ids are new every load): a player by who they
 * are, a vehicle by which one, a monster by kind and which copy ("goblin#2").
 */
export function slotOf(c: Combatant, combatants: Combatant[]): string {
  if (c.kind === 'player') return `player:${c.userId ?? c.name}`
  if (c.kind === 'vehicle') return `vehicle:${c.vehicleId ?? c.name}`
  if (c.monsterIndex) return `${c.monsterIndex}#${combatants.filter((x) => x.kind === 'monster' && x.monsterIndex === c.monsterIndex).indexOf(c) + 1}`
  return c.id
}

/** Where everything stands now, remembered by slot (and whether it's hidden) — the same map when nothing changed. */
export function withPlacements(map: BattleMap, combatants: Combatant[]): BattleMap {
  let placements = map.placements
  for (const c of combatants) {
    const t = map.tokens[c.id]
    if (!t) continue
    const slot = slotOf(c, combatants)
    const was = placements[slot]
    if (was && was.x === t.x && was.y === t.y && was.size === t.size && !!was.hidden === !!c.hidden) continue
    placements = { ...placements, [slot]: { x: t.x, y: t.y, size: t.size, ...(c.hidden ? { hidden: true } : {}) } }
  }
  return placements === map.placements ? map : { ...map, placements }
}

/**
 * Tokens for combatants that don't have one yet: the party (players and the
 * party's vehicles) from the left edge, everything else from the right, in
 * the first free squares. Tokens for combatants no longer in the encounter
 * are dropped, and a token whose size changed is resized where it stands.
 */
export function placeTokens(map: BattleMap, combatants: Combatant[], sizeOf: (c: Combatant) => number): BattleMap {
  const live = new Set(combatants.map((c) => c.id))
  let next: BattleMap = { ...map, tokens: Object.fromEntries(Object.entries(map.tokens).filter(([id]) => live.has(id))) }
  for (const c of combatants) {
    const size = Math.max(1, Math.min(4, sizeOf(c)))
    const have = next.tokens[c.id]
    if (have) {
      // Its size became known later (a vehicle or monster still loading): grow or shrink it in place when there's room.
      const resized = { ...have, size }
      if (have.size !== size && canStand(next, resized, c.id)) next = { ...next, tokens: { ...next.tokens, [c.id]: resized } }
      continue
    }
    const party = c.kind === 'player' || (c.kind === 'vehicle' && !!c.party)
    let spot: MapToken | null = null
    // Where it stood last time on this map, then (a player) the next free party start, then the edge of the map.
    const remembered = next.placements[slotOf(c, combatants)]
    if (remembered && canStand(next, { x: remembered.x, y: remembered.y, size })) spot = { x: remembered.x, y: remembered.y, size }
    if (!spot && c.kind === 'player') {
      const start = next.partyStarts.find((p) => canStand(next, { x: p.x, y: p.y, size }))
      if (start) spot = { x: start.x, y: start.y, size }
    }
    for (let i = 0; i < next.cols && !spot; i++) {
      const x = party ? i : next.cols - size - i
      for (let y = 0; y + size <= next.rows; y++) {
        const t = { x, y, size }
        if (canStand(next, t)) {
          spot = t
          break
        }
      }
    }
    if (spot) next = { ...next, tokens: { ...next.tokens, [c.id]: spot } }
  }
  if (Object.keys(next.tokens).length === Object.keys(map.tokens).length && Object.keys(map.tokens).every((id) => next.tokens[id] === map.tokens[id])) return map
  return next
}

/** A fog shape moved by (dx, dy) squares. */
export function moveFogShape(s: FogShape, dx: number, dy: number): FogShape {
  switch (s.kind) {
    case 'rect':
      return { ...s, x: s.x + dx, y: s.y + dy }
    case 'circle':
      return { ...s, cx: s.cx + dx, cy: s.cy + dy }
    default:
      return { ...s, points: s.points.map((q) => ({ x: q.x + dx, y: q.y + dy })) }
  }
}

/** The topmost fog shape under a point (the last drawn), for picking one to move. */
export function fogShapeAt(map: BattleMap, p: Pt): FogShape | null {
  for (let i = map.fog.length - 1; i >= 0; i--) if (inFogShape(map.fog[i], p)) return map.fog[i]
  return null
}

/** Fog over the whole map — everything on it and well beyond. */
export function fogEverything(map: BattleMap): FogShape {
  const b = mapBounds(map, 60)
  return { id: `all-${map.fog.length}`, op: 'add', kind: 'rect', x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 }
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = dx * dx + dy * dy
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Whether a point is inside one fog shape. */
export function inFogShape(s: FogShape, p: Pt): boolean {
  switch (s.kind) {
    case 'rect':
      return p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h
    case 'circle':
      return Math.hypot(p.x - s.cx, p.y - s.cy) <= s.r
    case 'stroke':
      if (s.points.length === 1) return Math.hypot(p.x - s.points[0].x, p.y - s.points[0].y) <= s.width / 2
      return s.points.some((a, i) => i > 0 && distToSegment(p, s.points[i - 1], a) <= s.width / 2)
    case 'poly': {
      let inside = false
      for (let i = 0, j = s.points.length - 1; i < s.points.length; j = i++) {
        const a = s.points[i]
        const b = s.points[j]
        if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
      }
      return inside
    }
  }
}

/** Whether a point on the map is under fog: the last shape that covers it decides. */
export function isFogged(map: BattleMap, p: Pt): boolean {
  let fogged = false
  for (const s of map.fog) if (inFogShape(s, p)) fogged = s.op === 'add'
  return fogged
}

/** A point snapped to the nearest square corner or centre (half-square steps). */
export function snapHalf(p: Pt): Pt {
  return { x: Math.round(p.x * 2) / 2, y: Math.round(p.y * 2) / 2 }
}

/** A short label for a template: "15 ft cone". */
export function templateLabel(t: MapTemplate): string {
  return `${t.sizeFt} ft ${t.kind}`
}

/**
 * What a player is sent of the battle map: no image (that goes separately,
 * once, see imageIdOf), and no token standing under fog — a hidden enemy's
 * position never leaves the DM's computer. Fog and spell shapes are sent as
 * they are; the player's map draws fog solid.
 */
export interface PlayerBattleMap {
  cols: number
  rows: number
  feetPerCell: number
  /** The map images showing, each by its fingerprint (the pictures themselves are fetched once per change, see imageIdOf). */
  images: Array<Omit<MapImage, 'src' | 'hidden' | 'locked'> & { imageId: string }>
  tokens: Record<string, MapToken>
  fog: FogShape[]
  templates: MapTemplate[]
  /** Walls and doors (so the player's map can work out sight), and the lights that are on (carried ones at their token). */
  walls: MapWall[]
  lights: LightSource[]
  ambient: Ambient
  /** What this player sees from, when the map limits sight (vision.ts's visionActive); null: they see the whole map. */
  vision: { sources: VisionSource[]; explored: string | null } | null
}

/** A short fingerprint of a map image, so players only download it when it changes. */
export function imageIdOf(image: string): string
export function imageIdOf(image: string | null): string | null
export function imageIdOf(image: string | null): string | null {
  if (!image) return null
  let h = 0
  // Sampling keeps this quick for a multi-megabyte data URL; the length guards against near-misses.
  const step = Math.max(1, Math.floor(image.length / 4096))
  for (let i = 0; i < image.length; i += step) h = (Math.imul(h, 31) + image.charCodeAt(i)) | 0
  return `${image.length.toString(36)}-${(h >>> 0).toString(36)}`
}

/**
 * The player's copy of the map: hidden things and tokens under fog left out,
 * the image swapped for its id, the DM's prep (placements, start spots,
 * lights that are off) not sent. With `viewer`, on a map that limits sight,
 * an enemy their party can't see right now (behind a wall, in the dark) is
 * left out too; the party's own tokens always show.
 */
export function mapForPlayer(map: BattleMap, hiddenIds: ReadonlySet<string> = new Set(), viewer?: { combatants: Combatant[]; userId: string }): PlayerBattleMap {
  const unseen = new Set(hiddenIds)
  for (const [id, t] of Object.entries(map.tokens)) if (isFogged(map, { x: t.x + t.size / 2, y: t.y + t.size / 2 })) unseen.add(id)
  let vision: PlayerBattleMap['vision'] = null
  if (viewer && visionActive(map)) {
    const sources = viewerSources(map, viewer.combatants, viewer.userId)
    const cells = visibleCells(map, sources, lightsOf(map, unseen))
    const party = new Set(viewer.combatants.filter((c) => c.kind === 'player' || (c.kind === 'vehicle' && c.party)).map((c) => c.id))
    for (const [id, t] of Object.entries(map.tokens)) if (!party.has(id) && !tokenSeen(t, cells)) unseen.add(id)
    vision = { sources, explored: map.explored[viewerKey(map, viewer.userId)] ?? null }
  }
  const tokens = Object.fromEntries(Object.entries(map.tokens).filter(([id]) => !unseen.has(id)))
  return {
    cols: map.cols,
    rows: map.rows,
    feetPerCell: map.feetPerCell,
    images: map.images.filter((i) => !i.hidden).map((i) => ({ id: i.id, imageId: imageIdOf(i.src), x: i.x, y: i.y, w: i.w, h: i.h })),
    tokens,
    fog: map.fog,
    templates: map.templates.filter((t) => !t.hidden),
    walls: map.walls,
    lights: lightsOf(map, unseen),
    ambient: map.ambient,
    vision
  }
}

/** The ids of hidden combatants, for mapForPlayer. */
export function hiddenCombatantIds(combatants: Combatant[]): Set<string> {
  return new Set(combatants.filter((c) => c.hidden).map((c) => c.id))
}

/** One of a campaign's battles: a map, the saved encounter it's for, and everything remembered on it. */
export interface SavedBattle {
  id: string
  name: string
  /** The encounter builder's saved encounter this map is for (loading it switches here). */
  encounterId: string | null
  map: BattleMap
}

export interface BattleLibrary {
  activeId: string
  battles: SavedBattle[]
  /** Stand-in players the DM adds to try a map out: each joins every fight as a party member. */
  testPlayers?: TestPlayer[]
}

/** A stand-in player for trying a map out, optionally playing one of the DM's own characters. */
export interface TestPlayer {
  id: string
  name: string
  /** One of the DM's characters to play (their hit points, AC, darkvision, actions and spells); null: just a token. */
  characterId: string | null
  /** Darkvision in feet, when not playing a character. */
  darkvision?: number
}

/** The relay-style user id a test player's combatant goes by. */
export const testUserId = (id: string): string => `test:${id}`
export const isTestUser = (userId: string | undefined): boolean => !!userId && userId.startsWith('test:')

export function newBattle(name: string, id: string): SavedBattle {
  return { id, name, encounterId: null, map: emptyBattleMap() }
}

export function emptyBattleLibrary(): BattleLibrary {
  const first = newBattle('Battle map', 'battle-1')
  return { activeId: first.id, battles: [first] }
}

export function activeBattle(lib: BattleLibrary): SavedBattle {
  return lib.battles.find((b) => b.id === lib.activeId) ?? lib.battles[0]
}

/** A saved library read back defensively; a campaign saved before battles existed (one map) becomes a library of one. */
export function normalizeBattleLibrary(input: unknown): BattleLibrary {
  if (!input || typeof input !== 'object') return emptyBattleLibrary()
  const raw = input as Partial<BattleLibrary>
  if (!Array.isArray(raw.battles)) {
    const only = { ...newBattle('Battle map', 'battle-1'), map: normalizeBattleMap(input) }
    return { activeId: only.id, battles: [only] }
  }
  const battles = raw.battles
    .filter((b): b is SavedBattle => !!b && typeof b === 'object' && typeof (b as SavedBattle).id === 'string')
    .map((b) => ({ id: b.id, name: typeof b.name === 'string' && b.name ? b.name : 'Battle map', encounterId: typeof b.encounterId === 'string' ? b.encounterId : null, map: normalizeBattleMap(b.map) }))
  if (battles.length === 0) return emptyBattleLibrary()
  const testPlayers = Array.isArray(raw.testPlayers)
    ? raw.testPlayers
        .filter((t): t is TestPlayer => !!t && typeof t.id === 'string' && typeof t.name === 'string')
        .map((t) => ({ id: t.id, name: t.name, characterId: typeof t.characterId === 'string' ? t.characterId : null, ...(typeof t.darkvision === 'number' ? { darkvision: t.darkvision } : {}) }))
    : []
  return { activeId: battles.some((b) => b.id === raw.activeId) ? raw.activeId! : battles[0].id, battles, ...(testPlayers.length ? { testPlayers } : {}) }
}

/** A saved map read back defensively: anything missing or the wrong shape falls back to the default. */
export function normalizeBattleMap(input: unknown): BattleMap {
  const base = emptyBattleMap()
  if (!input || typeof input !== 'object') return base
  const m = input as Partial<BattleMap>
  const int = (v: unknown, fallback: number, min: number, max: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : fallback)
  const cols = int(m.cols, base.cols, 4, 120)
  const rows = int(m.rows, base.rows, 4, 120)
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  const images = Array.isArray(m.images)
    ? m.images.filter((i): i is MapImage => !!i && typeof i.id === 'string' && typeof i.src === 'string' && i.src.startsWith('data:image/') && num(i.x) && num(i.y) && num(i.w) && num(i.h) && i.w > 0 && i.h > 0)
    : []
  // A map saved before images could be moved: its one background image, stretched over the grid as it was.
  const legacy = (input as { image?: unknown }).image
  if (typeof legacy === 'string' && legacy.startsWith('data:image/') && images.length === 0) images.push({ id: 'background', src: legacy, x: 0, y: 0, w: cols, h: rows })
  return {
    cols,
    rows,
    feetPerCell: int(m.feetPerCell, base.feetPerCell, 1, 1000),
    images,
    tokens: m.tokens && typeof m.tokens === 'object' ? (m.tokens as BattleMap['tokens']) : {},
    fog: Array.isArray(m.fog) ? m.fog.filter((f) => f && typeof f === 'object' && 'kind' in f) : [],
    templates: Array.isArray(m.templates) ? m.templates.filter((t) => t && typeof t === 'object' && 'kind' in t) : [],
    placements: m.placements && typeof m.placements === 'object' ? (m.placements as BattleMap['placements']) : {},
    partyStarts: Array.isArray(m.partyStarts) ? m.partyStarts.filter((p) => p && typeof p.x === 'number' && typeof p.y === 'number') : [],
    walls: Array.isArray(m.walls) ? m.walls.filter((w) => w && typeof w.id === 'string' && w.a && w.b && typeof w.a.x === 'number' && typeof w.b.x === 'number') : [],
    lights: Array.isArray(m.lights) ? m.lights.filter((l) => l && typeof l.id === 'string' && typeof l.x === 'number' && typeof l.y === 'number') : [],
    ambient: m.ambient === 'dim' || m.ambient === 'dark' ? m.ambient : 'bright',
    ...(m.sharedVision === false ? { sharedVision: false } : {}),
    explored: m.explored && typeof m.explored === 'object' ? (m.explored as BattleMap['explored']) : {}
  }
}
