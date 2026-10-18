import { describe, expect, it } from 'vitest'
import { buildCheckRollEntry, isCritFace } from '@shared/dice'

describe('lowered critical range', () => {
  it('crits on a natural 20 by default, and from the lowered face when there is one', () => {
    expect(isCritFace(20, {})).toBe(true)
    expect(isCritFace(19, {})).toBe(false)
    expect(isCritFace(19, { critOn: 19 })).toBe(true)
    expect(isCritFace(18, { critOn: 19 })).toBe(false)
  })

  it('carries the lowered face on an attack roll, and nothing for a normal one', () => {
    const lowered = buildCheckRollEntry('me', 'Me', 5, 'normal', false, 'Revolver Attack', null, [19], 19)
    expect(lowered.critOn).toBe(19)
    expect(isCritFace(lowered.groups![0].results[0], lowered)).toBe(true)
    expect(buildCheckRollEntry('me', 'Me', 5, 'normal', false, 'Attack', null, [19], 20).critOn).toBeUndefined()
  })
})
