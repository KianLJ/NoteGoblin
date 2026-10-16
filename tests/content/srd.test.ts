import { describe, expect, it } from 'vitest'
import { buildSrdPackInput, srdPack } from '@shared/content/srd'
import { validatePack } from '@shared/content/validate'

describe('SRD 5.2.1 pack', () => {
  it('passes validatePack with no issues', () => {
    const result = validatePack(buildSrdPackInput())
    expect(result.issues).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('covers every legacy entry', () => {
    const pack = srdPack()
    expect(pack.classes).toHaveLength(12)
    expect(pack.subclasses).toHaveLength(12)
    expect(pack.species).toHaveLength(9)
    expect(pack.backgrounds).toHaveLength(4)
    expect(pack.feats).toHaveLength(17)
    expect(pack.spells).toHaveLength(321)
    expect(pack.items).toHaveLength(237 + 362)
  })
})
