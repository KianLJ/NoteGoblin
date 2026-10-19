// The Combat tab's battle map: a grid (optionally over an uploaded map
// image), where each initiative combatant stands as a token, spell area
// templates, and fog the DM reveals. Pure data and math — the renderer
// draws it (features/combat/BattleMapView.tsx).
import type { Combatant } from './encounter'

export interface MapToken {
  /** The top-left square it covers. */
  x: number
  y: number
  /** Squares across: 1 for Medium, 2 Large, 3 Huge, 4 Gargantuan. */
  size: number
  /** Locked in place: can't be dragged until unlocked. */
  locked?: boolean
}

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
  cols: number
  rows: number
  feetPerCell: number
  /** An uploaded map image (a data URL), stretched over the grid; null: a plain grid. */
  image: string | null
  /** Combatant id → where its token stands. */
  tokens: Record<string, MapToken>
  /** Fog hidden from players, drawn and cut in order; the DM sees it dimmed. */
  fog: FogShape[]
  templates: MapTemplate[]
}

export function emptyBattleMap(): BattleMap {
  return { cols: 24, rows: 16, feetPerCell: 5, image: null, tokens: {}, fog: [], templates: [] }
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

/** Whether a token can stand here: on the map and not on top of another token (`ignore`: the token being moved). */
export function canStand(map: BattleMap, token: MapToken, ignore?: string): boolean {
  if (token.x < 0 || token.y < 0 || token.x + token.size > map.cols || token.y + token.size > map.rows) return false
  return Object.entries(map.tokens).every(([id, t]) => id === ignore || !overlaps(t, token))
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

/** Fog over the whole map. */
export function fogEverything(map: BattleMap): FogShape {
  return { id: `all-${map.fog.length}`, op: 'add', kind: 'rect', x: 0, y: 0, w: map.cols, h: map.rows }
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
