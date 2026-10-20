import { describe, expect, it } from 'vitest'
import type { MapWall } from '@shared/battleMap'
import { doorSpan, insertDoor, roomWalls, snapWallPoint, wallUnder } from '@shared/walls'

let n = 0
const id = (): string => `w${++n}`
const wall = (wid: string, ax: number, ay: number, bx: number, by: number): MapWall => ({ id: wid, a: { x: ax, y: ay }, b: { x: bx, y: by } })

describe('snapping wall corners', () => {
  const walls = [wall('top', 2, 2, 8, 2)]

  it('joins another wall’s end first', () => {
    expect(snapWallPoint(walls, { x: 8.2, y: 2.1 }, true, 0.4)).toEqual({ at: { x: 8, y: 2 }, kind: 'end' })
  })

  it('lands on a wall it touches, at a half-square step along it', () => {
    expect(snapWallPoint(walls, { x: 5.3, y: 2.2 }, true, 0.4)).toEqual({ at: { x: 5.5, y: 2 }, kind: 'wall' })
  })

  it('otherwise goes to a square’s corner, centre or edge middle', () => {
    expect(snapWallPoint(walls, { x: 4.4, y: 6.1 }, true, 0.4)).toEqual({ at: { x: 4.5, y: 6 }, kind: 'grid' })
    expect(snapWallPoint(walls, { x: 4.4, y: 6.1 }, false, 0.4)).toEqual({ at: { x: 4.4, y: 6.1 }, kind: 'free' })
  })
})

describe('rooms', () => {
  it('draws four walls joined at the corners, whichever way it was dragged', () => {
    const room = roomWalls({ x: 6, y: 5 }, { x: 1, y: 1 }, id)
    expect(room.map((w) => [w.a, w.b])).toEqual([
      [{ x: 1, y: 1 }, { x: 6, y: 1 }],
      [{ x: 6, y: 1 }, { x: 6, y: 5 }],
      [{ x: 6, y: 5 }, { x: 1, y: 5 }],
      [{ x: 1, y: 5 }, { x: 1, y: 1 }]
    ])
  })
})

describe('doors set into walls', () => {
  const long = wall('long', 0, 0, 10, 0)

  it('finds the wall under the pointer, not a door', () => {
    expect(wallUnder([long], { x: 3, y: 0.2 }, 0.4)?.id).toBe('long')
    expect(wallUnder([{ ...long, door: true }], { x: 3, y: 0.2 }, 0.4)).toBeNull()
  })

  it('makes a click a one-square door in the middle of that square', () => {
    const { t0, t1 } = doorSpan(long, { x: 3.2, y: 0 }, { x: 3.2, y: 0 }, true)
    expect(t0 * 10).toBeCloseTo(3)
    expect(t1 * 10).toBeCloseTo(4)
  })

  it('lines a door up with the grid’s squares, even on a wall starting mid-square', () => {
    const offset = wall('off', 5.5, -3, 15.5, -3)
    const { t0, t1 } = doorSpan(offset, { x: 9.8, y: -3 }, { x: 9.8, y: -3 }, true)
    expect(5.5 + t0 * 10).toBeCloseTo(9)
    expect(5.5 + t1 * 10).toBeCloseTo(10)
  })

  it('spans a drag along the wall', () => {
    const { t0, t1 } = doorSpan(long, { x: 6.9, y: 0.1 }, { x: 4.1, y: -0.2 }, true)
    expect(t0 * 10).toBeCloseTo(4)
    expect(t1 * 10).toBeCloseTo(7)
  })

  it('cuts that stretch out of the wall and puts a closed door in it', () => {
    const { walls, door } = insertDoor([long], 'long', 0.3, 0.4, id)
    expect(walls.map((w) => [w.a.x, w.b.x, !!w.door])).toEqual([
      [0, 3, false],
      [3, 4, true],
      [4, 10, false]
    ])
    expect(door.open).toBeUndefined()
    expect(walls[0].id).toBe('long')
  })

  it('leaves no sliver of wall when the door reaches the end', () => {
    const { walls } = insertDoor([long], 'long', 0.9, 1, id)
    expect(walls.map((w) => [w.a.x, w.b.x, !!w.door])).toEqual([
      [0, 9, false],
      [9, 10, true]
    ])
  })
})

describe('rooms side by side', () => {
  it('draws a shared wall once', async () => {
    const { withoutOverlaps } = await import('@shared/walls')
    const left = roomWalls({ x: 0, y: 0 }, { x: 5, y: 4 }, id)
    const right = withoutOverlaps(left, roomWalls({ x: 5, y: 0 }, { x: 9, y: 4 }, id), id)
    // Top, right and bottom of the new room; its left side is the first room's right wall.
    expect(right.map((w) => [w.a, w.b])).toEqual([
      [{ x: 5, y: 0 }, { x: 9, y: 0 }],
      [{ x: 9, y: 0 }, { x: 9, y: 4 }],
      [{ x: 9, y: 4 }, { x: 5, y: 4 }]
    ])
  })

  it('only fills in the part of a shared side that isn’t walled yet, keeping a door that’s there', async () => {
    const { withoutOverlaps } = await import('@shared/walls')
    const existing = [wall('short', 5, 0, 5, 2), { ...wall('door', 5, 2, 5, 3), door: true }]
    const added = withoutOverlaps(existing, [wall('side', 5, 6, 5, 0)], id)
    expect(added.map((w) => [w.a, w.b])).toEqual([[{ x: 5, y: 6 }, { x: 5, y: 3 }]])
  })

  it('lines a dragged corner up with a nearby room’s corner, one direction at a time', async () => {
    const { snapRoomCorner } = await import('@shared/walls')
    const room = roomWalls({ x: 0, y: 0 }, { x: 5, y: 4 }, id)
    // Near the bottom edge's height, but well right of the room: the corner's y lines up with it.
    expect(snapRoomCorner(room, { x: 9.3, y: 4.2 }, true, 0.4).at).toEqual({ x: 9.5, y: 4 })
    // Close to a corner itself: onto it.
    expect(snapRoomCorner(room, { x: 5.1, y: 3.8 }, true, 0.4).at).toEqual({ x: 5, y: 4 })
  })
})

describe('windows set into walls', () => {
  it('cuts the wall like a door, and is a window', () => {
    const { walls, door } = insertDoor([wall('long', 0, 0, 10, 0)], 'long', 0.2, 0.4, id, 'window')
    expect(door.window).toBe(true)
    expect(door.door).toBeUndefined()
    expect(walls.map((w) => [w.a.x, w.b.x, !!w.window])).toEqual([
      [0, 2, false],
      [2, 4, true],
      [4, 10, false]
    ])
    // A wall with a window in it isn't picked for another door on that stretch.
    expect(wallUnder(walls, { x: 3, y: 0.1 }, 0.4)?.id).not.toBe(door.id)
  })
})
