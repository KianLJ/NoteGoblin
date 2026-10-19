// The battle map itself: an SVG grid (over the uploaded map image, if any),
// a token per combatant, spell templates and fog. Pan by dragging empty map
// with the Move tool (or the middle mouse button), zoom with the wheel.
// Shapes are sized by dragging as they're placed; a placed one, selected
// with Move, can be dragged, resized from its handle, or sized exactly.
import { useEffect, useRef, useState } from 'react'
import { canStand, fogShapeAt, gridDistanceFt, moveFogShape, snapHalf, templateLabel, type BattleMap, type FogShape, type MapTemplate, type MapToken, type TemplateKind } from '@shared/battleMap'
import type { Combatant } from '@shared/encounter'
import { XIcon } from '../../ui/icons'

export type MapTool = 'move' | 'ruler' | TemplateKind | 'fog'
export type FogDraw = 'move' | 'brush' | 'line' | 'points' | 'rect' | 'circle'
export interface FogTool {
  /** Paint fog, or cut it away. */
  op: 'add' | 'cut'
  draw: FogDraw
  /** Brush and line width, in squares. */
  width: number
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
  fogTool: FogTool
  /** Snap shapes and fog to square corners and centres (and sizes to whole squares). */
  snap: boolean
  onHint: (text: string) => void
}

type Pt = { x: number; y: number }

type Drag =
  | { kind: 'token'; id: string; from: MapToken; at: MapToken }
  | { kind: 'pan'; x: number; y: number; px: number; py: number }
  | { kind: 'measure'; from: Pt; to: Pt }
  /** Placing a new shape, or resizing a placed one from its handle (`existing`). */
  | { kind: 'shape'; t: MapTemplate; existing: boolean; moved: boolean }
  | { kind: 'shapeMove'; t: MapTemplate; grab: Pt; at: Pt }
  /** Drawing fog: a brush stroke's points, or a line, square or circle from where the drag started. */
  | { kind: 'fog'; shape: FogShape }
  | { kind: 'fogMove'; id: string; grab: Pt; at: Pt }

/** A shape's size from how far it's been dragged: whole squares when snapping, else whole feet (at least one). */
function sizeFromDrag(kind: TemplateKind, origin: Pt, to: Pt, feetPerCell: number, snap: boolean): number {
  const dx = to.x - origin.x
  const dy = to.y - origin.y
  const squares = kind === 'cube' ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.hypot(dx, dy)
  return snap ? Math.max(1, Math.round(squares)) * feetPerCell : Math.max(1, Math.round(squares * feetPerCell))
}

/** A fog shape from where a drag started to where it is now. */
function fogFromDrag(shape: FogShape, from: Pt, to: Pt): FogShape {
  switch (shape.kind) {
    case 'rect':
      return { ...shape, x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), w: Math.abs(to.x - from.x), h: Math.abs(to.y - from.y) }
    case 'circle':
      return { ...shape, r: Math.hypot(to.x - from.x, to.y - from.y) }
    default:
      return shape
  }
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

export function BattleMapView({ map, onChange, combatants, turnId, selectedId, onSelect, tool, fogTool, snap, onHint }: Props): JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null)
  const [view, setView] = useState({ x: 40, y: 70, zoom: 1 })
  const [drag, setDrag] = useState<Drag | null>(null)
  const [selectedShape, setSelectedShape] = useState<string | null>(null)
  const [selectedFog, setSelectedFog] = useState<string | null>(null)
  const fogPicked = map.fog.find((f) => f.id === selectedFog) ?? null
  // Fog drawn point by point: the points so far, and where the pointer is (for the line to it).
  const [points, setPoints] = useState<Pt[] | null>(null)
  const [hover, setHover] = useState<Pt | null>(null)
  const fogStart = useRef<Pt>({ x: 0, y: 0 })
  const at = (p: Pt): Pt => (snap ? snapHalf(p) : p)

  // Switching tools (or fog shapes) drops a half-drawn point shape and the picked fog.
  useEffect(() => {
    setPoints(null)
    if (tool !== 'fog' || fogTool.draw !== 'move') setSelectedFog(null)
  }, [tool, fogTool.draw, fogTool.op])

  function closePoints(list: Pt[] | null): void {
    if (list && list.length >= 3) {
      onChange({ ...map, fog: [...map.fog, { id: crypto.randomUUID(), op: fogTool.op, kind: 'poly', points: list }] })
      onHint(fogTool.op === 'add' ? 'Fog drawn. Ctrl+Z undoes.' : 'Fog cut away. Ctrl+Z undoes.')
    }
    setPoints(null)
  }

  // Enter finishes a point-by-point shape; Escape abandons it.
  useEffect(() => {
    if (!points) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') closePoints(points)
      else if (e.key === 'Escape') setPoints(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, map])
  const fitted = useRef(false)
  const shape = map.templates.find((t) => t.id === selectedShape) ?? null

  /** Zoom and centre so the whole map fits the view. */
  function fit(): void {
    const el = svgRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return
    const zoom = Math.max(0.2, Math.min(2, Math.min((r.width - 40) / (map.cols * CELL), (r.height - 90) / (map.rows * CELL))))
    setView({ zoom, x: (r.width - map.cols * CELL * zoom) / 2, y: 60 + (r.height - 60 - map.rows * CELL * zoom) / 2 })
  }
  // Fit when the map is first shown and whenever its size changes; a window resize re-fits until the DM pans or zooms.
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    fit()
    const observer = new ResizeObserver(() => {
      if (!fitted.current) fit()
    })
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.cols, map.rows])

  // A shape undone away (or deleted) is no longer selected.
  useEffect(() => {
    if (selectedShape && !shape) setSelectedShape(null)
  }, [selectedShape, shape])

  // Delete or Backspace removes the selected shape or picked fog — unless it's locked.
  useEffect(() => {
    if (!shape && !fogPicked) return
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (shape && !shape.locked) removeShape(shape.id)
      else if (fogPicked && !fogPicked.locked) removeFog(fogPicked.id)
      else onHint('It’s locked. Unlock it first.')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape, fogPicked, map])

  const removeShape = (id: string): void => {
    onChange({ ...map, templates: map.templates.filter((t) => t.id !== id) })
    setSelectedShape(null)
  }
  const updateShape = (t: MapTemplate): void => onChange({ ...map, templates: map.templates.map((x) => (x.id === t.id ? t : x)) })
  const updateFog = (f: FogShape): void => onChange({ ...map, fog: map.fog.map((x) => (x.id === f.id ? f : x)) })
  const removeFog = (id: string): void => {
    onChange({ ...map, fog: map.fog.filter((f) => f.id !== id) })
    setSelectedFog(null)
  }

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

  /** A pointer position in map squares (fractional). */
  function toMap(e: { clientX: number; clientY: number }): Pt {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left - view.x) / (CELL * view.zoom), y: (e.clientY - r.top - view.y) / (CELL * view.zoom) }
  }
  const cellOf = (p: Pt): Pt => ({ x: Math.floor(p.x), y: Math.floor(p.y) })
  const inMap = (c: Pt): boolean => c.x >= 0 && c.y >= 0 && c.x < map.cols && c.y < map.rows

  function onPointerDown(e: React.PointerEvent): void {
    const p = toMap(e)
    const c = cellOf(p)
    const target = e.target as Element
    const tokenId = target.closest('[data-token]')?.getAttribute('data-token')
    const shapeId = target.closest('[data-template]')?.getAttribute('data-template')
    const handleId = target.closest('[data-handle]')?.getAttribute('data-handle')
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    if (handleId) {
      const t = map.templates.find((x) => x.id === handleId)
      if (t && !t.locked) setDrag({ kind: 'shape', t, existing: true, moved: false })
      return
    }
    if (e.button === 1 || (tool === 'move' && !tokenId && !shapeId)) {
      setDrag({ kind: 'pan', x: e.clientX, y: e.clientY, px: view.x, py: view.y })
      if (e.button !== 1) {
        onSelect(null)
        setSelectedShape(null)
      }
      return
    }
    if (tool === 'move' && tokenId) {
      const t = map.tokens[tokenId]
      onSelect(tokenId)
      setSelectedShape(null)
      if (t?.locked) onHint('This token is locked in place. Unlock it in the side panel to move it.')
      else if (t) setDrag({ kind: 'token', id: tokenId, from: t, at: t })
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
    if (tool === 'fog' && fogTool.draw === 'move') {
      const f = fogShapeAt(map, p)
      setSelectedFog(f?.id ?? null)
      if (!f) onHint('Click on fog (or a cut) to pick it.')
      else if (f.locked) onHint('This fog is locked. Unlock it to move it.')
      else setDrag({ kind: 'fogMove', id: f.id, grab: p, at: p })
      return
    }
    if (tool === 'fog') {
      const q = at(p)
      const base = { id: crypto.randomUUID(), op: fogTool.op }
      if (fogTool.draw === 'points') {
        // Clicking near the first point (or double-clicking) closes the shape.
        if (points && points.length >= 3 && Math.hypot(q.x - points[0].x, q.y - points[0].y) < 0.35) closePoints(points)
        else if (points && e.detail >= 2) closePoints(points)
        else setPoints([...(points ?? []), q])
        return
      }
      fogStart.current = q
      const shape: FogShape =
        fogTool.draw === 'rect'
          ? { ...base, kind: 'rect', x: q.x, y: q.y, w: 0, h: 0 }
          : fogTool.draw === 'circle'
            ? { ...base, kind: 'circle', cx: q.x, cy: q.y, r: 0 }
            : { ...base, kind: 'stroke', width: fogTool.width, points: fogTool.draw === 'line' ? [q, q] : [p] }
      setDrag({ kind: 'fog', shape })
      return
    }
    if (!inMap(c)) return
    if (tool === 'ruler') setDrag({ kind: 'measure', from: c, to: c })
    else if (tool !== 'move') {
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
      const at = { ...drag.at, x: Math.round(p.x - drag.from.size / 2), y: Math.round(p.y - drag.from.size / 2) }
      if (at.x !== drag.at.x || at.y !== drag.at.y) {
        setDrag({ ...drag, at })
        onHint(`Moving ${gridDistanceFt(drag.from, at, map.feetPerCell)} ft.`)
      }
    } else if (drag.kind === 'measure') {
      setDrag({ ...drag, to: c })
      onHint(`${gridDistanceFt(drag.from, c, map.feetPerCell)} ft.`)
    } else if (drag.kind === 'shape') {
      // Barely moved: keep the default size, so a click still places something sensible.
      if (!drag.moved && !drag.existing && Math.hypot(p.x - drag.t.origin.x, p.y - drag.t.origin.y) < 0.6) return
      const sizeFt = sizeFromDrag(drag.t.kind, drag.t.origin, p, map.feetPerCell, snap)
      setDrag({ ...drag, moved: true, t: { ...drag.t, toward: p, sizeFt } })
      onHint(templateLabel({ ...drag.t, sizeFt }))
    } else if (drag.kind === 'shapeMove' || drag.kind === 'fogMove') setDrag({ ...drag, at: p })
    else if (drag.kind === 'fog') {
      const s = drag.shape
      const q = at(p)
      if (s.kind === 'stroke' && fogTool.draw === 'brush') {
        const last = s.points[s.points.length - 1]
        if (Math.hypot(p.x - last.x, p.y - last.y) > 0.15) setDrag({ kind: 'fog', shape: { ...s, points: [...s.points, p] } })
      } else if (s.kind === 'stroke') setDrag({ kind: 'fog', shape: { ...s, points: [fogStart.current, q] } })
      else setDrag({ kind: 'fog', shape: fogFromDrag(s, fogStart.current, q) })
    }
  }

  function onHoverMove(e: React.PointerEvent): void {
    if (points) setHover(at(toMap(e)))
    onPointerMove(e)
  }

  function onPointerUp(): void {
    if (!drag) return
    if (drag.kind === 'token') {
      const moved = drag.at.x !== drag.from.x || drag.at.y !== drag.from.y
      if (moved && canStand(map, drag.at, drag.id)) onChange({ ...map, tokens: { ...map.tokens, [drag.id]: drag.at } })
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
    } else if (drag.kind === 'fogMove') {
      const { dx, dy } = offset(drag)
      const f = map.fog.find((x) => x.id === drag.id)
      if (f && (dx || dy)) updateFog(moveFogShape(f, dx, dy))
    } else if (drag.kind === 'fog') {
      const s = drag.shape
      const empty = (s.kind === 'rect' && (s.w < 0.1 || s.h < 0.1)) || (s.kind === 'circle' && s.r < 0.1)
      if (!empty) {
        onChange({ ...map, fog: [...map.fog, s] })
        onHint(s.op === 'add' ? 'Fog drawn. Ctrl+Z undoes.' : 'Fog cut away. Ctrl+Z undoes.')
      }
    }
    setDrag(null)
  }

  function onWheel(e: React.WheelEvent): void {
    fitted.current = true
    const r = svgRef.current!.getBoundingClientRect()
    const mx = e.clientX - r.left
    const my = e.clientY - r.top
    setView((v) => {
      const zoom = Math.max(0.2, Math.min(3, v.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
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

  // Fog as it'd be with the stroke in progress (or the point shape so far) included.
  const draftFog: FogShape | null = drag?.kind === 'fog' ? drag.shape : points && points.length >= 3 ? { id: 'draft', op: fogTool.op, kind: 'poly', points } : null
  const movedFog = drag?.kind === 'fogMove' ? map.fog.map((f) => (f.id === drag.id ? moveFogShape(f, offset(drag).dx, offset(drag).dy) : f)) : map.fog
  const fogShapes = draftFog ? [...movedFog, draftFog] : movedFog
  const pickedShown = selectedFog ? movedFog.find((f) => f.id === selectedFog) : undefined
  const W = map.cols * CELL
  const H = map.rows * CELL

  return (
    <>
      <svg
        ref={svgRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: drag?.kind === 'pan' ? 'grabbing' : tool === 'move' ? 'default' : 'crosshair', touchAction: 'none', userSelect: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onHoverMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
        onWheel={onWheel}
        onAuxClick={(e) => e.preventDefault()}
      >
        <defs>
          <pattern id="bm-floor" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
            <rect width={CELL} height={CELL} fill="#3b352b" />
            <rect x={2} y={2} width={CELL - 4} height={CELL - 4} rx={4} fill="#443d31" />
          </pattern>
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
          {map.image ? <image href={map.image} x={0} y={0} width={W} height={H} preserveAspectRatio="none" /> : <rect width={W} height={H} fill="url(#bm-floor)" />}
          <g stroke="rgba(0,0,0,0.35)" strokeWidth={1}>
            {Array.from({ length: map.cols + 1 }, (_, i) => (
              <line key={`c${i}`} x1={i * CELL} y1={0} x2={i * CELL} y2={H} />
            ))}
            {Array.from({ length: map.rows + 1 }, (_, i) => (
              <line key={`r${i}`} x1={0} y1={i * CELL} x2={W} y2={i * CELL} />
            ))}
          </g>
          <rect width={W} height={H} fill="none" stroke="var(--border-strong)" strokeWidth={2} />

          {shown.map((t) => (
            <Template key={t.id} t={t} feetPerCell={map.feetPerCell} selected={t.id === selectedShape} movable={tool === 'move'} />
          ))}

          {combatants.map((c) => {
            const t = drag?.kind === 'token' && drag.id === c.id ? drag.at : map.tokens[c.id]
            return t ? <Token key={c.id} c={c} t={t} turn={c.id === turnId} selected={c.id === selectedId} blocked={drag?.kind === 'token' && drag.id === c.id && !canStand(map, drag.at, c.id)} /> : null
          })}

          {fogShapes.length > 0 && (
            <>
              <mask id="bm-fog" maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
                <rect width={W} height={H} fill="black" />
                {fogShapes.map((f) => (
                  <FogShapeSvg key={f.id} f={f} />
                ))}
              </mask>
              <rect width={W} height={H} fill="#0b0907" opacity={0.6} mask="url(#bm-fog)" pointerEvents="none" />
            </>
          )}
          {draftFog && <FogOutline f={draftFog} />}
          {pickedShown && <FogOutline f={pickedShown} />}
          {points && (
            <g pointerEvents="none">
              <polyline points={[...points, ...(hover ? [hover] : [])].map((q) => `${q.x * CELL},${q.y * CELL}`).join(' ')} fill="none" stroke={fogTool.op === 'add' ? 'var(--text-primary)' : 'var(--accent)'} strokeWidth={2} strokeDasharray="6 4" />
              {points.map((q, i) => (
                <circle key={i} cx={q.x * CELL} cy={q.y * CELL} r={i === 0 ? 7 : 4} fill={i === 0 ? 'var(--bg-surface)' : 'var(--text-primary)'} stroke="var(--accent)" strokeWidth={2} />
              ))}
            </g>
          )}

          {/* The shape being placed or resized shows its size; a selected one has a handle to drag. */}
          {drag?.kind === 'shape' && <SizeLabel t={drag.t} feetPerCell={map.feetPerCell} />}
          {selectedShown && drag?.kind !== 'shape' && !selectedShown.locked && <Handle t={selectedShown} feetPerCell={map.feetPerCell} />}
          {drag?.kind === 'measure' && <Ruler from={drag.from} to={drag.to} feetPerCell={map.feetPerCell} />}
        </g>
      </svg>

      {shape && <ShapeOptions t={shape} feetPerCell={map.feetPerCell} onChange={updateShape} onRemove={() => removeShape(shape.id)} onClose={() => setSelectedShape(null)} />}
      {fogPicked && !shape && <FogOptions f={fogPicked} onChange={updateFog} onRemove={() => removeFog(fogPicked.id)} onClose={() => setSelectedFog(null)} />}

      <div style={{ position: 'absolute', right: 12, bottom: 12, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 5 }}>
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
    <div style={{ position: 'absolute', top: 100, right: 12, zIndex: 6, padding: '8px 10px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: '0 6px 20px rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 190 }}>
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
        <button type="button" className="gb-btn gb-btn--ghost" onClick={onRemove} disabled={t.locked} style={{ fontSize: 12, padding: '3px 8px', color: 'var(--danger)', marginLeft: 'auto', opacity: t.locked ? 0.4 : 1 }}>
          Delete
        </button>
      </div>
    </div>
  )
}

const FOG_NAMES: Record<FogShape['kind'], string> = { rect: 'Square', circle: 'Circle', poly: 'Drawn shape', stroke: 'Brush stroke' }

/** The picked fog: fog or cut, locked or not, and a way to remove it. */
function FogOptions({ f, onChange, onRemove, onClose }: { f: FogShape; onChange: (f: FogShape) => void; onRemove: () => void; onClose: () => void }): JSX.Element {
  return (
    <div style={{ position: 'absolute', top: 100, right: 12, zIndex: 6, padding: '8px 10px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: '0 6px 20px rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 190 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <strong style={{ flex: 1, fontSize: 13 }}>
          {FOG_NAMES[f.kind]} ({f.op === 'add' ? 'fog' : 'cut'})
        </strong>
        <button type="button" onClick={onClose} title="Done" style={iconBtn}>
          <XIcon size={11} />
        </button>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {(['add', 'cut'] as const).map((op) => (
          <button key={op} type="button" disabled={f.locked} onClick={() => onChange({ ...f, op })} style={{ ...presetBtn, ...(f.op === op ? { borderColor: 'var(--accent)', color: 'var(--accent-hover)' } : {}), opacity: f.locked ? 0.45 : 1 }}>
            {op === 'add' ? 'Fog' : 'Cut'}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <LockToggle locked={!!f.locked} onChange={(locked) => onChange({ ...f, locked: locked || undefined })} />
        <button type="button" className="gb-btn gb-btn--ghost" onClick={onRemove} disabled={f.locked} style={{ fontSize: 12, padding: '3px 8px', color: 'var(--danger)', marginLeft: 'auto', opacity: f.locked ? 0.4 : 1 }}>
          Delete
        </button>
      </div>
    </div>
  )
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

/** One fog shape in the fog mask: white paints fog, black cuts it. */
function FogShapeSvg({ f }: { f: FogShape }): JSX.Element {
  const colour = f.op === 'add' ? 'white' : 'black'
  switch (f.kind) {
    case 'rect':
      return <rect x={f.x * CELL} y={f.y * CELL} width={f.w * CELL} height={f.h * CELL} fill={colour} />
    case 'circle':
      return <circle cx={f.cx * CELL} cy={f.cy * CELL} r={f.r * CELL} fill={colour} />
    case 'poly':
      return <polygon points={f.points.map((q) => `${q.x * CELL},${q.y * CELL}`).join(' ')} fill={colour} />
    case 'stroke':
      return <polyline points={f.points.map((q) => `${q.x * CELL},${q.y * CELL}`).join(' ')} fill="none" stroke={colour} strokeWidth={f.width * CELL} strokeLinecap="round" strokeLinejoin="round" />
  }
}

/** A dashed outline of the fog shape being drawn — light for fog, orange for a cut. */
function FogOutline({ f }: { f: FogShape }): JSX.Element {
  const style = { fill: 'none', stroke: f.op === 'add' ? 'var(--text-primary)' : 'var(--accent)', strokeWidth: 2, strokeDasharray: '6 4', pointerEvents: 'none' as const }
  switch (f.kind) {
    case 'rect':
      return <rect x={f.x * CELL} y={f.y * CELL} width={f.w * CELL} height={f.h * CELL} {...style} />
    case 'circle':
      return <circle cx={f.cx * CELL} cy={f.cy * CELL} r={f.r * CELL} {...style} />
    case 'poly':
      return <polygon points={f.points.map((q) => `${q.x * CELL},${q.y * CELL}`).join(' ')} {...style} />
    case 'stroke':
      return <polyline points={f.points.map((q) => `${q.x * CELL},${q.y * CELL}`).join(' ')} {...style} />
  }
}

function Token({ c, t, turn, selected, blocked }: { c: Combatant; t: MapToken; turn: boolean; selected: boolean; blocked: boolean }): JSX.Element {
  const size = t.size * CELL
  const cx = t.x * CELL + size / 2
  const cy = t.y * CELL + size / 2
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
  const r = size / 2 - 3
  const len = 2 * Math.PI * r
  return (
    <g data-token={c.id} style={{ cursor: 'grab' }} opacity={dead ? 0.45 : 1}>
      <title>{`${c.name} — ${c.currentHp}/${c.maxHp} HP, AC ${c.ac}`}</title>
      {turn && <circle cx={cx} cy={cy} r={size / 2 + 2} fill="none" stroke="var(--accent)" strokeWidth={3} />}
      {selected && <circle cx={cx} cy={cy} r={size / 2 + 6} fill="none" stroke="var(--text-primary)" strokeWidth={1.5} strokeDasharray="4 3" />}
      {c.kind === 'vehicle' ? (
        <rect x={t.x * CELL + 4} y={t.y * CELL + 4} width={size - 8} height={size - 8} rx={12} fill={color} stroke={blocked ? 'var(--danger)' : 'rgba(0,0,0,0.55)'} strokeWidth={2} />
      ) : (
        <circle cx={cx} cy={cy} r={size / 2 - 5} fill={color} stroke={blocked ? 'var(--danger)' : 'rgba(0,0,0,0.55)'} strokeWidth={2} />
      )}
      {!dead && <circle cx={cx} cy={cy} r={r} fill="none" stroke={frac > 0.5 ? 'var(--success)' : frac > 0.25 ? 'var(--accent)' : 'var(--danger)'} strokeWidth={3} strokeDasharray={`${len * frac} ${len}`} transform={`rotate(-90 ${cx} ${cy})`} />}
      <text x={cx} y={cy + 5} textAnchor="middle" fill="#fff" fontSize={Math.min(16, 10 + t.size * 3)} fontWeight={700} pointerEvents="none">
        {dead ? 'X' : initials}
      </text>
      {t.locked && (
        <g transform={`translate(${t.x * CELL + size - 16} ${t.y * CELL + size - 16})`} pointerEvents="none" color="var(--text-primary)">
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
  const style = { fill: selected ? 'rgba(209,116,72,0.32)' : 'rgba(209,116,72,0.22)', stroke: selected ? 'var(--text-primary)' : 'var(--accent)', strokeWidth: selected ? 3 : 2 }
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

const zoomButton = { width: 34, height: 30, borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--text-primary)', cursor: 'pointer', font: 'inherit' } as const
const iconBtn = { background: 'none', border: 0, color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'inline-flex' } as const
const stepBtn = { padding: '0 7px', cursor: 'pointer' } as const
const presetBtn = { fontSize: 11, padding: '1px 7px', borderRadius: 999, border: '1px solid var(--border-strong)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', font: 'inherit' } as const
