// The session planner's maths in the app: who's busy on a day, reminders and a
// calendar file. The plans themselves (and their rules) live on the relay:
// relay/src/lib/planner.ts.
import type { BusyBlock, PlanView } from '../relay/src/lib/planner'

export type { BusyBlock, PlanAnswer, PlanMember, PlanProposal, PlannerState, PlanView, SessionPlan } from '../relay/src/lib/planner'

/** A moment's date in the viewer's own calendar ('2026-11-20'). */
export function dayKey(at: Date): string {
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
}

/** Whether any of these busy times overlap `from` to `to` (ms). */
export function busyDuring(busy: BusyBlock[], from: number, to: number): boolean {
  return busy.some((b) => Date.parse(b.start) < to && Date.parse(b.end) > from)
}

/** Who has something on during a time, by user id. */
export function busyFor(members: Array<{ userId: string; busy: BusyBlock[] }>, start: string, minutes: number): string[] {
  const from = Date.parse(start)
  return members.filter((m) => busyDuring(m.busy, from, from + minutes * 60_000)).map((m) => m.userId)
}

/**
 * The stretches of `from` to `to` (ms) when none of these people has anything on, at least `minLength` ms long,
 * as [start, end] pairs: when everyone could play.
 */
export function freeWindows(everyone: BusyBlock[][], from: number, to: number, minLength = 0): Array<[number, number]> {
  const taken = everyone
    .flat()
    .map((b): [number, number] => [Math.max(from, Date.parse(b.start)), Math.min(to, Date.parse(b.end))])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0])
  const out: Array<[number, number]> = []
  let at = from
  for (const [s, e] of taken) {
    if (s > at && s - at >= minLength) out.push([at, s])
    at = Math.max(at, e)
  }
  if (to > at && to - at >= minLength) out.push([at, to])
  return out
}

/** Booked sessions coming up that need a reminder now: the day before, then the hour before, each once. */
export function dueReminders(plans: PlanView[], now: number, fired: Set<string>): Array<{ key: string; plan: PlanView; soon: 'day' | 'hour' }> {
  const due: Array<{ key: string; plan: PlanView; soon: 'day' | 'hour' }> = []
  for (const plan of plans) {
    if (!plan.booked) continue
    const left = Date.parse(plan.booked.start) - now
    if (left <= 0) continue
    const base = `${plan.id}@${plan.booked.start}`
    // Only the nearer of the two: opening the app 30 minutes before gets the hour's reminder, not the day's as well.
    const soon = left <= 3_600_000 ? 'hour' : left <= 86_400_000 ? 'day' : null
    if (soon && !fired.has(`${base}:${soon}`)) due.push({ key: `${base}:${soon}`, plan, soon })
  }
  return due
}

const icsDate = (ms: number): string => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const icsText = (s: string): string => s.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n')

/** A calendar file (iCalendar) for a booked session, for Google, Outlook or Apple Calendar to add. */
export function sessionIcs(plan: PlanView, now = Date.now()): string | null {
  if (!plan.booked) return null
  const start = Date.parse(plan.booked.start)
  const who = plan.members.map((m) => m.username).join(', ')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NoteGoblin//Session planner//EN',
    'BEGIN:VEVENT',
    `UID:${plan.id}@notegoblin`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(start + plan.booked.minutes * 60_000)}`,
    `SUMMARY:${icsText(plan.title)}`,
    `DESCRIPTION:${icsText(`${plan.campaignName ? `${plan.campaignName}. ` : ''}With ${who}.`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
    ''
  ].join('\r\n')
}
