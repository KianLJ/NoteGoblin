import { describe, expect, it } from 'vitest'
import {
  EMPTY_LAYOUT,
  MIN_NODE_W,
  addNode,
  applyPreset,
  bringToFront,
  fitViewport,
  parseLayout,
  placeNew,
  renameNode,
  revealRect,
  setNodeRect,
  setPinned,
  addCollection,
  dissolveCollection,
  layoutAt,
  moveIntoCollection,
  moveOutOfCollection,
  pathNames,
  placedIds,
  updateAt,
  readingOrder,
  sceneSpot,
  sessionCollections,
  removeCollection,
  removeNode,
  presetFromLayout,
  parsePresets,
  setMinimized,
  MINI_SIZE,
  snap,
  zoomAt,
  type CanvasLayout
} from '../shared/canvasLayout'
import { PRESETS, isKnownId } from '../shared/canvasTools'

const twoNodes: CanvasLayout = {
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [
    { id: 'dice', x: 0, y: 0, w: 320, h: 480, z: 1 },
    { id: 'notes', x: 400, y: 0, w: 272, h: 640, z: 2 }
  ]
}

describe('canvas layout', () => {
  it('snaps moves and resizes to the grid, never below the minimum size', () => {
    expect(snap(23)).toBe(16)
    expect(snap(25)).toBe(32)
    const moved = setNodeRect(twoNodes, 'dice', { x: 23, y: 41, w: 50, h: 333 })
    expect(moved.nodes[0]).toMatchObject({ x: 16, y: 48, w: MIN_NODE_W, h: 336 })
  })

  it('brings a node to the front, and leaves the layout alone when it already is', () => {
    const raised = bringToFront(twoNodes, 'dice')
    expect(raised.nodes.find((n) => n.id === 'dice')!.z).toBe(3)
    expect(bringToFront(raised, 'dice')).toBe(raised)
    expect(bringToFront(twoNodes, 'missing')).toBe(twoNodes)
  })

  it('zooms at the cursor, keeping the point under it still', () => {
    const vp = zoomAt({ x: 100, y: 50, zoom: 1 }, 2, 300, 250)
    // World point under (300, 250) before: (200, 200). After: still (200, 200).
    expect((300 - vp.x) / vp.zoom).toBeCloseTo(200)
    expect((250 - vp.y) / vp.zoom).toBeCloseTo(200)
    expect(zoomAt(vp, 99, 0, 0).zoom).toBe(2)
  })

  it('fits every node in view without zooming past 100%', () => {
    const vp = fitViewport(twoNodes.nodes, 1600, 900)
    expect(vp.zoom).toBe(1)
    const wide = fitViewport([{ x: 0, y: 0, w: 4000, h: 500 }], 1000, 900, 0)
    expect(wide.zoom).toBeCloseTo(0.25)
    expect(fitViewport([], 1000, 900)).toEqual({ x: 0, y: 0, zoom: 1 })
  })

  it('pans just enough to reveal a node that is off screen', () => {
    const vp = revealRect({ x: 0, y: 0, zoom: 1 }, { x: 2000, y: 0, w: 300, h: 200 }, 1000, 800)
    expect(vp.x).toBe(1000 - 24 - 2300)
    expect(vp.y).toBe(24)
    const visible = { x: 0, y: 0, zoom: 1 }
    expect(revealRect(visible, { x: 100, y: 100, w: 100, h: 100 }, 1000, 800)).toBe(visible)
  })

  it('places a new node in the middle of the view, stepping past one already at that exact spot', () => {
    const rect = placeNew(EMPTY_LAYOUT, 320, 480, 1600, 900)
    expect(rect).toEqual({ x: snap(800 - 160), y: snap(450 - 240), w: 320, h: 480 })
    const crowded = addNode(EMPTY_LAYOUT, 'dice', { w: 320, h: 480 }, 1600, 900)
    expect(placeNew(crowded, 320, 480, 1600, 900)).toEqual({ x: rect.x + 32, y: rect.y + 32, w: 320, h: 480 })
    // Something merely overlapping the middle doesn't push it anywhere: it opens on top.
    const near = { ...EMPTY_LAYOUT, nodes: [{ id: 'notes', x: rect.x + 48, y: rect.y, w: 400, h: 400, z: 1 }] }
    expect(placeNew(near, 320, 480, 1600, 900)).toEqual(rect)
  })

  it('adds a node once, on top', () => {
    const once = addNode(twoNodes, 'calendar', { w: 352, h: 512 }, 1600, 900)
    expect(once.nodes.find((n) => n.id === 'calendar')!.z).toBe(3)
    expect(addNode(once, 'calendar', { w: 352, h: 512 }, 1600, 900)).toBe(once)
  })

  it('keeps a note node in place when it navigates to another note', () => {
    const layout = addNode(twoNodes, 'note:a', { w: 720, h: 720 }, 1600, 900, { x: 64, y: 64, w: 720, h: 720 })
    const renamed = renameNode(layout, 'note:a', 'note:b')
    expect(renamed.nodes.find((n) => n.id === 'note:b')).toMatchObject({ x: 64, y: 64 })
    expect(renamed.nodes.some((n) => n.id === 'note:a')).toBe(false)
  })

  it('puts the first open note and character into a preset’s slots', () => {
    const play = PRESETS.player[0]
    const layout = applyPreset(play, ['character:c1', 'note:n1', 'note:n2'])
    const ids = layout.nodes.map((n) => n.id)
    expect(ids).toContain('character:c1')
    expect(ids).toContain('note:n1')
    expect(ids).not.toContain('note:n2')
    expect(ids.some((id) => id.startsWith('slot:'))).toBe(false)
    // No note open: the slot is kept for the next note, and a saved layout keeps it too.
    const empty = applyPreset(PRESETS.dm[0], [])
    expect(empty.nodes.map((n) => n.id)).toContain('slot:note')
    expect(parseLayout(empty, (id) => isKnownId('dm', id))!.nodes.map((n) => n.id)).toContain('slot:note')
    expect(renameNode(empty, 'slot:note', 'note:n1').nodes.map((n) => n.id)).toContain('note:n1')
  })

  it('reads back a saved layout, dropping anything broken or unknown', () => {
    const parsed = parseLayout(
      {
        viewport: { x: 10, y: 20, zoom: 50 },
        nodes: [
          { id: 'party', x: 0, y: 0, w: 320, h: 480, z: 1 },
          { id: 'party', x: 5, y: 5, w: 320, h: 480, z: 2 },
          { id: 'note:abc', x: 0, y: 0, w: 10, h: 10, z: 3 },
          { id: 'music', x: 0, y: 0, w: 320, h: 480, z: 4 },
          { id: 'calendar', x: 'left', y: 0, w: 320, h: 480, z: 5 },
          null
        ]
      },
      (id) => isKnownId('player', id)
    )
    expect(parsed!.viewport).toEqual({ x: 10, y: 20, zoom: 2 })
    expect(parsed!.nodes.map((n) => n.id)).toEqual(['party', 'note:abc'])
    expect(parsed!.nodes[1].w).toBe(MIN_NODE_W)
    expect(parseLayout('nonsense', () => true)).toBeNull()
    expect(parseLayout({ nodes: 'x' }, () => true)).toBeNull()
  })

  it('pins a node where it shows on screen, and unpins it back under the same spot', () => {
    const vp = { x: 100, y: 50, zoom: 0.5 }
    const pinned = setPinned(twoNodes, 'notes', true, vp)
    expect(pinned.nodes.find((n) => n.id === 'notes')).toMatchObject({ x: 300, y: 50, pinned: true })
    expect(setPinned(pinned, 'notes', true, vp)).toBe(pinned)
    // Panned elsewhere since: it unpins under where it sits on screen now.
    const back = setPinned(pinned, 'notes', false, { x: 0, y: 0, zoom: 1 })
    expect(back.nodes.find((n) => n.id === 'notes')).toMatchObject({ x: 304, y: 48 })
    expect(back.nodes.find((n) => n.id === 'notes')!.pinned).toBeUndefined()
    // A pinned node doesn't push where new ones go, and survives a save.
    expect(placeNew({ viewport: { x: 0, y: 0, zoom: 1 }, nodes: [{ id: 'dice', x: 640, y: 208, w: 320, h: 480, z: 1, pinned: true }] }, 320, 480, 1600, 900)).toMatchObject({ x: 640, y: 208 })
    expect(parseLayout(pinned, () => true)!.nodes.find((n) => n.id === 'notes')!.pinned).toBe(true)
  })

  it('minimizes a node to a tile that only moves, and restores the size it had', () => {
    const mini = setMinimized(twoNodes, 'dice', true)
    expect(mini.nodes[0]).toMatchObject({ x: 0, y: 0, w: MINI_SIZE, h: MINI_SIZE, minimized: { w: 320, h: 480 } })
    expect(setMinimized(mini, 'dice', true)).toBe(mini)
    const moved = setNodeRect(mini, 'dice', { x: 64, y: 32, w: 999, h: 999 })
    expect(moved.nodes[0]).toMatchObject({ x: 64, y: 32, w: MINI_SIZE, h: MINI_SIZE })
    expect(setMinimized(moved, 'dice', false).nodes[0]).toMatchObject({ x: 64, y: 32, w: 320, h: 480, minimized: undefined })
    // Still pinnable while minimized, and both survive a save.
    const pinned = setPinned(moved, 'dice', true, { x: 0, y: 0, zoom: 1 })
    expect(parseLayout(pinned, () => true)!.nodes[0]).toMatchObject({ pinned: true, minimized: { w: 320, h: 480 } })
  })

  it('puts a pinned node back where it was pinned when it is opened again', () => {
    const pinned = setPinned(twoNodes, 'notes', true, { x: 10, y: 20, zoom: 1 })
    const closed = removeNode(pinned, 'notes')
    expect(closed.closedPins!.notes).toMatchObject({ x: 410, y: 20, pinned: true })
    // Survives a save, then comes back pinned in the same spot.
    const reloaded = parseLayout(closed, () => true)!
    const back = addNode(reloaded, 'notes', { w: 272, h: 640 }, 1600, 900)
    expect(back.nodes.find((n) => n.id === 'notes')).toMatchObject({ x: 410, y: 20, pinned: true })
    expect(back.closedPins?.notes).toBeUndefined()
    // An unpinned node leaves nothing behind.
    expect(removeNode(twoNodes, 'dice').closedPins).toBeUndefined()
  })

  it('saves the arrangement as a custom layout, with the first open note as its slot', () => {
    const layout: CanvasLayout = {
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        { id: 'notes', x: 0, y: 0, w: 272, h: 640, z: 1, pinned: true },
        { id: 'note:a', x: 300, y: 0, w: 700, h: 700, z: 2, minimized: { w: 700, h: 700 } },
        { id: 'note:b', x: 900, y: 0, w: 700, h: 700, z: 3 }
      ]
    }
    const preset = presetFromLayout(layout, 'mine', 'Mine')
    expect(preset.nodes.map((n) => n.id)).toEqual(['notes', 'slot:note'])
    expect(preset.nodes[0].pinned).toBe(true)
    const applied = applyPreset(preset, ['note:z'])
    expect(applied.nodes.find((n) => n.id === 'note:z')).toMatchObject({ x: 300, minimized: { w: 700, h: 700 } })
    expect(parsePresets([preset, { id: 1 }, null], (id) => isKnownId('dm', id))).toEqual([preset])
  })

  it('keeps a collection as a canvas of its own: in, out, nested, saved and broken up', () => {
    let root = addCollection(twoNodes, 'c1', 'Act One', { x: 800, y: 0 })
    expect(root.nodes.map((n) => n.id)).toContain('collection:c1')
    root = moveIntoCollection(root, 'notes', 'c1')
    expect(root.nodes.map((n) => n.id)).not.toContain('notes')
    expect(layoutAt(root, ['c1']).nodes.map((n) => n.id)).toEqual(['notes'])
    expect(placedIds(root).has('notes')).toBe(true)

    // A collection inside the collection, found by path.
    root = updateAt(root, ['c1'], (l) => addCollection(l, 'c2', 'Scene 3', { x: 0, y: 0 }))
    root = updateAt(root, ['c1'], (l) => moveIntoCollection(l, 'notes', 'c2'))
    expect(layoutAt(root, ['c1', 'c2']).nodes.map((n) => n.id)).toEqual(['notes'])
    expect(pathNames(root, ['c1', 'c2']).map((p) => p.name)).toEqual(['Act One', 'Scene 3'])

    // Survives a save.
    const saved = parseLayout(JSON.parse(JSON.stringify(root)), () => true)!
    expect(layoutAt(saved, ['c1', 'c2']).nodes.map((n) => n.id)).toEqual(['notes'])

    // Out of the inner collection, onto Act One beside its tile.
    root = moveOutOfCollection(root, ['c1', 'c2'], 'notes')
    expect(layoutAt(root, ['c1']).nodes.map((n) => n.id).sort()).toEqual(['collection:c2', 'notes'])

    // Breaking Act One up puts its notes and its own collection back on the top canvas.
    root = dissolveCollection(root, 'c1')
    expect(root.nodes.map((n) => n.id).sort()).toEqual(['collection:c2', 'dice', 'notes'])
    expect(root.collections?.c1).toBeUndefined()
    expect(root.collections?.c2?.name).toBe('Scene 3')
  })

  it('reads scene boxes in rows, top to bottom and left to right, even when they are not lined up exactly', () => {
    const box = (id: string, x: number, y: number) => ({ id, x, y, w: 300, h: 200, z: 1 })
    // Two rows: the second scene sits a little lower than the first but still reads as the same row.
    expect(readingOrder([box('c', 0, 400), box('b', 340, 40), box('a', 0, 0), box('d', 340, 420)])).toEqual(['a', 'b', 'c', 'd'])
    // Drag "a" past "b" and the order follows.
    expect(readingOrder([box('a', 700, 0), box('b', 340, 40), box('c', 0, 400)])).toEqual(['b', 'a', 'c'])
    expect(sceneSpot(5, { w: 300, h: 200 })).toMatchObject({ y: sceneSpot(0, { w: 300, h: 200 }).y + 264 })
  })

  it('finds session collections at any depth, and keeps their session when saved', () => {
    let root = addCollection(EMPTY_LAYOUT, 's1', 'Session 1', { x: 0, y: 0 }, { sessionDeckId: 'deck1', nodes: [{ id: 'note:a', x: 0, y: 0, w: 300, h: 200, z: 1 }] })
    root = updateAt(root, ['s1'], (l) => addCollection(l, 's2', 'Inner', { x: 0, y: 0 }, { sessionDeckId: 'deck2' }))
    expect(sessionCollections(root).map((s) => [s.path.join('/'), s.collection.sessionDeckId])).toEqual([
      ['s1', 'deck1'],
      ['s1/s2', 'deck2']
    ])
    expect(sessionCollections(parseLayout(JSON.parse(JSON.stringify(root)), () => true)!).length).toBe(2)
  })

  it('drops a deleted session collection whole, tile and all', () => {
    const root = addCollection(EMPTY_LAYOUT, 's1', 'Session 1', { x: 0, y: 0 }, { sessionDeckId: 'deck1' })
    const gone = removeCollection(root, 's1')
    expect(gone.nodes).toEqual([])
    expect(gone.collections?.s1).toBeUndefined()
  })

  it('keeps a session collection whose tile was closed, but drops a plain one', () => {
    let root = addCollection(EMPTY_LAYOUT, 's1', 'Session 1', { x: 0, y: 0 }, { sessionDeckId: 'deck1', nodes: [{ id: 'note:a', x: 0, y: 0, w: 300, h: 200, z: 1 }] })
    root = addCollection(root, 'c1', 'Loose', { x: 200, y: 0 })
    const closed = { ...root, nodes: [] }
    const back = parseLayout(JSON.parse(JSON.stringify(closed)), () => true)!
    expect(Object.keys(back.collections ?? {})).toEqual(['s1'])
    expect(back.collections?.s1.layout.nodes.map((n) => n.id)).toEqual(['note:a'])
  })
})
