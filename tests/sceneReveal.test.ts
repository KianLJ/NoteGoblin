import { describe, expect, it } from 'vitest'
import { fenceAudience, fenceFor, hiddenBlocks, mergeHiddenBlocks, readScene, stripDmAsides } from '../shared/sessionDeck'

describe('scene reveal', () => {
  it('reads a scene saved with one encounter and one mood as lists, and drops anything malformed', () => {
    expect(readScene({ noteId: 'a', encounterId: 'e1', moodId: 'tavern', trackId: null })).toEqual({ noteId: 'a', encounterIds: ['e1'], music: [{ moodId: 'tavern', trackId: null }] })
    expect(readScene({ noteId: 'a', encounterId: null, moodId: null, trackId: null })).toEqual({ noteId: 'a', encounterIds: [], music: [] })
    expect(
      readScene({ noteId: 'a', encounterIds: ['e1', 'e1', 3, 'e2'], music: [{ moodId: 'dread', trackId: 't1' }, { moodId: '' }, null, { moodId: 'boss', trackId: 5 }] })
    ).toEqual({ noteId: 'a', encounterIds: ['e1', 'e2'], music: [{ moodId: 'dread', trackId: 't1' }, { moodId: 'boss', trackId: null }] })
  })

  it('finds hidden blocks, open-ended ones included, and strips them', () => {
    const body = ['Intro', '::', 'secret', '::', 'Middle', '  ::  ', 'trailing secret'].join('\n')
    expect(hiddenBlocks(body.split('\n'))).toEqual([
      { open: 1, close: 3, audience: [] },
      { open: 5, close: null, audience: [] }
    ])
    expect(stripDmAsides(body)).toBe('Intro\nMiddle')
  })

  it('puts hidden blocks back into a save by someone who never saw them', () => {
    const stored = ['Intro', '', '::', 'the vault code is 4321', '::', 'Middle', '::', 'plan B', '::', 'End'].join('\n')
    const seen = stripDmAsides(stored)
    expect(seen).toBe('Intro\n\nMiddle\nEnd')
    // They add a line at the top and change the last one: both blocks keep their places.
    const edited = 'New first line\n' + seen.replace('End', 'The end')
    expect(mergeHiddenBlocks(stored, edited)).toBe(['New first line', 'Intro', '::', 'the vault code is 4321', '::', '', 'Middle', '::', 'plan B', '::', 'The end'].join('\n'))
    // Their edit removed the line a block followed: it goes at the end, never lost.
    expect(mergeHiddenBlocks(stored, 'Only this')).toBe(['Only this', '::', 'the vault code is 4321', '::', '::', 'plan B', '::'].join('\n'))
    // A block at the very top stays at the top.
    expect(mergeHiddenBlocks('::\nsecret\n::\nText', 'Text!')).toBe('::\nsecret\n::\nText!')
    // Nothing hidden: their text as it is.
    expect(mergeHiddenBlocks('a\nb', 'a\nc')).toBe('a\nc')
  })

  it('lets the players an opening fence names see its block, and nobody else', () => {
    expect(fenceFor(['u1', 'u2'])).toBe(':: @u1 @u2')
    expect(fenceAudience(':: @u1 @u2')).toEqual(['u1', 'u2'])
    // Text after :: that isn't a list of players isn't a fence at all.
    expect(hiddenBlocks([':: not a fence'])).toEqual([])
    const body = ['Intro', ':: @u1', 'for Ann', '::', '::', 'for nobody', '::', 'End'].join('\n')
    expect(stripDmAsides(body, 'u1')).toBe(['Intro', ':: @u1', 'for Ann', '::', 'End'].join('\n'))
    expect(stripDmAsides(body, 'u2')).toBe('Intro\nEnd')
    // Ann edits what she saw: only the block she couldn't see goes back in.
    const annSaw = stripDmAsides(body, 'u1')
    expect(mergeHiddenBlocks(body, annSaw.replace('for Ann', 'for Ann, edited'), 'u1')).toBe(body.replace('for Ann', 'for Ann, edited'))
  })
})
