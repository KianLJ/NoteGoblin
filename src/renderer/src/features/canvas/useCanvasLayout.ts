import { useCallback, useEffect, useMemo, useState } from 'react'
import { applyPreset, layoutAt, moveOutOfCollection, parseLayout, pathNames, placedIds, renameCollection, updateAt, type CanvasLayout } from '@shared/canvasLayout'
import { PRESETS, isKnownId, type CanvasMode } from '@shared/canvasTools'

function storageKey(mode: CanvasMode): string {
  return `gb-canvas:${mode}`
}

// The collection each mode had open — so switching DM ⇄ Player (which unmounts the workspace) comes back inside it.
const openPaths: Partial<Record<CanvasMode, string[]>> = {}

function loadLayout(mode: CanvasMode): CanvasLayout {
  try {
    const raw = localStorage.getItem(storageKey(mode))
    const parsed = raw ? parseLayout(JSON.parse(raw), (id) => isKnownId(mode, id)) : null
    if (parsed) return parsed
  } catch {
    /* fall through to the default preset */
  }
  return applyPreset(PRESETS[mode][0], [])
}

/** Getting around collections (canvases inside the canvas) — see Canvas.tsx. */
export interface CanvasNav {
  /** The collection ids from the top canvas down to the one showing; empty on the top canvas. */
  path: string[]
  /** Their names (and, for a session's collection, its session), for the breadcrumb. */
  names: { id: string; name: string; sessionDeckId?: string }[]
  /** The top canvas, with every collection inside it. */
  root: CanvasLayout
  /** Goes straight to the canvas at `path` (from the top). */
  enterPath: (path: string[]) => void
  /** Changes the canvas at `path`, showing or not. */
  update: (path: string[], change: (layout: CanvasLayout) => CanvasLayout) => void
  /** Every node id placed anywhere — so a box that lives inside a collection isn't pulled onto the canvas showing. */
  placed: Set<string>
  enter: (collectionId: string) => void
  /** Back up to `depth` collections deep (0: the top canvas). */
  exitTo: (depth: number) => void
  /** Renames the collection showing. */
  rename: (name: string) => void
  /** Takes a box out of the collection showing, onto the canvas above. */
  moveOut: (nodeId: string) => void
}

/**
 * One mode's canvas, remembered across restarts (debounced — a drag or a pan
 * settles before it's written). Returns the layout showing — the top canvas,
 * or the collection you've opened — a setter for it, and the way around
 * collections.
 */
export function useCanvasLayout(mode: CanvasMode): [CanvasLayout, (update: (layout: CanvasLayout) => CanvasLayout) => void, CanvasNav] {
  const [root, setRoot] = useState(() => loadLayout(mode))
  const [path, setPath] = useState<string[]>(() => openPaths[mode] ?? [])
  useEffect(() => {
    openPaths[mode] = path
  }, [mode, path])

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(storageKey(mode), JSON.stringify(root))
      } catch {
        /* best-effort persistence only */
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [mode, root])

  // A collection that's gone (broken up from inside it, say) takes you back up as far as still exists.
  const names = pathNames(root, path)
  const livePath = names.map((n) => n.id)
  const layout = layoutAt(root, livePath)
  const placed = useMemo(() => placedIds(root), [root])

  const nav: CanvasNav = {
    path: livePath,
    names,
    placed,
    root,
    enterPath: setPath,
    update: (at, change) => setRoot((r) => updateAt(r, at, change)),
    enter: (cid) => setPath([...livePath, cid]),
    exitTo: (depth) => setPath(livePath.slice(0, depth)),
    rename: (name) => setRoot((r) => updateAt(r, livePath.slice(0, -1), (parent) => renameCollection(parent, livePath[livePath.length - 1], name))),
    moveOut: (nodeId) => setRoot((r) => moveOutOfCollection(r, livePath, nodeId))
  }

  // Stable while the same canvas shows, so effects that depend on it don't re-run every render.
  const pathKey = livePath.join('/')
  const setLayout = useCallback(
    (update: (layout: CanvasLayout) => CanvasLayout) => setRoot((r) => updateAt(r, pathKey ? pathKey.split('/') : [], update)),
    [pathKey]
  )

  return [layout, setLayout, nav]
}
