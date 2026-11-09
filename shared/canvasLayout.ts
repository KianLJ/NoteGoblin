/**
 * Pure layout maths for the workspace canvas (see Canvas.tsx). A layout is a
 * viewport plus one rectangle per node, in world coordinates; on screen a
 * world point p sits at p * zoom + (viewport.x, viewport.y).
 *
 * Node ids: a fixed tool is its own kind ('dice', 'calendar', ...) and is
 * open exactly while the layout holds its node. Things you open many of carry
 * their subject ('note:<noteId>', 'monster:<index>') — which of those are open
 * is decided by the workspace (its open note tabs, say), and the layout only
 * remembers where each one sits.
 *
 * A pinned node is stuck to the screen instead: its x/y are screen pixels
 * from the canvas's top-left, it shows at 100% whatever the zoom, and panning
 * or zooming leaves it where it is.
 *
 * A minimized node is a small square tile (MINI_SIZE) showing just its title;
 * `minimized` remembers the size it goes back to.
 */

export const GRID = 16
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 2
// Small enough to tuck a box away; a tool too big to show at a size says so instead (see CanvasNode).
export const MIN_NODE_W = 96
export const MIN_NODE_H = 64
/** A minimized node's square tile — three dot-grid cells across, room for an icon and a two-line title. */
export const MINI_SIZE = 96

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface CanvasNodeGeom extends Rect {
  id: string
  z: number
  /** Stuck to the screen (x/y in screen pixels) rather than the canvas. */
  pinned?: boolean
  /** Minimized to a tile; the size it was before. */
  minimized?: { w: number; h: number }
}

export interface Viewport {
  x: number
  y: number
  zoom: number
}

export interface CanvasLayout {
  viewport: Viewport
  nodes: CanvasNodeGeom[]
  /** Where pinned nodes were when they were closed, so opening one again puts it back there, pinned. */
  closedPins?: Record<string, CanvasNodeGeom>
  /** Collections on this canvas, by id — each a canvas of its own (shown here as its 'collection:<id>' tile). */
  collections?: Record<string, Collection>
}

/** A canvas inside a canvas: its tile sits on the parent, and double-clicking it opens its own layout. */
export interface Collection {
  name: string
  layout: CanvasLayout
  /**
   * A session's collection: its scenes are the 'note:<id>' boxes inside, in reading order (see readingOrder).
   * Closing its tile shelves it — the collection stays, tile-less, until it's opened again from the Sessions box.
   */
  sessionDeckId?: string
}

export const EMPTY_LAYOUT: CanvasLayout = { viewport: { x: 0, y: 0, zoom: 1 }, nodes: [] }

export function snap(value: number): number {
  return Math.round(value / GRID) * GRID
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

/** Zooms to `zoom` while keeping the world point under screen point (sx, sy) where it is — zooming at the cursor. */
export function zoomAt(vp: Viewport, zoom: number, sx: number, sy: number): Viewport {
  const next = clampZoom(zoom)
  const wx = (sx - vp.x) / vp.zoom
  const wy = (sy - vp.y) / vp.zoom
  return { x: sx - wx * next, y: sy - wy * next, zoom: next }
}

export function findNode(layout: CanvasLayout, id: string): CanvasNodeGeom | undefined {
  return layout.nodes.find((n) => n.id === id)
}

function topZ(layout: CanvasLayout): number {
  return layout.nodes.reduce((max, n) => Math.max(max, n.z), 0)
}

/** Raises a node above every other one. Returns the same layout when it's already on top, so a click on the front node doesn't cause a save. */
export function bringToFront(layout: CanvasLayout, id: string): CanvasLayout {
  const node = findNode(layout, id)
  if (!node) return layout
  const top = topZ(layout)
  if (node.z === top && layout.nodes.filter((n) => n.z === top).length === 1) return layout
  return { ...layout, nodes: layout.nodes.map((n) => (n.id === id ? { ...n, z: top + 1 } : n)) }
}

/** Moves and/or resizes a node, snapped to the grid and never smaller than the minimum size. A minimized tile only moves. */
export function setNodeRect(layout: CanvasLayout, id: string, rect: Rect): CanvasLayout {
  return {
    ...layout,
    nodes: layout.nodes.map((n) =>
      n.id !== id
        ? n
        : n.minimized
          ? { ...n, x: snap(rect.x), y: snap(rect.y) }
          : { ...n, x: snap(rect.x), y: snap(rect.y), w: Math.max(MIN_NODE_W, snap(rect.w)), h: Math.max(MIN_NODE_H, snap(rect.h)) }
    )
  }
}

/** Shrinks a node to its tile, keeping its top-left corner, or opens it back up to the size it had. */
export function setMinimized(layout: CanvasLayout, id: string, minimized: boolean): CanvasLayout {
  const node = findNode(layout, id)
  if (!node || !!node.minimized === minimized) return layout
  const next: CanvasNodeGeom = minimized
    ? { ...node, w: MINI_SIZE, h: MINI_SIZE, minimized: { w: node.w, h: node.h } }
    : { ...node, w: node.minimized!.w, h: node.minimized!.h, minimized: undefined }
  return { ...layout, nodes: layout.nodes.map((n) => (n.id === id ? next : n)) }
}

export function removeNode(layout: CanvasLayout, id: string): CanvasLayout {
  const node = findNode(layout, id)
  if (!node) return layout
  const nodes = layout.nodes.filter((n) => n.id !== id)
  return node.pinned ? { ...layout, nodes, closedPins: { ...layout.closedPins, [id]: node } } : { ...layout, nodes }
}

/** Gives a node already on the canvas a new id, keeping where it sits — a note node that navigates to another note stays put. */
export function renameNode(layout: CanvasLayout, from: string, to: string): CanvasLayout {
  if (from === to || !findNode(layout, from)) return layout
  return { ...layout, nodes: layout.nodes.filter((n) => n.id !== to).map((n) => (n.id === from ? { ...n, id: to } : n)) }
}

/**
 * Pins a node to the screen where it shows now, or unpins it back onto the
 * canvas under where it sits on screen. A pinned node shows at 100%, so
 * its top-left corner stays put and its size is its own.
 */
export function setPinned(layout: CanvasLayout, id: string, pinned: boolean, vp: Viewport): CanvasLayout {
  const node = findNode(layout, id)
  if (!node || !!node.pinned === pinned) return layout
  const moved = pinned
    ? { x: Math.round(node.x * vp.zoom + vp.x), y: Math.round(node.y * vp.zoom + vp.y), pinned: true }
    : { x: snap((node.x - vp.x) / vp.zoom), y: snap((node.y - vp.y) / vp.zoom), pinned: undefined }
  return { ...layout, nodes: layout.nodes.map((n) => (n.id === id ? { ...n, ...moved } : n)) }
}

export function boundsOf(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null
  const minX = Math.min(...rects.map((r) => r.x))
  const minY = Math.min(...rects.map((r) => r.y))
  const maxX = Math.max(...rects.map((r) => r.x + r.w))
  const maxY = Math.max(...rects.map((r) => r.y + r.h))
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** The viewport that shows every rect with a margin, never zoomed in past 100%. */
export function fitViewport(rects: Rect[], viewW: number, viewH: number, pad = 48): Viewport {
  const b = boundsOf(rects)
  if (!b || viewW <= 0 || viewH <= 0) return { x: 0, y: 0, zoom: 1 }
  const zoom = clampZoom(Math.min(1, (viewW - pad * 2) / b.w, (viewH - pad * 2) / b.h))
  return { x: (viewW - b.w * zoom) / 2 - b.x * zoom, y: (viewH - b.h * zoom) / 2 - b.y * zoom, zoom }
}

/** Pans (never zooms) just enough to bring a rect fully into view, or centres it when it's bigger than the view. */
export function revealRect(vp: Viewport, rect: Rect, viewW: number, viewH: number, pad = 24): Viewport {
  const left = rect.x * vp.zoom + vp.x
  const top = rect.y * vp.zoom + vp.y
  const w = rect.w * vp.zoom
  const h = rect.h * vp.zoom
  const dx = w + pad * 2 > viewW ? viewW / 2 - (left + w / 2) : left < pad ? pad - left : left + w > viewW - pad ? viewW - pad - (left + w) : 0
  const dy = h + pad * 2 > viewH ? pad - top : top < pad ? pad - top : top + h > viewH - pad ? viewH - pad - (top + h) : 0
  if (dx === 0 && dy === 0) return vp
  return { ...vp, x: vp.x + dx, y: vp.y + dy }
}

/**
 * Where a new w×h node goes: the middle of what's on screen, on top of
 * whatever's there — so it opens where you're looking rather than off
 * somewhere else on the canvas. If another node already sits at exactly that
 * spot (opening a few in a row), each steps down and right a little, so
 * they don't hide each other completely.
 */
export function placeNew(layout: CanvasLayout, w: number, h: number, viewW: number, viewH: number): Rect {
  const vp = layout.viewport
  const cx = (viewW / 2 - vp.x) / vp.zoom
  const cy = (viewH / 2 - vp.y) / vp.zoom
  let x = snap(cx - w / 2)
  let y = snap(cy - h / 2)
  while (layout.nodes.some((n) => !n.pinned && n.x === x && n.y === y)) {
    x += GRID * 2
    y += GRID * 2
  }
  return { x, y, w, h }
}

/**
 * Adds a node (above all others) at `rect`, or — given no rect — back where
 * it was pinned when last closed, else in the middle of the view. A no-op when the id is
 * already there.
 */
export function addNode(layout: CanvasLayout, id: string, size: { w: number; h: number }, viewW: number, viewH: number, rect?: Rect): CanvasLayout {
  if (findNode(layout, id)) return layout
  const pinnedBefore = rect ? undefined : layout.closedPins?.[id]
  const { [id]: _restored, ...closedPins } = layout.closedPins ?? {}
  const node = pinnedBefore ?? { id, ...(rect ?? placeNew(layout, size.w, size.h, viewW, viewH)) }
  return { ...layout, nodes: [...layout.nodes, { ...node, z: topZ(layout) + 1 }], closedPins }
}

export interface PresetNode extends Rect {
  /** A tool kind, or 'slot:<kind>' — the spot the first open '<kind>:…' node (a note, a character) fills. */
  id: string
  pinned?: boolean
  minimized?: { w: number; h: number }
}

export interface LayoutPreset {
  id: string
  label: string
  nodes: PresetNode[]
}

/**
 * Lays out a preset's tools. Open things the preset doesn't name (notes,
 * monsters, sheets) keep no position and are placed afresh — except the
 * first open one of each slot kind, which takes that slot. A slot nothing
 * fills yet stays in the layout (unrendered) for the next one that opens.
 */
export function applyPreset(preset: LayoutPreset, openDynamicIds: string[]): CanvasLayout {
  const nodes: CanvasNodeGeom[] = []
  preset.nodes.forEach((p, i) => {
    const id = p.id.startsWith('slot:') ? (openDynamicIds.find((d) => d.startsWith(`${p.id.slice(5)}:`)) ?? p.id) : p.id
    nodes.push({ id, x: p.x, y: p.y, w: p.w, h: p.h, z: i + 1, ...(p.pinned ? { pinned: true } : {}), ...(p.minimized ? { minimized: p.minimized } : {}) })
  })
  return { viewport: { x: 0, y: 0, zoom: 1 }, nodes }
}

/**
 * The current arrangement as a layout you can come back to: every tool where
 * it is (pinned, minimized and all), and the first open note, character and
 * so on as that kind's slot — later ones are left out, since what's open
 * changes from session to session.
 */
export function presetFromLayout(layout: CanvasLayout, id: string, label: string): LayoutPreset {
  const slotted = new Set<string>()
  const nodes: PresetNode[] = []
  for (const n of [...layout.nodes].sort((a, b) => a.z - b.z)) {
    let presetId = n.id
    if (n.id.includes(':') && !n.id.startsWith('slot:')) {
      const kind = n.id.split(':')[0]
      if (slotted.has(kind)) continue
      slotted.add(kind)
      presetId = `slot:${kind}`
    } else if (n.id.startsWith('slot:')) {
      if (slotted.has(n.id.slice(5))) continue
      slotted.add(n.id.slice(5))
    }
    nodes.push({ id: presetId, x: n.x, y: n.y, w: n.w, h: n.h, ...(n.pinned ? { pinned: true } : {}), ...(n.minimized ? { minimized: n.minimized } : {}) })
  }
  return { id, label, nodes }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Reads a saved layout back, dropping anything malformed or no longer known
 * (`isKnownId`) rather than failing the whole thing. Null when there's
 * nothing usable — the caller then starts from a preset.
 */
function parseNode(n: Partial<CanvasNodeGeom> | null, isKnownId: (id: string) => boolean): CanvasNodeGeom | null {
  if (!n || typeof n.id !== 'string' || !isKnownId(n.id)) return null
  if (![n.x, n.y, n.w, n.h, n.z].every(isFiniteNumber)) return null
  return {
    id: n.id,
    x: n.x!,
    y: n.y!,
    w: Math.max(MIN_NODE_W, n.w!),
    h: Math.max(MIN_NODE_H, n.h!),
    z: n.z!,
    ...(n.pinned === true ? { pinned: true } : {}),
    ...(n.minimized && isFiniteNumber(n.minimized.w) && isFiniteNumber(n.minimized.h)
      ? { minimized: { w: Math.max(MIN_NODE_W, n.minimized.w), h: Math.max(MIN_NODE_H, n.minimized.h) } }
      : {})
  }
}

/**
 * Reads a saved layout back, dropping anything malformed or no longer known
 * (`isKnownId`) rather than failing the whole thing. Null when there's
 * nothing usable — the caller then starts from a preset.
 */
export function parseLayout(raw: unknown, isKnownId: (id: string) => boolean): CanvasLayout | null {
  if (!raw || typeof raw !== 'object') return null
  const { viewport, nodes, closedPins, collections: rawCollections } = raw as { viewport?: unknown; nodes?: unknown; closedPins?: unknown; collections?: unknown }
  if (!Array.isArray(nodes)) return null
  const vp = viewport as Partial<Viewport> | undefined
  const parsedVp: Viewport =
    vp && isFiniteNumber(vp.x) && isFiniteNumber(vp.y) && isFiniteNumber(vp.zoom) ? { x: vp.x, y: vp.y, zoom: clampZoom(vp.zoom) } : { x: 0, y: 0, zoom: 1 }
  const seen = new Set<string>()
  const parsedNodes: CanvasNodeGeom[] = []
  for (const raw of nodes as (Partial<CanvasNodeGeom> | null)[]) {
    const node = parseNode(raw, isKnownId)
    if (!node || seen.has(node.id)) continue
    seen.add(node.id)
    parsedNodes.push(node)
  }
  const pins: Record<string, CanvasNodeGeom> = {}
  if (closedPins && typeof closedPins === 'object') {
    for (const raw of Object.values(closedPins as Record<string, Partial<CanvasNodeGeom> | null>)) {
      const node = parseNode(raw, isKnownId)
      if (node && !seen.has(node.id)) pins[node.id] = { ...node, pinned: true }
    }
  }
  const collections: Record<string, Collection> = {}
  if (rawCollections && typeof rawCollections === 'object') {
    for (const [cid, c] of Object.entries(rawCollections as Record<string, Partial<Collection> | null>)) {
      const inner = c && parseLayout(c.layout, isKnownId)
      // A collection's tile and its contents go together: one without the other is dropped — except a session's,
      // which is kept with its tile closed (shelved), to open again from the Sessions box.
      if (inner && (seen.has(`${COLLECTION_PREFIX}${cid}`) || typeof c!.sessionDeckId === 'string')) {
        collections[cid] = {
          name: typeof c!.name === 'string' ? c!.name : 'Collection',
          layout: inner,
          ...(typeof c!.sessionDeckId === 'string' ? { sessionDeckId: c!.sessionDeckId } : {})
        }
      }
    }
  }
  return {
    viewport: parsedVp,
    nodes: parsedNodes.filter((n) => !n.id.startsWith(COLLECTION_PREFIX) || n.id.slice(COLLECTION_PREFIX.length) in collections),
    ...(Object.keys(pins).length ? { closedPins: pins } : {}),
    ...(Object.keys(collections).length ? { collections } : {})
  }
}

/** Reads saved custom layouts back, dropping any that are malformed. */
export function parsePresets(raw: unknown, isKnownId: (id: string) => boolean): LayoutPreset[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((p: Partial<LayoutPreset> | null) => {
    if (!p || typeof p.id !== 'string' || typeof p.label !== 'string' || !Array.isArray(p.nodes)) return []
    const nodes = p.nodes.flatMap((n) => {
      const node = parseNode({ ...n, z: 0 }, isKnownId)
      return node ? [{ id: node.id, x: node.x, y: node.y, w: node.w, h: node.h, ...(node.pinned ? { pinned: true } : {}), ...(node.minimized ? { minimized: node.minimized } : {}) }] : []
    })
    return [{ id: p.id, label: p.label, nodes }]
  })
}

// --- Collections ---------------------------------------------------------------
// A collection is a canvas inside a canvas. Its tile is the node 'collection:<id>' on the parent, and its own
// layout lives in the parent's `collections`. A path is the collection ids from the top canvas down.

export const COLLECTION_PREFIX = 'collection:'

/** The layout a path leads to — the top canvas for an empty path, or as deep as the path still exists. */
export function layoutAt(root: CanvasLayout, path: string[]): CanvasLayout {
  let layout = root
  for (const cid of path) {
    const next = layout.collections?.[cid]
    if (!next) break
    layout = next.layout
  }
  return layout
}

/** The top canvas with the layout at `path` replaced by `update`'s result. */
export function updateAt(root: CanvasLayout, path: string[], update: (layout: CanvasLayout) => CanvasLayout): CanvasLayout {
  const [cid, ...rest] = path
  const inner = cid ? root.collections?.[cid] : undefined
  if (!inner) return update(root)
  const next = updateAt(inner.layout, rest, update)
  return next === inner.layout ? root : { ...root, collections: { ...root.collections, [cid]: { ...inner, layout: next } } }
}

/** Every node id placed anywhere — on the top canvas or inside any collection. */
export function placedIds(root: CanvasLayout): Set<string> {
  const ids = new Set<string>()
  const walk = (layout: CanvasLayout): void => {
    for (const n of layout.nodes) ids.add(n.id)
    for (const c of Object.values(layout.collections ?? {})) walk(c.layout)
  }
  walk(root)
  return ids
}

/** The names along a path, for a breadcrumb. */
export function pathNames(root: CanvasLayout, path: string[]): { id: string; name: string; sessionDeckId?: string }[] {
  const names: { id: string; name: string; sessionDeckId?: string }[] = []
  let layout = root
  for (const cid of path) {
    const c = layout.collections?.[cid]
    if (!c) break
    names.push({ id: cid, name: c.name, ...(c.sessionDeckId ? { sessionDeckId: c.sessionDeckId } : {}) })
    layout = c.layout
  }
  return names
}

/** A new collection whose tile sits at `at` — empty, or holding `nodes` (a session's scenes, say). */
export function addCollection(
  layout: CanvasLayout,
  cid: string,
  name: string,
  at: { x: number; y: number },
  extra: { sessionDeckId?: string; nodes?: CanvasNodeGeom[] } = {}
): CanvasLayout {
  const tile: CanvasNodeGeom = { id: `${COLLECTION_PREFIX}${cid}`, x: snap(at.x), y: snap(at.y), w: MINI_SIZE, h: MINI_SIZE, z: topZ(layout) + 1 }
  const inner: CanvasLayout = { viewport: { x: 0, y: 0, zoom: 1 }, nodes: extra.nodes ?? [] }
  const collection: Collection = { name, layout: inner, ...(extra.sessionDeckId ? { sessionDeckId: extra.sessionDeckId } : {}) }
  return { ...layout, nodes: [...layout.nodes, tile], collections: { ...layout.collections, [cid]: collection } }
}

export function renameCollection(layout: CanvasLayout, cid: string, name: string): CanvasLayout {
  const c = layout.collections?.[cid]
  return c ? { ...layout, collections: { ...layout.collections, [cid]: { ...c, name } } } : layout
}

/** Moves a node (and, for a collection's tile, the whole collection) from one layout into another, at `at`, on top. */
function transfer(from: CanvasLayout, to: CanvasLayout, nodeId: string, at: { x: number; y: number }): [CanvasLayout, CanvasLayout] {
  const node = findNode(from, nodeId)
  if (!node || findNode(to, nodeId)) return [from, to]
  const { pinned: _pinned, ...rest } = node
  const moved: CanvasNodeGeom = { ...rest, x: snap(at.x), y: snap(at.y), z: topZ(to) + 1 }
  const cid = nodeId.startsWith(COLLECTION_PREFIX) ? nodeId.slice(COLLECTION_PREFIX.length) : null
  const carried = cid ? from.collections?.[cid] : undefined
  const { [cid ?? '']: _gone, ...fromCollections } = from.collections ?? {}
  return [
    { ...from, nodes: from.nodes.filter((n) => n.id !== nodeId), ...(carried ? { collections: fromCollections } : {}) },
    { ...to, nodes: [...to.nodes, moved], ...(carried ? { collections: { ...to.collections, [cid!]: carried } } : {}) }
  ]
}

/** Drops a node into one of this layout's collections, stacked after whatever's already in there. */
export function moveIntoCollection(layout: CanvasLayout, nodeId: string, cid: string): CanvasLayout {
  const c = layout.collections?.[cid]
  if (!c || nodeId === `${COLLECTION_PREFIX}${cid}`) return layout
  const offset = c.layout.nodes.length * GRID * 2
  const [from, to] = transfer(layout, c.layout, nodeId, { x: GRID + offset, y: GRID + offset })
  if (to === c.layout) return layout
  return { ...from, collections: { ...from.collections, [cid]: { ...c, layout: to } } }
}

/** Takes a node out of the collection at `path` and puts it on the canvas above, beside the collection's tile. */
export function moveOutOfCollection(root: CanvasLayout, path: string[], nodeId: string): CanvasLayout {
  if (path.length === 0) return root
  const parentPath = path.slice(0, -1)
  const cid = path[path.length - 1]
  return updateAt(root, parentPath, (parent) => {
    const c = parent.collections?.[cid]
    const tile = findNode(parent, `${COLLECTION_PREFIX}${cid}`)
    if (!c || !tile) return parent
    const [inner, outer] = transfer(c.layout, parent, nodeId, { x: tile.x + tile.w + GRID, y: tile.y })
    return inner === c.layout ? parent : { ...outer, collections: { ...outer.collections, [cid]: { ...c, layout: inner } } }
  })
}

/** Breaks a collection up: everything in it goes back onto this canvas beside where its tile was, and the tile goes. */
export function dissolveCollection(layout: CanvasLayout, cid: string): CanvasLayout {
  const c = layout.collections?.[cid]
  const tile = findNode(layout, `${COLLECTION_PREFIX}${cid}`)
  if (!c || !tile) return layout
  const { [cid]: _gone, ...collections } = layout.collections ?? {}
  let outer: CanvasLayout = { ...layout, nodes: layout.nodes.filter((n) => n.id !== tile.id), collections }
  let inner = c.layout
  for (const [i, n] of [...c.layout.nodes].entries()) {
    ;[inner, outer] = transfer(inner, outer, n.id, { x: tile.x + i * GRID * 2, y: tile.y + i * GRID * 2 })
  }
  return outer
}

// --- Sessions as collections ------------------------------------------------------

/**
 * The order boxes read in: top to bottom by row, left to right within a row.
 * A box joins the row above when its top sits within the upper half of that
 * row's shortest box — so boxes laid out roughly side by side read as a row,
 * even when they're not perfectly lined up.
 */
export function readingOrder(nodes: CanvasNodeGeom[]): string[] {
  const rows: CanvasNodeGeom[][] = []
  for (const n of [...nodes].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows[rows.length - 1]
    if (row && n.y < Math.min(...row.map((r) => r.y)) + Math.min(...row.map((r) => r.h)) / 2) row.push(n)
    else rows.push([n])
  }
  return rows.flatMap((row) => row.sort((a, b) => a.x - b.x).map((n) => n.id))
}

/** Where scene `index` of a session goes when it's laid out fresh: a grid of scene-sized boxes, four to a row. */
export function sceneSpot(index: number, size: { w: number; h: number }): Rect {
  const gap = GRID * 4
  return { x: GRID * 2 + (index % 4) * (size.w + gap), y: GRID * 6 + Math.floor(index / 4) * (size.h + gap), w: size.w, h: size.h }
}

/** Every session collection anywhere, with the path to it. */
export function sessionCollections(root: CanvasLayout): { path: string[]; collection: Collection }[] {
  const found: { path: string[]; collection: Collection }[] = []
  const walk = (layout: CanvasLayout, path: string[]): void => {
    for (const [cid, c] of Object.entries(layout.collections ?? {})) {
      if (c.sessionDeckId) found.push({ path: [...path, cid], collection: c })
      walk(c.layout, [...path, cid])
    }
  }
  walk(root, [])
  return found
}

/** Drops a collection and everything in it — for a session that's been deleted, whose scenes are gone too. */
export function removeCollection(layout: CanvasLayout, cid: string): CanvasLayout {
  if (!layout.collections?.[cid]) return layout
  const { [cid]: _gone, ...collections } = layout.collections
  return { ...layout, nodes: layout.nodes.filter((n) => n.id !== `${COLLECTION_PREFIX}${cid}`), collections }
}
