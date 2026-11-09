import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { getStoredFontScale } from '../../theme'
import { MIN_NODE_H, MIN_NODE_W, snap, type Rect } from '@shared/canvasLayout'

type Edge = { left?: boolean; right?: boolean; top?: boolean; bottom?: boolean }

const HANDLES: { edge: Edge; style: React.CSSProperties; cursor: string }[] = [
  { edge: { right: true }, style: { top: 8, bottom: 8, right: -4, width: 8 }, cursor: 'ew-resize' },
  { edge: { left: true }, style: { top: 8, bottom: 8, left: -4, width: 8 }, cursor: 'ew-resize' },
  { edge: { bottom: true }, style: { left: 8, right: 8, bottom: -4, height: 8 }, cursor: 'ns-resize' },
  { edge: { top: true }, style: { left: 8, right: 8, top: -4, height: 8 }, cursor: 'ns-resize' },
  { edge: { right: true, bottom: true }, style: { right: -4, bottom: -4, width: 14, height: 14 }, cursor: 'nwse-resize' },
  { edge: { left: true, top: true }, style: { left: -4, top: -4, width: 14, height: 14 }, cursor: 'nwse-resize' },
  { edge: { right: true, top: true }, style: { right: -4, top: -4, width: 14, height: 14 }, cursor: 'nesw-resize' },
  { edge: { left: true, bottom: true }, style: { left: -4, bottom: -4, width: 14, height: 14 }, cursor: 'nesw-resize' }
]

/** The title bar's height — what a box's contents don't get. */
const BAR_H = 32

function resized(start: Rect, edge: Edge | null, dx: number, dy: number): Rect {
  if (!edge) return { ...start, x: snap(start.x + dx), y: snap(start.y + dy) }
  let { x, y, w, h } = start
  if (edge.right) w = Math.max(MIN_NODE_W, snap(start.w + dx))
  if (edge.bottom) h = Math.max(MIN_NODE_H, snap(start.h + dy))
  if (edge.left) {
    w = Math.max(MIN_NODE_W, snap(start.w - dx))
    x = start.x + start.w - w
  }
  if (edge.top) {
    h = Math.max(MIN_NODE_H, snap(start.h - dy))
    y = start.y + start.h - h
  }
  return { x, y, w, h }
}

export interface CanvasNodeProps {
  id: string
  rect: Rect
  z: number
  zoom: number
  title: ReactNode
  icon?: ReactNode
  /** Extra controls in the title bar, before the box's own. */
  actions?: ReactNode
  front: boolean
  /** Stuck to the screen — see shared/canvasLayout.ts's setPinned. */
  pinned?: boolean
  onTogglePin?: () => void
  /** Shrunk to a tile — see shared/canvasLayout.ts's setMinimized. */
  minimized?: boolean
  /** Shown under the title bar while minimized, instead of the plain tile (a tool's own small view). */
  mini?: ReactNode
  onToggleMinimize?: () => void
  /** The smallest size its contents can be shown at; below it the box asks to be made bigger. */
  minContent?: { w: number; h: number }
  /** Extra classes on the box (a sticky note's paper). */
  className?: string
  /** A collection's tile: it never opens up — its restore button and a double-click go into it instead. */
  tileOpenTitle?: string
  /** Inside a collection: takes the box out, onto the canvas above. */
  onMoveOut?: () => void
  /** What kind of box it is ('note', 'dice', 'monster'…) — its colour (canvas.css). */
  kind?: string
  onFocus: () => void
  onRectChange: (rect: Rect) => void
  onClose?: () => void
  children: ReactNode
}

function NodeButton({ title, on, onClick, children }: { title: string; on?: boolean; onClick: () => void; children: ReactNode }): JSX.Element {
  return (
    <button
      type="button"
      className={on ? 'gb-canvas-node-close gb-canvas-node-pin--on' : 'gb-canvas-node-close'}
      title={title}
      aria-label={title}
      aria-pressed={on}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={onClick}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        {children}
      </svg>
    </button>
  )
}

/**
 * One box on the canvas: a title bar you drag it by, handles on every edge
 * and corner to resize it, and its tool inside. Minimized, it's a small tile
 * of its icon and title (double-click it, or its restore button, to open it
 * back up). A drag only re-renders this node (and the same `children`
 * element is handed straight back, so the tool inside doesn't re-render at
 * all) — the new rectangle is committed once, on release. The tool stays
 * mounted while minimized or too small to show, so nothing in it is lost.
 */
export function CanvasNode({
  id,
  rect,
  z,
  zoom,
  title,
  icon,
  actions,
  front,
  pinned,
  onTogglePin,
  minimized,
  mini,
  onToggleMinimize,
  minContent,
  className: extraClass,
  tileOpenTitle,
  onMoveOut,
  kind,
  onFocus,
  onRectChange,
  onClose,
  children
}: CanvasNodeProps): JSX.Element {
  const [live, setLive] = useState<Rect | null>(null)
  const drag = useRef<{ edge: Edge | null; sx: number; sy: number; start: Rect; scale: number; pointerId: number } | null>(null)
  const shown = live ?? rect
  const tooSmall = !minimized && !!minContent && (shown.w < minContent.w || shown.h - BAR_H < minContent.h)

  function begin(e: ReactPointerEvent<HTMLElement>, edge: Edge | null): void {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { edge, sx: e.clientX, sy: e.clientY, start: rect, scale: getStoredFontScale() * zoom, pointerId: e.pointerId }
    document.body.classList.add('gb-canvas-dragging')
    onFocus()
  }

  function move(e: ReactPointerEvent<HTMLElement>): void {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    setLive(resized(d.start, d.edge, (e.clientX - d.sx) / d.scale, (e.clientY - d.sy) / d.scale))
  }

  function end(e: ReactPointerEvent<HTMLElement>): void {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    drag.current = null
    document.body.classList.remove('gb-canvas-dragging')
    const next = resized(d.start, d.edge, (e.clientX - d.sx) / d.scale, (e.clientY - d.sy) / d.scale)
    setLive(null)
    if (next.x !== rect.x || next.y !== rect.y || next.w !== rect.w || next.h !== rect.h) onRectChange(next)
  }

  const dragHandlers = { onPointerMove: move, onPointerUp: end, onPointerCancel: end }


  const controls = (
    <>
      {actions && !minimized && (
        <span className="gb-canvas-node-actions" onPointerDown={(e) => e.stopPropagation()}>
          {actions}
        </span>
      )}
      {onTogglePin && (
        <NodeButton title={pinned ? 'Unpin — put it back on the canvas' : 'Pin to the screen — it stays put while you pan and zoom'} on={!!pinned} onClick={onTogglePin}>
          <path
            d="M10.5 1.5l4 4-2.2 1.1-2.6 2.6.4 3.3-1.6 1.6L5.6 11.2 2 14.8M4.8 6.5l1.6-1.6 3.3.4 2.6-2.6 1.1-2.2"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
            strokeLinecap="round"
            fill={pinned ? 'currentColor' : 'none'}
          />
        </NodeButton>
      )}
      {onToggleMinimize && (
        <NodeButton title={minimized ? (tileOpenTitle ?? 'Restore') : 'Minimize'} onClick={onToggleMinimize}>
          {minimized ? (
            <rect x="3" y="3" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
          ) : (
            <path d="M3.5 12h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          )}
        </NodeButton>
      )}
      {onMoveOut && (
        <NodeButton title="Move out of this collection" onClick={onMoveOut}>
          <path d="M6 10L13 3M8.5 3H13v4.5M11 9.5V13H3V5h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </NodeButton>
      )}
      {onClose && (
        <NodeButton title="Close" onClick={onClose}>
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </NodeButton>
      )}
    </>
  )

  const className = [
    'gb-canvas-node',
    front && 'gb-canvas-node--front',
    pinned && 'gb-canvas-node--pinned',
    minimized && (mini ? 'gb-canvas-node--compact' : 'gb-canvas-node--mini'),
    extraClass
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section
      className={className}
      data-canvas-node={id}
      data-kind={kind}
      aria-label={typeof title === 'string' ? title : undefined}
      onPointerDownCapture={onFocus}
      style={{ left: shown.x, top: shown.y, width: shown.w, height: shown.h, zIndex: z }}
    >
      {minimized && !mini ? (
        <div
          className="gb-canvas-node-tile"
          title={typeof title === 'string' ? `${title} — double-click to ${tileOpenTitle ? 'open' : 'restore'}` : undefined}
          onPointerDown={(e) => begin(e, null)}
          onDoubleClick={onToggleMinimize}
          {...dragHandlers}
        >
          <div className="gb-canvas-node-tile-controls">{controls}</div>
          {icon && <span className="gb-canvas-node-tile-icon">{icon}</span>}
          <span className="gb-canvas-node-tile-title">{title}</span>
        </div>
      ) : (
        <header className="gb-canvas-node-bar" onPointerDown={(e) => begin(e, null)} onDoubleClick={onToggleMinimize} {...dragHandlers}>
          {icon && <span className="gb-canvas-node-icon">{icon}</span>}
          <span className="gb-canvas-node-title">{title}</span>
          {controls}
        </header>
      )}
      {/* Kept mounted while hidden, so a minimized or too-small tool keeps its state. */}
      <div className="gb-canvas-node-body" data-canvas-node-body style={minimized || tooSmall ? { display: 'none' } : undefined}>
        {children}
      </div>
      {minimized && mini && <div className="gb-canvas-node-compact">{mini}</div>}
      {tooSmall && (
        <div className="gb-canvas-node-small">
          <span>Make this box bigger to see it</span>
        </div>
      )}
      {!minimized &&
        HANDLES.map((handle, i) => (
          <div
            key={i}
            className="gb-canvas-node-handle"
            style={{ ...handle.style, cursor: handle.cursor }}
            onPointerDown={(e) => begin(e, handle.edge)}
            {...dragHandlers}
          />
        ))}
    </section>
  )
}
