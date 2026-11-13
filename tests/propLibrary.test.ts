import { describe, expect, it } from 'vitest'
import { cleanName } from '../src/main/propLibrary'

describe('prop names', () => {
  it('drop path characters and leading dots, so a name stays one file in the props folder', () => {
    expect(cleanName('../../secrets')).toBe('secrets')
    expect(cleanName('Old: oak/table?')).toBe('Old oaktable')
    expect(cleanName('  .hidden  ')).toBe('hidden')
    expect(cleanName('Barrel')).toBe('Barrel')
  })
})
