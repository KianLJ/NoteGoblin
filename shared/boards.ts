/**
 * Shared collections: collections the whole table works in together. Anyone
 * in the campaign (a player or the DM) can make one; its tile shows on
 * everyone's canvas, and inside it's a collection like any other — notes,
 * sticky notes, images, statblocks, Codex entries and the tools made for
 * sharing — except everyone sees the same boxes, where they are, as they
 * change. Each box belongs to whoever put it there: they (and the DM) can
 * move, resize, change or close it, and can let other people do the same.
 *
 * The DM's computer holds them (like the party stash). Every change is one
 * BoardChange, checked by applyBoardChange on the DM's side and then passed
 * to everyone else, who apply the same change to their own copy.
 */
import type { CanvasNodeGeom } from './canvasLayout'

/** A box in a shared collection: where it is, and whose it is. */
export interface SharedNode extends CanvasNodeGeom {
  owner: string
  ownerName: string
  /** Who else may move, resize and change it: some people, or everyone. */
  editors: string[] | 'all'
}

export interface SharedBoard {
  id: string
  name: string
  owner: string
  ownerName: string
  createdAt: string
  nodes: SharedNode[]
  /**
   * What the boxes that are things (not notes or tools) hold — a sticky's words, an image (with its picture, so
   * everyone has it), a statblock, a Codex entry — by node id, in the shape a canvas keeps them (canvasEntries).
   */
  entries: Record<string, SharedEntry>
}

export type SharedEntry = { kind: string } & Record<string, unknown>

export interface CampaignBoards {
  boards: SharedBoard[]
}

/** Where a box is: everything but who owns it (which only the shared collection decides). */
export type NodeGeom = Pick<CanvasNodeGeom, 'id' | 'x' | 'y' | 'w' | 'h' | 'z' | 'minimized'>

export type BoardChange =
  | { kind: 'createBoard'; boardId: string; name: string; at: string }
  | { kind: 'renameBoard'; boardId: string; name: string }
  | { kind: 'deleteBoard'; boardId: string }
  /** Puts a box in (it's yours), or moves, resizes or brings forward one already there. `entry`: what a new thing holds. */
  | { kind: 'putNode'; boardId: string; node: NodeGeom; entry?: SharedEntry }
  /** Changes what a thing holds (a sticky's words or colour). */
  | { kind: 'putEntry'; boardId: string; nodeId: string; entry: SharedEntry }
  | { kind: 'removeNode'; boardId: string; nodeId: string }
  | { kind: 'shareNode'; boardId: string; nodeId: string; editors: string[] | 'all' }

export interface BoardActor {
  id: string
  name: string
  isDm: boolean
}

export const MAX_BOARDS = 50
export const MAX_BOARD_NODES = 300
export const MAX_BOARD_IMAGE_CHARS = 1_500_000
const MAX_ENTRY_CHARS = 300_000
const MAX_TEXT = 5000

/** The tools that work when everyone's looking at the same box (each person sees their own view of the campaign's). */
export const SHARED_TOOLS = ['notes', 'initiative', 'calendar', 'quests', 'reputation', 'worldmap', 'codex'] as const

/** Whether a node id is something a shared collection can hold: a note, a thing put on the canvas, or a shared tool. */
export function sharedNodeAllowed(id: string): boolean {
  return /^(note|sticky|image|monster|entry):./.test(id) || (SHARED_TOOLS as readonly string[]).includes(id)
}

/** Whether `userId` may move, resize and change a box: its owner, the DM, or someone it's shared with. */
export function canEditNode(node: Pick<SharedNode, 'owner' | 'editors'>, userId: string, isDm: boolean): boolean {
  return isDm || node.owner === userId || node.editors === 'all' || node.editors.includes(userId)
}

/** Whether `userId` may close a box or say who can edit it: only its owner (or the DM). */
export function ownsNode(node: Pick<SharedNode, 'owner'>, userId: string, isDm: boolean): boolean {
  return isDm || node.owner === userId
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const clampSize = (v: number): number => Math.max(48, Math.min(6000, v))
const clampPos = (v: number): number => Math.max(-200000, Math.min(200000, v))

/** What a thing may hold: the kinds a canvas has (not a Browser box, which is one person's), checked and kept small. */
export function readEntry(raw: unknown): SharedEntry | null {
  if (!raw || typeof raw !== 'object' || typeof (raw as SharedEntry).kind !== 'string') return null
  const e = raw as SharedEntry
  if (e.kind === 'browser') return null
  if (e.kind === 'sticky') return { kind: 'sticky', id: String(e.id ?? ''), text: typeof e.text === 'string' ? e.text.slice(0, MAX_TEXT) : '', color: typeof e.color === 'string' ? e.color : 'yellow' }
  if (e.kind === 'image') {
    if (typeof e.src !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,/.test(e.src) || e.src.length > MAX_BOARD_IMAGE_CHARS) return null
    return { kind: 'image', id: String(e.id ?? ''), name: typeof e.name === 'string' ? e.name.slice(0, 120) : 'Image', src: e.src }
  }
  return JSON.stringify(e).length > MAX_ENTRY_CHARS ? null : e
}

/** A board document from storage or the wire, made safe. */
export function normalizeBoards(raw: unknown): CampaignBoards {
  const boards = raw && typeof raw === 'object' && Array.isArray((raw as CampaignBoards).boards) ? (raw as CampaignBoards).boards : []
  return {
    boards: boards
      .filter((b): b is SharedBoard => !!b && typeof b.id === 'string' && typeof b.name === 'string')
      .slice(0, MAX_BOARDS)
      .map((b) => ({
        id: b.id,
        name: b.name,
        owner: String(b.owner ?? ''),
        ownerName: String(b.ownerName ?? ''),
        createdAt: String(b.createdAt ?? ''),
        nodes: (Array.isArray(b.nodes) ? b.nodes : []).filter((n) => !!n && typeof n.id === 'string' && sharedNodeAllowed(n.id) && [n.x, n.y, n.w, n.h].every(num)).slice(0, MAX_BOARD_NODES),
        entries: b.entries && typeof b.entries === 'object' ? b.entries : {}
      }))
  }
}

type Result = { ok: true; doc: CampaignBoards } | { ok: false; error: string }

/**
 * One change by `actor`, if they're allowed to make it: the new document, or
 * why not. The DM's computer runs this to decide; everyone else runs it to
 * keep their copy in step (so it must give the same answer everywhere).
 */
export function applyBoardChange(doc: CampaignBoards, raw: unknown, actor: BoardActor): Result {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Not a change.' }
  const change = raw as BoardChange
  if (typeof change.boardId !== 'string' || !change.boardId) return { ok: false, error: 'Which collection?' }
  const board = doc.boards.find((b) => b.id === change.boardId)
  const withBoard = (next: SharedBoard): CampaignBoards => ({ boards: doc.boards.map((b) => (b.id === next.id ? next : b)) })

  if (change.kind === 'createBoard') {
    if (board) return { ok: false, error: 'That collection already exists.' }
    if (doc.boards.length >= MAX_BOARDS) return { ok: false, error: 'This campaign has as many shared collections as it can hold.' }
    const name = typeof change.name === 'string' && change.name.trim() ? change.name.trim().slice(0, 80) : 'Shared collection'
    return { ok: true, doc: { boards: [...doc.boards, { id: change.boardId, name, owner: actor.id, ownerName: actor.name, createdAt: typeof change.at === 'string' ? change.at : '', nodes: [], entries: {} }] } }
  }
  if (!board) return { ok: false, error: 'That collection is gone.' }
  const boardOwner = actor.isDm || board.owner === actor.id

  switch (change.kind) {
    case 'renameBoard': {
      if (!boardOwner) return { ok: false, error: 'Only whoever made it (or the DM) can rename it.' }
      const name = typeof change.name === 'string' ? change.name.slice(0, 80) : ''
      return name.trim() ? { ok: true, doc: withBoard({ ...board, name }) } : { ok: false, error: 'Give it a name.' }
    }
    case 'deleteBoard':
      if (!boardOwner) return { ok: false, error: 'Only whoever made it (or the DM) can delete it.' }
      return { ok: true, doc: { boards: doc.boards.filter((b) => b.id !== board.id) } }
    case 'putNode': {
      const g = change.node
      if (!g || typeof g.id !== 'string' || !sharedNodeAllowed(g.id) || ![g.x, g.y, g.w, g.h].every(num)) return { ok: false, error: 'That can’t go in a shared collection.' }
      const geom = { x: clampPos(g.x), y: clampPos(g.y), w: clampSize(g.w), h: clampSize(g.h), z: num(g.z) ? g.z : 0, ...(g.minimized ? { minimized: g.minimized } : {}) }
      const existing = board.nodes.find((n) => n.id === g.id)
      if (existing) {
        const moved = existing.x !== geom.x || existing.y !== geom.y || existing.w !== geom.w || existing.h !== geom.h || !!existing.minimized !== !!geom.minimized
        // Bringing a box to the front changes nothing anyone owns, so anyone may.
        if (moved && !canEditNode(existing, actor.id, actor.isDm)) return { ok: false, error: `That’s ${existing.ownerName}’s. Ask them to let you move it.` }
        const { minimized: _m, ...rest } = existing
        const next: SharedNode = { ...rest, ...geom }
        return { ok: true, doc: withBoard({ ...board, nodes: board.nodes.map((n) => (n.id === g.id ? next : n)) }) }
      }
      if (board.nodes.length >= MAX_BOARD_NODES) return { ok: false, error: 'This collection is full.' }
      const needsEntry = /^(sticky|image|monster|entry):/.test(g.id)
      const entry = change.entry === undefined ? null : readEntry(change.entry)
      if (needsEntry && !entry && !board.entries[g.id]) return { ok: false, error: 'That picture is too big, or isn’t something a shared collection can hold.' }
      const node: SharedNode = { id: g.id, ...geom, owner: actor.id, ownerName: actor.name, editors: [] }
      return { ok: true, doc: withBoard({ ...board, nodes: [...board.nodes, node], entries: entry ? { ...board.entries, [g.id]: entry } : board.entries }) }
    }
    case 'putEntry': {
      const node = board.nodes.find((n) => n.id === change.nodeId)
      if (!node) return { ok: false, error: 'That’s gone.' }
      if (!canEditNode(node, actor.id, actor.isDm)) return { ok: false, error: `That’s ${node.ownerName}’s. Ask them to let you edit it.` }
      const entry = readEntry(change.entry)
      if (!entry) return { ok: false, error: 'That can’t go in a shared collection.' }
      return { ok: true, doc: withBoard({ ...board, entries: { ...board.entries, [node.id]: entry } }) }
    }
    case 'removeNode': {
      const node = board.nodes.find((n) => n.id === change.nodeId)
      if (!node) return { ok: true, doc }
      if (!ownsNode(node, actor.id, actor.isDm)) return { ok: false, error: `Only ${node.ownerName} (or the DM) can close that.` }
      const { [node.id]: _gone, ...entries } = board.entries
      return { ok: true, doc: withBoard({ ...board, nodes: board.nodes.filter((n) => n.id !== node.id), entries }) }
    }
    case 'shareNode': {
      const node = board.nodes.find((n) => n.id === change.nodeId)
      if (!node) return { ok: false, error: 'That’s gone.' }
      if (!ownsNode(node, actor.id, actor.isDm)) return { ok: false, error: `Only ${node.ownerName} (or the DM) can say who edits that.` }
      const editors = change.editors === 'all' ? 'all' : Array.isArray(change.editors) ? [...new Set(change.editors.filter((x): x is string => typeof x === 'string'))].slice(0, 50) : []
      return { ok: true, doc: withBoard({ ...board, nodes: board.nodes.map((n) => (n.id === node.id ? { ...n, editors } : n)) }) }
    }
    default:
      return { ok: false, error: 'Not a change.' }
  }
}
