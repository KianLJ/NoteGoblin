import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getStoredFontScale } from '../../theme'
import {
  GRID,
  addNode,
  snap,
  layoutForPreset,
  bringToFront,
  clampZoom,
  findNode,
  fitViewport,
  removeNode,
  renameNode,
  revealRect,
  setNodeRect,
  presetFromLayout,
  setMinimized,
  COLLECTION_PREFIX,
  addCollection,
  dissolveCollection,
  moveIntoCollection,
  setPinned,
  zoomAt,
  isTrackpadWheel,
  readingOrder,
  type CanvasNodeGeom,
  type CanvasLayout,
  type Rect,
  type Viewport
} from '@shared/canvasLayout'
import { CanvasNode } from './CanvasNode'
import { CanvasZoomContext } from './canvasZoom'
import { DYNAMIC_SIZE, MIN_CONTENT, TOOL_META, TOOLS_BY_MODE, dynamicKind, type CanvasMode, type ToolKind } from '@shared/canvasTools'
import { ContextMenu, type ContextMenuItem, type ContextMenuState } from '../../ui/ContextMenu'
import { LayoutsMenu } from './LayoutsMenu'
import { allEntries, restoreEntries } from './canvasEntries'
import { putCanvasImage } from './canvasImages'
import { imageBoxSize } from './ImageBox'
import { PlusIcon } from '../../ui/icons'
import { useCanvasMood } from './useCanvasMood'
import { ImageIcon, StickyIcon } from '../campaigns/icons'
import type { CanvasNav } from './useCanvasLayout'
import { entryNodeId, putEntry } from './canvasEntries'
import { offerUndo } from '../../ui/undo'
import { NEW_BROWSER_WINDOW_EVENT, setFirstPage } from '../browser/browserAccount'
import { OPEN_CODEX_ENTRY_EVENT } from '../campaigns/CodexItemPicker'
import type { CodexRef } from '@shared/codexRef'
import { BrowserIcon } from '../browser/BrowserPanel'
import type { CanvasItem } from './toolItems'

/** A point on the canvas, in world coordinates. */
export interface CanvasPoint {
  x: number
  y: number
}

export interface CanvasHandle {
  /** Brings a node to the front and pans it into view — once it's on the canvas, if it's only just been opened. */
  reveal: (id: string) => void
  /** Opens a tool (or reveals it when it's already open) — at `at` when given, else in a free spot in view. */
  openTool: (kind: ToolKind, at?: CanvasPoint) => void
  closeTool: (kind: ToolKind) => void
  /** Gives `id` a place at `at` before its item exists (a note being created), or reveals it when it already has one. */
  openAt: (id: string, size: { w: number; h: number }, at?: CanvasPoint) => void
  /** Another Browser box, opening `url` if given. */
  openBrowser: (url?: string) => void
}

interface CanvasProps {
  mode: CanvasMode
  layout: CanvasLayout
  setLayout: (update: (layout: CanvasLayout) => CanvasLayout) => void
  items: CanvasItem[]
  toolIcons: Record<ToolKind, ReactNode>
  /** Tools opened from somewhere else (the header) — left out of the bottom bar. */
  hiddenTools?: ToolKind[]
  /** Floats in the bottom-left corner, over the canvas (the campaign or character switcher, settings). */
  corner?: ReactNode
  /** Floats in the bottom-right corner (the round Dice button). */
  floating?: ReactNode
  /** Extra widgets in the dock, after the tools (the DM's session timer). */
  dock?: ReactNode
  /**
   * What a right-click on empty canvas offers, for the spot clicked: `add` goes in the menu's Add ▸ submenu
   * (with the sticky notes, collections and images every canvas has), `open` below it. Omitted: no menu.
   */
  contextMenu?: (at: CanvasPoint) => { add: ContextMenuItem[]; open?: ContextMenuItem[] }
  /** Getting around collections (canvases inside the canvas) — see useCanvasLayout.ts. */
  nav?: CanvasNav
  /** Box ids in order (a session's scenes): numbered, with an arrow from each to the next. */
  sequence?: string[]
  /**
   * The sequence is set by hand: moving boxes doesn't change it, and each number is a picker for where that box goes
   * in the order (`to`, from 0).
   */
  onSequenceMove?: (id: string, to: number) => void
  /** After the breadcrumb, inside a collection (a session's Present button). */
  crumbExtra?: ReactNode
  /** Small text in the top-left corner: the open campaign's name. */
  title?: string
  /** Beside the title (the DM's Host button). */
  titleExtra?: ReactNode
  /** A saved layout was loaded with these boxes: the workspace opens any it only shows while open (a player's notes and sheets). */
  onRestoreBoxes?: (ids: string[]) => void
}

const ZOOM_STEP = 1.2

/**
 * The workspace: an endless sheet you pan and zoom, with every tool as a box
 * on it (CanvasNode). The wheel zooms at the cursor; dragging with the left or
 * right button on empty space, or the middle button anywhere, pans. On a
 * trackpad, two fingers pan and a pinch zooms. A wheel over a box's insides
 * scrolls the box instead — hold Ctrl (or pinch) to zoom from there too.
 *
 * Panning and zooming live in local state while they happen and are written
 * back to the layout once they settle, so the tools inside don't re-render
 * on every frame.
 */
export const Canvas = forwardRef<CanvasHandle, CanvasProps>(function Canvas({ mode, layout, setLayout, items, toolIcons, hiddenTools = [], corner, floating, dock, contextMenu, nav, sequence, onSequenceMove, crumbExtra, title, titleExtra, onRestoreBoxes }, ref) {
  const viewportRef = useRef<HTMLDivElement>(null)
  // The dot grid's pattern id (useId's colons aren't safe inside url(#…)).
  const gridId = `gb-grid${useId().replace(/:/g, '')}`
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [vp, setVp] = useState<Viewport>(layout.viewport)
  const vpRef = useRef(vp)
  vpRef.current = vp
  // The zoom the boxes are laid out at (CSS zoom), which catches up with the view's zoom once zooming stops.
  // Laid out at their real on-screen size, every box draws sharp text at any zoom; a scale transform alone
  // stretches the layers Chromium gives scrolling areas, which is what blurred music, the calendar and the rest.
  // While a zoom is under way the difference is a quick scale, so zooming stays smooth.
  const [laidOutZoom, setLaidOutZoom] = useState(vp.zoom)
  useEffect(() => {
    if (vp.zoom === laidOutZoom) return
    const t = setTimeout(() => setLaidOutZoom(vp.zoom), 160)
    return () => clearTimeout(t)
  }, [vp.zoom, laidOutZoom])
  const zooming = vp.zoom !== laidOutZoom
  const zoomContext = useMemo(() => ({ zoom: laidOutZoom, zooming }), [laidOutZoom, zooming])
  const [panning, setPanning] = useState(false)
  const [pendingReveal, setPendingReveal] = useState<string | null>(null)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const mood = useCanvasMood()

  // Picks up a viewport set from outside (a preset, Fit all) — otherwise the local one leads.
  const lastCommitted = useRef(layout.viewport)
  useEffect(() => {
    if (layout.viewport !== lastCommitted.current) {
      lastCommitted.current = layout.viewport
      setVp(layout.viewport)
    }
  }, [layout.viewport])

  useEffect(() => {
    if (vp === lastCommitted.current) return
    const timer = setTimeout(() => {
      lastCommitted.current = vp
      setLayout((l) => ({ ...l, viewport: vp }))
    }, 250)
    return () => clearTimeout(timer)
  }, [vp, setLayout])

  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    observer.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => observer.disconnect()
  }, [])

  // Screen point (in this element's own, pre-font-scale pixels) for a mouse event.
  const localPoint = useCallback((clientX: number, clientY: number) => {
    const rect = viewportRef.current!.getBoundingClientRect()
    const scale = getStoredFontScale()
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale }
  }, [])

  // Wheel: native, non-passive listener — React's onWheel can't preventDefault.
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    function onWheel(e: WheelEvent): void {
      const target = e.target as Element
      // Over a box's insides (or the bottom row's popovers, like Dice) the wheel scrolls them instead.
      if (target.closest('.gb-canvas-bottom') || (!e.ctrlKey && target.closest('[data-canvas-node-body]'))) return
      e.preventDefault()
      const trackpad = isTrackpadWheel(e)
      // Two-finger scroll on a trackpad pans; a pinch (which arrives as Ctrl+wheel) or a mouse wheel zooms.
      if (trackpad && !e.ctrlKey) {
        const scale = getStoredFontScale()
        setVp((v) => ({ ...v, x: v.x - e.deltaX / scale, y: v.y - e.deltaY / scale }))
        return
      }
      const p = localPoint(e.clientX, e.clientY)
      setVp((v) => zoomAt(v, v.zoom * Math.exp(-e.deltaY * (trackpad ? 0.01 : 0.0025)), p.x, p.y))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [localPoint])

  const pan = useRef<{ sx: number; sy: number; start: Viewport; pointerId: number } | null>(null)
  // Whether the last right-button press dragged (a pan) — the right-click that follows then opens no menu.
  const rightDragged = useRef(false)

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    const target = e.target as Element
    const onBackground = !target.closest('[data-canvas-node]')
    // Left-drag (for trackpads) only from the bare sheet — not the bars and buttons floating over it.
    const onBareSheet = target === e.currentTarget || target.matches('.gb-canvas-world, .gb-canvas-zoom, .gb-canvas-pinned, .gb-canvas-mood, .gb-canvas-empty, .gb-canvas-empty *')
    // Right-drag only from empty space, so right-click menus inside the tools still work.
    if (!(e.button === 1 || (e.button === 2 && onBackground) || (e.button === 0 && onBareSheet))) return
    // Left presses keep their default, so clicking the sheet still takes focus out of a box's text field.
    if (e.button !== 0) e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    pan.current = { sx: e.clientX, sy: e.clientY, start: vpRef.current, pointerId: e.pointerId }
    if (e.button === 2) rightDragged.current = false
    setPanning(true)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    const p = pan.current
    if (!p || p.pointerId !== e.pointerId) return
    const scale = getStoredFontScale()
    if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) >= 4) rightDragged.current = true
    setVp({ ...p.start, x: p.start.x + (e.clientX - p.sx) / scale, y: p.start.y + (e.clientY - p.sy) / scale })
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    if (pan.current?.pointerId !== e.pointerId) return
    pan.current = null
    setPanning(false)
  }

  // A right-click on empty canvas that didn't drag opens the menu for that spot. Tools inside boxes keep their own.
  function onContextMenu(e: React.MouseEvent<HTMLDivElement>): void {
    if ((e.target as Element).closest('[data-canvas-node]')) return
    e.preventDefault()
    if (rightDragged.current || !contextMenu) return
    const local = localPoint(e.clientX, e.clientY)
    const v = vpRef.current
    const at = { x: (local.x - v.x) / v.zoom, y: (local.y - v.y) / v.zoom }
    const sticky: ContextMenuItem = {
      label: 'Sticky note',
      icon: <StickyIcon />,
      separatorBefore: true,
      onSelect: () => {
        const entry = { kind: 'sticky', id: crypto.randomUUID(), text: '', color: 'yellow' } as const
        putEntry(mode, entry)
        openAt(entryNodeId(entry), DYNAMIC_SIZE.sticky, at)
      }
    }
    const browser: ContextMenuItem = {
      label: 'Browser window',
      icon: <BrowserIcon />,
      onSelect: () => openBrowserWindow(at)
    }
    const image: ContextMenuItem = {
      label: 'Image…',
      icon: <ImageIcon />,
      onSelect: () => void addImage(at)
    }
    const collection: ContextMenuItem = {
      label: 'Collection',
      icon: <CollectionIcon />,
      onSelect: () => setLayout((l) => addCollection(l, crypto.randomUUID(), 'New collection', at))
    }
    const { add, open = [] } = contextMenu(at)
    // Everything new goes under one Add ▸; the workspace's own new things first, then the ones every canvas has.
    const addMenu: ContextMenuItem = { label: 'Add', icon: <PlusIcon />, submenu: [...add, sticky, image, browser, ...(nav ? [collection] : [])] }
    setMenu({ x: e.clientX, y: e.clientY, items: [addMenu, ...open.map((item, i) => (i === 0 ? { ...item, separatorBefore: true } : item))] })
  }

  /** Picks an image file and puts it on the canvas at `at`, sized to its own proportions. */
  async function addImage(at: CanvasPoint): Promise<void> {
    const picked = await window.goblin.files.pickImage()
    if (!picked.ok) return
    const img = new Image()
    img.src = picked.data.dataUrl
    await img.decode().catch(() => undefined)
    const entry = { kind: 'image', id: crypto.randomUUID(), name: picked.data.fileName } as const
    await putCanvasImage(entry.id, picked.data.dataUrl)
    putEntry(mode, entry)
    openAt(entryNodeId(entry), imageBoxSize(img.naturalWidth || 400, img.naturalHeight || 300), at)
  }

  // Give every item that has no place yet one: a preset's reserved slot for its kind, or a free spot in view.
  useEffect(() => {
    if (size.w === 0) return
    // A box placed inside another collection (or the canvas above) stays there — it isn't pulled onto this one.
    const missing = items.filter((item) => !findNode(layout, item.id) && !nav?.placed.has(item.id))
    if (missing.length === 0) return
    setLayout((l) => {
      let next = { ...l, viewport: vpRef.current }
      for (const item of missing) {
        if (findNode(next, item.id)) continue
        const slot = `slot:${dynamicKind(item.id)}`
        next = findNode(next, slot) ? bringToFront(renameNode(next, slot, item.id), item.id) : addNode(next, item.id, item.size, size.w, size.h)
      }
      return next
    })
  }, [items, layout, setLayout, size, nav])

  const reveal = useCallback(
    (id: string) => {
      const node = findNode(layout, id)
      if (!node || size.w === 0) {
        setPendingReveal(id)
        return
      }
      setLayout((l) => bringToFront(l, id))
      // A pinned box is on screen already.
      if (!node.pinned) setVp((v) => revealRect(v, node, size.w, size.h))
    },
    [layout, setLayout, size]
  )

  useEffect(() => {
    if (pendingReveal && findNode(layout, pendingReveal) && size.w > 0) {
      setPendingReveal(null)
      reveal(pendingReveal)
    }
  }, [pendingReveal, layout, size, reveal])

  const openAt = useCallback(
    (id: string, boxSize: { w: number; h: number }, at?: CanvasPoint) => {
      if (!findNode(layout, id)) {
        setLayout((l) =>
          addNode({ ...l, viewport: vpRef.current }, id, boxSize, size.w, size.h, at && { x: snap(at.x), y: snap(at.y), w: boxSize.w, h: boxSize.h })
        )
      }
      reveal(id)
    },
    [layout, setLayout, size, reveal]
  )

  const openTool = useCallback((kind: ToolKind, at?: CanvasPoint) => openAt(kind, TOOL_META[kind], at), [openAt])

  /** Another Browser box, its own tabs: at `at`, or where a new box goes. */
  const openBrowserWindow = useCallback(
    (at?: CanvasPoint, url?: string) => {
      const entry = { kind: 'browser', id: crypto.randomUUID() } as const
      if (url) setFirstPage(entry.id, url)
      putEntry(mode, entry)
      openAt(entryNodeId(entry), DYNAMIC_SIZE.browser, at)
    },
    [mode, openAt]
  )
  // A Browser box on this canvas asking for another (its "new window" button).
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onAsk = (e: Event): void => {
      e.stopPropagation()
      openBrowserWindow(undefined, (e as CustomEvent<{ url?: string }>).detail?.url)
    }
    // A quest reward or stash item asking for its Codex entry: in a box of its own, like one from the Codex.
    const onEntry = (e: Event): void => {
      e.stopPropagation()
      const ref = (e as CustomEvent<CodexRef>).detail
      if (!ref) return
      const entry = { kind: ref.kind, id: ref.id, name: ref.name } as const
      putEntry(mode, entry)
      openAt(entryNodeId(entry), DYNAMIC_SIZE.entry)
    }
    el.addEventListener(NEW_BROWSER_WINDOW_EVENT, onAsk)
    el.addEventListener(OPEN_CODEX_ENTRY_EVENT, onEntry)
    return () => {
      el.removeEventListener(NEW_BROWSER_WINDOW_EVENT, onAsk)
      el.removeEventListener(OPEN_CODEX_ENTRY_EVENT, onEntry)
    }
  }, [openBrowserWindow, mode, openAt])

  const closeTool = useCallback((kind: ToolKind) => setLayout((l) => removeNode(l, kind)), [setLayout])

  const openBrowser = useCallback((url?: string) => openBrowserWindow(undefined, url), [openBrowserWindow])
  useImperativeHandle(ref, () => ({ reveal, openTool, closeTool, openAt, openBrowser }), [reveal, openTool, closeTool, openAt, openBrowser])

  function zoomBy(factor: number): void {
    setVp((v) => zoomAt(v, v.zoom * factor, size.w / 2, size.h / 2))
  }

  // Each collection on this canvas is a tile of its own.
  const collectionItems: CanvasItem[] = Object.entries(layout.collections ?? {}).map(([cid, c]) => ({
    id: `${COLLECTION_PREFIX}${cid}`,
    title: c.name || 'Collection',
    icon: <CollectionIcon />,
    size: { w: 96, h: 96 },
    className: 'gb-canvas-node--collection',
    content: null
  }))
  const rendered = [...items, ...collectionItems].map((item) => ({ item, node: findNode(layout, item.id) })).filter((r) => r.node)

  /** The collection tile (on this canvas, not pinned) a box was dropped onto, if any. */
  function collectionUnder(id: string, r: { x: number; y: number; w: number; h: number }): string | null {
    const cx = r.x + r.w / 2
    const cy = r.y + r.h / 2
    const tile = layout.nodes.find((n) => n.id !== id && n.id.startsWith(COLLECTION_PREFIX) && !n.pinned && cx >= n.x && cx <= n.x + n.w && cy >= n.y && cy <= n.y + n.h)
    return tile ? tile.id.slice(COLLECTION_PREFIX.length) : null
  }
  const topZ = rendered.reduce((max, r) => Math.max(max, r.node!.z), 0)

  function fitAll(): void {
    setVp(fitViewport(rendered.filter((r) => !r.node!.pinned).map((r) => r.node!), size.w, size.h - 56))
  }

  // A pinned box sits in screen space, and the canvas clips what's outside it: its title bar always stays inside, so
  // it can't be dropped (or left, from an older layout or a bigger window) where it can never be grabbed again.
  function onScreen(r: Rect): Rect {
    return { ...r, x: Math.min(Math.max(r.x, 64 - r.w), Math.max(0, size.w - 64)), y: Math.min(Math.max(r.y, 0), Math.max(0, size.h - 40)) }
  }

  // A session's scene box being dragged right now: its numbers and arrows follow it (and re-number) as it moves.
  const [dragged, setDragged] = useState<{ id: string; rect: Rect } | null>(null)
  const seqRect = (id: string): CanvasNodeGeom | undefined => {
    const n = findNode(layout, id)
    return n && dragged?.id === id ? { ...n, ...dragged.rect } : n
  }
  // The same reading order the session's order is worked out by (CampaignWorkspace), over where the boxes are now.
  const liveSequence = sequence && !onSequenceMove && dragged && sequence.includes(dragged.id) ? readingOrder(sequence.map(seqRect).filter((n): n is NonNullable<typeof n> => !!n && !n.pinned)) : sequence

  function renderNode({ item, node }: (typeof rendered)[number]): JSX.Element {
    const isCollection = item.id.startsWith(COLLECTION_PREFIX)
    return (
      <CanvasNode
        key={item.id}
        id={item.id}
        // A tool's small view is shown at its own size, even in a layout saved before it had one.
        rect={(node!.pinned ? onScreen : (x: Rect) => x)(node!.minimized && item.miniSize ? { ...node!, ...item.miniSize } : node!)}
        z={node!.z}
        // A pinned box shows at 100%, so dragging it moves it pixel for pixel.
        zoom={node!.pinned ? 1 : vp.zoom}
        title={item.title}
        icon={item.icon}
        actions={item.actions}
        front={node!.z === topZ}
        pinned={node!.pinned}
        onTogglePin={() => setLayout((l) => setPinned(l, item.id, !node!.pinned, vpRef.current))}
        minimized={isCollection || !!node!.minimized}
        onToggleMinimize={isCollection ? () => nav?.enter(item.id.slice(COLLECTION_PREFIX.length)) : () => setLayout((l) => setMinimized(l, item.id, !node!.minimized, item.miniSize))}
        mini={item.mini}
        tileOpenTitle={isCollection ? 'Open' : undefined}
        onMoveOut={nav?.path.length ? () => nav.moveOut(item.id) : undefined}
        minContent={MIN_CONTENT[dynamicKind(item.id)]}
        className={item.className}
        kind={dynamicKind(item.id)}
        onFocus={() => {
          setLayout((l) => bringToFront(l, item.id))
          item.onFocus?.()
        }}
        onLiveRect={!node!.pinned && sequence?.includes(item.id) ? (r) => setDragged(r ? { id: item.id, rect: r } : null) : undefined}
        onRectChange={(r) => {
          // Dropped onto a collection's tile: it goes in.
          const into = node!.pinned ? null : collectionUnder(item.id, r)
          const rect = node!.pinned ? onScreen(r) : r
          setLayout((l) => (into ? moveIntoCollection(setNodeRect(l, item.id, rect), item.id, into) : setNodeRect(l, item.id, rect)))
        }}
        onClose={item.noClose ? undefined : () => {
          // Closing a collection's tile breaks it up: what's inside comes back out here, nothing's lost.
          // A session's is only shelved — kept whole, opened again from the Sessions box.
          const cid = item.id.slice(COLLECTION_PREFIX.length)
          if (isCollection && layout.collections?.[cid]?.sessionDeckId) setLayout((l) => removeNode(l, item.id))
          else if (isCollection) setLayout((l) => dissolveCollection(l, cid))
          else {
            // A thing put on the canvas (a sticky, a picture, a statblock, a Browser box) is gone once closed — so it
            // can be brought back, where it was. Tools and notes only close; they're still there to reopen.
            const entry = allEntries(mode)[item.id]
            const at = node!.pinned ? null : { x: node!.x, y: node!.y, w: node!.w, h: node!.h }
            if (entry && at) {
              const title = typeof item.title === 'string' && item.title ? item.title : 'the box'
              offerUndo(`Closed ${title}`, () => {
                putEntry(mode, entry)
                setLayout((l) => addNode(l, item.id, { w: at.w, h: at.h }, size.w, size.h, at))
              })
            }
            setLayout((l) => removeNode(l, item.id))
          }
          item.onClose?.()
        }}
      >
        {item.content}
      </CanvasNode>
    )
  }

  const tools = TOOLS_BY_MODE[mode].filter((kind) => !hiddenTools.includes(kind))
  const gridPx = GRID * vp.zoom

  return (
    <div
      ref={viewportRef}
      className={panning ? 'gb-canvas gb-canvas--panning' : 'gb-canvas'}
      data-mood={mood ?? undefined}
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* The dot grid. An SVG pattern, not a CSS gradient: the browser rounds a gradient's tile to whole pixels, so
          at most zooms the dots drifted and jumped as a trackpad zoomed smoothly. Its origin is the world's own. */}
      <svg className="gb-canvas-grid" aria-hidden="true">
        <defs>
          <pattern id={gridId} width={gridPx * 2} height={gridPx * 2} x={Math.round(vp.x)} y={Math.round(vp.y)} patternUnits="userSpaceOnUse">
            <circle cx={gridPx} cy={gridPx} r={1.15} fill="currentColor" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${gridId})`} />
      </svg>
      {/* The light the scene's music (or a fight) casts over the table — see useCanvasMood.ts. */}
      <div className="gb-canvas-mood" aria-hidden="true" />
      {/* Whole pixels, so nothing on the canvas sits between two. */}
      <div className="gb-canvas-world" style={{ transform: `translate(${Math.round(vp.x)}px, ${Math.round(vp.y)}px)${vp.zoom === laidOutZoom ? '' : ` scale(${vp.zoom / laidOutZoom})`}` }}>
        <div className="gb-canvas-zoom" style={{ zoom: laidOutZoom }}>
        <CanvasZoomContext.Provider value={zoomContext}>
        {liveSequence && <SequenceArrows nodes={liveSequence.map(seqRect).filter((n) => n && !n.pinned) as Rect[]} />}
        {rendered.filter((r) => !r.node!.pinned).map(renderNode)}
        {liveSequence?.map((id, i) => {
          const n = seqRect(id)
          if (!n || n.pinned) return null
          const style = { left: n.x - 12, top: n.y - 12, zIndex: topZ + 1 }
          // Set by hand: the number picks where this scene goes.
          return onSequenceMove ? (
            <select
              key={id}
              className="gb-canvas-seq-badge gb-canvas-seq-badge--pick"
              style={style}
              value={i}
              aria-label={`Scene ${i + 1}: move to`}
              title="Move this scene to another place in the order"
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => onSequenceMove(id, Number(e.target.value))}
            >
              {liveSequence.map((_, k) => (
                <option key={k} value={k}>
                  {k + 1}
                </option>
              ))}
            </select>
          ) : (
            <span key={id} className="gb-canvas-seq-badge" style={style} aria-hidden="true">
              {i + 1}
            </span>
          )
        })}
        </CanvasZoomContext.Provider>
        </div>
      </div>
      <div className="gb-canvas-pinned">{rendered.filter((r) => r.node!.pinned).map(renderNode)}</div>

      {title && (
        <div className="gb-canvas-title">
          <span className="gb-canvas-title-name">{title}</span>
          {titleExtra && (
            <span className="gb-canvas-title-extra" onPointerDown={(e) => e.stopPropagation()}>
              {titleExtra}
            </span>
          )}
        </div>
      )}

      {nav && nav.path.length > 0 && (
        <nav className="gb-canvas-crumbs" aria-label="Collections" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className="gb-canvas-crumb" onClick={() => nav.exitTo(0)}>
            ← Canvas
          </button>
          {nav.names.map((c, i) =>
            i < nav.names.length - 1 ? (
              <button key={c.id} type="button" className="gb-canvas-crumb" onClick={() => nav.exitTo(i + 1)}>
                › {c.name || 'Collection'}
              </button>
            ) : (
              <span key={c.id} className="gb-canvas-crumb-here">
                ›
                <input value={c.name} size={Math.max(10, c.name.length + 1)} onChange={(e) => nav.rename(e.target.value)} aria-label="Collection name" placeholder="Collection" />
              </span>
            )
          )}
          {crumbExtra}
        </nav>
      )}

      {rendered.length === 0 && (
        <div className="gb-canvas-empty">
          <strong>{nav?.path.length ? 'An empty collection' : 'An empty table'}</strong>
          <span>{contextMenu ? 'Right-click to add a note, an image, a sticky note or a tool here — or pick a layout below.' : 'Add a tool from the bar below, or pick a layout to start from.'}</span>
        </div>
      )}

      {/* Right-clicks down here are the bar's own (close a tool) — never the canvas menu. */}
      <div className="gb-canvas-bottom" onContextMenu={(e) => e.stopPropagation()}>
      <div className="gb-canvas-corner" onPointerDown={(e) => e.stopPropagation()}>
        {corner}
      </div>
      <div className="gb-canvas-toolbar" onPointerDown={(e) => e.stopPropagation()}>
        <div className="gb-canvas-toolbar-group" role="group" aria-label="Tools">
          {tools.map((kind) => {
            const open = !!findNode(layout, kind)
            return (
              <button
                key={kind}
                type="button"
                className={open ? 'gb-dock-tool gb-dock-tool--open' : 'gb-dock-tool'}
                data-kind={kind}
                data-label={open ? `${TOOL_META[kind].title} · right-click to close` : TOOL_META[kind].title}
                aria-label={TOOL_META[kind].title}
                aria-pressed={open}
                onClick={() => openTool(kind)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  closeTool(kind)
                }}
              >
                {toolIcons[kind]}
              </button>
            )
          })}
        </div>
        {dock && (
          <>
            <div className="gb-canvas-toolbar-sep" />
            <div className="gb-canvas-toolbar-group">{dock}</div>
          </>
        )}
        <div className="gb-canvas-toolbar-sep" />
        <div className="gb-canvas-toolbar-group" role="group" aria-label="View">
          <LayoutsMenu
            mode={mode}
            onApply={(preset) => {
              const next = layoutForPreset(preset, layout, items.map((i) => i.id).filter((id) => id.includes(':')))
              if (preset.snapshot) {
                // Closed stickies, statblocks and images it had come back; boxes opened since (notes, sheets) close.
                if (preset.entries) restoreEntries(mode, preset.entries)
                const ids = new Set(next.nodes.map((n) => n.id))
                for (const item of items) if (!ids.has(item.id) && /^(note|character|playerSheet|partySheet):/.test(item.id)) item.onClose?.()
                onRestoreBoxes?.(next.nodes.map((n) => n.id))
              }
              // The viewport goes in with the layout — the canvas picks a viewport set from outside up from there.
              setLayout(() => ({ ...next, viewport: fitViewport(next.nodes.filter((n) => !n.pinned), size.w, size.h - 56) }))
            }}
            onSaveCurrent={(label) => presetFromLayout(layout, 'new', label, allEntries(mode))}
          />
          <button type="button" className="gb-dock-tool" data-label="Fit everything in view" aria-label="Fit everything in view" onClick={fitAll} disabled={rendered.length === 0}>
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M1.5 5.5v-4h4M10.5 1.5h4v4M14.5 10.5v4h-4M5.5 14.5h-4v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="gb-dock-zoom" role="group" aria-label="Zoom">
            <button type="button" data-label="Zoom out" aria-label="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)}>
              −
            </button>
            <button type="button" className="gb-dock-zoom-value" data-label="Back to 100%" onClick={() => setVp((v) => zoomAt(v, 1, size.w / 2, size.h / 2))}>
              {Math.round(clampZoom(vp.zoom) * 100)}%
            </button>
            <button type="button" data-label="Zoom in" aria-label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)}>
              +
            </button>
          </div>
        </div>
      </div>
      <div className="gb-canvas-floating" onPointerDown={(e) => e.stopPropagation()}>
        {floating}
      </div>
      </div>
      <ContextMenu state={menu} onClose={() => setMenu(null)} />
    </div>
  )
})

function CollectionIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="4.5" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4.5 2.5h8a1.5 1.5 0 0 1 1.5 1.5v7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

/** Where the line from the centre of `r` towards (dx, dy) leaves the box. */
function edgePoint(r: Rect, dx: number, dy: number): { x: number; y: number } {
  const t = Math.min(dx ? r.w / 2 / Math.abs(dx) : Infinity, dy ? r.h / 2 / Math.abs(dy) : Infinity)
  return { x: r.x + r.w / 2 + dx * t, y: r.y + r.h / 2 + dy * t }
}

/** An arrow from each box to the next, edge to edge, drawn under the boxes. */
function SequenceArrows({ nodes }: { nodes: Rect[] }): JSX.Element | null {
  if (nodes.length < 2) return null
  const lines = nodes.slice(1).map((to, i) => {
    const from = nodes[i]
    const dx = to.x + to.w / 2 - (from.x + from.w / 2)
    const dy = to.y + to.h / 2 - (from.y + from.h / 2)
    if (!dx && !dy) return null
    const a = edgePoint(from, dx, dy)
    const b = edgePoint(to, -dx, -dy)
    return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} markerEnd="url(#gb-seq-head)" />
  })
  return (
    <svg className="gb-canvas-sequence" aria-hidden="true">
      <defs>
        <marker id="gb-seq-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="currentColor" />
        </marker>
      </defs>
      {lines}
    </svg>
  )
}
