import { describe, expect, it } from 'vitest'
import { activate, awakeTabs, closeTab, openTab, readTabs, updateTab } from '../src/renderer/src/features/browser/browserTabs'

describe('the Browser box’s tabs', () => {
  it('starts with one tab, and reads back only what it saved', () => {
    const fresh = readTabs(null, 'https://a.org/')
    expect(fresh.tabs).toHaveLength(1)
    expect(fresh.tabs[0].url).toBe('https://a.org/')
    const read = readTabs({ tabs: [{ id: 'x', url: 'javascript:alert(1)', title: 'T' }, { id: 'y', url: 'https://b.org/' }, 'junk'], active: 'y' })
    expect(read.tabs.map((t) => t.url)).toEqual(['', 'https://b.org/'])
    expect(read.active).toBe('y')
  })

  it('opens tabs after the one showing, and closing one goes back to the one before', () => {
    let s = readTabs(null, 'https://a.org/')
    const first = s.active
    s = openTab(s, 'https://b.org/')
    const second = s.active
    s = activate(s, first)
    s = openTab(s, 'https://c.org/')
    expect(s.tabs.map((t) => t.url)).toEqual(['https://a.org/', 'https://c.org/', 'https://b.org/'])
    s = activate(s, second)
    s = closeTab(s, second)
    expect(s.tabs.find((t) => t.id === s.active)?.url).toBe('https://c.org/')
  })

  it('never closes the last tab — it goes back to the start page', () => {
    const s = readTabs(null, 'https://a.org/')
    const closed = closeTab(s, s.active)
    expect(closed.tabs).toHaveLength(1)
    expect(closed.tabs[0].url).toBe('')
  })

  it('keeps only the most recently looked-at tabs live', () => {
    let s = readTabs(null, 'https://1.org/')
    for (const n of [2, 3, 4, 5]) s = openTab(s, `https://${n}.org/`)
    const urls = (ids: Set<string>): string[] => s.tabs.filter((t) => ids.has(t.id)).map((t) => t.url)
    expect(urls(awakeTabs(s))).toEqual(['https://3.org/', 'https://4.org/', 'https://5.org/'])
    s = activate(s, s.tabs[0].id)
    expect(urls(awakeTabs(s))).toEqual(['https://1.org/', 'https://4.org/', 'https://5.org/'])
    s = updateTab(s, s.tabs[0].id, { title: 'One' })
    expect(s.tabs[0].title).toBe('One')
  })
})
