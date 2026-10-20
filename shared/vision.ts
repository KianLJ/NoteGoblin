// Walls, doors, light and sight on the battle map. Walls (and closed doors)
// stop tokens and block sight; players see what their tokens have line of
// sight to, where it's lit or within their darkvision. Squares are the unit
// throughout (a square's centre is x + 0.5). Pure math, shared by the DM's
// app (what to remember as explored), the host (what a player may be sent)
// and the player's map (drawing it).
import { mapBounds, type BattleMap, type Bounds, type MapToken, type Pt } from './battleMap'
import type { Combatant } from './encounter'

export interface Seg {
  a: Pt
  b: Pt
}

/** A light shining from a point: bright light out to `bright` feet, then dim light for `dim` feet more (the 5e way). */
export interface LightSource {
  x: number
  y: number
  bright: number
  dim: number
  /** A carried light: the token carrying it (so it moves with a token being dragged). */
  id?: string
}

/** A token players see from: where its eyes are, and how far its darkvision reaches (feet). */
export interface VisionSource {
  x: number
  y: number
  darkvision: number
  /** The token it's seen from. */
  id?: string
}

/** Squares over an area of the map (1: in it). */
export interface Region {
  b: Bounds
  cells: Uint8Array
}

function emptyRegion(b: Bounds): Region {
  return { b, cells: new Uint8Array(Math.max(0, (b.x1 - b.x0) * (b.y1 - b.y0))) }
}

/** Whether a square is in the region. */
export function inRegion(r: Region, x: number, y: number): boolean {
  return x >= r.b.x0 && x < r.b.x1 && y >= r.b.y0 && y < r.b.y1 && r.cells[(y - r.b.y0) * (r.b.x1 - r.b.x0) + (x - r.b.x0)] === 1
}

/** How far sight is worked out: the map's contents and this many squares beyond. */
const SIGHT_PAD = 30

/** Light presets for lights and carried lights, in feet. */
export const LIGHT_PRESETS: Array<{ name: string; bright: number; dim: number }> = [
  { name: 'Candle', bright: 5, dim: 5 },
  { name: 'Torch', bright: 20, dim: 20 },
  { name: 'Lantern', bright: 30, dim: 30 },
  { name: 'Daylight', bright: 60, dim: 60 }
]

/**
 * The walls in the way: for sight (and light), every wall and closed door —
 * windows are glass; for movement, every wall, closed door and closed window.
 */
export function blockingWalls(map: Pick<BattleMap, 'walls'>, use: 'sight' | 'move' = 'sight'): Seg[] {
  return map.walls.filter((w) => (w.window ? use === 'move' && !w.open : !w.door || !w.open))
}

/** Whether the map restricts what players see: once it has walls, or it's dark. A plain lit map shows everything, as before. */
export function visionActive(map: Pick<BattleMap, 'walls' | 'ambient'>): boolean {
  return map.walls.length > 0 || map.ambient === 'dark'
}

/** Where segment p→q meets segment a→b: t along p→q, u along a→b (both 0–1 inside them); null when parallel. */
function intersect(p: Pt, q: Pt, a: Pt, b: Pt): { t: number; u: number } | null {
  const rx = q.x - p.x
  const ry = q.y - p.y
  const sx = b.x - a.x
  const sy = b.y - a.y
  const den = rx * sy - ry * sx
  if (Math.abs(den) < 1e-12) return null
  const t = ((a.x - p.x) * sy - (a.y - p.y) * sx) / den
  const u = ((a.x - p.x) * ry - (a.y - p.y) * rx) / den
  return { t, u }
}

const E = 1e-6

/** Whether a wall is in the way of seeing from p to q. Sight grazing the very end of a wall gets past it. */
export function sightBlocked(p: Pt, q: Pt, walls: Seg[]): boolean {
  for (const w of walls) {
    const i = intersect(p, q, w.a, w.b)
    if (i && i.t > E && i.t < 1 - E && i.u > E && i.u < 1 - E) return true
  }
  return false
}

/** Whether a wall is in the way of moving from p to q. Unlike sight, touching a wall's end blocks too, so nothing squeezes diagonally through a corner. */
export function moveBlocked(p: Pt, q: Pt, walls: Seg[]): boolean {
  for (const w of walls) {
    const i = intersect(p, q, w.a, w.b)
    if (i && i.t > E && i.t <= 1 + E && i.u >= -E && i.u <= 1 + E) return true
  }
  return false
}

/** Whether a wall runs through a token's body (a Large creature can't stand astride a wall). */
function wallThrough(t: MapToken, walls: Seg[]): boolean {
  const m = 0.05
  const x0 = t.x + m
  const y0 = t.y + m
  const x1 = t.x + t.size - m
  const y1 = t.y + t.size - m
  const inside = (p: Pt): boolean => p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1
  const edges: Seg[] = [
    { a: { x: x0, y: y0 }, b: { x: x1, y: y0 } },
    { a: { x: x1, y: y0 }, b: { x: x1, y: y1 } },
    { a: { x: x1, y: y1 }, b: { x: x0, y: y1 } },
    { a: { x: x0, y: y1 }, b: { x: x0, y: y0 } }
  ]
  return walls.some((w) => inside(w.a) || inside(w.b) || edges.some((e) => moveBlocked(w.a, w.b, [e])))
}

/**
 * Whether a token can walk from where it stands to `to` without going
 * through a wall or a closed door: the straight way if it's clear, else any
 * way round, square by square (diagonals included). Other tokens don't block
 * the way, only the square it ends on (see canStand).
 */
export function canReach(map: BattleMap, from: MapToken, to: Pt): boolean {
  const walls = blockingWalls(map, 'move')
  if (walls.length === 0) return true
  const size = from.size
  const centre = (x: number, y: number): Pt => ({ x: x + size / 2, y: y + size / 2 })
  // The way round has to stay near the map (past its walls, anywhere's reachable anyway).
  const mb = mapBounds(map, 6)
  const b = { x0: Math.min(mb.x0, from.x, to.x) - 1, y0: Math.min(mb.y0, from.y, to.y) - 1, x1: Math.max(mb.x1, from.x + size, to.x + size) + 1, y1: Math.max(mb.y1, from.y + size, to.y + size) + 1 }
  const fits = (x: number, y: number): boolean => x >= b.x0 && y >= b.y0 && x + size <= b.x1 && y + size <= b.y1 && (size === 1 || !wallThrough({ x, y, size }, walls))
  if (!fits(to.x, to.y)) return false
  if (!moveBlocked(centre(from.x, from.y), centre(to.x, to.y), walls) && size === 1) return true
  const width = b.x1 - b.x0
  const key = (x: number, y: number): number => (y - b.y0) * width + (x - b.x0)
  const seen = new Uint8Array(width * (b.y1 - b.y0))
  const queue: Array<[number, number]> = [[from.x, from.y]]
  seen[key(from.x, from.y)] = 1
  while (queue.length) {
    const [x, y] = queue.shift()!
    if (x === to.x && y === to.y) return true
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const nx = x + dx
        const ny = y + dy
        if ((!dx && !dy) || !fits(nx, ny) || seen[key(nx, ny)]) continue
        if (moveBlocked(centre(x, y), centre(nx, ny), walls)) continue
        seen[key(nx, ny)] = 1
        queue.push([nx, ny])
      }
  }
  return false
}

function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = dx * dx + dy * dy
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/**
 * A token being dragged from one point to another (its centre), stopped by
 * walls: it moves in small steps, and where a wall is in the way it slides
 * along it rather than passing through. A token already pressed into a wall
 * (put there by the DM) can still move away from it, but not across it.
 */
export function slideMove(walls: Seg[], size: number, from: Pt, to: Pt): Pt {
  if (walls.length === 0) return to
  const r = Math.max(0.3, size / 2 - 0.12)
  const clear = (p: Pt): boolean => walls.every((w) => distToSeg(p, w.a, w.b) >= r)
  const ok = (a: Pt, b: Pt): boolean => !moveBlocked(a, b, walls) && (clear(b) || !clear(a))
  const dist = Math.hypot(to.x - from.x, to.y - from.y)
  const steps = Math.max(1, Math.ceil(dist / 0.1))
  const sx = (to.x - from.x) / steps
  const sy = (to.y - from.y) / steps
  let cur = from
  let blocked = false
  for (let i = 0; i < steps; i++) {
    const both = { x: cur.x + sx, y: cur.y + sy }
    const alongX = { x: cur.x + sx, y: cur.y }
    const alongY = { x: cur.x, y: cur.y + sy }
    if (ok(cur, both)) cur = both
    else {
      blocked = true
      if (sx && ok(cur, alongX)) cur = alongX
      else if (sy && ok(cur, alongY)) cur = alongY
    }
  }
  return blocked ? cur : to
}

/**
 * Everything visible from `o`: a polygon of the area its sight reaches
 * before hitting a wall or the map's edge (a ray cast at, and just either
 * side of, every wall end).
 */
export function visibilityPolygon(o: Pt, walls: Seg[], b: Bounds): Pt[] {
  const origin = { x: Math.max(b.x0 + 0.001, Math.min(b.x1 - 0.001, o.x)), y: Math.max(b.y0 + 0.001, Math.min(b.y1 - 0.001, o.y)) }
  const border: Seg[] = [
    { a: { x: b.x0, y: b.y0 }, b: { x: b.x1, y: b.y0 } },
    { a: { x: b.x1, y: b.y0 }, b: { x: b.x1, y: b.y1 } },
    { a: { x: b.x1, y: b.y1 }, b: { x: b.x0, y: b.y1 } },
    { a: { x: b.x0, y: b.y1 }, b: { x: b.x0, y: b.y0 } }
  ]
  const segs = [...walls, ...border]
  const angles: number[] = []
  const seen = new Set<string>()
  for (const s of segs)
    for (const p of [s.a, s.b]) {
      const k = `${p.x},${p.y}`
      if (seen.has(k)) continue
      seen.add(k)
      const a = Math.atan2(p.y - origin.y, p.x - origin.x)
      angles.push(a - 1e-4, a, a + 1e-4)
    }
  angles.sort((a, b) => a - b)
  const pts: Pt[] = []
  for (const a of angles) {
    const q = { x: origin.x + Math.cos(a), y: origin.y + Math.sin(a) }
    let best = Infinity
    for (const s of segs) {
      const i = intersect(origin, q, s.a, s.b)
      if (i && i.t > 0 && i.u >= -1e-9 && i.u <= 1 + 1e-9 && i.t < best) best = i.t
    }
    if (best < Infinity) pts.push({ x: origin.x + (q.x - origin.x) * best, y: origin.y + (q.y - origin.y) * best })
  }
  return pts
}

/** Marks every square whose centre lies inside the polygon (and passes `keep`), row by row. */
export function cellsInPolygon(poly: Pt[], out: Region, keep?: (x: number, y: number) => boolean): void {
  const n = poly.length
  if (n < 3) return
  const { x0: bx0, y0: by0, x1: bx1, y1: by1 } = out.b
  const width = bx1 - bx0
  for (let y = by0; y < by1; y++) {
    const cy = y + 0.5
    const xs: number[] = []
    for (let i = 0; i < n; i++) {
      const a = poly[i]
      const b = poly[(i + 1) % n]
      if (a.y > cy !== b.y > cy) xs.push(a.x + ((cy - a.y) * (b.x - a.x)) / (b.y - a.y))
    }
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(bx0, Math.ceil(xs[k] - 0.5))
      const x1 = Math.min(bx1 - 1, Math.floor(xs[k + 1] - 0.5))
      for (let x = x0; x <= x1; x++) if (!keep || keep(x, y)) out.cells[(y - by0) * width + (x - bx0)] = 1
    }
  }
}

/** The map's lights that are on, and those carried by tokens (at each token's centre); tokens in `skip` (hidden, under fog) left out. */
export function lightsOf(map: Pick<BattleMap, 'lights' | 'tokens'>, skip: ReadonlySet<string> = new Set()): LightSource[] {
  const placed = map.lights.filter((l) => !l.off).map((l) => ({ x: l.x, y: l.y, bright: l.bright, dim: l.dim }))
  const carried = Object.entries(map.tokens)
    .filter(([id, t]) => t.light && !skip.has(id))
    .map(([id, t]) => ({ x: t.x + t.size / 2, y: t.y + t.size / 2, bright: t.light!.bright, dim: t.light!.dim, id }))
  return [...placed, ...carried]
}

/** How far sight is worked out on this map (see mapBounds). */
export function sightBounds(map: BattleMap): Bounds {
  return mapBounds(map, SIGHT_PAD)
}

/** Squares lit by at least dim light (every square, unless the map is dark). */
export function litCells(map: BattleMap, lights: LightSource[], b: Bounds = sightBounds(map)): Region {
  const out = emptyRegion(b)
  if (map.ambient !== 'dark') {
    out.cells.fill(1)
    return out
  }
  const walls = blockingWalls(map)
  for (const l of lights) {
    const r = (l.bright + l.dim) / map.feetPerCell
    if (r <= 0) continue
    cellsInPolygon(visibilityPolygon(l, walls, b), out, (x, y) => Math.hypot(x + 0.5 - l.x, y + 0.5 - l.y) <= r)
  }
  return out
}

/** The squares these sources can see: in their line of sight, and lit or within their darkvision. */
export function visibleCells(map: BattleMap, sources: VisionSource[], lights: LightSource[]): Region {
  const b = sightBounds(map)
  const out = emptyRegion(b)
  const walls = blockingWalls(map)
  const lit = litCells(map, lights, b)
  for (const s of sources) {
    const dv = s.darkvision / map.feetPerCell
    cellsInPolygon(visibilityPolygon(s, walls, b), out, (x, y) => inRegion(lit, x, y) || (dv > 0 && Math.hypot(x + 0.5 - s.x, y + 0.5 - s.y) <= dv))
  }
  return out
}

/** Whether any square a token covers (even partly, mid-drag) is in the region. */
export function tokenSeen(t: MapToken, r: Region): boolean {
  for (let x = Math.floor(t.x); x < Math.ceil(t.x + t.size); x++) for (let y = Math.floor(t.y); y < Math.ceil(t.y + t.size); y++) if (inRegion(r, x, y)) return true
  return false
}

const isParty = (c: Combatant): boolean => c.kind === 'player' || (c.kind === 'vehicle' && !!c.party)

/**
 * Who a player sees through: with shared vision (the default) every party
 * token on the map, else just their own character's. `userId` null: the
 * whole party.
 */
export function viewerSources(map: Pick<BattleMap, 'tokens' | 'sharedVision'>, combatants: Combatant[], userId: string | null): VisionSource[] {
  const shared = map.sharedVision !== false || userId === null
  return combatants
    .filter((c) => (shared ? isParty(c) : c.kind === 'player' && c.userId === userId) && map.tokens[c.id])
    .map((c) => {
      const t = map.tokens[c.id]
      return { x: t.x + t.size / 2, y: t.y + t.size / 2, darkvision: c.darkvision ?? 0, id: c.id }
    })
}

/** Which explored record a player's view uses: the party's together, or their own. */
export function viewerKey(map: Pick<BattleMap, 'sharedVision'>, userId: string): string {
  return map.sharedVision !== false ? 'party' : `user:${userId}`
}

/**
 * Explored squares, read from their compact form: rows ("y:") of runs
 * ("x+count"), separated by semicolons. Anything else reads as nothing.
 */
export function decodeExplored(code: string | undefined | null): Map<number, Set<number>> {
  const rows = new Map<number, Set<number>>()
  if (!code) return rows
  for (const part of code.split(';')) {
    const [ys, runs] = part.split(':')
    const y = Number(ys)
    if (!Number.isInteger(y) || !runs) continue
    for (const run of runs.split(',')) {
      const [xs, ns] = run.split('+')
      const x = Number(xs)
      const n = Number(ns)
      if (!Number.isInteger(x) || !Number.isInteger(n) || n < 1 || n > 10000) continue
      let row = rows.get(y)
      if (!row) rows.set(y, (row = new Set()))
      for (let i = 0; i < n; i++) row.add(x + i)
    }
  }
  return rows
}

function encodeExplored(rows: Map<number, Set<number>>): string {
  return [...rows.keys()]
    .sort((a, b) => a - b)
    .map((y) => {
      const xs = [...rows.get(y)!].sort((a, b) => a - b)
      const runs: string[] = []
      for (let i = 0; i < xs.length; ) {
        let j = i
        while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++
        runs.push(`${xs[i]}+${j - i + 1}`)
        i = j + 1
      }
      return `${y}:${runs.join(',')}`
    })
    .join(';')
}

/** The explored record with a region's squares added; the same string when nothing new was seen. */
export function addExplored(code: string | undefined, r: Region): string {
  const rows = decodeExplored(code)
  let changed = code === undefined
  const width = r.b.x1 - r.b.x0
  for (let i = 0; i < r.cells.length; i++) {
    if (!r.cells[i]) continue
    const x = r.b.x0 + (i % width)
    const y = r.b.y0 + Math.floor(i / width)
    let row = rows.get(y)
    if (!row) rows.set(y, (row = new Set()))
    if (!row.has(x)) {
      row.add(x)
      changed = true
    }
  }
  return changed ? encodeExplored(rows) : code!
}

/** The nearest wall to a point (in squares), within `within`, for picking one to change. */
export function wallAt<W extends Seg>(walls: W[], p: Pt, within = 0.3): W | null {
  let best: W | null = null
  let bestD = within
  for (const w of walls) {
    const dx = w.b.x - w.a.x
    const dy = w.b.y - w.a.y
    const len = dx * dx + dy * dy
    const t = len ? Math.max(0, Math.min(1, ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / len)) : 0
    const d = Math.hypot(p.x - (w.a.x + t * dx), p.y - (w.a.y + t * dy))
    if (d <= bestD) {
      best = w
      bestD = d
    }
  }
  return best
}
