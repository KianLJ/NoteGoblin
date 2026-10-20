// Drawing walls on the battle map: where a point snaps to (another wall's
// end, a spot along a wall, or the grid's corners, centres and edge
// middles), whole rooms at once, and doors set into a wall — the stretch
// they cover is cut out of it. Squares are the unit throughout.
import { snapHalf, type MapWall, type Pt } from './battleMap'

/** What a point snapped to: a wall's end, somewhere along a wall, the grid, or nothing (placed freely). */
export type SnapKind = 'end' | 'wall' | 'grid' | 'free'

/** The nearest point on a wall to p, as how far along it (0 at a, 1 at b) and the point itself. */
export function projectOnWall(w: { a: Pt; b: Pt }, p: Pt): { t: number; at: Pt; dist: number } {
  const dx = w.b.x - w.a.x
  const dy = w.b.y - w.a.y
  const len = dx * dx + dy * dy
  const t = len ? Math.max(0, Math.min(1, ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / len)) : 0
  const at = { x: w.a.x + t * dx, y: w.a.y + t * dy }
  return { t, at, dist: Math.hypot(p.x - at.x, p.y - at.y) }
}

/** A distance along a wall rounded to half squares. */
function snapAlong(w: { a: Pt; b: Pt }, t: number): number {
  const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y)
  if (!len) return t
  return Math.max(0, Math.min(1, (Math.round(t * len * 2) / 2) / len))
}

/**
 * Where a wall corner placed at p goes: onto another wall's end within
 * `radius` squares, else onto a wall it's touching (at a half-square step
 * along it, when snapping), else — when snapping — the nearest square
 * corner, centre or edge middle.
 */
export function snapWallPoint(walls: MapWall[], p: Pt, snap: boolean, radius: number, ignore?: string): { at: Pt; kind: SnapKind } {
  let best: Pt | null = null
  let bestD = radius
  for (const w of walls) {
    if (w.id === ignore) continue
    for (const e of [w.a, w.b]) {
      const d = Math.hypot(p.x - e.x, p.y - e.y)
      if (d <= bestD) {
        best = e
        bestD = d
      }
    }
  }
  if (best) return { at: { x: best.x, y: best.y }, kind: 'end' }
  let onWall: { at: Pt; dist: number } | null = null
  for (const w of walls) {
    if (w.id === ignore) continue
    const pr = projectOnWall(w, p)
    if (pr.dist <= radius && (!onWall || pr.dist < onWall.dist)) {
      const t = snap ? snapAlong(w, pr.t) : pr.t
      onWall = { at: { x: w.a.x + t * (w.b.x - w.a.x), y: w.a.y + t * (w.b.y - w.a.y) }, dist: pr.dist }
    }
  }
  if (onWall) return { at: onWall.at, kind: 'wall' }
  return snap ? { at: snapHalf(p), kind: 'grid' } : { at: p, kind: 'free' }
}

/** The four walls of a rectangular room between two opposite corners, joined at the corners. */
export function roomWalls(a: Pt, b: Pt, newId: () => string): MapWall[] {
  const x0 = Math.min(a.x, b.x)
  const x1 = Math.max(a.x, b.x)
  const y0 = Math.min(a.y, b.y)
  const y1 = Math.max(a.y, b.y)
  const c = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 }
  ]
  return c.map((p, i) => ({ id: newId(), a: p, b: c[(i + 1) % 4] }))
}

/** A door or window (anything set into a wall that opens). */
export const isOpening = (w: Pick<MapWall, 'door' | 'window'>): boolean => !!w.door || !!w.window

/** The wall (not a door or window) nearest p, within `radius` squares. */
export function wallUnder(walls: MapWall[], p: Pt, radius: number): MapWall | null {
  let best: MapWall | null = null
  let bestD = radius
  for (const w of walls) {
    if (isOpening(w)) continue
    const d = projectOnWall(w, p).dist
    if (d <= bestD) {
      best = w
      bestD = d
    }
  }
  return best
}

/**
 * Where a door set into a wall would go: from where the drag started to
 * where it is now, both along the wall (half-square steps when snapping);
 * a click with no drag makes a door one square wide, centred there.
 */
export function doorSpan(w: MapWall, from: Pt, to: Pt, snap: boolean): { t0: number; t1: number } {
  const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1
  const along = (t: number): Pt => ({ x: w.a.x + t * (w.b.x - w.a.x), y: w.a.y + t * (w.b.y - w.a.y) })
  // Snapping lines doors up with the grid's own squares (not with where the wall happens to start).
  const gridT = (t: number): number => projectOnWall(w, snapHalf(along(t))).t
  let t0 = projectOnWall(w, from).t
  let t1 = projectOnWall(w, to).t
  if (Math.abs(t1 - t0) * len < 0.25) {
    // A click: one square wide, centred on the middle of the square clicked (on a wall along a grid line), kept inside the wall.
    const half = Math.min(0.5, len / 2) / len
    let mid = t0
    if (snap) {
      const m = along(t0)
      if (w.a.y === w.b.y) m.x = Math.floor(m.x) + 0.5
      else if (w.a.x === w.b.x) m.y = Math.floor(m.y) + 0.5
      mid = projectOnWall(w, m).t
    }
    mid = Math.max(half, Math.min(1 - half, mid))
    return { t0: mid - half, t1: mid + half }
  }
  if (snap) {
    t0 = gridT(t0)
    t1 = gridT(t1)
  }
  return t0 < t1 ? { t0, t1 } : { t0: t1, t1: t0 }
}

/** A door (or window) set into a wall: the wall split round it (pieces too short to matter dropped), the door in the gap, closed. */
export function insertDoor(walls: MapWall[], wallId: string, t0: number, t1: number, newId: () => string, kind: 'door' | 'window' = 'door'): { walls: MapWall[]; door: MapWall } {
  const w = walls.find((x) => x.id === wallId)
  // Rounded, so the door's ends meet the wall pieces exactly.
  const r = (v: number): number => Math.round(v * 10000) / 10000
  const at = (t: number): Pt => ({ x: r(w!.a.x + t * (w!.b.x - w!.a.x)), y: r(w!.a.y + t * (w!.b.y - w!.a.y)) })
  const door: MapWall = { id: newId(), a: at(t0), b: at(t1), ...(kind === 'window' ? { window: true } : { door: true }) }
  if (!w) return { walls, door }
  const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y)
  const keep = { ...(w.locked ? { locked: true } : {}) }
  const pieces: MapWall[] = []
  if (t0 * len > 0.05) pieces.push({ id: w.id, a: w.a, b: door.a, ...keep })
  pieces.push(door)
  if ((1 - t1) * len > 0.05) pieces.push({ id: pieces.length > 1 ? newId() : w.id, a: door.b, b: w.b, ...keep })
  const i = walls.indexOf(w)
  return { walls: [...walls.slice(0, i), ...pieces, ...walls.slice(i + 1)], door }
}

/**
 * New walls with any stretch that's already walled cut out — so two rooms
 * sharing a wall have it once, and a door already in that wall stays a door.
 * Only walls lying along the same line count; pieces too short to matter are dropped.
 */
export function withoutOverlaps(existing: MapWall[], added: MapWall[], newId: () => string): MapWall[] {
  const out: MapWall[] = []
  for (const w of added) {
    const dx = w.b.x - w.a.x
    const dy = w.b.y - w.a.y
    const len = Math.hypot(dx, dy)
    if (len < 0.05) continue
    // The parts of this wall (0 to 1 along it) another wall already covers.
    const covered: Array<[number, number]> = []
    for (const e of [...existing, ...out]) {
      const ex = e.b.x - e.a.x
      const ey = e.b.y - e.a.y
      if (Math.abs(dx * ey - dy * ex) > 1e-6 * len * Math.hypot(ex, ey)) continue
      if (Math.abs((e.a.x - w.a.x) * dy - (e.a.y - w.a.y) * dx) / len > 1e-4) continue
      const t = (p: Pt): number => ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / (len * len)
      const lo = Math.max(0, Math.min(t(e.a), t(e.b)))
      const hi = Math.min(1, Math.max(t(e.a), t(e.b)))
      if (hi > lo) covered.push([lo, hi])
    }
    covered.sort((p, q) => p[0] - q[0])
    let from = 0
    const pieces: Array<[number, number]> = []
    for (const [lo, hi] of covered) {
      if (lo > from) pieces.push([from, lo])
      from = Math.max(from, hi)
    }
    if (from < 1) pieces.push([from, 1])
    const at = (t: number): Pt => ({ x: Math.round((w.a.x + t * dx) * 10000) / 10000, y: Math.round((w.a.y + t * dy) * 10000) / 10000 })
    pieces
      .filter(([lo, hi]) => (hi - lo) * len > 0.05)
      .forEach(([lo, hi], i) => out.push({ ...w, id: i === 0 ? w.id : newId(), a: at(lo), b: at(hi) }))
  }
  return out
}

/**
 * Where a room's corner goes while it's dragged: onto another wall's end if
 * it's close, else each of its x and y lines up with a nearby wall corner on
 * its own (so the room's edges sit flush with the rooms beside it), the
 * grid (snapping) or the pointer filling in the rest.
 */
export function snapRoomCorner(walls: MapWall[], p: Pt, snap: boolean, radius: number): { at: Pt; kind: SnapKind } {
  const point = snapWallPoint(walls, p, snap, radius)
  if (point.kind === 'end') return point
  const base = snap ? snapHalf(p) : p
  const ends = walls.flatMap((w) => [w.a, w.b])
  const nearest = (axis: 'x' | 'y'): number | null => {
    let best: number | null = null
    let bestD = radius
    for (const e of ends) {
      const d = Math.abs(e[axis] - p[axis])
      if (d <= bestD) {
        best = e[axis]
        bestD = d
      }
    }
    return best
  }
  const x = nearest('x')
  const y = nearest('y')
  if (x === null && y === null) return point
  return { at: { x: x ?? base.x, y: y ?? base.y }, kind: 'end' }
}
