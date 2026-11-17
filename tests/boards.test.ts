import { describe, expect, it } from 'vitest'
import { applyBoardChange, normalizeBoards, type CampaignBoards } from '../shared/boards'

const sam = { id: 'sam', name: 'Sam', isDm: false }
const ollie = { id: 'ollie', name: 'Ollie', isDm: false }
const dm = { id: 'dm', name: 'DM', isDm: true }

function apply(doc: CampaignBoards, change: unknown, actor = sam): CampaignBoards {
  const r = applyBoardChange(doc, change, actor)
  if (!r.ok) throw new Error(r.error)
  return r.doc
}

const sticky = { id: 'sticky:s', x: 0, y: 0, w: 224, h: 192, z: 1 }

describe('shared collections', () => {
  const made = apply({ boards: [] }, { kind: 'createBoard', boardId: 'b', name: 'Plans', at: 'now' })
  const withSticky = apply(made, { kind: 'putNode', boardId: 'b', node: sticky, entry: { kind: 'sticky', id: 's', text: 'Go left', color: 'yellow' } })

  it('lets anyone make one, and owns what they put in it', () => {
    expect(made.boards[0]).toMatchObject({ name: 'Plans', owner: 'sam' })
    expect(withSticky.boards[0].nodes[0]).toMatchObject({ id: 'sticky:s', owner: 'sam', editors: [] })
    expect(withSticky.boards[0].entries['sticky:s']).toMatchObject({ text: 'Go left' })
  })

  it('stops others moving or changing it until it’s shared with them, but anyone can bring it forward', () => {
    const move = { kind: 'putNode', boardId: 'b', node: { ...sticky, x: 50 } }
    expect(applyBoardChange(withSticky, move, ollie).ok).toBe(false)
    expect(applyBoardChange(withSticky, { kind: 'putEntry', boardId: 'b', nodeId: 'sticky:s', entry: { kind: 'sticky', id: 's', text: 'mine now' } }, ollie).ok).toBe(false)
    expect(apply(withSticky, { kind: 'putNode', boardId: 'b', node: { ...sticky, z: 9 } }, ollie).boards[0].nodes[0].z).toBe(9)
    expect(applyBoardChange(withSticky, move, dm).ok).toBe(true)
    const shared = apply(withSticky, { kind: 'shareNode', boardId: 'b', nodeId: 'sticky:s', editors: ['ollie'] })
    expect(apply(shared, move, ollie).boards[0].nodes[0].x).toBe(50)
    // Sharing lets them edit it, not close it or share it on.
    expect(applyBoardChange(shared, { kind: 'removeNode', boardId: 'b', nodeId: 'sticky:s' }, ollie).ok).toBe(false)
    expect(applyBoardChange(shared, { kind: 'shareNode', boardId: 'b', nodeId: 'sticky:s', editors: 'all' }, ollie).ok).toBe(false)
  })

  it('holds notes and shared tools, but not someone’s own things', () => {
    expect(applyBoardChange(made, { kind: 'putNode', boardId: 'b', node: { id: 'note:n1', x: 0, y: 0, w: 700, h: 700, z: 1 } }, sam).ok).toBe(true)
    expect(applyBoardChange(made, { kind: 'putNode', boardId: 'b', node: { id: 'calendar', x: 0, y: 0, w: 400, h: 400, z: 1 } }, sam).ok).toBe(true)
    expect(applyBoardChange(made, { kind: 'putNode', boardId: 'b', node: { id: 'friends', x: 0, y: 0, w: 300, h: 400, z: 1 } }, sam).ok).toBe(false)
    expect(applyBoardChange(made, { kind: 'putNode', boardId: 'b', node: { id: 'browser:x', x: 0, y: 0, w: 300, h: 400, z: 1 }, entry: { kind: 'browser', id: 'x' } }, sam).ok).toBe(false)
  })

  it('only lets its maker (or the DM) rename or delete a collection', () => {
    expect(applyBoardChange(made, { kind: 'deleteBoard', boardId: 'b' }, ollie).ok).toBe(false)
    expect(apply(made, { kind: 'deleteBoard', boardId: 'b' }, dm).boards).toHaveLength(0)
  })

  it('refuses a picture that isn’t one', () => {
    const bad = { kind: 'putNode', boardId: 'b', node: { id: 'image:i', x: 0, y: 0, w: 10, h: 10, z: 1 }, entry: { kind: 'image', id: 'i', name: 'x', src: 'javascript:alert(1)' } }
    expect(applyBoardChange(made, bad, sam).ok).toBe(false)
  })

  it('reads back what was stored, dropping anything broken', () => {
    expect(normalizeBoards({ boards: [withSticky.boards[0], { id: 3 }] }).boards).toHaveLength(1)
  })
})
