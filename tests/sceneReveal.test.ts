import { describe, expect, it } from 'vitest'
import { sceneRevealed, withRevealFlags, type SessionScene } from '../shared/sessionDeck'

const scene = (noteId: string, revealed?: boolean): SessionScene => ({ noteId, encounterId: null, moodId: null, trackId: null, ...(revealed !== undefined ? { revealed } : {}) })

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
})
