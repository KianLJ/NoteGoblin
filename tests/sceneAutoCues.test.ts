import { describe, expect, it } from 'vitest'
import { readScene } from '../shared/sessionDeck'

describe('a scene’s autoplay switches', () => {
  it('keeps them only when they differ from the defaults: music plays, encounters wait', () => {
    expect(readScene({ noteId: 'n', encounterIds: ['e'], music: [] })).not.toHaveProperty('autoMusic')
    expect(readScene({ noteId: 'n', autoMusic: true, autoEncounter: false })).toEqual({ noteId: 'n', encounterIds: [], music: [] })
    expect(readScene({ noteId: 'n', autoMusic: false, autoEncounter: true })).toMatchObject({ autoMusic: false, autoEncounter: true })
    expect(readScene({ noteId: 'n', autoMusic: 'no', autoEncounter: 'yes' })).toEqual({ noteId: 'n', encounterIds: [], music: [] })
  })
})
