import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { addNode, findNode, type CanvasLayout, type CanvasNodeGeom, type Viewport } from '@shared/canvasLayout'
import { DYNAMIC_SIZE, TOOLS_BY_MODE, type CanvasMode, type ToolKind } from '@shared/canvasTools'
import { ownsNode, sharedNodeAllowed, SHARED_TOOLS, type BoardChange, type NodeGeom, type SharedEntry } from '@shared/boards'
import { DRAW_FADE_MS, markColour, readMark, type MapMark } from '@shared/battleMap'
import type { CanvasItem } from '../canvas/toolItems'
import type { CanvasHandle, CanvasPoint } from '../canvas/Canvas'
import type { CanvasNav } from '../canvas/useCanvasLayout'
import { CanvasZoomContext } from '../canvas/canvasZoom'
import { entryNodeId, putLocalEntry, setEntryRedirect, type CanvasEntry } from '../canvas/canvasEntries'
import { getCanvasImage } from '../canvas/canvasImages'
import type { ContextMenuItem } from '../../ui/ContextMenu'
import { ConfirmButton } from '../../ui/ConfirmButton'
import { useBoards, type BoardsApi } from './useBoards'
import './boards.css'

export const BOARD_PREFIX = 'board:'
const SHARED_ID = 'shared:'

export function BoardIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
      <rect x="1.5" y="3" width="13" height="10.5" rx="1.5" />
      <path d="M1.5 6h13" />
      <circle cx="5.5" cy="10" r="1.6" />
      <circle cx="10.5" cy="10" r="1.6" />
    </svg>
  )
}

const seenKey = (campaignId: string, mode: string): string => `gb-boards-seen:${mode}:${campaignId}`

/** What the workspace hands its canvas while a shared collection is open, in place of its own. */
export interface SharedCanvas {
  layout: CanvasLayout
  setLayout: (update: (layout: CanvasLayout) => CanvasLayout) => void
  nav: CanvasNav
  hiddenTools: ToolKind[]
  crumbExtra: ReactNode
  overlay: ReactNode
}

/**
 * Shared collections in a workspace: their tiles on your own canvas (one
 * someone's just made comes onto it by itself), a new one or a closed one
 * from the right-click menu, and — opened — the collection itself, handed to
 * the canvas in place of your own so it works exactly like any collection:
 * the same boxes, menus and breadcrumb. Everyone in it sees the same boxes
 * move as they're moved, and each other's cursors.
 */
export function useSharedCollection({
  mode,
  campaignId,
  sessionId,
  isDm,
  rootLayout,
  setRootLayout,
  rootNav,
  canvasRef
}: {
  mode: CanvasMode
  campaignId: string | null
  sessionId: string | null
  isDm: boolean
  rootLayout: CanvasLayout
  setRootLayout: (update: (l: CanvasLayout) => CanvasLayout) => void
  rootNav: CanvasNav
  canvasRef: React.RefObject<CanvasHandle>
}): { tiles: CanvasItem[]; add: (at: CanvasPoint) => ContextMenuItem | null; open: (at: CanvasPoint) => ContextMenuItem | null; active: SharedCanvas | null } {
  const api = useBoards(campaignId, sessionId, isDm)
  const [openId, setOpenId] = useState<string | null>(null)
  const [vp, setVp] = useState<Viewport>({ x: 40, y: 64, zoom: 1 })
  const [error, setError] = useState<string | null>(null)
  const say = useCallback((e: string | null) => {
    if (!e) return
    setError(e)
    setTimeout(() => setError((x) => (x === e ? null : x)), 3500)
  }, [])
  const send = useCallback((c: BoardChange) => void api?.change(c).then(say), [api, say])

  // A collection you haven't seen before comes onto your canvas by itself (once: close its tile and it stays closed).
  const boardIds = api?.doc.boards.map((b) => b.id).join(',') ?? ''
  useEffect(() => {
    if (!api || !campaignId) return
    let seen: string[] = []
    try {
      seen = JSON.parse(localStorage.getItem(seenKey(campaignId, mode)) ?? '[]') as string[]
    } catch {
      /* none seen yet */
    }
    const fresh = api.doc.boards.filter((b) => !seen.includes(b.id))
    if (!fresh.length) return
    setRootLayout((l) => fresh.reduce((acc, b) => (findNode(acc, BOARD_PREFIX + b.id) ? acc : addNode(acc, BOARD_PREFIX + b.id, DYNAMIC_SIZE.board, window.innerWidth, window.innerHeight)), l))
    try {
      localStorage.setItem(seenKey(campaignId, mode), JSON.stringify([...seen, ...fresh.map((b) => b.id)]))
    } catch {
      /* best effort: it would just come back once more */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardIds, campaignId])

  const board = api?.doc.boards.find((b) => b.id === openId) ?? null
  // Deleted while you were in it (or you left the table): back out to your own canvas.
  useEffect(() => {
    if (openId && api && !board) setOpenId(null)
  }, [openId, api, board])

  const layout: CanvasLayout = useMemo(() => ({ viewport: vp, nodes: board?.nodes ?? [] }), [vp, board?.nodes])
  // The layout as it stands after our own changes, even before they've come back round (several in a row diff right).
  const working = useRef(layout)
  useEffect(() => {
    working.current = layout
  }, [layout])

  // New things wait here for their box: what's put on the canvas first, then given a place.
  const pending = useRef(new Map<string, CanvasEntry>())

  const geom = (n: CanvasNodeGeom): NodeGeom => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h, z: n.z, ...(n.minimized ? { minimized: n.minimized } : {}) })

  const setLayout = useCallback(
    (update: (l: CanvasLayout) => CanvasLayout) => {
      if (!board) return
      const prev = working.current
      const next = update(prev)
      working.current = next
      if (next.viewport !== prev.viewport) setVp(next.viewport)
      const before = new Map(prev.nodes.map((n) => [n.id, n]))
      for (const n of next.nodes) {
        // Pinning is to your own screen, and only some things can be shared.
        if (n.pinned || !sharedNodeAllowed(n.id)) continue
        const old = before.get(n.id)
        if (!old) {
          const entry = pending.current.get(n.id)
          pending.current.delete(n.id)
          // An image from your computer goes in with its picture, so everyone has it.
          if (entry?.kind === 'image' && !entry.src) {
            void getCanvasImage(entry.id).then((src) => send({ kind: 'putNode', boardId: board.id, node: geom(n), entry: { ...entry, src: src ?? '' } as SharedEntry }))
          } else send({ kind: 'putNode', boardId: board.id, node: geom(n), ...(entry ? { entry: entry as unknown as SharedEntry } : {}) })
          continue
        }
        if (old.x !== n.x || old.y !== n.y || old.w !== n.w || old.h !== n.h || old.z !== n.z || !!old.minimized !== !!n.minimized) send({ kind: 'putNode', boardId: board.id, node: geom(n) })
      }
      const kept = new Set(next.nodes.map((n) => n.id))
      for (const id of before.keys()) if (!kept.has(id)) send({ kind: 'removeNode', boardId: board.id, nodeId: id })
    },
    [board, send]
  )

  // While it's open, what boxes hold comes from (and goes to) the shared collection.
  useEffect(() => {
    if (!board) return
    setEntryRedirect(mode, {
      entries: board.entries as unknown as Record<string, CanvasEntry>,
      put: (entry) => {
        const id = entryNodeId(entry)
        if (board.nodes.some((n) => n.id === id)) send({ kind: 'putEntry', boardId: board.id, nodeId: id, entry: entry as unknown as SharedEntry })
        else pending.current.set(id, entry)
      },
      drop: (nodeId) => send({ kind: 'removeNode', boardId: board.id, nodeId })
    })
    return () => setEntryRedirect(mode, null)
  }, [board, mode, send])

  const me = api?.me
  const tiles: CanvasItem[] = (api?.doc.boards ?? [])
    .filter((b) => findNode(rootLayout, BOARD_PREFIX + b.id))
    .map((b) => ({
      id: BOARD_PREFIX + b.id,
      title: b.name,
      icon: <BoardIcon />,
      size: DYNAMIC_SIZE.board,
      className: 'gb-canvas-node--collection gb-canvas-node--shared',
      tileOpen: () => {
        setVp({ x: 40, y: 64, zoom: 1 })
        setOpenId(b.id)
      }
    }))
    .map((t) => ({ ...t, content: null }))

  function create(at: CanvasPoint): void {
    if (!api) return
    const id = crypto.randomUUID()
    // Marked seen first, so its tile isn't placed a second time when it arrives.
    try {
      const key = seenKey(api.campaignId, mode)
      localStorage.setItem(key, JSON.stringify([...(JSON.parse(localStorage.getItem(key) ?? '[]') as string[]), id]))
    } catch {
      /* best effort */
    }
    void api.change({ kind: 'createBoard', boardId: id, name: 'Shared collection', at: new Date().toISOString() })
    canvasRef.current?.openAt(BOARD_PREFIX + id, DYNAMIC_SIZE.board, at)
  }

  let active: SharedCanvas | null = null
  if (board && api && me) {
    const mine = ownsNode(board, me.id, me.isDm)
    const nav: CanvasNav = {
      path: [SHARED_ID + board.id],
      names: [{ id: SHARED_ID + board.id, name: board.name }],
      root: layout,
      placed: new Set([...rootNav.placed, ...board.nodes.map((n) => n.id)]),
      enterPath: () => {},
      update: (_path, change) => setLayout(change),
      enter: () => {},
      exitTo: () => setOpenId(null),
      rename: (name) => (mine ? send({ kind: 'renameBoard', boardId: board.id, name: name || ' ' }) : say('Only whoever made it (or the DM) can rename it.')),
      // Taken out: off the shared collection, onto your own canvas.
      moveOut: (nodeId) => {
        const node = board.nodes.find((n) => n.id === nodeId)
        if (!node) return
        if (!ownsNode(node, me.id, me.isDm)) return say(`Only ${node.ownerName} (or the DM) can take that out.`)
        const entry = board.entries[nodeId] as unknown as CanvasEntry | undefined
        if (entry) putLocalEntry(mode, entry)
        send({ kind: 'removeNode', boardId: board.id, nodeId })
        setRootLayout((l) => (findNode(l, nodeId) ? l : addNode(l, nodeId, { w: node.w, h: node.h }, window.innerWidth, window.innerHeight)))
      }
    }
    active = {
      layout,
      setLayout,
      nav,
      hiddenTools: TOOLS_BY_MODE[mode].filter((t) => !(SHARED_TOOLS as readonly string[]).includes(t)),
      crumbExtra: <SharedCrumbs board={board} api={api} mine={mine} error={error} onDelete={() => setOpenId(null)} send={send} />,
      overlay: <SharedOverlay boardId={board.id} api={api} />
    }
  }

  return {
    tiles,
    add: (at) => (api && !openId ? { label: 'Shared collection', icon: <BoardIcon />, onSelect: () => create(at) } : null),
    open: (at) => {
      if (openId) return null
      const closed = (api?.doc.boards ?? []).filter((b) => !findNode(rootLayout, BOARD_PREFIX + b.id))
      if (!closed.length) return null
      return {
        label: 'Open a shared collection',
        icon: <BoardIcon />,
        submenu: closed.map((b) => ({ label: b.name, onSelect: () => canvasRef.current?.openAt(BOARD_PREFIX + b.id, DYNAMIC_SIZE.board, at) }))
      }
    },
    active
  }
}

/** After the breadcrumb: who's here, pointing and drawing, sharing what's yours, and deleting it (if it's yours). */
function SharedCrumbs({
  board,
  api,
  mine,
  error,
  onDelete,
  send
}: {
  board: NonNullable<ReturnType<typeof useBoards>>['doc']['boards'][number]
  api: BoardsApi
  mine: boolean
  error: string | null
  onDelete: () => void
  send: (c: BoardChange) => void
}): JSX.Element {
  const tool = useMarkTool()
  const yours = board.nodes.filter((n) => ownsNode(n, api.me.id, api.me.isDm))
  const shareAll = (editors: string[] | 'all'): void => yours.forEach((n) => send({ kind: 'shareNode', boardId: board.id, nodeId: n.id, editors }))
  const sharedAll = yours.length > 0 && yours.every((n) => n.editors === 'all')
  return (
    <>
      <span className="gb-canvas-crumb-note" title={`Made by ${board.ownerName}. Everyone at the table sees it and what’s in it; each box is its owner’s to change.`}>
        Shared
      </span>
      {(['pointer', 'draw'] as const).map((t) => (
        <button key={t} type="button" className={`gb-canvas-crumb${tool.value === t ? ' gb-canvas-crumb--on' : ''}`} onClick={() => tool.set(tool.value === t ? null : t)} title={t === 'pointer' ? 'Hold and move to point things out to everyone' : 'Draw for everyone to see; it fades after a few seconds'}>
          {t === 'pointer' ? 'Point' : 'Draw'}
        </button>
      ))}
      {yours.length > 0 && (
        <button
          type="button"
          className="gb-canvas-crumb"
          onClick={() => shareAll(sharedAll ? [] : 'all')}
          title={sharedAll ? 'Only you (and the DM) can move and change your boxes here again' : 'Let everyone move and change your boxes here'}
        >
          {sharedAll ? 'Stop sharing mine' : 'Let everyone edit mine'}
        </button>
      )}
      {mine && (
        <ConfirmButton
          label="Delete"
          confirmLabel="Delete for everyone?"
          variant="ghost"
          danger
          title="Delete this shared collection, and everything in it, for everyone"
          style={{ fontSize: 11, padding: '1px 8px' }}
          onConfirm={() => {
            onDelete()
            send({ kind: 'deleteBoard', boardId: board.id })
          }}
        />
      )}
      {error && <span className="gb-canvas-crumb-error">{error}</span>}
    </>
  )
}

// Pointing or drawing in a shared collection: one at a time, shared by the breadcrumb buttons and the overlay.
let markTool: 'pointer' | 'draw' | null = null
const markListeners = new Set<() => void>()
function useMarkTool(): { value: typeof markTool; set: (t: typeof markTool) => void } {
  const [, bump] = useState(0)
  useEffect(() => {
    const l = (): void => bump((n) => n + 1)
    markListeners.add(l)
    return () => {
      markListeners.delete(l)
    }
  }, [])
  return {
    value: markTool,
    set: (t) => {
      markTool = t
      markListeners.forEach((l) => l())
    }
  }
}

type Remote = { name: string; colour: string; cursor: { x: number; y: number } | null; mark?: MapMark; t: number }

/**
 * Drawn in the shared collection's own space, over its boxes: everyone
 * else's cursors (with their names), pointers and drawings, and — while
 * pointing or drawing — a layer that takes the mouse for it.
 */
function SharedOverlay({ boardId, api }: { boardId: string; api: BoardsApi }): JSX.Element {
  const { zoom } = useContext(CanvasZoomContext)
  const probe = useRef<HTMLDivElement>(null)
  const tool = useMarkTool()
  const [remote, setRemote] = useState<Record<string, Remote>>({})
  const [mine, setMine] = useState<MapMark | null>(null)
  const [fading, setFading] = useState<MapMark[]>([])
  const colour = markColour(api.me.id || 'me')

  // Screen to canvas: a 1000-pixel square at the canvas's origin says where it is and how big, whatever the zoom.
  const toWorld = useCallback((e: { clientX: number; clientY: number }): { x: number; y: number } | null => {
    const r = probe.current?.getBoundingClientRect()
    if (!r || !r.width) return null
    const s = r.width / 1000
    return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s }
  }, [])

  const last = useRef(0)
  const presence = useCallback(
    (cursor: { x: number; y: number } | null, mark?: MapMark, now = false) => {
      const t = performance.now()
      if (!now && t - last.current < 45) return
      last.current = t
      void window.goblin.boards.presence(api.campaignId, { boardId, cursor, ...(mark ? { mark } : {}) }, api.sessionId ?? undefined)
    },
    [api.campaignId, api.sessionId, boardId]
  )

  // Your cursor goes out while it's over the canvas.
  useEffect(() => {
    let inside = false
    const onMove = (e: PointerEvent): void => {
      const canvas = probe.current?.closest('.gb-canvas')
      const over = !!canvas && canvas.contains(e.target as Node)
      if (over) {
        inside = true
        const p = toWorld(e)
        if (p) presence(p)
      } else if (inside) {
        inside = false
        presence(null, undefined, true)
      }
    }
    window.addEventListener('pointermove', onMove)
    return () => {
      window.removeEventListener('pointermove', onMove)
      presence(null, undefined, true)
    }
  }, [presence, toWorld])

  // Everyone else's.
  useEffect(() => {
    const off = window.goblin.boards.onPresence(({ sessionId: from, campaignId, presence: p }) => {
      if (campaignId !== api.campaignId || p.boardId !== boardId || (api.sessionId ? from !== api.sessionId : from !== null)) return
      const mark = p.mark === undefined ? undefined : (readMark(p.mark) ?? undefined)
      setRemote((all) => ({ ...all, [p.userId]: { name: p.name, colour: p.colour, cursor: p.cursor, mark: mark ?? (all[p.userId]?.mark?.kind === 'draw' ? all[p.userId].mark : undefined), t: Date.now() } }))
    })
    const tick = setInterval(() => {
      const now = Date.now()
      setRemote((all) => {
        let changed = false
        const next: Record<string, Remote> = {}
        for (const [id, r] of Object.entries(all)) {
          if (now - r.t > 8000 && !r.mark) {
            changed = true
            continue
          }
          const gone = r.mark?.done && now - r.t > (r.mark.kind === 'draw' ? DRAW_FADE_MS : 300)
          next[id] = gone ? { ...r, mark: undefined } : r
          if (gone) changed = true
        }
        return changed ? next : all
      })
    }, 500)
    return () => {
      off()
      clearInterval(tick)
    }
  }, [api.campaignId, api.sessionId, boardId])

  const marks = [...Object.values(remote).flatMap((r) => (r.mark ? [r.mark] : [])), ...fading, ...(mine ? [mine] : [])]
  const s = 1 / (zoom || 1)
  return (
    <>
      <div ref={probe} className="gb-shared-probe" aria-hidden="true" />
      {tool.value && (
        <div
          className="gb-shared-capture"
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.stopPropagation()
            const p = toWorld(e)
            if (!p) return
            e.currentTarget.setPointerCapture(e.pointerId)
            const m: MapMark = { id: crypto.randomUUID(), kind: tool.value!, by: api.me.name, colour, points: [p] }
            setMine(m)
            presence(p, m, true)
          }}
          onPointerMove={(e) => {
            if (!mine) return
            const p = toWorld(e)
            if (!p) return
            const lastPt = mine.points[mine.points.length - 1]
            if (Math.hypot(p.x - lastPt.x, p.y - lastPt.y) < 2) return
            const m = { ...mine, points: mine.kind === 'pointer' ? [...mine.points, p].slice(-14) : [...mine.points, p].slice(0, 400) }
            setMine(m)
            presence(p, m)
          }}
          onPointerUp={(e) => {
            if (!mine) return
            const done = { ...mine, done: true }
            presence(toWorld(e), done, true)
            if (done.kind === 'draw') {
              setFading((f) => [...f, done])
              setTimeout(() => setFading((f) => f.filter((x) => x.id !== done.id)), DRAW_FADE_MS)
            }
            setMine(null)
          }}
        />
      )}
      <svg className="gb-shared-marks" aria-hidden="true">
        {marks.map((m) =>
          m.kind === 'draw' ? (
            <polyline key={m.id} className={m.done ? 'bm-mark-fade' : undefined} points={m.points.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke={m.colour} strokeWidth={4 * s} strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <g key={m.id} opacity={m.done ? 0.5 : 1}>
              {m.points.slice(1).map((q, i) => (
                <line key={i} x1={m.points[i].x} y1={m.points[i].y} x2={q.x} y2={q.y} stroke={m.colour} strokeOpacity={(i + 1) / m.points.length} strokeWidth={(2 + (4 * (i + 1)) / m.points.length) * s} strokeLinecap="round" />
              ))}
              <circle cx={m.points[m.points.length - 1].x} cy={m.points[m.points.length - 1].y} r={7 * s} fill={m.colour} stroke="#0b0907" strokeWidth={2 * s} />
            </g>
          )
        )}
      </svg>
      {Object.entries(remote).map(([id, r]) =>
        r.cursor ? (
          <div key={id} className="gb-shared-cursor" style={{ left: r.cursor.x, top: r.cursor.y, color: r.colour, transform: `scale(${s})` }}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2 1.5l11 5.6-4.6 1.3-1.9 4.4z" fill="currentColor" stroke="#0b0907" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
            <span style={{ background: r.colour }}>{r.name}</span>
          </div>
        ) : null
      )}
    </>
  )
}
