import { describe, expect, it } from 'vitest'
import { emptyBattleMap, mapForPlayer, normalizeBattleMap, type BattleMap, type MapWall } from '@shared/battleMap'
import { emptyCombatant, sanitizeForPlayer, emptyInitiativeState, type Combatant } from '@shared/encounter'
import { blockingWalls, addExplored, canReach, decodeExplored, inRegion, moveBlocked, sightBlocked, slideMove, visibleCells, viewerSources, visionActive, type Region } from '@shared/vision'

const c = (id: string, kind: Combatant['kind'], extra: Partial<Combatant> = {}): Combatant => ({ id, name: id, kind, initiative: 10, maxHp: 10, currentHp: 10, ac: 12, ...emptyCombatant(), ...extra })
const wall = (id: string, ax: number, ay: number, bx: number, by: number, extra: Partial<MapWall> = {}): MapWall => ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, ...extra })

/** A wall straight down the middle (x = 10) with a door in it at rows 7–8. */
function splitMap(extra: Partial<BattleMap> = {}): BattleMap {
  return { ...emptyBattleMap(), walls: [wall('top', 10, 0, 10, 7), wall('door', 10, 7, 10, 9, { door: true }), wall('bottom', 10, 9, 10, 16)], ...extra }
}

describe('walls and doors', () => {
  it('stops sight and movement through a wall, but not past its end', () => {
    const walls = [wall('w', 5, 0, 5, 5)]
    expect(sightBlocked({ x: 4.5, y: 2.5 }, { x: 5.5, y: 2.5 }, walls)).toBe(true)
    expect(sightBlocked({ x: 4.5, y: 6.5 }, { x: 5.5, y: 6.5 }, walls)).toBe(false)
    expect(moveBlocked({ x: 4.5, y: 2.5 }, { x: 5.5, y: 2.5 }, walls)).toBe(true)
  })

  it('does not let a token squeeze diagonally through a closed corner', () => {
    const walls = [wall('v', 5, 0, 5, 5), wall('h', 5, 5, 10, 5)]
    expect(moveBlocked({ x: 4.5, y: 5.5 }, { x: 5.5, y: 4.5 }, walls)).toBe(true)
  })

  it('walks round a wall, but not out of a room through a closed door', () => {
    // A room from (0,0) to (10,16), its door in the east wall.
    const map = splitMap()
    map.walls.push(wall('n', 0, 0, 10, 0), wall('w', 0, 0, 0, 16), wall('s', 0, 16, 10, 16))
    const token = { x: 2, y: 8, size: 1 }
    expect(canReach(map, token, { x: 14, y: 8 })).toBe(false)
    const open = { ...map, walls: map.walls.map((w) => (w.door ? { ...w, open: true } : w)) }
    expect(canReach(open, token, { x: 14, y: 8 })).toBe(true)
    // The grid has no edge: a lone wall can be walked round its end.
    expect(canReach(splitMap(), token, { x: 14, y: 8 })).toBe(true)
    // A short wall can be walked round.
    expect(canReach({ ...emptyBattleMap(), walls: [wall('w', 5, 0, 5, 5)] }, { x: 3, y: 2, size: 1 }, { x: 7, y: 2 })).toBe(true)
  })
})

describe('dragging into a wall', () => {
  const wallX = [wall('w', 10, 0, 10, 10)]
  it('stops a dragged token at the wall instead of letting it through', () => {
    const end = slideMove(wallX, 1, { x: 7.5, y: 5.5 }, { x: 13.5, y: 5.5 })
    expect(end.x).toBeLessThan(10)
    expect(end.x).toBeGreaterThan(9.4)
  })

  it('slides it along the wall when dragged at an angle', () => {
    const end = slideMove(wallX, 1, { x: 9.3, y: 2.5 }, { x: 12.5, y: 7.5 })
    expect(end.x).toBeLessThan(10)
    expect(end.y).toBeCloseTo(7.5, 1)
  })

  it('lets it round the end of a wall, and moves freely with no walls', () => {
    expect(slideMove(wallX, 1, { x: 9.5, y: 11.5 }, { x: 11.5, y: 11.5 })).toEqual({ x: 11.5, y: 11.5 })
    expect(slideMove([], 1, { x: 0, y: 0 }, { x: 50, y: -3 })).toEqual({ x: 50, y: -3 })
  })

  it('stops it at a closed door, not an open one', () => {
    const door = wall('d', 10, 0, 10, 10, { door: true })
    const shut = slideMove(blockingWalls({ walls: [door] }), 1, { x: 8.5, y: 5.5 }, { x: 12.5, y: 5.5 })
    expect(shut.x).toBeLessThan(10)
    expect(slideMove(blockingWalls({ walls: [{ ...door, open: true }] }), 1, { x: 8.5, y: 5.5 }, { x: 12.5, y: 5.5 }).x).toBeCloseTo(12.5)
  })
})

describe('sight and light', () => {
  it('only limits sight once a map has walls or is dark', () => {
    expect(visionActive(emptyBattleMap())).toBe(false)
    expect(visionActive(splitMap())).toBe(true)
    expect(visionActive({ ...emptyBattleMap(), ambient: 'dark' })).toBe(true)
  })

  it('sees up to a wall in the light, and through a door once it opens', () => {
    const map = splitMap()
    const sources = [{ x: 2.5, y: 8.5, darkvision: 0 }]
    const cells = visibleCells(map, sources, [])
    expect(inRegion(cells, 9, 8)).toBe(true)
    expect(inRegion(cells, 12, 8)).toBe(false)
    const open = { ...map, walls: map.walls.map((w) => (w.door ? { ...w, open: true } : w)) }
    expect(inRegion(visibleCells(open, sources, []), 12, 8)).toBe(true)
  })

  it('in the dark, sees only lit squares and what darkvision reaches', () => {
    const map = { ...emptyBattleMap(), ambient: 'dark' as const }
    const plain = visibleCells(map, [{ x: 0.5, y: 0.5, darkvision: 0 }], [])
    expect(plain.cells.some((v) => v === 1)).toBe(false)
    const dv = visibleCells(map, [{ x: 0.5, y: 0.5, darkvision: 30 }], [])
    expect(inRegion(dv, 6, 0)).toBe(true)
    expect(inRegion(dv, -5, 0)).toBe(true)
    expect(inRegion(dv, 8, 0)).toBe(false)
    const lit = visibleCells(map, [{ x: 0.5, y: 0.5, darkvision: 0 }], [{ x: 20.5, y: 0.5, bright: 5, dim: 5 }])
    expect(inRegion(lit, 20, 0)).toBe(true)
    expect(inRegion(lit, 10, 0)).toBe(false)
  })

  it('remembers explored squares compactly', () => {
    // Squares (-2,7), (-1,7) and (2,8), anywhere on the endless grid.
    const r: Region = { b: { x0: -2, y0: 7, x1: 3, y1: 9 }, cells: new Uint8Array([1, 1, 0, 0, 0, 0, 0, 0, 0, 1]) }
    const once = addExplored(undefined, r)
    expect(once).toBe('7:-2+2;8:2+1')
    expect(addExplored(once, r)).toBe(once)
    expect([...decodeExplored(once).get(7)!]).toEqual([-2, -1])
    // A record from before (a different format) reads as nothing explored.
    expect(decodeExplored('24:ff0').size).toBe(0)
  })
})

describe("a player's copy of the map", () => {
  it('leaves out enemies the party can’t see, never the party itself', () => {
    const map = splitMap({ tokens: { pc: { x: 2, y: 8, size: 1 }, ally: { x: 15, y: 2, size: 1 }, gob: { x: 14, y: 8, size: 1 }, orc: { x: 5, y: 8, size: 1 } } })
    const combatants = [c('pc', 'player', { userId: 'u1' }), c('ally', 'player', { userId: 'u2' }), c('gob', 'monster'), c('orc', 'monster')]
    // Shared sight: the ally across the wall sees the goblin.
    expect(Object.keys(mapForPlayer(map, new Set(), { combatants, userId: 'u1' }).tokens).sort()).toEqual(['ally', 'gob', 'orc', 'pc'])
    // Each to their own: the goblin is behind the wall from where the player stands.
    const own = mapForPlayer({ ...map, sharedVision: false }, new Set(), { combatants, userId: 'u1' })
    expect(Object.keys(own.tokens).sort()).toEqual(['ally', 'orc', 'pc'])
    expect(own.vision?.sources).toEqual([{ x: 2.5, y: 8.5, darkvision: 0, id: 'pc' }])
  })

  it('sends everything on a lit map with no walls, as before', () => {
    const map = { ...emptyBattleMap(), tokens: { pc: { x: 0, y: 0, size: 1 }, gob: { x: 20, y: 10, size: 1 } } }
    const seen = mapForPlayer(map, new Set(), { combatants: [c('pc', 'player', { userId: 'u1' }), c('gob', 'monster')], userId: 'u1' })
    expect(Object.keys(seen.tokens).sort()).toEqual(['gob', 'pc'])
    expect(seen.vision).toBeNull()
  })

  it('sees from every party token with shared sight, else just your own', () => {
    const map = { ...emptyBattleMap(), tokens: { a: { x: 0, y: 0, size: 1 }, b: { x: 4, y: 4, size: 1 } } }
    const combatants = [c('a', 'player', { userId: 'u1', darkvision: 60 }), c('b', 'player', { userId: 'u2' })]
    expect(viewerSources(map, combatants, 'u1')).toHaveLength(2)
    expect(viewerSources({ ...map, sharedVision: false }, combatants, 'u1')).toEqual([{ x: 0.5, y: 0.5, darkvision: 60, id: 'a' }])
  })

  it('reads old maps without walls or lights', () => {
    const m = normalizeBattleMap({ cols: 10, rows: 10, tokens: {} })
    expect(m.walls).toEqual([])
    expect(m.lights).toEqual([])
    expect(m.ambient).toBe('bright')
  })

  it('tells a player their party’s AC and who they are, but not an enemy’s', () => {
    const state = { ...emptyInitiativeState(), combatants: [c('pc', 'player', { userId: 'u2', ac: 16 }), c('gob', 'monster', { ac: 15 })] }
    const seen = sanitizeForPlayer(state, 'u1').combatants
    expect(seen.find((x) => x.id === 'pc')).toMatchObject({ ac: 16, userId: 'u2' })
    expect(seen.find((x) => x.id === 'gob')).toMatchObject({ ac: null })
    expect(seen.find((x) => x.id === 'gob')?.userId).toBeUndefined()
  })
})

describe('windows', () => {
  const room = (open?: boolean) => ({
    ...emptyBattleMap(),
    walls: [wall('n', 0, 0, 10, 0), wall('s', 0, 16, 10, 16), wall('w', 0, 0, 0, 16), wall('e1', 10, 0, 10, 7), wall('win', 10, 7, 10, 9, { window: true, ...(open ? { open: true } : {}) }), wall('e2', 10, 9, 10, 16)]
  })

  it('lets sight (and light) through glass, closed or open', () => {
    expect(inRegion(visibleCells(room(), [{ x: 2.5, y: 8.5, darkvision: 0 }], []), 14, 8)).toBe(true)
  })

  it('stops tokens when closed, and lets them climb through when open', () => {
    const token = { x: 2, y: 8, size: 1 }
    expect(canReach(room(), token, { x: 14, y: 8 })).toBe(false)
    expect(canReach(room(true), token, { x: 14, y: 8 })).toBe(true)
    expect(slideMove(blockingWalls(room(), 'move'), 1, { x: 8.5, y: 8 }, { x: 12.5, y: 8 }).x).toBeLessThan(10)
  })
})
