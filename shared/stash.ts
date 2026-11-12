/**
 * A campaign's party stash: the loot the party holds in common — items (with how many, a note, and who's carrying
 * one if anyone's taken it) and coins. One JSON document per campaign (campaign_stash), changed by anyone at the
 * table, one small change at a time (a StashChange), applied in turn on the DM's computer — so two people taking
 * things at once can't overwrite each other. A finished quest's item reward lands here.
 */

import { readCodexRef, type CodexRef } from './codexRef'

export interface StashItem {
  id: string
  name: string
  qty: number
  note?: string
  /** Who's carrying it (a user id), once someone's taken it out; none while it's in the stash. */
  heldBy?: string
  /** The Codex entry it is, to open — when it came from the Codex. */
  codex?: Omit<CodexRef, 'name'>
}

export interface CampaignStash {
  items: StashItem[]
  /** Coins by currency id (cp…pp, or a pack's), as on a quest reward. */
  coins: Record<string, number>
}

export type StashChange =
  | { op: 'add'; name: string; qty?: number; note?: string; codex?: Omit<CodexRef, 'name'> }
  | { op: 'qty'; id: string; delta: number }
  | { op: 'note'; id: string; note: string }
  | { op: 'remove'; id: string }
  | { op: 'take'; id: string }
  | { op: 'return'; id: string }
  | { op: 'coins'; coin: string; delta: number }

const MAX_ITEMS = 300
const MAX_NAME = 120
const MAX_NOTE = 500
const MAX_QTY = 100_000
const MAX_COINS = 10_000_000
const COIN_ID = /^[A-Za-z0-9_.:-]{1,64}$/

export const EMPTY_STASH: CampaignStash = { items: [], coins: {} }

const whole = (v: unknown, max: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0)

/** A stash as it can be trusted. */
export function normalizeStash(raw: unknown): CampaignStash {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const items: StashItem[] = []
  for (const x of Array.isArray(r.items) ? r.items.slice(0, MAX_ITEMS) : []) {
    if (typeof x !== 'object' || x === null) continue
    const i = x as Record<string, unknown>
    if (typeof i.id !== 'string' || !i.id || typeof i.name !== 'string' || !i.name.trim()) continue
    const item: StashItem = { id: i.id.slice(0, 64), name: i.name.trim().slice(0, MAX_NAME), qty: Math.max(1, whole(i.qty, MAX_QTY)) }
    if (typeof i.note === 'string' && i.note.trim()) item.note = i.note.trim().slice(0, MAX_NOTE)
    if (typeof i.heldBy === 'string' && i.heldBy) item.heldBy = i.heldBy.slice(0, 128)
    const codex = readCodexRef({ ...(i.codex as object), name: item.name })
    if (codex) item.codex = { kind: codex.kind, id: codex.id }
    items.push(item)
  }
  const coins: Record<string, number> = {}
  if (typeof r.coins === 'object' && r.coins !== null) {
    for (const [id, v] of Object.entries(r.coins as Record<string, unknown>).slice(0, 12)) {
      const n = whole(v, MAX_COINS)
      if (n && COIN_ID.test(id)) coins[id] = n
    }
  }
  return { items, coins }
}

/**
 * One change to the stash, by `userId`. Returns the stash after it, or an error to show. Only the one carrying an
 * item (or the DM) can put it back; a quantity can't go below one (remove the item instead), nor coins below none.
 */
export function applyStashChange(stash: CampaignStash, change: unknown, userId: string, isDm: boolean, newId: () => string): { ok: true; stash: CampaignStash } | { ok: false; error: string } {
  if (typeof change !== 'object' || change === null) return { ok: false, error: 'That isn’t a change to the stash.' }
  const c = change as Record<string, unknown>
  const find = (): StashItem | undefined => (typeof c.id === 'string' ? stash.items.find((i) => i.id === c.id) : undefined)
  const withItem = (id: string, patch: (i: StashItem) => StashItem | null): CampaignStash => ({
    ...stash,
    items: stash.items.flatMap((i) => (i.id === id ? (patch(i) ?? []) : [i]))
  })
  switch (c.op) {
    case 'add': {
      const name = typeof c.name === 'string' ? c.name.trim().slice(0, MAX_NAME) : ''
      if (!name) return { ok: false, error: 'Give it a name.' }
      if (stash.items.length >= MAX_ITEMS) return { ok: false, error: 'The stash is full.' }
      const item: StashItem = { id: newId(), name, qty: Math.max(1, whole(c.qty ?? 1, MAX_QTY)) }
      if (typeof c.note === 'string' && c.note.trim()) item.note = c.note.trim().slice(0, MAX_NOTE)
      const codex = readCodexRef({ ...(c.codex as object), name })
      if (codex) item.codex = { kind: codex.kind, id: codex.id }
      return { ok: true, stash: { ...stash, items: [...stash.items, item] } }
    }
    case 'qty': {
      const item = find()
      if (!item) return { ok: false, error: 'That’s not in the stash any more.' }
      const delta = typeof c.delta === 'number' && Number.isFinite(c.delta) ? Math.trunc(c.delta) : 0
      return { ok: true, stash: withItem(item.id, (i) => ({ ...i, qty: Math.max(1, Math.min(MAX_QTY, i.qty + delta)) })) }
    }
    case 'note': {
      const item = find()
      if (!item) return { ok: false, error: 'That’s not in the stash any more.' }
      const note = typeof c.note === 'string' ? c.note.trim().slice(0, MAX_NOTE) : ''
      return { ok: true, stash: withItem(item.id, (i) => (note ? { ...i, note } : { ...i, note: undefined })) }
    }
    case 'remove': {
      const item = find()
      if (!item) return { ok: true, stash }
      if (item.heldBy && item.heldBy !== userId && !isDm) return { ok: false, error: 'Someone else is carrying that.' }
      return { ok: true, stash: withItem(item.id, () => null) }
    }
    case 'take': {
      const item = find()
      if (!item) return { ok: false, error: 'That’s not in the stash any more.' }
      if (item.heldBy && item.heldBy !== userId) return { ok: false, error: 'Someone else has already taken that.' }
      return { ok: true, stash: withItem(item.id, (i) => ({ ...i, heldBy: userId })) }
    }
    case 'return': {
      const item = find()
      if (!item) return { ok: false, error: 'That’s not in the stash any more.' }
      if (item.heldBy && item.heldBy !== userId && !isDm) return { ok: false, error: 'Only whoever has it can put it back.' }
      return { ok: true, stash: withItem(item.id, (i) => ({ ...i, heldBy: undefined })) }
    }
    case 'coins': {
      const coin = typeof c.coin === 'string' && COIN_ID.test(c.coin) ? c.coin : ''
      const delta = typeof c.delta === 'number' && Number.isFinite(c.delta) ? Math.trunc(c.delta) : 0
      if (!coin || !delta) return { ok: false, error: 'How much of which coin?' }
      const now = stash.coins[coin] ?? 0
      if (now + delta < 0) return { ok: false, error: `There’s only ${now} in the stash.` }
      const coins = { ...stash.coins, [coin]: Math.min(MAX_COINS, now + delta) }
      if (!coins[coin]) delete coins[coin]
      return { ok: true, stash: { ...stash, coins } }
    }
    default:
      return { ok: false, error: 'That isn’t a change to the stash.' }
  }
}
