import { describe, expect, it } from 'vitest'
import { applyStashChange, normalizeStash, EMPTY_STASH, type CampaignStash } from '../shared/stash'

let n = 0
const id = (): string => `i${++n}`
const change = (s: CampaignStash, c: unknown, user = 'ann', dm = false): CampaignStash => {
  const r = applyStashChange(s, c, user, dm, id)
  if (!r.ok) throw new Error(r.error)
  return r.stash
}

describe('the party stash', () => {
  it('adds items and counts them, never below one', () => {
    let s = change(EMPTY_STASH, { op: 'add', name: ' Rope (50 ft) ', qty: 2 })
    expect(s.items).toEqual([{ id: 'i1', name: 'Rope (50 ft)', qty: 2 }])
    s = change(s, { op: 'qty', id: 'i1', delta: -5 })
    expect(s.items[0].qty).toBe(1)
    expect(applyStashChange(s, { op: 'add', name: '  ' }, 'ann', false, id).ok).toBe(false)
  })

  it('lets one person carry an item, and only them (or the DM) put it back', () => {
    let s = change(EMPTY_STASH, { op: 'add', name: 'Silver key' })
    const key = s.items[0].id
    s = change(s, { op: 'take', id: key }, 'ann')
    expect(s.items[0].heldBy).toBe('ann')
    expect(applyStashChange(s, { op: 'take', id: key }, 'bram', false, id).ok).toBe(false)
    expect(applyStashChange(s, { op: 'return', id: key }, 'bram', false, id).ok).toBe(false)
    expect(applyStashChange(s, { op: 'remove', id: key }, 'bram', false, id).ok).toBe(false)
    s = change(s, { op: 'return', id: key }, 'dm', true)
    expect(s.items[0].heldBy).toBeUndefined()
  })

  it('keeps coins, and never lets more come out than is in', () => {
    let s = change(EMPTY_STASH, { op: 'coins', coin: 'gp', delta: 50 })
    s = change(s, { op: 'coins', coin: 'gp', delta: -20 })
    expect(s.coins).toEqual({ gp: 30 })
    expect(applyStashChange(s, { op: 'coins', coin: 'gp', delta: -31 }, 'ann', false, id).ok).toBe(false)
    s = change(s, { op: 'coins', coin: 'gp', delta: -30 })
    expect(s.coins).toEqual({})
  })

  it('reads back only what makes sense', () => {
    expect(normalizeStash({ items: [{ id: 'a', name: 'Gem', qty: -3 }, { id: 'b', name: '' }, 'x'], coins: { gp: 12.7, 'bad id!': 5, sp: -1 } })).toEqual({
      items: [{ id: 'a', name: 'Gem', qty: 1 }],
      coins: { gp: 12 }
    })
  })

  it('keeps which Codex entry an item is', () => {
    const s = change(EMPTY_STASH, { op: 'add', name: 'Longsword', codex: { kind: 'equipment', id: 'longsword' } })
    expect(s.items[0].codex).toEqual({ kind: 'equipment', id: 'longsword' })
    expect(change(EMPTY_STASH, { op: 'add', name: 'Odd', codex: { kind: 'spell', id: 'x' } }).items[0].codex).toBeUndefined()
  })
})
