import { describe, expect, it } from 'vitest'
import { DEFAULT_HIDDEN_LABEL, hiddenBlockLabel, readScene, sceneVisibleTo, stripDmAsides, unmarkHiddenBlocks } from '@shared/sessionDeck'

describe('who can read a scene', () => {
  it('shows a presented scene only to players who were there, unless the DM says otherwise', () => {
    const scene = { revealed: true, seenBy: ['a'] }
    expect(sceneVisibleTo(scene, 'a')).toBe(true)
    expect(sceneVisibleTo(scene, 'late')).toBe(false)
    expect(sceneVisibleTo({ ...scene, visibility: 'hidden' }, 'a')).toBe(false)
    expect(sceneVisibleTo({ revealed: false, visibility: 'shown' }, 'late')).toBe(true)
    // Presented before seen-tracking existed: nobody's recorded, so it waits for the DM.
    expect(sceneVisibleTo({ revealed: true }, 'a')).toBe(false)
  })

  it('reads only the settings the DM may set, never who saw it', () => {
    const s = readScene({ noteId: 'n', visibility: 'shown', hiddenNotice: false, hiddenLabel: '  For you  ', seenBy: ['x'], revealed: true })
    expect(s).toMatchObject({ visibility: 'shown', hiddenNotice: false, hiddenLabel: 'For you' })
    expect('seenBy' in s || 'revealed' in s).toBe(false)
  })
})

describe('text only for one player', () => {
  const body = ['Intro', ':: @a', 'Only for A', '::', ':: @b', 'Only for B', '::'].join('\n')

  it('is labelled for them, in the scene’s own words if it has some', () => {
    expect(hiddenBlockLabel(['a'], () => undefined, { userId: 'a' })).toBe(DEFAULT_HIDDEN_LABEL)
    expect(hiddenBlockLabel(['a'], () => undefined, { userId: 'a', label: 'Psst' })).toBe('Psst')
    expect(hiddenBlockLabel(['a', 'b'], () => 'Bo', { userId: 'a' })).toBe('Hidden - Shown to You and Bo')
  })

  it('can read as ordinary text, without giving away what others were shown', () => {
    expect(unmarkHiddenBlocks(stripDmAsides(body, 'a'))).toBe(['Intro', 'Only for A'].join('\n'))
  })
})
