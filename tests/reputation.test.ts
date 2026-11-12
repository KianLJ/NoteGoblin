import { describe, expect, it } from 'vitest'
import { changeStanding, normalizeReputation, reputationForPlayer, standingLabel } from '../shared/reputation'

describe('the reputation tracker', () => {
  it('names a standing by its tier', () => {
    expect([-10, -6, -3, 0, 1, 4, 7, 10].map(standingLabel)).toEqual(['Hated', 'Hostile', 'Unfriendly', 'Neutral', 'Friendly', 'Honored', 'Exalted', 'Exalted'])
    expect(standingLabel(-4)).toBe('Hostile')
  })

  it('keeps a standing within −10…+10, and notes only what actually moved', () => {
    const base = normalizeReputation({ entries: [{ id: 'a', name: 'The Harbourmaster', kind: 'npc', standing: 9 }] }).entries[0]
    const up = changeStanding(base, 5, 'Saved her ship', true, 'c1', '2026-01-01')
    expect(up.standing).toBe(10)
    expect(up.history).toEqual([{ id: 'c1', at: '2026-01-01', delta: 1, reason: 'Saved her ship', known: true }])
    expect(changeStanding(up, 1, 'more', true, 'c2', '')).toBe(up)
  })

  it('reads back only what makes sense, and never lets someone belong to their own member', () => {
    const doc = normalizeReputation({
      entries: [
        { id: 'k', name: 'Kingdom of Ash', kind: 'kingdom', standing: 99, partOf: 'f' },
        { id: 'f', name: 'The Ember Guard', kind: 'faction', partOf: 'k' },
        { id: 'n', name: '  ', kind: 'npc' },
        { id: 'x', name: 'Odd', kind: 'dragon', partOf: 'gone' }
      ]
    })
    expect(doc.entries.map((e) => [e.name, e.kind, e.standing])).toEqual([
      ['Kingdom of Ash', 'kingdom', 10],
      ['The Ember Guard', 'faction', 0],
      ['Odd', 'other', 0]
    ])
    // One link of the loop is cut, so it's a chain, not a circle.
    expect(doc.entries.filter((e) => e.partOf).length).toBe(1)
    expect(doc.entries[2].partOf).toBeUndefined()
  })

  it('players see only shown entries, without secrets or unknown history', () => {
    const doc = normalizeReputation({
      entries: [
        { id: 'k', name: 'Kingdom of Ash', kind: 'kingdom', shared: false },
        {
          id: 'f',
          name: 'The Ember Guard',
          kind: 'faction',
          shared: true,
          partOf: 'k',
          secret: 'Their captain is a doppelganger',
          history: [
            { id: 'h1', delta: 2, reason: 'Returned the banner', known: true },
            { id: 'h2', delta: -3, reason: 'Found out about the theft', known: false }
          ]
        }
      ]
    })
    const seen = reputationForPlayer(doc).entries
    expect(seen.map((e) => e.name)).toEqual(['The Ember Guard'])
    expect(seen[0]).not.toHaveProperty('secret')
    expect(seen[0]).not.toHaveProperty('partOf')
    expect(seen[0].history.map((h) => h.reason)).toEqual(['Returned the banner'])
  })
})
