// The session planner's wire shapes and rules, shared by the relay (directory.ts,
// which stores and checks plans) and the app (shared/relay.ts re-exports the
// types). Pure: no storage, no Workers APIs, so tests can import it directly.

export type PlanAnswer = 'yes' | 'maybe' | 'no'

/**
 * Something someone has on, from `start` to `end` (ISO date-times), so friends
 * can see they're busy then and free either side. The title is only ever sent
 * back to its owner: friends see the times alone.
 */
export interface BusyBlock {
  id: string
  start: string
  end: string
  title?: string
}

export interface PlanProposal {
  id: string
  /** When it starts, as an ISO date-time. */
  start: string
  /** How long, in minutes. */
  minutes: number
  /** Someone asked who suggested this time instead (the organiser's own times have none). */
  by?: string
}

export interface SessionPlan {
  id: string
  ownerId: string
  title: string
  campaignId?: string
  campaignName?: string
  /** Everyone asked, not counting the organiser. */
  memberIds: string[]
  proposals: PlanProposal[]
  /** proposal id → user id → their answer. */
  votes: Record<string, Record<string, PlanAnswer>>
  /** The time it's pencilled in for, once the organiser books one. */
  booked?: { proposalId: string; start: string; minutes: number }
  updatedAt: string
}

export interface PlanMember {
  userId: string
  username: string
  avatar?: string
  /** Their busy times, without titles. */
  busy: BusyBlock[]
}

/** A plan as one of its people sees it: everyone in it (organiser first), with their busy days. */
export interface PlanView extends SessionPlan {
  members: PlanMember[]
}

export interface PlannerState {
  myBusy: BusyBlock[]
  /** Your friends' busy times (no titles), by user id, for picking times before they're in a plan. */
  friendsBusy: Record<string, BusyBlock[]>
  plans: PlanView[]
}

export const MAX_PLAN_MEMBERS = 30
export const MAX_PROPOSALS = 20

export const MAX_BUSY = 300
const WEEK_MS = 7 * 86_400_000

/** Busy times from the wire: real times, ending after they start and at most a week long, each id once, in order. */
export function readBusy(raw: unknown): BusyBlock[] {
  if (!Array.isArray(raw)) return []
  const out = new Map<string, BusyBlock>()
  for (const b of raw as Array<Partial<BusyBlock> | null>) {
    if (!b || typeof b.id !== 'string' || !b.id || b.id.length > 64 || typeof b.start !== 'string' || typeof b.end !== 'string') continue
    const start = Date.parse(b.start)
    const end = Date.parse(b.end)
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start || end - start > WEEK_MS) continue
    const title = typeof b.title === 'string' ? b.title.trim().slice(0, 80) : ''
    out.set(b.id, { id: b.id, start: new Date(start).toISOString(), end: new Date(end).toISOString(), ...(title ? { title } : {}) })
  }
  return [...out.values()].sort((a, b) => a.start.localeCompare(b.start)).slice(-MAX_BUSY)
}

/** Busy times as friends see them: when, not what. */
export function busyTimesOnly(busy: BusyBlock[]): BusyBlock[] {
  return busy.map(({ id, start, end }) => ({ id, start, end }))
}

/** A time on the wire: a real start, 15 minutes to a day long. */
function readTime(start: unknown, minutes: unknown): { start: string; minutes: number } | null {
  if (typeof start !== 'string' || Number.isNaN(Date.parse(start))) return null
  if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 15 || minutes > 24 * 60) return null
  return { start: new Date(start).toISOString(), minutes }
}

function readProposals(raw: unknown): PlanProposal[] | null {
  if (!Array.isArray(raw)) return []
  if (raw.length > MAX_PROPOSALS) return null
  const out: PlanProposal[] = []
  for (const p of raw as Array<Partial<PlanProposal> | null>) {
    if (!p || typeof p.id !== 'string' || !p.id || p.id.length > 64) return null
    const time = readTime(p.start, p.minutes)
    if (!time) return null
    if (out.some((x) => x.id === p.id)) return null
    out.push({ id: p.id, ...time })
  }
  return out.sort((a, b) => a.start.localeCompare(b.start))
}

/**
 * A plan as the organiser sent it, checked: a title, only their friends asked
 * (never themselves), sensible times. Votes and the booking are kept from
 * `before` for the times that are still there; nobody can set them by saving.
 */
export function readPlan(
  raw: unknown,
  ownerId: string,
  friendIds: string[],
  before: SessionPlan | null,
  now: string
): { plan: SessionPlan } | { error: string } {
  const o = (raw ?? {}) as Partial<SessionPlan>
  const title = typeof o.title === 'string' ? o.title.trim().slice(0, 120) : ''
  if (!title) return { error: 'Give the session a name.' }
  if (!Array.isArray(o.memberIds) || o.memberIds.some((id) => typeof id !== 'string')) return { error: 'Pick who to ask.' }
  const memberIds = [...new Set(o.memberIds as string[])].filter((id) => id !== ownerId)
  if (!memberIds.length) return { error: 'Pick who to ask.' }
  if (memberIds.length > MAX_PLAN_MEMBERS) return { error: `A plan can ask up to ${MAX_PLAN_MEMBERS} people.` }
  // Only people still asked from before, or friends: nobody gets added to plans by strangers.
  if (memberIds.some((id) => !friendIds.includes(id) && !before?.memberIds.includes(id))) return { error: 'You can only ask your friends.' }
  const read = readProposals(o.proposals)
  if (!read) return { error: 'One of the times isn’t right.' }
  // Who suggested a time comes from the plan as it was, never from the organiser's save.
  const proposals = read.map((p) => {
    const by = before?.proposals.find((x) => x.id === p.id)?.by
    return by ? { ...p, by } : p
  })
  const kept = new Set(proposals.map((p) => p.id))
  const people = new Set([ownerId, ...memberIds])
  const votes: SessionPlan['votes'] = {}
  for (const [pid, byUser] of Object.entries(before?.votes ?? {})) {
    if (!kept.has(pid)) continue
    const still = Object.entries(byUser).filter(([uid]) => people.has(uid))
    if (still.length) votes[pid] = Object.fromEntries(still)
  }
  const booked = before?.booked && kept.has(before.booked.proposalId) ? proposals.find((p) => p.id === before.booked!.proposalId) : undefined
  return {
    plan: {
      id: before?.id ?? (typeof o.id === 'string' && o.id ? o.id.slice(0, 64) : ''),
      ownerId,
      title,
      ...(typeof o.campaignId === 'string' && o.campaignId ? { campaignId: o.campaignId.slice(0, 64), campaignName: String(o.campaignName ?? '').slice(0, 120) } : {}),
      memberIds,
      proposals,
      votes,
      ...(booked ? { booked: { proposalId: booked.id, start: booked.start, minutes: booked.minutes } } : {}),
      updatedAt: now
    }
  }
}

/** Someone in the plan answering one of its times; anything else leaves it as it was. */
export function withVote(plan: SessionPlan, userId: string, proposalId: string, answer: unknown): SessionPlan | null {
  if (userId !== plan.ownerId && !plan.memberIds.includes(userId)) return null
  if (!plan.proposals.some((p) => p.id === proposalId)) return null
  if (answer !== 'yes' && answer !== 'maybe' && answer !== 'no' && answer !== null) return null
  const forTime = { ...(plan.votes[proposalId] ?? {}) }
  if (answer === null) delete forTime[userId]
  else forTime[userId] = answer
  return { ...plan, votes: { ...plan.votes, [proposalId]: forTime } }
}

/**
 * Someone in the plan suggesting a time of their own (it says it was theirs), answered yes for them; null if they
 * aren't in it, the time isn't right, or the plan has all the times it can take.
 */
export function withSuggestion(plan: SessionPlan, userId: string, id: string, start: unknown, minutes: unknown, now: string): SessionPlan | null {
  if (userId !== plan.ownerId && !plan.memberIds.includes(userId)) return null
  if (plan.proposals.length >= MAX_PROPOSALS || plan.proposals.some((p) => p.id === id)) return null
  const time = readTime(start, minutes)
  if (!time) return null
  const proposals = [...plan.proposals, { id, ...time, ...(userId === plan.ownerId ? {} : { by: userId }) }].sort((a, b) => a.start.localeCompare(b.start))
  return { ...plan, proposals, votes: { ...plan.votes, [id]: { [userId]: 'yes' } }, updatedAt: now }
}

/** Taking a suggested time back: only whoever suggested it (or the organiser), and never the booked one. */
export function withoutSuggestion(plan: SessionPlan, userId: string, proposalId: string, now: string): SessionPlan | null {
  const p = plan.proposals.find((x) => x.id === proposalId)
  if (!p || plan.booked?.proposalId === proposalId) return null
  if (userId !== plan.ownerId && p.by !== userId) return null
  const votes = { ...plan.votes }
  delete votes[proposalId]
  return { ...plan, proposals: plan.proposals.filter((x) => x.id !== proposalId), votes, updatedAt: now }
}

/** Who to tell what after a save: people newly asked, and (if there are new times) everyone else asked. */
export function whoToPing(before: SessionPlan | null, after: SessionPlan): { invited: string[]; newTimes: string[] } {
  const invited = after.memberIds.filter((id) => !before?.memberIds.includes(id))
  const hadTimes = new Set(before?.proposals.map((p) => p.id) ?? [])
  const timesAdded = after.proposals.some((p) => !hadTimes.has(p.id))
  return { invited, newTimes: before && timesAdded ? after.memberIds.filter((id) => !invited.includes(id)) : [] }
}
