import { describe, expect, it } from 'vitest'
import type { DerivedResource } from '@shared/content/engine'
import { applyRestores, removeTempPoints, resourceRemaining, restResources, restoreResource, rollAmount, setResourceUsed, spendResource } from '@shared/content/resourceMath'

const ce: DerivedResource = { id: 'ce', name: 'Cursed Energy', description: '', max: 8, used: 0, recharge: 'long', display: 'pool', source: 'x', shortRestRegain: 2 }
const ki: DerivedResource = { ...ce, id: 'ki', name: 'Ki', recharge: 'short', shortRestRegain: undefined }

describe('resource math', () => {
  it('spends temporary points first and refuses to overspend', () => {
    const state = { resourceUsed: { ce: 2 }, resourceTemp: { ce: 3 } }
    expect(resourceRemaining(ce, state)).toBe(9)
    expect(spendResource(ce, state, 4)).toEqual({ resourceUsed: { ce: 3 }, resourceTemp: {} })
    expect(spendResource(ce, state, 10)).toBeNull()
  })

  it('rolls dice amounts', () => {
    expect(rollAmount('2d6 + 3', () => 0)).toBe(5)
    expect(rollAmount('1d4 - 1', () => 0.99)).toBe(3)
    expect(rollAmount('7')).toBe(7)
  })

  it('restores spent points or adds temporary ones', () => {
    const { state, gained } = applyRestores(
      [
        { resourceId: 'ce', amount: '3', value: 3, temporary: false },
        { resourceId: 'ce', amount: '2', value: 2, temporary: true }
      ],
      [ce],
      { resourceUsed: { ce: 5 }, resourceTemp: {} }
    )
    expect(state).toEqual({ resourceUsed: { ce: 2 }, resourceTemp: { ce: 2 } })
    expect(gained).toHaveLength(2)
  })

  it('gives back short-rest regain, refills short-rest pools and drops temporary points on a rest', () => {
    const state = { resourceUsed: { ce: 5, ki: 3 }, resourceTemp: { ce: 2 } }
    expect(restResources('short', [ce, ki], state)).toEqual({ resourceUsed: { ce: 3, ki: 0 }, resourceTemp: {} })
    expect(restResources('long', [ce, ki], state)).toEqual({ resourceUsed: { ce: 0, ki: 0 }, resourceTemp: {} })
  })
})

describe('tracker edits', () => {
  it('restores only spent points, sets used, and removes temporary points', () => {
    const state = { resourceUsed: { ce: 5 }, resourceTemp: { ce: 3 } }
    expect(restoreResource(ce, state, 2)).toEqual({ resourceUsed: { ce: 3 }, resourceTemp: { ce: 3 } })
    expect(restoreResource(ce, state, 9).resourceUsed.ce).toBe(0)
    expect(setResourceUsed(ce, state, 99).resourceUsed.ce).toBe(8)
    expect(removeTempPoints(ce, state, 1).resourceTemp.ce).toBe(2)
    expect(removeTempPoints(ce, state).resourceTemp).toEqual({})
    // Spending through the tracker eats temporary points before regular ones.
    // Spent temporary points are gone, not left at 0.
    expect(spendResource(ce, state, 4)).toEqual({ resourceUsed: { ce: 6 }, resourceTemp: {} })
  })
})
