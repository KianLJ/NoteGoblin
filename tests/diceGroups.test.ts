import { describe, expect, it } from 'vitest'
import { diceGroups } from '@shared/dice'

describe('dice expressions for the roller', () => {
  it('splits dice and a flat bonus, merging the same die', () => {
    expect(diceGroups('2d6 + 3')).toEqual({ groups: [{ sides: 6, count: 2 }], modifier: 3 })
    expect(diceGroups('1d8+1d6+1d8 - 1')).toEqual({ groups: [{ sides: 8, count: 2 }, { sides: 6, count: 1 }], modifier: -1 })
    expect(diceGroups('d20')).toEqual({ groups: [{ sides: 20, count: 1 }], modifier: 0 })
  })

  it('refuses what the roller can’t do, so the caller can fall back', () => {
    expect(diceGroups('5')).toBeNull()
    expect(diceGroups('1d7')).toBeNull()
    expect(diceGroups('2d6 - 1d4')).toBeNull()
    expect(diceGroups('1d6 + @level')).toBeNull()
    expect(diceGroups('')).toBeNull()
  })
})
