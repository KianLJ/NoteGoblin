import { describe, expect, it } from 'vitest'
import { canStand, emptyBattleMap, fogEverything, gridDistanceFt, isFogged, placeTokens, sizeInSquares, snapHalf, type FogShape } from '@shared/battleMap'
import { emptyCombatant, emptyInitiativeState, nextTurnState, previousTurnState, withCombatantHp, type Combatant } from '@shared/encounter'

const c = (id: string, kind: Combatant['kind'], extra: Partial<Combatant> = {}): Combatant => ({ id, name: id, kind, initiative: 10, maxHp: 10, currentHp: 10, ac: 12, ...emptyCombatant(), ...extra })

describe('battle map', () => {
  it('measures the 5e way: diagonals are 5 ft', () => {
    expect(gridDistanceFt({ x: 0, y: 0 }, { x: 3, y: 2 })).toBe(15)
    expect(gridDistanceFt({ x: 0, y: 0 }, { x: 0, y: 6 }, 10)).toBe(60)
  })

  it('puts the party on the left and enemies on the right, sized and not overlapping', () => {
    const map = placeTokens(emptyBattleMap(), [c('pc', 'player'), c('ogre', 'monster'), c('pc2', 'player')], (x) => (x.id === 'ogre' ? sizeInSquares('Large') : 1))
    expect(map.tokens.pc).toEqual({ x: 0, y: 0, size: 1 })
    expect(map.tokens.pc2).toEqual({ x: 0, y: 1, size: 1 })
    expect(map.tokens.ogre).toEqual({ x: 22, y: 0, size: 2 })
    expect(canStand(map, { x: 23, y: 1, size: 1 })).toBe(false)
  })

  it('drops tokens for combatants who left, and leaves an unchanged map alone', () => {
    const map = placeTokens(emptyBattleMap(), [c('a', 'player'), c('b', 'monster')], () => 1)
    expect(Object.keys(placeTokens(map, [c('a', 'player')], () => 1).tokens)).toEqual(['a'])
    expect(placeTokens(map, [c('a', 'player'), c('b', 'monster')], () => 1)).toBe(map)
  })

  it('applies fog shapes in order: fog, then a cut, then fog again over part of the cut', () => {
    const base = emptyBattleMap()
    const fog: FogShape[] = [
      fogEverything(base),
      { id: 'door', op: 'cut', kind: 'circle', cx: 5, cy: 5, r: 2 },
      { id: 'pillar', op: 'add', kind: 'rect', x: 4.5, y: 4.5, w: 1, h: 1 }
    ]
    const map = { ...base, fog }
    expect(isFogged(map, { x: 0.5, y: 0.5 })).toBe(true)
    expect(isFogged(map, { x: 6, y: 5 })).toBe(false)
    expect(isFogged(map, { x: 5, y: 5 })).toBe(true)
    expect(isFogged(base, { x: 5, y: 5 })).toBe(false)
  })

  it('knows what a brush stroke and a drawn shape cover', () => {
    const map = {
      ...emptyBattleMap(),
      fog: [
        { id: 's', op: 'add', kind: 'stroke', width: 1, points: [{ x: 0, y: 0 }, { x: 4, y: 0 }] },
        { id: 'p', op: 'add', kind: 'poly', points: [{ x: 10, y: 10 }, { x: 14, y: 10 }, { x: 12, y: 13 }] }
      ] as FogShape[]
    }
    expect([isFogged(map, { x: 2, y: 0.4 }), isFogged(map, { x: 2, y: 0.6 })]).toEqual([true, false])
    expect([isFogged(map, { x: 12, y: 11 }), isFogged(map, { x: 10.2, y: 12.8 })]).toEqual([true, false])
  })

  it('snaps to square corners and centres', () => {
    expect(snapHalf({ x: 2.2, y: 3.4 })).toEqual({ x: 2, y: 3.5 })
  })
})

describe('encounter helpers', () => {
  it('starts death saves at 0 HP for players only, and steps turns and rounds', () => {
    const s = { ...emptyInitiativeState(), combatants: [c('pc', 'player'), c('gob', 'monster')] }
    expect(withCombatantHp(s, 'pc', 0).combatants[0].deathSaves).toEqual({ successes: 0, failures: 0 })
    expect(withCombatantHp(s, 'gob', 0).combatants[1].deathSaves).toBeNull()
    const started = nextTurnState(s)
    expect([started.turnIndex, started.round]).toEqual([0, 1])
    const wrapped = nextTurnState(nextTurnState(started))
    expect([wrapped.turnIndex, wrapped.round]).toEqual([0, 2])
    expect([previousTurnState(wrapped).turnIndex, previousTurnState(wrapped).round]).toEqual([1, 1])
  })
})

describe('moving fog', () => {
  it('moves any fog shape and picks the topmost one under a point', async () => {
    const { fogShapeAt, moveFogShape } = await import('@shared/battleMap')
    const map = {
      ...emptyBattleMap(),
      fog: [
        { id: 'a', op: 'add', kind: 'rect', x: 0, y: 0, w: 4, h: 4 },
        { id: 'b', op: 'cut', kind: 'circle', cx: 2, cy: 2, r: 1 }
      ] as FogShape[]
    }
    expect(fogShapeAt(map, { x: 2, y: 2 })?.id).toBe('b')
    expect(fogShapeAt(map, { x: 0.5, y: 0.5 })?.id).toBe('a')
    expect(moveFogShape(map.fog[0], 2, 1)).toMatchObject({ x: 2, y: 1 })
    expect(moveFogShape({ id: 'p', op: 'add', kind: 'poly', points: [{ x: 1, y: 1 }] }, 1, 1)).toMatchObject({ points: [{ x: 2, y: 2 }] })
  })
})
