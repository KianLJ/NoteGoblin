import { describe, expect, it } from 'vitest'
import { addressToUrl, isBrowsableUrl } from '../shared/browser'

describe('the Browser box’s address bar', () => {
  it('opens addresses and searches for anything else', () => {
    expect(addressToUrl('dndbeyond.com/spells')).toBe('https://dndbeyond.com/spells')
    expect(addressToUrl('https://example.org')).toBe('https://example.org')
    expect(addressToUrl('fireball 5e')).toBe('https://duckduckgo.com/?q=fireball%205e')
    expect(addressToUrl('owlbear')).toBe('https://duckduckgo.com/?q=owlbear')
    expect(addressToUrl('  ')).toBe('')
  })

  it('only ever shows web pages', () => {
    expect(isBrowsableUrl('https://a.b')).toBe(true)
    expect(isBrowsableUrl('file:///C:/Windows')).toBe(false)
    expect(isBrowsableUrl('javascript:alert(1)')).toBe(false)
    expect(addressToUrl('javascript:alert(1)')).toBe('https://duckduckgo.com/?q=javascript%3Aalert(1)')
  })
})

describe('the Browser box’s sessions', () => {
  it('gives each account its own, and accepts only those', async () => {
    const { browserPartition, isBrowserPartition } = await import('../shared/browser')
    expect(browserPartition('u_123-abc')).toBe('persist:browser-u_123-abc')
    expect(browserPartition(null)).toBe('persist:browser')
    expect(browserPartition('../../evil')).toBe('persist:browser-evil')
    expect(isBrowserPartition(browserPartition('u1'))).toBe(true)
    expect(isBrowserPartition('persist:browser')).toBe(true)
    expect(isBrowserPartition('persist:other')).toBe(false)
    expect(isBrowserPartition('')).toBe(false)
  })
})
