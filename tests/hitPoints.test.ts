import { describe, expect, it } from 'vitest'
import { applyDamage, applyHealing, hpAfterMaxChange } from '@shared/hitPoints'

describe('hit points', () => {
  it('takes damage from temporary HP first, which is gone once used up', () => {
    expect(applyDamage({ currentHp: 20, tempHp: 5 }, 3)).toEqual({ currentHp: 20, tempHp: 2 })
    expect(applyDamage({ currentHp: 20, tempHp: 5 }, 8)).toEqual({ currentHp: 17, tempHp: 0 })
    expect(applyDamage({ currentHp: 4, tempHp: 0 }, 10)).toEqual({ currentHp: 0, tempHp: 0 })
  })

  it('heals up to the maximum without touching temporary HP', () => {
    expect(applyHealing({ currentHp: 10, tempHp: 3 }, 50, 24)).toEqual({ currentHp: 24, tempHp: 3 })
  })

  it('moves current HP with the maximum, both ways', () => {
    expect(hpAfterMaxChange(40, 40, 48)).toBe(48)
    expect(hpAfterMaxChange(48, 48, 40)).toBe(40)
    expect(hpAfterMaxChange(20, 48, 40)).toBe(12)
    expect(hpAfterMaxChange(3, 48, 40)).toBe(1)
    expect(hpAfterMaxChange(0, 48, 40)).toBe(0)
  })
})
