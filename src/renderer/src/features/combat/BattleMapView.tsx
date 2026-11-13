// The battle map itself: an endless SVG grid over the map images the DM has
// placed, a token per combatant, spell templates and fog. Pan by dragging empty map
// with the Move tool (or the middle mouse button), zoom with the wheel.
// Shapes are sized by dragging as they're placed; a placed one, selected
// with Move, can be dragged, resized from its handle, or sized exactly.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { VehicleArc } from '@shared/content/schema'
import { canStand, normalizeFacing, tokenCentre, tokenH, tokenW, turnToken, gridDistanceFt, mapBounds, snapHalf, templateLabel, type BattleMap, type Bounds, type MapImage, type MapLight, type MapTemplate, type MapToken, type MapWall, type TemplateKind } from '@shared/battleMap'
import type { Combatant } from '@shared/encounter'
import { isTrackpadWheel } from '@shared/canvasLayout'
import { blockingWalls, canReach, decodeExplored, slideMove, lightsOf, tokenSeen, visibleCells, LIGHT_PRESETS, sightBounds, visibilityPolygon, segTouchesBox, wallAt, type LightSource, type VisionSource } from '@shared/vision'
import { doorSpan, insertDoor, isOpening, roomWalls, snapRoomCorner, snapWallPoint, wallUnder, withoutOverlaps, type SnapKind } from '@shared/walls'
import { XIcon } from '../../ui/icons'

export type MapTool = 'move' | 'ruler' | TemplateKind | 'walls' | 'light' | 'images' | 'props'
/** Walls tool: draw walls corner by corner, drag out a door, or pick one to change. */
export type WallDraw = 'wall' | 'room' | 'door' | 'window' | 'blocker' | 'select' | 'selectBlocker'

/** What a player sees from (or the DM previewing them): beyond it is dark, and squares seen before are dimmed. */
export interface Sight {
  sources: VisionSource[]
  explored: string | null
  lights: LightSource[]
}
const CELL = 50
export const TEMPLATE_DEFAULT: Record<TemplateKind, number> = { cone: 15, sphere: 20, line: 30, cube: 10 }

interface Props {
  map: BattleMap
  onChange: (next: BattleMap) => void
  combatants: Combatant[]
  turnId: string | null
  selectedId: string | null
  onSelect: (id: string | null) => void
  tool: MapTool
  /** What a click with the Lights tool places (picked along the top bar). */
  newLight?: { name: string; bright: number; dim: number }
  /** Snap shapes to square corners and centres (and sizes to whole squares). */
  snap: boolean
  onHint: (text: string) => void
  /**
   * A player's view: fog is solid, shapes and fog can't be changed, and only
   * the tokens `canDrag` allows can be moved — the move goes to `onMoveToken`
   * (the DM's app has the final say) instead of `onChange`.
   */
  viewer?: { canDrag: (combatantId: string) => boolean; onMoveToken: (combatantId: string, x: number, y: number) => void; onFaceToken?: (combatantId: string, facing: number) => void }
  wallDraw?: WallDraw
  /** Darkness beyond what can be seen (a player, or the DM viewing as one); null or left out: everything shows. */
  sight?: Sight | null
  /** Set to a function giving the middle of what's on screen (in squares), for placing a new image there. */
  centreRef?: React.MutableRefObject<(() => Pt) | null>
  /** The image picked with the Images tool (its options show in the side of the map). */
  selectedImage?: string | null
  onSelectImage?: (id: string | null) => void
  /** Tokens someone else is dragging right now, where they are (top-left, in squares). */
  remoteDrags?: Record<string, Pt>
  /** A token you're dragging, as it moves (x null: let go) — for showing it to everyone else. */
  onLiveDrag?: (id: string, x: number | null, y: number | null) => void
  /** Aiming a vehicle's weapon: its reach and arcs are drawn round the shooter, and clicking a token picks the target. */
  aim?: { from: string; label: string; arcs?: VehicleArc[]; reach: number | null; onPick: (targetId: string) => void; onCancel: () => void } | null
  /** The DM's settings for the selected token (hide, lock, facing, size), shown beside it. */
  tokenPopup?: (id: string) => ReactNode
}

type Pt = { x: number; y: number }

type Drag =
  /** Dragging a token: `free` is where it is under the pointer, `at` the square it lands on. */
  | { kind: 'token'; id: string; from: MapToken; at: MapToken; free: Pt; stopped?: boolean }
  | { kind: 'pan'; x: number; y: number; px: number; py: number }
  | { kind: 'measure'; from: Pt; to: Pt }
  /** Placing a new shape, or resizing a placed one from its handle (`existing`). */
  | { kind: 'shape'; t: MapTemplate; existing: boolean; moved: boolean }
  | { kind: 'shapeMove'; t: MapTemplate; grab: Pt; at: Pt }
  | { kind: 'start'; index: number; at: Pt }
  /** Dragging out a new door, or a wall's end to a new spot. */
  /** A door: set into a wall (`wallId`, from where the drag started to where it is, along it), or standing free. */
  | { kind: 'door'; a: Pt; b: Pt; wallId: string | null; window: boolean }
  /** A room: four walls between two corners. */
  | { kind: 'room'; a: Pt; b: Pt }
  /** A box dragged out with Pick: every wall it touches is picked. */
  | { kind: 'marquee'; a: Pt; b: Pt; additive: boolean }
  | { kind: 'wallEnd'; id: string; end: 'a' | 'b'; at: Pt }
  | { kind: 'light'; id: string; grab: Pt; at: Pt }
  | { kind: 'imageMove'; id: string; grab: Pt; at: Pt }
  | { kind: 'imageSize'; id: string; at: Pt }
  /** Turning a token by its facing handle. */
  /** `t`: the token as turned so far (a long one's lying down or standing up depends on the way it went). */
  | { kind: 'rotate'; id: string; facing: number; t: MapToken }

/** A shape's size from how far it's been dragged: whole squares when snapping, else whole feet (at least one). */
function sizeFromDrag(kind: TemplateKind, origin: Pt, to: Pt, feetPerCell: number, snap: boolean): number {
  const dx = to.x - origin.x
  const dy = to.y - origin.y
  const squares = kind === 'cube' ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.hypot(dx, dy)
  return snap ? Math.max(1, Math.round(squares)) * feetPerCell : Math.max(1, Math.round(squares * feetPerCell))
}

/** Where a shape's resize handle sits: the far end of a cone or line, the edge of a sphere, the far corner of a cube. */
function handlePoint(t: MapTemplate, feetPerCell: number): Pt {
  const L = t.sizeFt / feetPerCell
  if (t.kind === 'cube') {
    const sx = Math.sign(t.toward.x - t.origin.x) || 1
    const sy = Math.sign(t.toward.y - t.origin.y) || 1
    return { x: t.origin.x + sx * L, y: t.origin.y + sy * L }
  }
  const ang = Math.atan2(t.toward.y - t.origin.y, t.toward.x - t.origin.x)
  return { x: t.origin.x + Math.cos(ang) * L, y: t.origin.y + Math.sin(ang) * L }
}

export function BattleMapView({ map, onChange, combatants, turnId, selectedId, onSelect, tool, snap, onHint, viewer, wallDraw = 'wall', sight, centreRef, selectedImage = null, onSelectImage, remoteDrags = NO_DRAGS, onLiveDrag, aim = null, tokenPopup, newLight = LIGHT_PRESETS[1] }: Props): JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null)
  const [view, setView] = useState({ x: 40, y: 70, zoom: 1 })
  const [size, setSize] = useState({ w: 800, h: 600 })
  const imagePicked = map.images.find((i) => i.id === selectedImage) ?? null
  // Props are map images too: the Props tool picks, drags and sizes them like the Map images tool.
  const imageTool = tool === 'images' || tool === 'props'
  if (centreRef) centreRef.current = () => ({ x: (size.w / 2 - view.x) / (CELL * view.zoom), y: (size.h / 2 - view.y) / (CELL * view.zoom) })
  const [drag, setDrag] = useState<Drag | null>(null)
  const [selectedShape, setSelectedShape] = useState<string | null>(null)
  const solidWalls = useMemo(() => blockingWalls(map, 'move'), [map.walls])
  // Where the pointer is while drawing a wall (for the line to it).
  const [hover, setHover] = useState<Pt | null>(null)
  const at = (p: Pt): Pt => (snap ? snapHalf(p) : p)
  // Wall corners snap to another wall's end, onto a wall, or (snapping) the grid's corners, centres and edge middles — within a few pixels however far it's zoomed.
  const snapR = 14 / (CELL * view.zoom)
  const wallPt = (p: Pt, ignore?: string): { at: Pt; kind: SnapKind } => snapWallPoint(map.walls, p, snap, snapR, ignore)
  // Where a wall corner would go under the pointer (with the Walls tool), shown as a marker.
  const [wallHover, setWallHover] = useState<{ at: Pt; kind: SnapKind; door?: { a: Pt; b: Pt } } | null>(null)
  // A wall being drawn corner by corner: the corners so far.
  const [wallChain, setWallChain] = useState<Pt[] | null>(null)
  const [selectedWall, setSelectedWall] = useState<string | null>(null)
  // More than one wall picked (Ctrl-click, or a box dragged round them): they're deleted together.
  const [pickedWalls, setPickedWalls] = useState<string[]>([])
  const picking = wallDraw === 'select' || wallDraw === 'selectBlocker'
  // Picking blockers (from the Props tool) only picks blockers.
  const pickable = wallDraw === 'selectBlocker' ? map.walls.filter((w) => w.blocker) : map.walls
  const [selectedLight, setSelectedLight] = useState<string | null>(null)
  const wallPicked = map.walls.find((w) => w.id === selectedWall) ?? null
  const lightPicked = map.lights.find((l) => l.id === selectedLight) ?? null

  // Switching tools drops a half-drawn wall, and whatever was picked.
  useEffect(() => {
    setWallChain(null)
    if (tool !== 'walls' || !picking) {
      setSelectedWall(null)
      setPickedWalls([])
    }
    if (tool !== 'light') setSelectedLight(null)
  }, [tool, wallDraw])

  // Enter or Escape stops drawing a wall.
  useEffect(() => {
    if (!wallChain) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        setWallChain(null)
        onHint('Wall done. Click to start another.')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallChain])

  const fitted = useRef(false)
  const shape = map.templates.find((t) => t.id === selectedShape) ?? null

  /** Zoom and centre so everything on the map fits the view. */
  function fit(): void {
    const el = svgRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return
    const b = mapBounds(map)
    const w = (b.x1 - b.x0) * CELL
    const h = (b.y1 - b.y0) * CELL
    const zoom = Math.max(0.1, Math.min(2, Math.min((r.width - 120) / w, (r.height - 90) / h)))
    setView({ zoom, x: (r.width - w * zoom) / 2 - b.x0 * CELL * zoom, y: 50 + (r.height - 50 - h * zoom) / 2 - b.y0 * CELL * zoom })
  }
  // Fit when the map is first shown; a window resize re-fits until the DM pans or zooms.
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    fit()
    const observer = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setSize({ w: r.width, h: r.height })
      if (!fitted.current) fit()
    })
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A shape undone away (or deleted) is no longer selected.
  useEffect(() => {
    if (selectedShape && !shape) setSelectedShape(null)
  }, [selectedShape, shape])

  // Delete or Backspace removes the selected shape, wall, light or image — unless it's locked.
  useEffect(() => {
    if (!shape && !wallPicked && !lightPicked && !imagePicked && pickedWalls.length === 0) return
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (pickedWalls.length > 0) {
        const gone = new Set(pickedWalls.filter((id) => !map.walls.find((w) => w.id === id)?.locked))
        onChange({ ...map, walls: map.walls.filter((w) => !gone.has(w.id)) })
        setPickedWalls(pickedWalls.filter((id) => !gone.has(id)))
        onHint(gone.size < pickedWalls.length ? 'Removed them, except the locked ones.' : `Removed ${gone.size}.`)
      } else if (shape && !shape.locked) removeShape(shape.id)
      else if (wallPicked && !wallPicked.locked) removeWall(wallPicked.id)
      else if (lightPicked && !lightPicked.locked) removeLight(lightPicked.id)
      else if (imagePicked && !imagePicked.locked) removeImage(imagePicked.id)
      else onHint('It’s locked. Unlock it first.')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape, wallPicked, lightPicked, imagePicked, pickedWalls, map])

  const updateImage = (i: MapImage): void => onChange({ ...map, images: map.images.map((x) => (x.id === i.id ? i : x)) })
  const removeImage = (id: string): void => {
    onChange({ ...map, images: map.images.filter((i) => i.id !== id) })
    onSelectImage?.(null)
  }

  const updateWall = (w: MapWall): void => onChange({ ...map, walls: map.walls.map((x) => (x.id === w.id ? w : x)) })
  const removeWall = (id: string): void => {
    onChange({ ...map, walls: map.walls.filter((w) => w.id !== id) })
    setSelectedWall(null)
  }
  const updateLight = (l: MapLight): void => onChange({ ...map, lights: map.lights.map((x) => (x.id === l.id ? l : x)) })
  const removeLight = (id: string): void => {
    onChange({ ...map, lights: map.lights.filter((l) => l.id !== id) })
    setSelectedLight(null)
  }

  const removeShape = (id: string): void => {
    onChange({ ...map, templates: map.templates.filter((t) => t.id !== id) })
    setSelectedShape(null)
  }
  const updateShape = (t: MapTemplate): void => onChange({ ...map, templates: map.templates.map((x) => (x.id === t.id ? t : x)) })

  const zoomBy = (factor: number): void => {
    fitted.current = true
    const r = svgRef.current!.getBoundingClientRect()
    const mx = r.width / 2
    const my = r.height / 2
    setView((v) => {
      const zoom = Math.max(0.2, Math.min(3, v.zoom * factor))
      return { zoom, x: mx - ((mx - v.x) * zoom) / v.zoom, y: my - ((my - v.y) * zoom) / v.zoom }
    })
  }

  /** Pans so the centre of the map (where the grid's starting point is) is in the middle of the view. */
  function centre(): void {
    fitted.current = true
    setView((v) => ({ ...v, x: size.w / 2, y: size.h / 2 }))
  }

  /** Turns a token (whose facing is shown) to face `facing` degrees. */
  function faceToken(id: string, facing: number): void {
    const t = map.tokens[id]
    if (!t || t.locked) return
    const f = normalizeFacing(facing)
    if (viewer) viewer.onFaceToken?.(id, f)
    else onChange({ ...map, tokens: { ...map.tokens, [id]: turnToken(t, f) } })
  }
  const canTurn = (id: string | null): id is string => !!id && map.tokens[id]?.facing !== undefined && !map.tokens[id]?.locked && (!viewer || (viewer.canDrag(id) && !!viewer.onFaceToken))

  // Q and E turn the selected token 45° (one with facing shown, that you're allowed to move).
  useEffect(() => {
    if (!canTurn(selectedId)) return
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement
      if (e.ctrlKey || e.metaKey || e.altKey || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) return
      const k = e.key.toLowerCase()
      if (k !== 'q' && k !== 'e') return
      const next = (map.tokens[selectedId]!.facing ?? 0) + (k === 'e' ? 45 : -45)
      faceToken(selectedId, next)
      onHint(`Facing ${compass(normalizeFacing(next))}.`)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, map, viewer])

  /** A pointer position in map squares (fractional). */
  function toMap(e: { clientX: number; clientY: number }): Pt {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left - view.x) / (CELL * view.zoom), y: (e.clientY - r.top - view.y) / (CELL * view.zoom) }
  }
  const cellOf = (p: Pt): Pt => ({ x: Math.floor(p.x), y: Math.floor(p.y) })

  function onPointerDown(e: React.PointerEvent): void {
    const p = toMap(e)
    const c = cellOf(p)
    const target = e.target as Element
    const tokenId = target.closest('[data-token]')?.getAttribute('data-token')
    const shapeId = target.closest('[data-template]')?.getAttribute('data-template')
    const handleId = target.closest('[data-handle]')?.getAttribute('data-handle')
    // Aiming: a token is the target; anywhere else (or another button) stops aiming.
    if (aim) {
      if (e.button === 0 && tokenId && tokenId !== aim.from) aim.onPick(tokenId)
      else if (e.button === 0) aim.onCancel()
      if (e.button === 0) return
    }
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    const rotateId = target.closest('[data-rotate]')?.getAttribute('data-rotate')
    if (rotateId && map.tokens[rotateId]) {
      if (map.tokens[rotateId].locked) onHint(viewer ? 'The DM has locked your token in place.' : 'This token is locked. Unlock it in the side panel to turn it.')
      else setDrag({ kind: 'rotate', id: rotateId, facing: map.tokens[rotateId].facing ?? 0, t: map.tokens[rotateId] })
      return
    }
    if (handleId && !viewer) {
      const t = map.templates.find((x) => x.id === handleId)
      if (t && !t.locked) setDrag({ kind: 'shape', t, existing: true, moved: false })
      return
    }
    // A door opens or closes with a click (the DM's; players ask the DM).
    const doorId = target.closest('[data-door]')?.getAttribute('data-door')
    if (doorId && tool === 'move' && !viewer && e.button === 0) {
      const d = map.walls.find((w) => w.id === doorId)
      if (d) {
        updateWall({ ...d, open: !d.open || undefined })
        onHint(d.open ? 'Door closed.' : 'Door opened.')
      }
      return
    }
    if (tool === 'walls' && !viewer && e.button === 0) {
      const endRef = target.closest('[data-wall-end]')?.getAttribute('data-wall-end')
      if (endRef) {
        const [id, end] = endRef.split('|') as [string, 'a' | 'b']
        const w = map.walls.find((x) => x.id === id)
        if (w && !w.locked) setDrag({ kind: 'wallEnd', id, end, at: w[end] })
        else if (w) onHint('This wall is locked. Unlock it to move it.')
        return
      }
      if (picking) {
        const w = wallAt(pickable, p, 0.4)
        const additive = e.ctrlKey || e.metaKey || e.shiftKey
        if (!w) {
          // Empty space: drag a box round the walls to pick.
          setDrag({ kind: 'marquee', a: p, b: p, additive })
          if (!additive) {
            setSelectedWall(null)
            setPickedWalls([])
          }
          return
        }
        if (additive) {
          const all = [...new Set([...pickedWalls, ...(selectedWall ? [selectedWall] : [])])]
          const next = all.includes(w.id) ? all.filter((id) => id !== w.id) : [...all, w.id]
          setPickedWalls(next.length > 1 ? next : [])
          setSelectedWall(next.length === 1 ? next[0] : null)
          onHint(`${next.length} picked. Delete removes them.`)
          return
        }
        setPickedWalls([])
        setSelectedWall(w.id)
        onHint('Drag its ends to move them. Delete removes it. Ctrl-click (or drag a box round them) to pick more.')
        return
      }
      if (wallDraw === 'door' || wallDraw === 'window') {
        // On a wall: the door (or window) is set into it. Anywhere else: one standing on its own.
        const win = wallDraw === 'window'
        const w = wallUnder(map.walls.filter((x) => !x.blocker), p, snapR)
        if (w) setDrag({ kind: 'door', a: p, b: p, wallId: w.id, window: win })
        else {
          const q = wallPt(p).at
          setDrag({ kind: 'door', a: q, b: q, wallId: null, window: win })
        }
        return
      }
      if (wallDraw === 'room') {
        const q = snapRoomCorner(map.walls, p, snap, snapR).at
        setDrag({ kind: 'room', a: q, b: q })
        return
      }
      const q = wallPt(p).at
      if (wallChain && e.detail >= 2) {
        setWallChain(null)
        onHint('Wall done. Click to start another.')
        return
      }
      if (wallChain) {
        const last = wallChain[wallChain.length - 1]
        if (Math.hypot(q.x - last.x, q.y - last.y) > 0.05) {
          // Blockers sit freely over walls; a wall is only cut where another wall already is.
          const piece = { id: crypto.randomUUID(), a: last, b: q }
          const added = wallDraw === 'blocker' ? [{ ...piece, blocker: true }] : withoutOverlaps(map.walls.filter((w) => !w.blocker), [piece], () => crypto.randomUUID())
          onChange({ ...map, walls: [...map.walls, ...added] })
          // Back at the first corner: the shape is closed, so that's the wall done.
          if (wallChain.length >= 2 && Math.hypot(q.x - wallChain[0].x, q.y - wallChain[0].y) < 0.01) {
            setWallChain(null)
            onHint('Closed. Click to start another wall.')
          } else setWallChain([...wallChain, q])
        }
        return
      }
      setWallChain([q])
      onHint('Click the next corner (click the first one again to close the shape). Double-click, Enter or Escape stops; Ctrl+Z takes back the last piece.')
      return
    }
    if (imageTool && !viewer && e.button === 0) {
      const sizeId = target.closest('[data-image-size]')?.getAttribute('data-image-size')
      const imageId = sizeId ?? target.closest('[data-image]')?.getAttribute('data-image')
      const img = imageId ? map.images.find((i) => i.id === imageId) : undefined
      onSelectImage?.(img?.id ?? null)
      if (!img) {
        onHint('Click an image to pick it, or add one from the bar above.')
        return
      }
      if (img.locked) onHint('This image is locked. Unlock it in its options to move it.')
      else if (sizeId) setDrag({ kind: 'imageSize', id: img.id, at: { x: img.x + img.w, y: img.y + img.h } })
      else {
        setDrag({ kind: 'imageMove', id: img.id, grab: p, at: p })
        onHint('Drag it to line it up with the grid; drag its corner to size it.')
      }
      return
    }
    if (tool === 'light' && !viewer && e.button === 0) {
      const lightId = target.closest('[data-light]')?.getAttribute('data-light')
      const l = lightId ? map.lights.find((x) => x.id === lightId) : undefined
      if (l) {
        setSelectedLight(l.id)
        if (l.locked) onHint('This light is locked. Unlock it to move it.')
        else setDrag({ kind: 'light', id: l.id, grab: p, at: p })
        return
      }
      const q = at(p)
      const light: MapLight = { id: crypto.randomUUID(), x: q.x, y: q.y, bright: newLight.bright, dim: newLight.dim }
      onChange({ ...map, lights: [...map.lights, light] })
      setSelectedLight(light.id)
      onHint(`${newLight.name} placed. Drag it to move it; its options change how far it reaches.`)
      return
    }
    if (e.button === 1 || (tool === 'move' && !tokenId && (!shapeId || viewer) && !target.closest('[data-start]'))) {
      setDrag({ kind: 'pan', x: e.clientX, y: e.clientY, px: view.x, py: view.y })
      if (e.button !== 1) {
        onSelect(null)
        setSelectedShape(null)
      }
      return
    }
    const startIndex = target.closest('[data-start]')?.getAttribute('data-start')
    if (tool === 'move' && startIndex != null && !viewer) {
      const i = Number(startIndex)
      setDrag({ kind: 'start', index: i, at: map.partyStarts[i] })
      onHint('Drag the start spot to where that party member should begin.')
      return
    }
    if (tool === 'move' && tokenId) {
      const t = map.tokens[tokenId]
      onSelect(tokenId)
      setSelectedShape(null)
      if (viewer && !viewer.canDrag(tokenId)) return
      if (t?.locked) onHint(viewer ? 'The DM has locked your token in place.' : 'This token is locked in place. Unlock it in the side panel to move it.')
      else if (t) setDrag({ kind: 'token', id: tokenId, from: t, at: t, free: { x: t.x, y: t.y } })
      return
    }
    if (tool === 'move' && shapeId) {
      const t = map.templates.find((x) => x.id === shapeId)
      if (t) {
        setSelectedShape(t.id)
        if (t.locked) onHint('This shape is locked. Unlock it in its options to change it.')
        else {
          setDrag({ kind: 'shapeMove', t, grab: p, at: p })
          onHint('Drag the shape to move it, its handle to resize or turn it. Delete removes it.')
        }
      }
      return
    }
    if (viewer && tool !== 'ruler') return
    if (tool === 'ruler') setDrag({ kind: 'measure', from: c, to: c })
    else if (tool === 'cone' || tool === 'sphere' || tool === 'line' || tool === 'cube') {
      // Starts from the nearest square corner or centre when snapping, else exactly where you pressed.
      const origin = at(p)
      setDrag({ kind: 'shape', t: { id: crypto.randomUUID(), kind: tool, origin, toward: { x: origin.x + 1, y: origin.y }, sizeFt: TEMPLATE_DEFAULT[tool] }, existing: false, moved: false })
      onHint('Drag to size it; let go to place it.')
    }
  }

  function onPointerMove(e: React.PointerEvent): void {
    if (!drag) return
    const p = toMap(e)
    const c = cellOf(p)
    if (drag.kind === 'pan') {
      fitted.current = true
      setView((v) => ({ ...v, x: drag.px + e.clientX - drag.x, y: drag.py + e.clientY - drag.y }))
    } else if (drag.kind === 'token') {
      // Walls stop it (it slides along them) — unless the DM holds Alt to put it anywhere.
      const half = { x: tokenW(drag.from) / 2, y: tokenH(drag.from) / 2 }
      const through = e.altKey && !viewer
      // A long token collides as its narrow side (so it still fits down a corridor).
      const centre = through ? p : slideMove(solidWalls, Math.min(tokenW(drag.from), tokenH(drag.from)), { x: drag.free.x + half.x, y: drag.free.y + half.y }, p)
      const free = { x: centre.x - half.x, y: centre.y - half.y }
      const at = { ...drag.at, x: Math.round(free.x), y: Math.round(free.y) }
      const stopped = Math.hypot(centre.x - p.x, centre.y - p.y) > 0.5
      if (at.x !== drag.at.x || at.y !== drag.at.y || stopped !== drag.stopped)
        onHint(`Moving ${gridDistanceFt(drag.from, at, map.feetPerCell)} ft.${stopped ? (viewer ? ' A wall is in the way.' : ' A wall is in the way — hold Alt to drag through it.') : ''}`)
      setDrag({ ...drag, at, free, stopped })
      sendDrag(drag.id, free)
    } else if (drag.kind === 'marquee') setDrag({ ...drag, b: p })
    else if (drag.kind === 'measure') {
      setDrag({ ...drag, to: c })
      onHint(`${gridDistanceFt(drag.from, c, map.feetPerCell)} ft.`)
    } else if (drag.kind === 'shape') {
      // Barely moved: keep the default size, so a click still places something sensible.
      if (!drag.moved && !drag.existing && Math.hypot(p.x - drag.t.origin.x, p.y - drag.t.origin.y) < 0.6) return
      const sizeFt = sizeFromDrag(drag.t.kind, drag.t.origin, p, map.feetPerCell, snap)
      setDrag({ ...drag, moved: true, t: { ...drag.t, toward: p, sizeFt } })
      onHint(templateLabel({ ...drag.t, sizeFt }))
    } else if (drag.kind === 'shapeMove') setDrag({ ...drag, at: p })
    else if (drag.kind === 'start') setDrag({ ...drag, at: { x: Math.floor(p.x), y: Math.floor(p.y) } })
    else if (drag.kind === 'imageMove') setDrag({ ...drag, at: p })
    else if (drag.kind === 'imageSize') setDrag({ ...drag, at: p })
    else if (drag.kind === 'rotate') {
      const t = map.tokens[drag.id]
      if (t) {
        const mid = tokenCentre(t)
        const raw = (Math.atan2(p.x - mid.x, -(p.y - mid.y)) * 180) / Math.PI
        const facing = normalizeFacing(snap ? Math.round(raw / 45) * 45 : raw)
        if (facing !== drag.facing) {
          setDrag({ ...drag, facing, t: turnToken(drag.t, facing) })
          onHint(`Facing ${compass(facing)}.`)
        }
      }
    }
    else if (drag.kind === 'door') setDrag({ ...drag, b: drag.wallId ? p : wallPt(p).at })
    else if (drag.kind === 'room') setDrag({ ...drag, b: snapRoomCorner(map.walls, p, snap, snapR).at })
    else if (drag.kind === 'wallEnd') setDrag({ ...drag, at: wallPt(p, drag.id).at })
    else if (drag.kind === 'light') setDrag({ ...drag, at: p })
  }

  // A token being dragged goes out to everyone as it moves — at most every 50 ms, and always when it's let go.
  const lastSent = useRef(0)
  function sendDrag(id: string, at: Pt | null): void {
    if (!onLiveDrag) return
    const now = performance.now()
    if (at && now - lastSent.current < 50) return
    lastSent.current = at ? now : 0
    onLiveDrag(id, at ? Math.round(at.x * 100) / 100 : null, at ? Math.round(at.y * 100) / 100 : null)
  }

  function onHoverMove(e: React.PointerEvent): void {
    if (wallChain) setHover(wallPt(toMap(e)).at)
    if (tool === 'walls' && !viewer && !picking && !drag) {
      const p = toMap(e)
      if (wallDraw === 'door' || wallDraw === 'window') {
        // Over a wall, the door (or window) it would get.
        const w = wallUnder(map.walls.filter((x) => !x.blocker), p, snapR)
        if (w) {
          const { t0, t1 } = doorSpan(w, p, p, snap)
          const along = (t: number): Pt => ({ x: w.a.x + t * (w.b.x - w.a.x), y: w.a.y + t * (w.b.y - w.a.y) })
          setWallHover({ at: along((t0 + t1) / 2), kind: 'wall', door: { a: along(t0), b: along(t1) } })
        } else setWallHover({ ...wallPt(p) })
      } else setWallHover(wallDraw === 'room' ? snapRoomCorner(map.walls, p, snap, snapR) : wallPt(p))
    } else if (wallHover) setWallHover(null)
    onPointerMove(e)
  }

  function onPointerUp(): void {
    if (!drag) return
    if (drag.kind === 'marquee') {
      const box = { x0: Math.min(drag.a.x, drag.b.x), y0: Math.min(drag.a.y, drag.b.y), x1: Math.max(drag.a.x, drag.b.x), y1: Math.max(drag.a.y, drag.b.y) }
      const hit = pickable.filter((w) => segTouchesBox(w, box)).map((w) => w.id)
      const ids = drag.additive ? [...new Set([...pickedWalls, ...(selectedWall ? [selectedWall] : []), ...hit])] : hit
      setPickedWalls(ids.length > 1 ? ids : [])
      setSelectedWall(ids.length === 1 ? ids[0] : null)
      if (ids.length) onHint(ids.length === 1 ? 'Drag its ends to move them. Delete removes it.' : `${ids.length} picked. Delete removes them (locked ones stay).`)
      setDrag(null)
      return
    }
    if (drag.kind === 'token') {
      const moved = drag.at.x !== drag.from.x || drag.at.y !== drag.from.y
      // Where it was dropped goes out last (not the last position sent mid-drag), so everyone sees it land there.
      lastSent.current = 0
      if (moved) sendDrag(drag.id, drag.at)
      sendDrag(drag.id, null)
      setSettling(drag.id)
      // A player can't walk through walls or closed doors; the DM can put anything anywhere.
      if (moved && viewer && !canReach(map, drag.from, drag.at)) onHint('A wall (or a closed door) is in the way.')
      else if (moved && canStand(map, drag.at, drag.id)) {
        if (viewer) viewer.onMoveToken(drag.id, drag.at.x, drag.at.y)
        else onChange({ ...map, tokens: { ...map.tokens, [drag.id]: drag.at } })
      }
      else if (moved) onHint('Something’s already standing there.')
    } else if (drag.kind === 'shape') {
      if (drag.existing) {
        if (drag.moved) updateShape(drag.t)
      } else {
        onChange({ ...map, templates: [...map.templates, drag.t] })
        setSelectedShape(drag.t.id)
        onHint(`${templateLabel(drag.t)} placed. Drag its handle to resize it; Ctrl+Z undoes.`)
      }
    } else if (drag.kind === 'shapeMove') {
      const dx = snap ? Math.round((drag.at.x - drag.grab.x) * 2) / 2 : drag.at.x - drag.grab.x
      const dy = snap ? Math.round((drag.at.y - drag.grab.y) * 2) / 2 : drag.at.y - drag.grab.y
      if (dx || dy) updateShape({ ...drag.t, origin: { x: drag.t.origin.x + dx, y: drag.t.origin.y + dy }, toward: { x: drag.t.toward.x + dx, y: drag.t.toward.y + dy } })
    } else if (drag.kind === 'start') {
      const from = map.partyStarts[drag.index]
      if (from && (from.x !== drag.at.x || from.y !== drag.at.y)) onChange({ ...map, partyStarts: map.partyStarts.map((q, i) => (i === drag.index ? drag.at : q)) })
    } else if (drag.kind === 'door') {
      const w = drag.wallId ? map.walls.find((x) => x.id === drag.wallId) : undefined
      if (w) {
        // Set into the wall: that stretch of wall is cut out and the door put in its place.
        const { t0, t1 } = doorSpan(w, drag.a, drag.b, snap)
        onChange({ ...map, walls: insertDoor(map.walls, w.id, t0, t1, () => crypto.randomUUID(), drag.window ? 'window' : 'door').walls })
        onHint(`${drag.window ? 'Window' : 'Door'} set into the wall, closed. Click it with the Move tool to open or close it.`)
      } else if (Math.hypot(drag.b.x - drag.a.x, drag.b.y - drag.a.y) > 0.2) {
        onChange({ ...map, walls: [...map.walls, { id: crypto.randomUUID(), a: drag.a, b: drag.b, ...(drag.window ? { window: true } : { door: true }) }] })
        onHint(`${drag.window ? 'Window' : 'Door'} placed, closed. Click it with the Move tool to open or close it.`)
      }
    } else if (drag.kind === 'room') {
      if (Math.abs(drag.b.x - drag.a.x) > 0.2 && Math.abs(drag.b.y - drag.a.y) > 0.2) {
        // A wall it shares with a room already there isn't drawn twice.
        onChange({ ...map, walls: [...map.walls, ...withoutOverlaps(map.walls.filter((w) => !w.blocker), roomWalls(drag.a, drag.b, () => crypto.randomUUID()), () => crypto.randomUUID())] })
        onHint('Room drawn. Use Door to set doors into its walls.')
      }
    } else if (drag.kind === 'wallEnd') {
      const w = map.walls.find((x) => x.id === drag.id)
      if (w && (w[drag.end].x !== drag.at.x || w[drag.end].y !== drag.at.y)) updateWall({ ...w, [drag.end]: drag.at })
    } else if (drag.kind === 'rotate') {
      const t = map.tokens[drag.id]
      if (t && drag.facing !== t.facing) {
        // The DM's token lands as it was turned; a player's turn goes to the host by its heading.
        if (viewer) faceToken(drag.id, drag.facing)
        else if (!t.locked) onChange({ ...map, tokens: { ...map.tokens, [drag.id]: drag.t } })
      }
    } else if (drag.kind === 'imageMove' || drag.kind === 'imageSize') {
      const img = imagesShown.find((i) => i.id === drag.id)
      const was = map.images.find((i) => i.id === drag.id)
      if (img && was && (img.x !== was.x || img.y !== was.y || img.w !== was.w)) updateImage(img)
    } else if (drag.kind === 'light') {
      const { dx, dy } = offset(drag)
      const l = map.lights.find((x) => x.id === drag.id)
      if (l && (dx || dy)) updateLight({ ...l, x: l.x + dx, y: l.y + dy })
    }
    setDrag(null)
  }

  function onWheel(e: React.WheelEvent): void {
    fitted.current = true
    const r = svgRef.current!.getBoundingClientRect()
    const mx = e.clientX - r.left
    const my = e.clientY - r.top
    const trackpad = isTrackpadWheel(e.nativeEvent)
    // Two-finger scroll on a trackpad pans; a pinch (Ctrl+wheel) zooms in step with the fingers.
    if (trackpad && !e.ctrlKey) {
      setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
      return
    }
    setView((v) => {
      const zoom = Math.max(0.2, Math.min(3, trackpad ? v.zoom * Math.exp(-e.deltaY * 0.01) : v.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
      // Keep the point under the cursor where it is.
      return { zoom, x: mx - ((mx - v.x) * zoom) / v.zoom, y: my - ((my - v.y) * zoom) / v.zoom }
    })
  }

  /** How far a move drag has gone — half squares when snapping. */
  function offset(d: { grab: Pt; at: Pt }): { dx: number; dy: number } {
    const dx = d.at.x - d.grab.x
    const dy = d.at.y - d.grab.y
    return snap ? { dx: Math.round(dx * 2) / 2, dy: Math.round(dy * 2) / 2 } : { dx, dy }
  }

  // Shapes as they'd be with the drag in progress applied.
  const shown: MapTemplate[] = map.templates.map((t) => {
    if (drag?.kind === 'shape' && drag.existing && drag.t.id === t.id) return drag.t
    if (drag?.kind === 'shapeMove' && drag.t.id === t.id) {
      const dx = snap ? Math.round((drag.at.x - drag.grab.x) * 2) / 2 : drag.at.x - drag.grab.x
      const dy = snap ? Math.round((drag.at.y - drag.grab.y) * 2) / 2 : drag.at.y - drag.grab.y
      return { ...t, origin: { x: t.origin.x + dx, y: t.origin.y + dy }, toward: { x: t.toward.x + dx, y: t.toward.y + dy } }
    }
    return t
  })
  if (drag?.kind === 'shape' && !drag.existing) shown.push(drag.t)
  const selectedShown = shown.find((t) => t.id === selectedShape)

  // The part of the endless grid on screen (a little more), for drawing the floor, grid lines and darkness.
  const vis: Bounds = {
    x0: Math.floor(-view.x / (CELL * view.zoom)) - 2,
    y0: Math.floor(-view.y / (CELL * view.zoom)) - 2,
    x1: Math.ceil((size.w - view.x) / (CELL * view.zoom)) + 2,
    y1: Math.ceil((size.h - view.y) / (CELL * view.zoom)) + 2
  }
  const area = { x: vis.x0 * CELL, y: vis.y0 * CELL, width: (vis.x1 - vis.x0) * CELL, height: (vis.y1 - vis.y0) * CELL }
  // Images as they'd be with the move or resize in progress: whole squares when snapping, and always the same shape.
  const imagesShown = map.images.map((i) => {
    if (drag?.kind === 'imageMove' && drag.id === i.id) {
      const dx = drag.at.x - drag.grab.x
      const dy = drag.at.y - drag.grab.y
      return { ...i, x: snap ? Math.round(i.x + dx) : i.x + dx, y: snap ? Math.round(i.y + dy) : i.y + dy }
    }
    if (drag?.kind === 'imageSize' && drag.id === i.id) {
      const raw = Math.max(0.5, drag.at.x - i.x)
      const w = snap ? Math.max(1, Math.round(raw)) : raw
      return { ...i, w, h: (w * i.h) / i.w }
    }
    return i
  })
  const wallsShown = drag?.kind === 'wallEnd' ? map.walls.map((w) => (w.id === drag.id ? { ...w, [drag.end]: drag.at } : w)) : map.walls
  const lightsShown = drag?.kind === 'light' ? map.lights.map((l) => (l.id === drag.id ? { ...l, x: l.x + offset(drag).dx, y: l.y + offset(drag).dy } : l)) : map.lights
  // Where every token is right now: under your pointer while you drag one, where someone else is dragging one, else where it stands.
  const localDrag = drag?.kind === 'token' ? drag : null
  // A token you just let go of drops onto its square at once (sight and light move with it); others' moves glide.
  const [settling, setSettling] = useState<string | null>(null)
  useEffect(() => {
    if (!settling) return
    const timer = setTimeout(() => setSettling(null), 300)
    return () => clearTimeout(timer)
  }, [settling])
  const liveTokens = useMemo(() => {
    const ids = [...Object.keys(remoteDrags), ...(localDrag ? [localDrag.id] : [])].filter((id) => map.tokens[id])
    const turning = drag?.kind === 'rotate' && map.tokens[drag.id] ? drag : null
    if (!ids.length && !turning) return map.tokens
    const next = { ...map.tokens }
    for (const id of ids) next[id] = { ...next[id], ...(localDrag?.id === id ? localDrag.free : remoteDrags[id]) }
    if (turning) next[turning.id] = turning.t
    return next
  }, [map.tokens, remoteDrags, localDrag?.id, localDrag?.free.x, localDrag?.free.y, drag])
  // Lights carried, and the eyes of whoever's seeing, move with their tokens.
  const liveSight: Sight | null | undefined = useMemo(() => {
    if (!sight || liveTokens === map.tokens) return sight
    const centre = (id: string | undefined): Pt | null => {
      const t = id ? liveTokens[id] : undefined
      return t && t !== map.tokens[id!] ? tokenCentre(t) : null
    }
    return {
      ...sight,
      sources: sight.sources.map((src) => ({ ...src, ...centre(src.id) })),
      lights: sight.lights.map((l) => ({ ...l, ...centre(l.id) }))
    }
  }, [sight, liveTokens, map.tokens])
  // The DM sees how the lights fall (at half strength) on a map that isn't brightly lit.
  const dmLighting = !viewer && !sight && map.ambient !== 'bright'
  const dmLights = useMemo(() => lightsOf({ lights: lightsShown, tokens: liveTokens }), [lightsShown, liveTokens])
  // Seeing through someone's eyes, an enemy shows only while it's in sight — worked out from where everyone is right now, mid-drag too.
  // Only what sight depends on (not, say, the explored squares or where things were remembered, which change after every move).
  const seen = useMemo(
    () => (liveSight ? visibleCells({ ...map, tokens: liveTokens }, liveSight.sources, liveSight.lights) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveSight, liveTokens, map.walls, map.ambient, map.feetPerCell, map.cols, map.rows, map.images, map.templates, map.partyStarts, map.lights]
  )
  const inSight = (c: Combatant): boolean => !seen || c.kind === 'player' || (c.kind === 'vehicle' && !!c.party) || (!!liveTokens[c.id] && tokenSeen(liveTokens[c.id], seen))
  const tokens = combatants.filter(inSight).map((c) => {
    const t = liveTokens[c.id]
    const blocked = localDrag?.id === c.id && (!canStand(map, localDrag.at, c.id) || (!!viewer && !canReach(map, localDrag.from, localDrag.at)))
    return t ? <Token key={c.id} c={c} t={t} turn={c.id === turnId} selected={c.id === selectedId} blocked={blocked} glide={localDrag?.id !== c.id && settling !== c.id} /> : null
  })
  // Where a token you're dragging will land.
  const landing = localDrag && (localDrag.at.x !== localDrag.from.x || localDrag.at.y !== localDrag.from.y) && (
    <rect
      x={localDrag.at.x * CELL + 2}
      y={localDrag.at.y * CELL + 2}
      width={tokenW(localDrag.at) * CELL - 4}
      height={tokenH(localDrag.at) * CELL - 4}
      rx={8}
      fill="none"
      stroke={!canStand(map, localDrag.at, localDrag.id) || (!!viewer && !canReach(map, localDrag.from, localDrag.at)) ? 'var(--danger)' : 'var(--accent-hover)'}
      strokeWidth={2}
      strokeDasharray="6 4"
      pointerEvents="none"
    />
  )

  return (
    <>
      <svg
        ref={svgRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: drag?.kind === 'pan' ? 'grabbing' : tool === 'move' ? 'default' : 'crosshair', touchAction: 'none', userSelect: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onHoverMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          if (drag?.kind === 'token') sendDrag(drag.id, null)
          setDrag(null)
        }}
        onContextMenu={(e) => {
          // A right-click stops drawing a wall.
          if (wallChain) {
            e.preventDefault()
            setWallChain(null)
            onHint('Wall done. Click to start another.')
          }
        }}
        onWheel={onWheel}
        onAuxClick={(e) => e.preventDefault()}
      >
        <defs>
          <pattern id="bm-floor" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
            <rect width={CELL} height={CELL} fill="#2f2a22" />
            <rect x={2} y={2} width={CELL - 4} height={CELL - 4} rx={4} fill="#373127" />
          </pattern>
          <pattern id="bm-grid" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
            <path d={`M${CELL} 0H0V${CELL}`} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={1.2} />
          </pattern>
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
          <rect {...area} fill="url(#bm-floor)" />
          {imagesShown.map((i) =>
            viewer && i.hidden ? null : <MapImageSvg key={i.id} i={i} active={imageTool && !viewer} selected={i.id === selectedImage && imageTool && !viewer} />
          )}
          {/* Grid lines over the images, so an image can be lined up with them. */}
          <rect {...area} fill="url(#bm-grid)" pointerEvents="none" />
          <CentreMark area={area} zoom={view.zoom} />
          {imagesShown.map((i) => (i.id === selectedImage && imageTool && !viewer ? <ImageFrame key={i.id} i={i} /> : null))}

          {shown.map((t) => (
            <Template key={t.id} t={t} feetPerCell={map.feetPerCell} selected={t.id === selectedShape} movable={tool === 'move' && !viewer} />
          ))}

          {!viewer &&
            map.partyStarts.map((q0, i) => {
              const q = drag?.kind === 'start' && drag.index === i ? drag.at : q0
              return (
                <g key={`start${i}`} data-start={i} style={{ cursor: tool === 'move' ? 'grab' : undefined }} pointerEvents={tool === 'move' ? undefined : 'none'}>
                  <title>{`Party start ${i + 1} — players begin here (only you can see this)`}</title>
                  <rect x={q.x * CELL + 3} y={q.y * CELL + 3} width={CELL - 6} height={CELL - 6} rx={8} fill="rgba(63,127,181,0.18)" stroke="#7fbad6" strokeWidth={2} strokeDasharray="5 4" />
                  <text x={q.x * CELL + CELL / 2} y={q.y * CELL + CELL / 2 + 5} textAnchor="middle" fontSize={14} fontWeight={700} fill="#7fbad6" pointerEvents="none">
                    P{i + 1}
                  </text>
                </g>
              )
            })}

          {/* Walls as one shape (outline, then stone), so joins and corners merge; the picked one on top; doors over them all. Players only see doors. */}
          {!viewer && <WallLayer walls={wallsShown} />}
          {!viewer &&
            wallsShown.map((w) => (!isOpening(w) && (w.id === selectedWall || pickedWalls.includes(w.id)) ? <WallSvg key={w.id} w={w} selected editing={tool === 'walls'} doorClick={false} /> : null))}
          {wallsShown.map((w) => (isOpening(w) ? <WallSvg key={w.id} w={w} selected={w.id === selectedWall || pickedWalls.includes(w.id)} editing={tool === 'walls' && !viewer} doorClick={tool === 'move' && !viewer} /> : null))}
          {drag?.kind === 'door' && <WallSvg w={{ id: 'draft', ...draftDoor(drag, map.walls, snap), ...(drag.window ? { window: true } : { door: true }) }} selected editing={false} doorClick={false} />}
          {drag?.kind === 'marquee' && (
            <rect
              x={Math.min(drag.a.x, drag.b.x) * CELL}
              y={Math.min(drag.a.y, drag.b.y) * CELL}
              width={Math.abs(drag.b.x - drag.a.x) * CELL}
              height={Math.abs(drag.b.y - drag.a.y) * CELL}
              fill="var(--accent)"
              fillOpacity={0.12}
              stroke="var(--accent)"
              strokeWidth={1.5 / view.zoom}
              pointerEvents="none"
            />
          )}
          {drag?.kind === 'room' &&
            roomWalls(drag.a, drag.b, () => 'draft').map((w, i) => (
              <line key={i} x1={w.a.x * CELL} y1={w.a.y * CELL} x2={w.b.x * CELL} y2={w.b.y * CELL} stroke="var(--accent)" strokeWidth={4} strokeDasharray="8 5" strokeLinecap="round" pointerEvents="none" />
            ))}
          {wallHover?.door && <WallSvg w={{ id: 'hover', ...wallHover.door, ...(wallDraw === 'window' ? { window: true } : { door: true }) }} selected={false} editing={false} doorClick={false} />}
          {wallHover && tool === 'walls' && <SnapMarker at={wallHover.at} kind={wallHover.kind} zoom={view.zoom} />}
          {wallChain && (
            <polyline points={[...wallChain, ...(hover ? [hover] : [])].map((q) => `${q.x * CELL},${q.y * CELL}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={4} strokeDasharray="8 5" pointerEvents="none" />
          )}

          {dmLighting && <Darkness map={map} sight={{ sources: NO_SOURCES, explored: null, lights: dmLights }} area={area} dmPreview />}
          {landing}
          {aim && liveTokens[aim.from] && <AimOverlay t={liveTokens[aim.from]} arcs={aim.arcs} reach={aim.reach} zoom={view.zoom} />}
          {canTurn(selectedId) && liveTokens[selectedId] && tool === 'move' && <TurnHandle id={selectedId} t={liveTokens[selectedId]} zoom={view.zoom} />}
          {!sight && tokens}
          {liveSight && <Darkness map={map} sight={liveSight} area={area} />}
          {sight && tokens}

          {!viewer && (tool === 'light' || lightsShown.some((l) => l.id === selectedLight)) &&
            lightsShown.map((l) => <LightMarker key={l.id} l={l} feetPerCell={map.feetPerCell} selected={l.id === selectedLight} active={tool === 'light'} />)}

          {/* The shape being placed or resized shows its size; a selected one has a handle to drag. */}
          {drag?.kind === 'shape' && <SizeLabel t={drag.t} feetPerCell={map.feetPerCell} />}
          {selectedShown && drag?.kind !== 'shape' && !selectedShown.locked && <Handle t={selectedShown} feetPerCell={map.feetPerCell} />}
          {drag?.kind === 'measure' && <Ruler from={drag.from} to={drag.to} feetPerCell={map.feetPerCell} />}
        </g>
      </svg>

      {/* Whatever's selected has its settings beside it. */}
      {tokenPopup && selectedId && liveTokens[selectedId] && !viewer && !aim && drag?.kind !== 'token' && drag?.kind !== 'rotate' && (tool === 'move' || tool === 'ruler') && (
        <Beside box={tokenBox(liveTokens[selectedId])} view={view} area={size} padPx={canTurn(selectedId) ? HANDLE_REACH + 6 : 6}>
          {tokenPopup(selectedId)}
        </Beside>
      )}
      {shape && (
        <Beside box={shapeBox(shape, map.feetPerCell)} view={view} area={size}>
          <ShapeOptions t={shape} feetPerCell={map.feetPerCell} onChange={updateShape} onRemove={() => removeShape(shape.id)} onClose={() => setSelectedShape(null)} />
        </Beside>
      )}
      {wallPicked && (
        <Beside box={{ x0: Math.min(wallPicked.a.x, wallPicked.b.x), y0: Math.min(wallPicked.a.y, wallPicked.b.y), x1: Math.max(wallPicked.a.x, wallPicked.b.x), y1: Math.max(wallPicked.a.y, wallPicked.b.y) }} view={view} area={size}>
          <WallOptions w={wallPicked} onChange={updateWall} onRemove={() => removeWall(wallPicked.id)} onClose={() => setSelectedWall(null)} />
        </Beside>
      )}
      {lightPicked && (
        <Beside box={{ x0: lightPicked.x - 0.5, y0: lightPicked.y - 0.5, x1: lightPicked.x + 0.5, y1: lightPicked.y + 0.5 }} view={view} area={size}>
          <LightOptions l={lightPicked} onChange={updateLight} onRemove={() => removeLight(lightPicked.id)} onClose={() => setSelectedLight(null)} />
        </Beside>
      )}
      {imagePicked && imageTool && !viewer && (
        <Beside box={{ x0: imagePicked.x, y0: imagePicked.y, x1: imagePicked.x + imagePicked.w, y1: imagePicked.y + imagePicked.h }} view={view} area={size}>
        <ImageOptions
          i={imagePicked}
          snap={snap}
          onChange={updateImage}
          onRemove={() => removeImage(imagePicked.id)}
          onClose={() => onSelectImage?.(null)}
          onOrder={(dir) => {
            const rest = map.images.filter((x) => x.id !== imagePicked.id)
            onChange({ ...map, images: dir === 'front' ? [...rest, imagePicked] : [imagePicked, ...rest] })
          }}
        />
        </Beside>
      )}

      {/* The centre is off screen: an arrow at the edge points the way (click it to go there). */}
      {(() => {
        const m = 28
        const inView = view.x > m && view.x < size.w - m && view.y > m && view.y < size.h - m
        if (inView) return null
        const cx = size.w / 2
        const cy = size.h / 2
        const ang = Math.atan2(view.y - cy, view.x - cx)
        // Where the line from the middle of the view to the centre leaves the view (kept clear of the edges).
        const sx = Math.abs(Math.cos(ang)) > 1e-6 ? (cx - m) / Math.abs(Math.cos(ang)) : Infinity
        const sy = Math.abs(Math.sin(ang)) > 1e-6 ? (cy - m) / Math.abs(Math.sin(ang)) : Infinity
        const r = Math.min(sx, sy)
        return (
          <button
            type="button"
            onClick={centre}
            title="The centre of the map is this way — click to go there"
            style={{ position: 'absolute', left: cx + Math.cos(ang) * r - 14, top: cy + Math.sin(ang) * r - 14, width: 28, height: 28, borderRadius: 999, border: '1px solid var(--accent)', background: 'var(--bg-surface)', color: 'var(--accent-hover)', display: 'grid', placeItems: 'center', cursor: 'pointer', zIndex: 4, padding: 0 }}
          >
            <svg width={14} height={14} viewBox="0 0 16 16" aria-hidden="true" style={{ transform: `rotate(${ang}rad)` }}>
              <path d="M3 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )
      })()}

      <div style={{ position: 'absolute', right: 12, bottom: 12, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 5 }}>
        <button type="button" style={zoomButton} onClick={centre} title="Go to the centre of the map" aria-label="Go to the centre of the map">
          <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
            <circle cx="8" cy="8" r="4" />
            <path d="M8 1v3M8 12v3M1 8h3M12 8h3" />
          </svg>
        </button>
        <button type="button" style={zoomButton} onClick={() => zoomBy(1.2)} title="Zoom in">
          +
        </button>
        <button type="button" style={zoomButton} onClick={() => zoomBy(1 / 1.2)} title="Zoom out">
          −
        </button>
        <button
          type="button"
          style={{ ...zoomButton, fontSize: 10 }}
          onClick={() => {
            fitted.current = false
            fit()
          }}
          title="Fit the whole map"
        >
          Fit
        </button>
      </div>
    </>
  )
}

/** The selected shape's exact size, in steps of a square, and a way to remove it. */
function ShapeOptions({ t, feetPerCell, onChange, onRemove, onClose }: { t: MapTemplate; feetPerCell: number; onChange: (t: MapTemplate) => void; onRemove: () => void; onClose: () => void }): JSX.Element {
  const setSize = (ft: number): void => {
    if (!t.locked) onChange({ ...t, sizeFt: Math.max(feetPerCell, Math.round(ft / feetPerCell) * feetPerCell) })
  }
  const what = t.kind === 'sphere' ? 'Radius' : t.kind === 'cube' ? 'Side' : 'Length'
  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <strong style={{ flex: 1, fontSize: 13, textTransform: 'capitalize' }}>{t.kind}</strong>
        <button type="button" onClick={onClose} title="Done" style={iconBtn}>
          <XIcon size={11} />
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
        <span style={{ width: 48 }}>{what}</span>
        <button type="button" className="gs-chip" style={stepBtn} onClick={() => setSize(t.sizeFt - feetPerCell)} disabled={t.locked || t.sizeFt <= feetPerCell} aria-label="Smaller">
          −
        </button>
        <input type="number" min={feetPerCell} step={feetPerCell} className="gb-input" value={t.sizeFt} disabled={t.locked} onChange={(e) => setSize(Number(e.target.value) || feetPerCell)} style={{ width: 56, padding: '2px 4px', fontSize: 12, textAlign: 'center' }} aria-label={`${what} in feet`} />
        <span>ft</span>
        <button type="button" className="gs-chip" style={stepBtn} onClick={() => setSize(t.sizeFt + feetPerCell)} disabled={t.locked} aria-label="Bigger">
          +
        </button>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {[10, 15, 20, 30, 60].map((ft) => (
          <button key={ft} type="button" disabled={t.locked} onClick={() => setSize(ft)} style={{ ...presetBtn, ...(t.sizeFt === ft ? { borderColor: 'var(--accent)', color: 'var(--accent-hover)' } : {}), opacity: t.locked ? 0.45 : 1 }}>
            {ft}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <LockToggle locked={!!t.locked} onChange={(locked) => onChange({ ...t, locked: locked || undefined })} />
        <HideToggle hidden={!!t.hidden} onChange={(hidden) => onChange({ ...t, hidden: hidden || undefined })} />
        <button type="button" className="gb-btn gb-btn--ghost" onClick={onRemove} disabled={t.locked} style={{ fontSize: 12, padding: '3px 8px', color: 'var(--danger)', marginLeft: 'auto', opacity: t.locked ? 0.4 : 1 }}>
          Delete
        </button>
      </div>
    </div>
  )
}

/**
 * The centre of the map: the grid's starting point, where its two middle
 * lines cross — marked with a crosshair, and the lines drawn faintly out from it.
 */
function CentreMark({ area, zoom }: { area: { x: number; y: number; width: number; height: number }; zoom: number }): JSX.Element {
  // Kept the same size on screen however far in or out it's zoomed.
  const k = 1 / zoom
  return (
    <g pointerEvents="none">
      <title>The centre of the map</title>
      <line x1={area.x} y1={0} x2={area.x + area.width} y2={0} stroke="var(--accent)" strokeOpacity={0.35} strokeWidth={1.5 * k} strokeDasharray={`${8 * k} ${6 * k}`} />
      <line x1={0} y1={area.y} x2={0} y2={area.y + area.height} stroke="var(--accent)" strokeOpacity={0.35} strokeWidth={1.5 * k} strokeDasharray={`${8 * k} ${6 * k}`} />
      <circle cx={0} cy={0} r={9 * k} fill="var(--bg-surface)" fillOpacity={0.85} stroke="var(--accent)" strokeWidth={2 * k} />
      <path d={`M${-14 * k} 0H${-4 * k}M${4 * k} 0H${14 * k}M0 ${-14 * k}V${-4 * k}M0 ${4 * k}V${14 * k}`} stroke="var(--accent-hover)" strokeWidth={2 * k} strokeLinecap="round" />
      <circle cx={0} cy={0} r={1.8 * k} fill="var(--accent-hover)" />
    </g>
  )
}

/** A map image on the grid; with the Images tool it can be picked and dragged. A hidden one is faint (players don't get it). */
function MapImageSvg({ i, active, selected }: { i: MapImage; active: boolean; selected: boolean }): JSX.Element {
  return (
    <g data-image={i.id} style={{ cursor: active ? (i.locked ? 'not-allowed' : 'move') : undefined }} pointerEvents={active ? undefined : 'none'} opacity={i.hidden ? 0.45 : 1}>
      <image href={i.src} x={i.x * CELL} y={i.y * CELL} width={i.w * CELL} height={i.h * CELL} preserveAspectRatio="none" />
      {active && !selected && <rect x={i.x * CELL} y={i.y * CELL} width={i.w * CELL} height={i.h * CELL} fill="none" stroke="rgba(255,255,255,0.25)" strokeDasharray="6 6" />}
    </g>
  )
}

/** The picked image's outline and the corner to drag to size it. */
function ImageFrame({ i }: { i: MapImage }): JSX.Element {
  const x1 = (i.x + i.w) * CELL
  const y1 = (i.y + i.h) * CELL
  return (
    <g>
      <rect x={i.x * CELL} y={i.y * CELL} width={i.w * CELL} height={i.h * CELL} fill="none" stroke="var(--accent)" strokeWidth={3} pointerEvents="none" />
      {!i.locked && (
        <g data-image-size={i.id} style={{ cursor: 'nwse-resize' }}>
          <title>Drag to size it (it keeps its shape)</title>
          <rect x={x1 - 9} y={y1 - 9} width={18} height={18} rx={4} fill="var(--bg-surface)" stroke="var(--accent)" strokeWidth={3} />
        </g>
      )}
    </g>
  )
}

/** The picked image: its size in squares (or by how many pixels make a square), its order, and lock, hide and delete. */
function ImageOptions({ i, snap, onChange, onRemove, onClose, onOrder }: { i: MapImage; snap: boolean; onChange: (i: MapImage) => void; onRemove: () => void; onClose: () => void; onOrder: (dir: 'front' | 'back') => void }): JSX.Element {
  const round = (n: number): number => Math.round(n * 100) / 100
  const setW = (w: number): void => {
    if (i.locked || !(w > 0)) return
    onChange({ ...i, w, h: (w * i.h) / i.w })
  }
  const pps = i.naturalW ? round(i.naturalW / i.w) : null
  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <strong style={{ flex: 1, fontSize: 13 }}>Image</strong>
        <button type="button" onClick={onClose} title="Done" style={iconBtn}>
          <XIcon size={11} />
        </button>
      </div>
      <label style={optRow}>
        <span style={{ width: 70 }}>Width</span>
        <input type="number" min={0.5} step={snap ? 1 : 0.1} className="gb-input" disabled={i.locked} value={round(i.w)} onChange={(e) => setW(Number(e.target.value))} style={numBox} />
        <span>squares</span>
      </label>
      <label style={optRow}>
        <span style={{ width: 70 }}>Height</span>
        <input type="number" min={0.5} step={snap ? 1 : 0.1} className="gb-input" disabled={i.locked} value={round(i.h)} onChange={(e) => setW((Number(e.target.value) * i.w) / i.h)} style={numBox} />
        <span>squares</span>
      </label>
      {pps !== null && (
        <label style={optRow} title="If the map was drawn on a grid, how many of its pixels make one square — it's sized to match">
          <span style={{ width: 70 }}>Pixels / sq</span>
          <input type="number" min={1} className="gb-input" disabled={i.locked} value={pps} onChange={(e) => Number(e.target.value) > 0 && setW(i.naturalW! / Number(e.target.value))} style={numBox} />
        </label>
      )}
      <div style={{ display: 'flex', gap: 4 }}>
        <button type="button" style={presetBtn} onClick={() => onOrder('front')} title="Draw it over the other images">
          To front
        </button>
        <button type="button" style={presetBtn} onClick={() => onOrder('back')} title="Draw it under the other images">
          To back
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <LockToggle locked={!!i.locked} onChange={(locked) => onChange({ ...i, locked: locked || undefined })} />
        <HideToggle hidden={!!i.hidden} onChange={(hidden) => onChange({ ...i, hidden: hidden || undefined })} />
        <button type="button" className="gb-btn gb-btn--ghost" onClick={onRemove} disabled={i.locked} style={{ fontSize: 12, padding: '3px 8px', color: 'var(--danger)', marginLeft: 'auto', opacity: i.locked ? 0.4 : 1 }}>
          Delete
        </button>
      </div>
    </div>
  )
}

/** Where a door being placed goes: along the wall it's set into, or between the drag's ends. */
function draftDoor(drag: { a: Pt; b: Pt; wallId: string | null }, walls: MapWall[], snap: boolean): { a: Pt; b: Pt } {
  const w = drag.wallId ? walls.find((x) => x.id === drag.wallId) : undefined
  if (!w) return { a: drag.a, b: drag.b }
  const { t0, t1 } = doorSpan(w, drag.a, drag.b, snap)
  const along = (t: number): Pt => ({ x: w.a.x + t * (w.b.x - w.a.x), y: w.a.y + t * (w.b.y - w.a.y) })
  return { a: along(t0), b: along(t1) }
}

/** Where a wall corner would go: a filled dot on another wall's end, a ring on a wall, a small dot on the grid. */
function SnapMarker({ at, kind, zoom }: { at: Pt; kind: SnapKind; zoom: number }): JSX.Element | null {
  if (kind === 'free') return null
  const k = 1 / zoom
  const cx = at.x * CELL
  const cy = at.y * CELL
  return (
    <g pointerEvents="none">
      {kind === 'end' && <circle cx={cx} cy={cy} r={7 * k} fill="var(--accent-hover)" stroke="var(--bg-surface)" strokeWidth={2 * k} />}
      {kind === 'wall' && <circle cx={cx} cy={cy} r={7 * k} fill="none" stroke="var(--accent-hover)" strokeWidth={2.5 * k} />}
      {kind === 'grid' && <circle cx={cx} cy={cy} r={4 * k} fill="var(--text-primary)" fillOpacity={0.8} />}
    </g>
  )
}

/** The picked wall, door or window: which it is, open or closed, locked or not, and a way to remove it. */
function WallOptions({ w, onChange, onRemove, onClose }: { w: MapWall; onChange: (w: MapWall) => void; onRemove: () => void; onClose: () => void }): JSX.Element {
  const choice = (on: boolean): React.CSSProperties => ({ ...presetBtn, ...(on ? { borderColor: 'var(--accent)', color: 'var(--accent-hover)' } : {}) })
  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <strong style={{ flex: 1, fontSize: 13 }}>{w.door ? 'Door' : w.window ? 'Window' : 'Wall'}</strong>
        <button type="button" onClick={onClose} title="Done" style={iconBtn}>
          <XIcon size={11} />
        </button>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button type="button" style={choice(!isOpening(w))} onClick={() => onChange({ ...w, door: undefined, window: undefined, open: undefined })}>
          Wall
        </button>
        <button type="button" style={choice(!!w.door)} onClick={() => onChange({ ...w, door: true, window: undefined })}>
          Door
        </button>
        <button type="button" style={choice(!!w.window)} onClick={() => onChange({ ...w, window: true, door: undefined })} title="Glass: sight and light pass; closed it stops tokens">
          Window
        </button>
      </div>
      {isOpening(w) && (
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" style={choice(!w.open)} onClick={() => onChange({ ...w, open: undefined })}>
            Closed
          </button>
          <button type="button" style={choice(!!w.open)} onClick={() => onChange({ ...w, open: true })}>
            Open
          </button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <LockToggle locked={!!w.locked} onChange={(locked) => onChange({ ...w, locked: locked || undefined })} />
        <button type="button" className="gb-btn gb-btn--ghost" onClick={onRemove} disabled={w.locked} style={{ fontSize: 12, padding: '3px 8px', color: 'var(--danger)', marginLeft: 'auto', opacity: w.locked ? 0.4 : 1 }}>
          Delete
        </button>
      </div>
    </div>
  )
}

/** The picked light: how far its bright and dim light reach, on or off, and a way to remove it. */
function LightOptions({ l, onChange, onRemove, onClose }: { l: MapLight; onChange: (l: MapLight) => void; onRemove: () => void; onClose: () => void }): JSX.Element {
  const feet = (key: 'bright' | 'dim', label: string): JSX.Element => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
      <span style={{ width: 48 }}>{label}</span>
      <input type="number" min={0} step={5} className="gb-input" value={l[key]} onChange={(e) => onChange({ ...l, [key]: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 60, padding: '2px 4px', fontSize: 12, textAlign: 'center' }} />
      <span>ft</span>
    </label>
  )
  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <strong style={{ flex: 1, fontSize: 13 }}>Light</strong>
        <button type="button" onClick={onClose} title="Done" style={iconBtn}>
          <XIcon size={11} />
        </button>
      </div>
      {feet('bright', 'Bright')}
      {feet('dim', 'Dim')}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button type="button" onClick={() => onChange({ ...l, off: !l.off || undefined })} style={{ ...presetBtn, ...(l.off ? {} : { borderColor: 'var(--accent)', color: 'var(--accent-hover)' }) }} title={l.off ? 'Put out — click to light it' : 'Lit — click to put it out'}>
          {l.off ? 'Off' : 'On'}
        </button>
        <LockToggle locked={!!l.locked} onChange={(locked) => onChange({ ...l, locked: locked || undefined })} />
        <button type="button" className="gb-btn gb-btn--ghost" onClick={onRemove} disabled={l.locked} style={{ fontSize: 12, padding: '3px 8px', color: 'var(--danger)', marginLeft: 'auto', opacity: l.locked ? 0.4 : 1 }}>
          Delete
        </button>
      </div>
    </div>
  )
}

/** Every wall (not door) drawn as one shape: all the dark edges first, then all the stone, so where walls meet they read as one wall. */
function WallLayer({ walls }: { walls: MapWall[] }): JSX.Element | null {
  const path = (list: MapWall[]): string => list.map((w) => `M${w.a.x * CELL} ${w.a.y * CELL}L${w.b.x * CELL} ${w.b.y * CELL}`).join('')
  const d = path(walls.filter((w) => !isOpening(w) && !w.blocker))
  const blockers = path(walls.filter((w) => w.blocker))
  if (!d && !blockers) return null
  return (
    <g pointerEvents="none">
      {/* Blockers: only the DM sees them, as a dashed red line. */}
      {blockers && <path d={blockers} fill="none" stroke="#e05a4f" strokeWidth={3} strokeDasharray="8 6" strokeLinecap="round" strokeOpacity={0.85} />}
      <path d={d} fill="none" stroke="rgba(0,0,0,0.75)" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke="#d9cba8" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke="#efe4c8" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.7} />
    </g>
  )
}

/**
 * A door: a wooden leaf between two dark jambs where it meets the wall —
 * closed, it fills the gap; open, the gap is empty but for a faint line across
 * the doorway (no leaf swung out over the floor). The picked one (or a wall picked with Pick)
 * shows its ends to drag; a door can be clicked open or shut.
 */
function WallSvg({ w, selected, editing, doorClick }: { w: MapWall; selected: boolean; editing: boolean; doorClick: boolean }): JSX.Element {
  const a = { x: w.a.x * CELL, y: w.a.y * CELL }
  const b = { x: w.b.x * CELL, y: w.b.y * CELL }
  const clickable = isOpening(w) && doorClick
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const ux = (b.x - a.x) / len
  const uy = (b.y - a.y) / len
  const jamb = (p: { x: number; y: number }): JSX.Element => (
    <rect x={p.x - 5} y={p.y - 5} width={10} height={10} rx={2} fill="#3a2a1a" stroke="rgba(0,0,0,0.8)" strokeWidth={1.5} transform={`rotate(${(Math.atan2(uy, ux) * 180) / Math.PI} ${p.x} ${p.y})`} />
  )
  // A window's jambs are the wall's own stone.
  const stoneJamb = (p: { x: number; y: number }): JSX.Element => (
    <rect x={p.x - 4.5} y={p.y - 4.5} width={9} height={9} rx={1.5} fill="#d9cba8" stroke="rgba(0,0,0,0.8)" strokeWidth={1.5} transform={`rotate(${(Math.atan2(uy, ux) * 180) / Math.PI} ${p.x} ${p.y})`} />
  )
  return (
    <g data-door={clickable ? w.id : undefined} style={{ cursor: clickable ? 'pointer' : undefined }} pointerEvents={clickable || (editing && selected) ? undefined : 'none'}>
      {clickable && <title>{`${w.open ? 'Open' : 'Closed'} ${w.window ? 'window' : 'door'} — click to ${w.open ? 'close' : 'open'} it`}</title>}
      {clickable && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={18} />}
      {w.window ? (
        // A window: glass between two stone jambs, with a bar across the middle; open, just the gap (no swing).
        <>
          {w.open ? (
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={selected ? 'var(--accent-hover)' : '#8fd0e8'} strokeOpacity={0.7} strokeWidth={2} strokeDasharray="4 4" />
          ) : (
            <>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(0,0,0,0.8)" strokeWidth={9} strokeLinecap="butt" />
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={selected ? 'var(--accent-hover)' : '#7cc3dd'} strokeWidth={5} strokeLinecap="butt" />
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#e8f7fd" strokeWidth={1.2} strokeOpacity={0.9} strokeLinecap="butt" />
              <line x1={(a.x + b.x) / 2 - uy * 5} y1={(a.y + b.y) / 2 + ux * 5} x2={(a.x + b.x) / 2 + uy * 5} y2={(a.y + b.y) / 2 - ux * 5} stroke="rgba(0,0,0,0.8)" strokeWidth={2} />
            </>
          )}
          {stoneJamb(a)}
          {stoneJamb(b)}
        </>
      ) : !w.door ? (
        <>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(0,0,0,0.75)" strokeWidth={10} strokeLinecap="round" />
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={selected ? 'var(--accent-hover)' : '#d9cba8'} strokeWidth={5} strokeLinecap="round" />
        </>
      ) : w.open ? (
        <>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={selected ? 'var(--accent-hover)' : '#b9823f'} strokeOpacity={0.6} strokeWidth={2} strokeDasharray="5 5" />
          {jamb(a)}
          {jamb(b)}
        </>
      ) : (
        <>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(0,0,0,0.8)" strokeWidth={12} strokeLinecap="butt" />
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={selected ? 'var(--accent-hover)' : '#a8733a'} strokeWidth={8} strokeLinecap="butt" />
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#d39a55" strokeWidth={1.5} strokeLinecap="butt" strokeOpacity={0.8} />
          {jamb(a)}
          {jamb(b)}
        </>
      )}
      {editing &&
        selected &&
        (['a', 'b'] as const).map((end) => (
          <circle key={end} data-wall-end={`${w.id}|${end}`} cx={w[end].x * CELL} cy={w[end].y * CELL} r={8} fill="var(--bg-surface)" stroke="var(--accent)" strokeWidth={3} style={{ cursor: 'move' }} />
        ))}
    </g>
  )
}

/** Where a light is (for the DM), with how far its bright and dim light reach. */
function LightMarker({ l, feetPerCell, selected, active }: { l: MapLight; feetPerCell: number; selected: boolean; active: boolean }): JSX.Element {
  const cx = l.x * CELL
  const cy = l.y * CELL
  const ring = (ft: number): number => (ft / feetPerCell) * CELL
  return (
    <g data-light={l.id} style={{ cursor: active ? (l.locked ? 'not-allowed' : 'move') : undefined }} pointerEvents={active ? undefined : 'none'} opacity={l.off ? 0.5 : 1}>
      <title>{`Light — ${l.bright} ft bright, ${l.dim} ft dim${l.off ? ' (off)' : ''}`}</title>
      {selected && (
        <>
          <circle cx={cx} cy={cy} r={ring(l.bright)} fill="none" stroke="#f2c94c" strokeWidth={1.5} strokeDasharray="6 5" pointerEvents="none" />
          <circle cx={cx} cy={cy} r={ring(l.bright + l.dim)} fill="none" stroke="#f2c94c" strokeOpacity={0.5} strokeWidth={1.5} strokeDasharray="3 6" pointerEvents="none" />
        </>
      )}
      <circle cx={cx} cy={cy} r={11} fill={l.off ? 'var(--bg-surface)' : '#f2c94c'} stroke={selected ? 'var(--text-primary)' : 'rgba(0,0,0,0.6)'} strokeWidth={2} />
      {Array.from({ length: 8 }, (_, i) => {
        const ang = (i * Math.PI) / 4
        return <line key={i} x1={cx + Math.cos(ang) * 14} y1={cy + Math.sin(ang) * 14} x2={cx + Math.cos(ang) * 18} y2={cy + Math.sin(ang) * 18} stroke="#f2c94c" strokeWidth={2} strokeLinecap="round" pointerEvents="none" />
      })}
    </g>
  )
}

const DIM = '#8c8c8c'
const EXPLORED = '#a6a6a6'

/**
 * Darkness over everything out of sight. Each source sees its line of sight
 * where it's lit (bright, or dim — drawn a little darker) or within its
 * darkvision; squares seen before stay visible, dimmed. With `dmPreview` (the
 * DM, not looking through anyone's eyes) it just shows how the lights fall,
 * at half strength.
 */
function Darkness({ map, sight, area, dmPreview = false }: { map: BattleMap; sight: Sight; area: { x: number; y: number; width: number; height: number }; dmPreview?: boolean }): JSX.Element {
  // Chromium doesn't redraw a mask when only a gradient or shape it borrows (through <use>) changes — a light's
  // reach, the lighting, a darkvision range — so the ids change with them, and the masks are drawn afresh.
  const look = `${map.ambient}|${sight.lights.map((l) => `${l.bright}/${l.dim}`).join(',')}|${sight.sources.map((s) => s.darkvision).join(',')}`
  const uid = useId().replace(/:/g, '') + hashOf(look)
  const walls = useMemo(() => blockingWalls(map), [map.walls])
  const b = sightBounds(map)
  const bk = `${b.x0},${b.y0},${b.x1},${b.y1}`
  const lightPolys = useMemo(() => sight.lights.map((l) => visibilityPolygon(l, walls, b)), [sight.lights, walls, bk])
  const sourcePolys = useMemo(() => sight.sources.map((s) => visibilityPolygon(s, walls, b)), [sight.sources, walls, bk])
  const explored = useMemo(() => {
    let d = ''
    for (const [y, row] of decodeExplored(sight.explored)) {
      const xs = [...row].sort((p, q) => p - q)
      for (let i = 0; i < xs.length; ) {
        let j = i
        while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++
        d += `M${xs[i] * CELL} ${y * CELL}h${(j - i + 1) * CELL}v${CELL}h${-(j - i + 1) * CELL}z`
        i = j + 1
      }
    }
    return d
  }, [sight.explored])
  const pts = (poly: Pt[]): string => poly.map((q) => `${q.x * CELL},${q.y * CELL}`).join(' ')
  // The lit areas, bright and dim: white and grey where it's seen, or (the DM's preview) black and dark grey where it's lit.
  const litShapes = (brightColour: string, dimColour: string, blend: 'lighten' | 'darken'): JSX.Element[] =>
    sight.lights.map((l, i) => {
      const r = ((l.bright + l.dim) / map.feetPerCell) * CELL
      const stop = l.bright + l.dim > 0 ? l.bright / (l.bright + l.dim) : 1
      return (
        <g key={i} style={{ mixBlendMode: blend }}>
          <radialGradient id={`${uid}g${i}${blend}`} gradientUnits="userSpaceOnUse" cx={l.x * CELL} cy={l.y * CELL} r={Math.max(1, r)}>
            <stop offset={0} stopColor={brightColour} />
            <stop offset={stop} stopColor={brightColour} />
            <stop offset={stop} stopColor={dimColour} />
            <stop offset={1} stopColor={dimColour} />
          </radialGradient>
          <clipPath id={`${uid}c${i}${blend}`}>
            <circle cx={l.x * CELL} cy={l.y * CELL} r={r} />
          </clipPath>
          <polygon points={pts(lightPolys[i] ?? [])} fill={`url(#${uid}g${i}${blend})`} clipPath={`url(#${uid}c${i}${blend})`} shapeRendering="crispEdges" />
        </g>
      )
    })

  if (dmPreview) {
    return (
      <g pointerEvents="none">
        <mask id={`${uid}dm`} maskUnits="userSpaceOnUse" {...area}>
          <rect {...area} fill={map.ambient === 'dim' ? '#737373' : 'white'} />
          {litShapes('black', '#737373', 'darken')}
        </mask>
        <rect {...area} fill="#050403" opacity={0.55} mask={`url(#${uid}dm)`} />
      </g>
    )
  }
  const base = map.ambient === 'bright' ? 'white' : map.ambient === 'dim' ? DIM : 'black'
  return (
    <g pointerEvents="none">
      <defs>
        <g id={`${uid}lit`}>{map.ambient === 'bright' ? null : litShapes('white', DIM, 'lighten')}</g>
      </defs>
      {sight.sources.map((s, i) => {
        const dv = (s.darkvision / map.feetPerCell) * CELL
        return (
          <mask key={i} id={`${uid}s${i}`} maskUnits="userSpaceOnUse" {...area}>
            <rect {...area} fill={base} />
            <use href={`#${uid}lit`} />
            {dv > 0 && <circle cx={s.x * CELL} cy={s.y * CELL} r={dv} fill={DIM} style={{ mixBlendMode: 'lighten' }} />}
          </mask>
        )
      })}
      <mask id={`${uid}dark`} maskUnits="userSpaceOnUse" {...area}>
        <rect {...area} fill="white" />
        {explored && <path d={explored} fill={EXPLORED} />}
        {sourcePolys.map((poly, i) => (
          <polygon key={i} points={pts(poly)} fill="black" mask={`url(#${uid}s${i})`} />
        ))}
      </mask>
      <rect {...area} fill="#050403" mask={`url(#${uid}dark)`} />
    </g>
  )
}

/** A short fingerprint of a string, for ids. */
function hashOf(text: string): string {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** A padlock, drawn — closed or open. */
export function LockIcon({ locked, size = 12 }: { locked: boolean; size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d={locked ? 'M5.5 7V5a2.5 2.5 0 0 1 5 0v2' : 'M5.5 7V5a2.5 2.5 0 0 1 4.9-.7'} />
    </svg>
  )
}

/** An eye, open or struck through. */
export function EyeIcon({ open, size = 12 }: { open: boolean; size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
      {!open && <path d="M2.5 13.5l11-11" />}
    </svg>
  )
}

/** "Hidden" / "Hide" — keeps something off the players' map (and a creature out of their turn order) until revealed. */
export function HideToggle({ hidden, onChange }: { hidden: boolean; onChange: (hidden: boolean) => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onChange(!hidden)}
      title={hidden ? 'Hidden from players — click to reveal it' : 'Hide it from players until you reveal it'}
      style={{ ...presetBtn, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', ...(hidden ? { borderColor: 'var(--accent)', color: 'var(--accent-hover)' } : {}) }}
    >
      <EyeIcon open={!hidden} />
      {hidden ? 'Hidden' : 'Hide'}
    </button>
  )
}

/** "Locked" / "Lock in place" — what the side panel and the shape options use. */
export function LockToggle({ locked, onChange }: { locked: boolean; onChange: (locked: boolean) => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onChange(!locked)}
      title={locked ? 'Locked in place — click to unlock' : 'Lock it in place so it can’t be moved by accident'}
      style={{ ...presetBtn, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', ...(locked ? { borderColor: 'var(--accent)', color: 'var(--accent-hover)' } : {}) }}
    >
      <LockIcon locked={locked} />
      {locked ? 'Locked' : 'Lock'}
    </button>
  )
}

/**
 * A combatant's token. It's drawn at its own corner and moved into place,
 * gliding there when it moves (a move made, or someone else's drag coming
 * in) — but not while you drag it yourself, so it stays under the pointer.
 */
/** A facing as a compass point ("north-east") and degrees. */
function compass(deg: number): string {
  const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']
  return deg % 45 === 0 ? names[deg / 45] : `${deg}°`
}

/** The handle beside the selected token's facing pointer: drag it round to turn the token. */
function TurnHandle({ id, t, zoom }: { id: string; t: MapToken; zoom: number }): JSX.Element {
  const k = 1 / zoom
  const a = (((t.facing ?? 0) - 90) * Math.PI) / 180
  const r = edgeAt(tokenW(t) * CELL, tokenH(t) * CELL, t.facing ?? 0)
  const cx = (t.x + tokenW(t) / 2) * CELL
  const cy = (t.y + tokenH(t) / 2) * CELL
  const d = r + HANDLE_OFFSET * k
  return (
    <g data-rotate={id} style={{ cursor: 'grab' }}>
      <title>Drag to turn it (Q and E turn it 45°)</title>
      <line x1={cx + Math.cos(a) * r} y1={cy + Math.sin(a) * r} x2={cx + Math.cos(a) * d} y2={cy + Math.sin(a) * d} stroke="var(--accent)" strokeWidth={2 * k} pointerEvents="none" />
      <circle cx={cx + Math.cos(a) * d} cy={cy + Math.sin(a) * d} r={8 * k} fill="var(--bg-surface)" stroke="var(--accent)" strokeWidth={3 * k} />
      <path d={`M${cx + Math.cos(a) * d - 3.5 * k} ${cy + Math.sin(a) * d}a${3.5 * k} ${3.5 * k} 0 1 1 ${3.5 * k} ${3.5 * k}`} fill="none" stroke="var(--accent)" strokeWidth={1.5 * k} pointerEvents="none" />
    </g>
  )
}

/**
 * Which way a token faces: a pointer on its edge — and for a vehicle, its
 * fore arc (the 90° it fires into) as a faint wedge, stronger when selected.
 */
function FacingMark({ t, vehicle, selected }: { t: MapToken; vehicle: boolean; selected: boolean }): JSX.Element {
  const w = tokenW(t) * CELL
  const h = tokenH(t) * CELL
  const cx = w / 2
  const cy = h / 2
  const R = Math.max(w, h) * 0.95
  const d = edgeAt(w, h, t.facing ?? 0)
  const s45 = Math.SQRT1_2
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${t.facing ?? 0})`} pointerEvents="none">
      {vehicle && <path d={`M0 0L${-R * s45} ${-R * s45}A${R} ${R} 0 0 1 ${R * s45} ${-R * s45}Z`} fill="var(--accent)" fillOpacity={selected ? 0.18 : 0.08} stroke="var(--accent)" strokeOpacity={selected ? 0.6 : 0.25} strokeWidth={1.5} strokeDasharray="5 4" />}
      <path d={`M-8 ${3 - d}L0 ${-9 - d}L8 ${3 - d}Z`} fill="var(--accent-hover)" stroke="rgba(0,0,0,0.7)" strokeWidth={1.5} strokeLinejoin="round" />
    </g>
  )
}

/**
 * Where a weapon being aimed can reach: a ring at its reach (from the
 * shooter's edge), with the arcs it fires into filled — or all round when it
 * fires anywhere or the shooter has no facing.
 */
function AimOverlay({ t, arcs, reach, zoom }: { t: MapToken; arcs?: VehicleArc[]; reach: number | null; zoom: number }): JSX.Element {
  const c = tokenCentre(t)
  const cx = c.x * CELL
  const cy = c.y * CELL
  const R = ((reach ?? 30) + Math.max(tokenW(t), tokenH(t)) / 2) * CELL
  const k = 1 / zoom
  const all = !arcs?.length || t.facing === undefined
  const CENTRES: Record<VehicleArc, number> = { fore: 0, starboard: 90, aft: 180, port: 270 }
  const wedge = (centre: number): string => {
    const a0 = ((t.facing! + centre - 45 - 90) * Math.PI) / 180
    const a1 = ((t.facing! + centre + 45 - 90) * Math.PI) / 180
    return `M${cx} ${cy}L${cx + Math.cos(a0) * R} ${cy + Math.sin(a0) * R}A${R} ${R} 0 0 1 ${cx + Math.cos(a1) * R} ${cy + Math.sin(a1) * R}Z`
  }
  return (
    <g pointerEvents="none">
      {all ? <circle cx={cx} cy={cy} r={R} fill="var(--danger)" fillOpacity={0.08} /> : arcs!.map((a) => <path key={a} d={wedge(CENTRES[a])} fill="var(--danger)" fillOpacity={0.12} stroke="var(--danger)" strokeOpacity={0.5} strokeWidth={1.5 * k} />)}
      {reach !== null && <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--danger)" strokeWidth={2 * k} strokeDasharray={`${8 * k} ${6 * k}`} />}
    </g>
  )
}

type Box = { x0: number; y0: number; x1: number; y1: number }

/** The turn handle sits this far (on screen) past the token's edge; with its knob, it reaches HANDLE_REACH. */
const HANDLE_OFFSET = 22
const HANDLE_REACH = HANDLE_OFFSET + 10

/**
 * A settings panel beside something on the map (`box`, in squares): to its
 * right, else its left, else below or above it — never over it if there's
 * any room — and kept inside the map's view.
 */
function Beside({ box, view, area, padPx = 0, children }: { box: Box; view: { x: number; y: number; zoom: number }; area: { w: number; h: number }; /** Room to leave round it, in pixels (a token's turn handle). */ padPx?: number; children: ReactNode }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [own, setOwn] = useState({ w: 230, h: 120 })
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect()
    if (r && (Math.abs(r.width - own.w) > 1 || Math.abs(r.height - own.h) > 1)) setOwn({ w: r.width, h: r.height })
  })
  const s = CELL * view.zoom
  const left = view.x + box.x0 * s - padPx
  const right = view.x + box.x1 * s + padPx
  const top = view.y + box.y0 * s - padPx
  const bottom = view.y + box.y1 * s + padPx
  const gap = 12
  const pad = 8
  const clampX = (x: number): number => Math.max(pad, Math.min(area.w - own.w - pad, x))
  const clampY = (y: number): number => Math.max(52, Math.min(area.h - own.h - pad, y))
  let x: number
  let y: number
  if (right + gap + own.w <= area.w - pad) [x, y] = [right + gap, clampY(top)]
  else if (left - gap - own.w >= pad) [x, y] = [left - gap - own.w, clampY(top)]
  else if (bottom + gap + own.h <= area.h - pad) [x, y] = [clampX(left), bottom + gap]
  else [x, y] = [clampX(left), Math.max(pad, top - gap - own.h)]
  return (
    <div ref={ref} style={{ position: 'absolute', left: x, top: y, zIndex: 6, maxWidth: 260 }}>
      {children}
    </div>
  )
}

const tokenBox = (t: MapToken): Box => ({ x0: t.x, y0: t.y, x1: t.x + tokenW(t), y1: t.y + tokenH(t) })

/** Roughly where a spell area lies, in squares. */
function shapeBox(t: MapTemplate, feetPerCell: number): Box {
  if (t.kind === 'sphere') {
    const r = t.sizeFt / feetPerCell
    return { x0: t.origin.x - r, y0: t.origin.y - r, x1: t.origin.x + r, y1: t.origin.y + r }
  }
  return { x0: Math.min(t.origin.x, t.toward.x), y0: Math.min(t.origin.y, t.toward.y), x1: Math.max(t.origin.x, t.toward.x), y1: Math.max(t.origin.y, t.toward.y) }
}

/** How far it is from the middle of a w × h box to its edge, heading `deg` (clockwise from up). */
function edgeAt(w: number, h: number, deg: number): number {
  const a = (deg * Math.PI) / 180
  const dx = Math.abs(Math.sin(a))
  const dy = Math.abs(Math.cos(a))
  return Math.min(dx > 1e-6 ? w / 2 / dx : Infinity, dy > 1e-6 ? h / 2 / dy : Infinity)
}

function Token({ c, t, turn, selected, blocked, glide }: { c: Combatant; t: MapToken; turn: boolean; selected: boolean; blocked: boolean; glide: boolean }): JSX.Element {
  const size = tokenW(t) * CELL
  const height = tokenH(t) * CELL
  const cx = size / 2
  const cy = height / 2
  const small = Math.min(size, height)
  const dead = c.currentHp <= 0
  const color = c.kind === 'player' ? '#3f7fb5' : c.kind === 'vehicle' ? (c.party ? '#8a6d3b' : '#7a3d2a') : '#a9473a'
  const initials =
    c.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?'
  const frac = Math.max(0, Math.min(1, c.currentHp / Math.max(1, c.maxHp)))
  const r = small / 2 - 3
  const len = 2 * Math.PI * r
  // Rings round the whole token (an oval for a long one).
  const ring = (pad: number, props: React.SVGProps<SVGEllipseElement>): JSX.Element => <ellipse cx={cx} cy={cy} rx={size / 2 + pad} ry={height / 2 + pad} fill="none" {...props} />
  return (
    <g data-token={c.id} style={{ cursor: 'grab', transform: `translate(${t.x * CELL}px, ${t.y * CELL}px)`, transition: glide ? 'transform 0.16s linear' : 'none' }} opacity={dead ? 0.45 : c.hidden ? 0.55 : 1}>
      <title>{`${c.name} — ${c.currentHp}/${c.maxHp} HP, AC ${c.ac}${c.hidden ? ' (hidden from players)' : ''}`}</title>
      {c.hidden && ring(4, { stroke: 'var(--text-muted)', strokeWidth: 2, strokeDasharray: '3 4' })}
      {turn && ring(2, { stroke: 'var(--accent)', strokeWidth: 3 })}
      {selected && ring(6, { stroke: 'var(--text-primary)', strokeWidth: 1.5, strokeDasharray: '4 3' })}
      {t.facing !== undefined && c.kind === 'vehicle' && <FacingMark t={t} vehicle selected={selected} />}
      {c.kind === 'vehicle' ? (
        <rect x={4} y={4} width={size - 8} height={height - 8} rx={12} fill={color} stroke={blocked ? 'var(--danger)' : 'rgba(0,0,0,0.55)'} strokeWidth={2} />
      ) : (
        <ellipse cx={cx} cy={cy} rx={size / 2 - 5} ry={height / 2 - 5} fill={color} stroke={blocked ? 'var(--danger)' : 'rgba(0,0,0,0.55)'} strokeWidth={2} />
      )}
      {!dead && <circle cx={cx} cy={cy} r={r} fill="none" stroke={frac > 0.5 ? 'var(--success)' : frac > 0.25 ? 'var(--accent)' : 'var(--danger)'} strokeWidth={3} strokeDasharray={`${len * frac} ${len}`} transform={`rotate(-90 ${cx} ${cy})`} />}
      <text x={cx} y={cy + 5} textAnchor="middle" fill="#fff" fontSize={Math.min(16, 10 + Math.min(tokenW(t), tokenH(t)) * 3)} fontWeight={700} pointerEvents="none">
        {dead ? 'X' : initials}
      </text>
      {t.facing !== undefined && c.kind !== 'vehicle' && <FacingMark t={t} vehicle={false} selected={selected} />}
      {t.locked && (
        <g transform={`translate(${size - 16} ${height - 16})`} pointerEvents="none" color="var(--text-primary)">
          <circle cx={7} cy={7} r={9} fill="var(--bg-surface)" stroke="var(--border-strong)" />
          <g transform="translate(1 1) scale(0.75)">
            <LockIcon locked size={16} />
          </g>
        </g>
      )}
    </g>
  )
}

function Ruler({ from, to, feetPerCell }: { from: Pt; to: Pt; feetPerCell: number }): JSX.Element {
  const a = { x: (from.x + 0.5) * CELL, y: (from.y + 0.5) * CELL }
  const b = { x: (to.x + 0.5) * CELL, y: (to.y + 0.5) * CELL }
  return (
    <g pointerEvents="none">
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--accent-hover)" strokeWidth={3} strokeDasharray="8 5" />
      <Label x={b.x} y={b.y} text={`${gridDistanceFt(from, to, feetPerCell)} ft`} />
    </g>
  )
}

function Label({ x, y, text }: { x: number; y: number; text: string }): JSX.Element {
  const w = 12 + text.length * 7.5
  return (
    <g pointerEvents="none">
      <rect x={x + 8} y={y - 28} width={w} height={22} rx={6} fill="var(--bg-surface)" stroke="var(--border-strong)" />
      <text x={x + 8 + w / 2} y={y - 12} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--accent-hover)">
        {text}
      </text>
    </g>
  )
}

function SizeLabel({ t, feetPerCell }: { t: MapTemplate; feetPerCell: number }): JSX.Element {
  const h = handlePoint(t, feetPerCell)
  return <Label x={h.x * CELL} y={h.y * CELL} text={templateLabel(t)} />
}

function Handle({ t, feetPerCell }: { t: MapTemplate; feetPerCell: number }): JSX.Element {
  const h = handlePoint(t, feetPerCell)
  return (
    <g data-handle={t.id} style={{ cursor: 'nwse-resize' }}>
      <title>Drag to resize or turn it</title>
      <circle cx={h.x * CELL} cy={h.y * CELL} r={9} fill="var(--bg-surface)" stroke="var(--accent)" strokeWidth={3} />
    </g>
  )
}

/** A spell area, drawn at its real size: the cone's width equals its length at the far end, as in the 5e rules. */
function Template({ t, feetPerCell, selected, movable }: { t: MapTemplate; feetPerCell: number; selected: boolean; movable: boolean }): JSX.Element {
  const px = (ft: number): number => (ft / feetPerCell) * CELL
  const o = { x: t.origin.x * CELL, y: t.origin.y * CELL }
  const ang = Math.atan2(t.toward.y * CELL - o.y, t.toward.x * CELL - o.x)
  const L = px(t.sizeFt)
  const style = {
    fill: t.hidden ? 'rgba(209,116,72,0.1)' : selected ? 'rgba(209,116,72,0.32)' : 'rgba(209,116,72,0.22)',
    stroke: selected ? 'var(--text-primary)' : 'var(--accent)',
    strokeWidth: selected ? 3 : 2,
    ...(t.hidden ? { strokeDasharray: '6 5' } : {})
  }
  let shape: JSX.Element
  if (t.kind === 'sphere') shape = <circle cx={o.x} cy={o.y} r={L} {...style} />
  else if (t.kind === 'cube') {
    const dx = Math.sign(t.toward.x - t.origin.x) || 1
    const dy = Math.sign(t.toward.y - t.origin.y) || 1
    shape = <rect x={Math.min(o.x, o.x + dx * L)} y={Math.min(o.y, o.y + dy * L)} width={L} height={L} {...style} />
  } else if (t.kind === 'line') {
    const w = px(5) / 2
    const nx = -Math.sin(ang) * w
    const ny = Math.cos(ang) * w
    const ex = o.x + Math.cos(ang) * L
    const ey = o.y + Math.sin(ang) * L
    shape = <polygon points={`${o.x + nx},${o.y + ny} ${ex + nx},${ey + ny} ${ex - nx},${ey - ny} ${o.x - nx},${o.y - ny}`} {...style} />
  } else {
    const half = Math.atan(0.5)
    const edge = L / Math.cos(half)
    shape = <polygon points={`${o.x},${o.y} ${o.x + edge * Math.cos(ang - half)},${o.y + edge * Math.sin(ang - half)} ${o.x + edge * Math.cos(ang + half)},${o.y + edge * Math.sin(ang + half)}`} {...style} />
  }
  return (
    <g data-template={t.id} style={{ cursor: movable ? (t.locked ? 'not-allowed' : 'move') : undefined }} pointerEvents={movable ? undefined : 'none'}>
      <title>{templateLabel(t)}</title>
      {shape}
    </g>
  )
}

const NO_SOURCES: VisionSource[] = []
const NO_DRAGS: Record<string, Pt> = {}
const optRow = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' } as const
const numBox = { width: 64, padding: '2px 4px', fontSize: 12, textAlign: 'center' } as const
const panel = { padding: '8px 10px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: '0 6px 20px rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 190 } as const
const zoomButton = { width: 34, height: 30, borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--text-primary)', cursor: 'pointer', font: 'inherit' } as const
const iconBtn = { background: 'none', border: 0, color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'inline-flex' } as const
const stepBtn = { padding: '0 7px', cursor: 'pointer' } as const
const presetBtn = { fontSize: 11, padding: '1px 7px', borderRadius: 999, border: '1px solid var(--border-strong)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', font: 'inherit' } as const
