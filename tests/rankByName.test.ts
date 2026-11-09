import { describe, expect, it } from 'vitest'
import { rankByName } from '../shared/rankByName'

const named = (...names: string[]): { name: string }[] => names.map((name) => ({ name }))

describe('rankByName', () => {
  it('puts names starting with the query first, then words starting with it, then anywhere', () => {
    const list = named('Hobgoblin', 'Goblin Boss', 'Goblin', 'Bugbear', 'Green Hag (goblin kin)')
    expect(rankByName(list, 'gob').map((m) => m.name)).toEqual(['Goblin', 'Goblin Boss', 'Green Hag (goblin kin)', 'Hobgoblin'])
  })

  it('ignores case and surrounding spaces, and keeps everything for an empty query', () => {
    const list = named('Ogre', 'Orc')
    expect(rankByName(list, '  OGR ').map((m) => m.name)).toEqual(['Ogre'])
    expect(rankByName(list, '')).toBe(list)
  })
})
