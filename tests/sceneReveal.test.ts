import { describe, expect, it } from 'vitest'
import { readScene, sceneRevealed, withRevealFlags, type SessionScene } from '../shared/sessionDeck'

const scene = (noteId: string, revealed?: boolean): SessionScene => ({ noteId, encounterIds: [], music: [], ...(revealed !== undefined ? { revealed } : {}) })

describe('scene reveal', () => {
  it('shows players only the scenes the DM has presented', () => {
    const scenes = [scene('a', true), scene('b', false), scene('c')]
    expect(scenes.filter((s) => sceneRevealed(s, scenes, true)).map((s) => s.noteId)).toEqual(['a'])
  })

  it('keeps every scene of a deck presented before scenes were revealed one by one', () => {
    const old = [scene('a'), scene('b')]
    expect(old.every((s) => sceneRevealed(s, old, true))).toBe(true)
    // A deck never presented shows nothing.
    expect(old.some((s) => sceneRevealed(s, old, false))).toBe(false)
    // Writing the flags out keeps that, so a new hidden scene can go beside them.
    expect(withRevealFlags(old, true).map((s) => s.revealed)).toEqual([true, true])
    expect(withRevealFlags(old, false).map((s) => s.revealed)).toEqual([false, false])
  })

  it('reads a scene saved with one encounter and one mood as lists, and drops anything malformed', () => {
    expect(readScene({ noteId: 'a', encounterId: 'e1', moodId: 'tavern', trackId: null })).toEqual({ noteId: 'a', encounterIds: ['e1'], music: [{ moodId: 'tavern', trackId: null }] })
    expect(readScene({ noteId: 'a', encounterId: null, moodId: null, trackId: null })).toEqual({ noteId: 'a', encounterIds: [], music: [] })
    expect(
      readScene({ noteId: 'a', encounterIds: ['e1', 'e1', 3, 'e2'], music: [{ moodId: 'dread', trackId: 't1' }, { moodId: '' }, null, { moodId: 'boss', trackId: 5 }] })
    ).toEqual({ noteId: 'a', encounterIds: ['e1', 'e2'], music: [{ moodId: 'dread', trackId: 't1' }, { moodId: 'boss', trackId: null }] })
  })
})
