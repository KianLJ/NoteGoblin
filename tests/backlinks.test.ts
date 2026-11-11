import { describe, expect, it } from 'vitest'
import { backlinksTo, linkTargets } from '../src/renderer/src/wikilink'

const note = (id: string, title: string, bodyMarkdown: string) => ({ id, title, bodyMarkdown })

describe('backlinks', () => {
  it('reads both link forms, aliases included, ignoring case', () => {
    expect([...linkTargets('See [[The Crypt]], [brakka|the ogre] and [[Saltmarsh|town]].')]).toEqual(['the crypt', 'brakka', 'saltmarsh'])
  })

  it('leaves ordinary markdown links alone', () => {
    expect(linkTargets('[a site](https://example.com) and [text][ref]').size).toBe(0)
  })

  it('lists the other notes linking to a note, by title, not the note itself', () => {
    const crypt = note('1', 'The Crypt', 'It links to [[The Crypt]] itself.')
    const notes = [crypt, note('2', 'Session 3', 'We went to [the crypt].'), note('3', 'Brakka', 'Lives in [[The Crypt|the old chapel]].'), note('4', 'Town', 'Nothing here.')]
    expect(backlinksTo(notes, crypt).map((n) => n.title)).toEqual(['Brakka', 'Session 3'])
  })

  it('an untitled note has no backlinks', () => {
    expect(backlinksTo([note('2', 'Other', '[[ ]]')], { id: '1', title: '  ' })).toEqual([])
  })
})
