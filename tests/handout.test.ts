import { describe, expect, it } from 'vitest'
import { parseHandout } from '../shared/ipc'

describe('handouts arriving over the relay', () => {
  it('lets through a note or a data: picture, and nothing more than their fields', () => {
    expect(parseHandout({ id: 'h', title: 'Letter', kind: 'note', markdown: 'Hi', extra: 1 })).toEqual({ id: 'h', title: 'Letter', kind: 'note', markdown: 'Hi' })
    expect(parseHandout({ id: 'h', title: 'Map', kind: 'image', src: 'data:image/png;base64,AAAA' })).toEqual({ id: 'h', title: 'Map', kind: 'image', src: 'data:image/png;base64,AAAA' })
  })

  it('refuses pictures from anywhere but the handout itself', () => {
    expect(parseHandout({ id: 'h', title: 'Map', kind: 'image', src: 'https://example.com/x.png' })).toBeNull()
    expect(parseHandout({ id: 'h', title: 'Map', kind: 'image', src: 'javascript:alert(1)' })).toBeNull()
  })

  it('refuses anything malformed', () => {
    for (const bad of [null, 'note', {}, { id: 1, title: 't', kind: 'note', markdown: '' }, { id: 'h', title: 't', kind: 'video', src: 'data:image/png' }, { id: 'h', title: 't', kind: 'note' }]) {
      expect(parseHandout(bad)).toBeNull()
    }
  })
})
