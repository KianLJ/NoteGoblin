import { describe, expect, it } from 'vitest'
import { busyTimesOnly, readBusy, readPlan, whoToPing, withoutSuggestion, withSuggestion, withVote, type SessionPlan } from '../relay/src/lib/planner'
import { busyFor, dayKey, dueReminders, freeWindows, sessionIcs, type PlanView } from '../shared/planner'

const NOW = '2026-11-18T12:00:00.000Z'

describe('the session planner on the relay', () => {
  it('keeps busy times real, at most a week, each once, and never shows friends the titles', () => {
    const busy = readBusy([
      { id: 'b', start: '2026-11-20T18:00:00Z', end: '2026-11-20T20:00:00Z', title: ' Dentist ' },
      { id: 'a', start: '2026-11-20T09:00:00Z', end: '2026-11-20T17:00:00Z' },
      { id: 'c', start: '2026-11-20T09:00:00Z', end: '2026-11-20T08:00:00Z' },
      { id: 'd', start: '2026-11-01T00:00:00Z', end: '2026-11-20T00:00:00Z' },
      { id: 'e', start: 'soon', end: '2026-11-20T08:00:00Z' },
      null
    ])
    expect(busy.map((b) => b.id)).toEqual(['a', 'b'])
    expect(busy[1].title).toBe('Dentist')
    expect(busyTimesOnly(busy)[1]).toEqual({ id: 'b', start: '2026-11-20T18:00:00.000Z', end: '2026-11-20T20:00:00.000Z' })
    expect(readBusy(null)).toEqual([])
  })

  it('checks a plan: a name, only friends asked, sensible times', () => {
    const ok = readPlan({ title: ' Session 12 ', memberIds: ['ann', 'bram', 'me'], proposals: [{ id: 'p1', start: '2026-11-20T19:00:00Z', minutes: 180 }] }, 'me', ['ann', 'bram'], null, NOW)
    expect('plan' in ok && ok.plan).toMatchObject({ title: 'Session 12', ownerId: 'me', memberIds: ['ann', 'bram'], proposals: [{ id: 'p1', start: '2026-11-20T19:00:00.000Z', minutes: 180 }] })
    expect(readPlan({ title: '', memberIds: [] }, 'me', [], null, NOW)).toEqual({ error: 'Give the session a name.' })
    expect(readPlan({ title: 'X', memberIds: ['stranger'] }, 'me', ['ann'], null, NOW)).toEqual({ error: 'You can only ask your friends.' })
    expect(readPlan({ title: 'X', memberIds: ['me'] }, 'me', ['ann'], null, NOW)).toEqual({ error: 'Pick who to ask.' })
    expect('error' in readPlan({ title: 'X', memberIds: ['ann'], proposals: [{ id: 'p', start: 'soon', minutes: 60 }] }, 'me', ['ann'], null, NOW)).toBe(true)
    expect('error' in readPlan({ title: 'X', memberIds: ['ann'], proposals: [{ id: 'p', start: NOW, minutes: 5 }] }, 'me', ['ann'], null, NOW)).toBe(true)
  })

  it('keeps votes and the booking for times still there, and nobody sets them by saving', () => {
    const before: SessionPlan = {
      id: 'plan',
      ownerId: 'me',
      title: 'X',
      memberIds: ['ann', 'bram'],
      proposals: [
        { id: 'p1', start: NOW, minutes: 60 },
        { id: 'p2', start: NOW, minutes: 60 }
      ],
      votes: { p1: { ann: 'yes', bram: 'no' }, p2: { ann: 'maybe' } },
      booked: { proposalId: 'p1', start: NOW, minutes: 60 },
      updatedAt: NOW
    }
    const r = readPlan({ title: 'X', memberIds: ['ann'], proposals: [{ id: 'p1', start: NOW, minutes: 90 }], votes: { p1: { ann: 'no' } }, booked: { proposalId: 'p9' } }, 'me', ['ann', 'bram'], before, NOW)
    if (!('plan' in r)) throw new Error(r.error)
    expect(r.plan.votes).toEqual({ p1: { ann: 'yes' } })
    // The booked time follows its proposal's new length.
    expect(r.plan.booked).toEqual({ proposalId: 'p1', start: NOW, minutes: 90 })
    expect(whoToPing(before, r.plan)).toEqual({ invited: [], newTimes: [] })
    const more = readPlan({ title: 'X', memberIds: ['ann', 'bram'], proposals: [{ id: 'p1', start: NOW, minutes: 60 }, { id: 'p3', start: NOW, minutes: 60 }] }, 'me', ['ann', 'bram'], r.plan, NOW)
    if (!('plan' in more)) throw new Error(more.error)
    expect(whoToPing(r.plan, more.plan)).toEqual({ invited: ['bram'], newTimes: ['ann'] })
  })

  it('takes answers only from people in the plan, for its own times', () => {
    const plan: SessionPlan = { id: 'plan', ownerId: 'me', title: 'X', memberIds: ['ann'], proposals: [{ id: 'p1', start: NOW, minutes: 60 }], votes: {}, updatedAt: NOW }
    expect(withVote(plan, 'ann', 'p1', 'yes')?.votes).toEqual({ p1: { ann: 'yes' } })
    expect(withVote(plan, 'me', 'p1', 'maybe')?.votes).toEqual({ p1: { me: 'maybe' } })
    expect(withVote(plan, 'eve', 'p1', 'yes')).toBeNull()
    expect(withVote(plan, 'ann', 'p9', 'yes')).toBeNull()
    expect(withVote(plan, 'ann', 'p1', 'sure')).toBeNull()
    expect(withVote(withVote(plan, 'ann', 'p1', 'yes')!, 'ann', 'p1', null)?.votes).toEqual({ p1: {} })
  })
})

describe('suggesting times', () => {
  const plan: SessionPlan = { id: 'plan', ownerId: 'me', title: 'X', memberIds: ['ann', 'bram'], proposals: [{ id: 'p1', start: NOW, minutes: 180 }], votes: {}, updatedAt: NOW }

  it('lets anyone asked suggest a time, marked as theirs, with their yes', () => {
    const s = withSuggestion(plan, 'ann', 's1', '2026-11-20T20:00:00Z', 120, NOW)!
    expect(s.proposals.find((p) => p.id === 's1')).toEqual({ id: 's1', start: '2026-11-20T20:00:00.000Z', minutes: 120, by: 'ann' })
    expect(s.votes.s1).toEqual({ ann: 'yes' })
    expect(withSuggestion(plan, 'eve', 's1', NOW, 120, NOW)).toBeNull()
    expect(withSuggestion(plan, 'ann', 's1', 'soon', 120, NOW)).toBeNull()
    expect(withSuggestion(plan, 'ann', 's1', NOW, 5, NOW)).toBeNull()
  })

  it('lets only who suggested it (or the organiser) take it off, and keeps who it was through a save', () => {
    const s = withSuggestion(plan, 'ann', 's1', NOW, 120, NOW)!
    expect(withoutSuggestion(s, 'bram', 's1', NOW)).toBeNull()
    expect(withoutSuggestion(s, 'ann', 's1', NOW)?.proposals.map((p) => p.id)).toEqual(['p1'])
    expect(withoutSuggestion(s, 'me', 's1', NOW)?.votes.s1).toBeUndefined()
    // The organiser can't claim a suggestion was someone else's, or drop who made one.
    const saved = readPlan({ title: 'X', memberIds: ['ann', 'bram'], proposals: s.proposals.map(({ by: _by, ...p }) => ({ ...p, by: 'bram' })) }, 'me', ['ann', 'bram'], s, NOW)
    if (!('plan' in saved)) throw new Error(saved.error)
    expect(saved.plan.proposals.map((p) => p.by)).toEqual([undefined, 'ann'])
  })
})

describe('the session planner in the app', () => {
  it('finds who has something on during a time, and when everyone is free', () => {
    const members = [
      { userId: 'ann', busy: [{ id: '1', start: '2026-11-20T09:00:00Z', end: '2026-11-20T17:00:00Z' }] },
      { userId: 'bram', busy: [{ id: '2', start: '2026-11-20T20:00:00Z', end: '2026-11-20T21:00:00Z' }] }
    ]
    // Busy at work all day, but free for an evening session: only Bram's hour clashes.
    expect(busyFor(members, '2026-11-20T18:00:00Z', 180)).toEqual(['bram'])
    expect(busyFor(members, '2026-11-20T17:00:00Z', 60)).toEqual([])
    const day = Date.parse('2026-11-20T00:00:00Z')
    const h = (n: number): number => day + n * 3_600_000
    expect(freeWindows(members.map((m) => m.busy), h(8), h(24))).toEqual([[h(8), h(9)], [h(17), h(20)], [h(21), h(24)]])
    expect(freeWindows(members.map((m) => m.busy), h(8), h(24), 2 * 3_600_000)).toEqual([[h(17), h(20)], [h(21), h(24)]])
    expect(freeWindows(members.map((m) => m.busy), h(8), h(24), 4 * 3_600_000)).toEqual([])
    expect(dayKey(new Date(2026, 10, 20, 19))).toBe('2026-11-20')
  })

  const plan = (start: string): PlanView => ({
    id: 'plan',
    ownerId: 'me',
    title: 'Session 12; the crypt',
    campaignName: 'Ashes',
    memberIds: ['ann'],
    proposals: [{ id: 'p1', start, minutes: 180 }],
    votes: {},
    booked: { proposalId: 'p1', start, minutes: 180 },
    updatedAt: NOW,
    members: [
      { userId: 'me', username: 'kian', busy: [] },
      { userId: 'ann', username: 'ann', busy: [] }
    ]
  })

  it('reminds the day before and the hour before, each once, only the nearer', () => {
    const now = Date.parse(NOW)
    expect(dueReminders([plan('2026-11-19T10:00:00Z')], now, new Set()).map((r) => r.soon)).toEqual(['day'])
    expect(dueReminders([plan('2026-11-18T12:30:00Z')], now, new Set()).map((r) => r.soon)).toEqual(['hour'])
    expect(dueReminders([plan('2026-11-25T12:30:00Z')], now, new Set())).toEqual([])
    expect(dueReminders([plan('2026-11-18T11:00:00Z')], now, new Set())).toEqual([])
    const key = dueReminders([plan('2026-11-18T12:30:00Z')], now, new Set())[0].key
    expect(dueReminders([plan('2026-11-18T12:30:00Z')], now, new Set([key]))).toEqual([])
  })

  it('makes a calendar file for a booked session', () => {
    const ics = sessionIcs(plan('2026-11-20T19:00:00Z'), Date.parse(NOW))!
    expect(ics).toContain('DTSTART:20261120T190000Z')
    expect(ics).toContain('DTEND:20261120T220000Z')
    expect(ics).toContain('SUMMARY:Session 12\\; the crypt')
    expect(ics).toContain('DESCRIPTION:Ashes. With kian\\, ann.')
  })
})
