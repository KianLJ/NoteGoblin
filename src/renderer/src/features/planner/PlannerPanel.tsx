import { useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction, type PointerEvent as ReactPointerEvent } from 'react'
import { busyDuring, busyFor, dayKey, freeWindows, sessionIcs, type BusyBlock, type PlanAnswer, type PlannerState, type PlanProposal, type PlanView } from '@shared/planner'
import type { FriendSummary } from '@shared/relay'
import { useFriends } from '../friends/useFriends'
import { GoblinLoader } from '../../ui/GoblinLoader'
import { offerUndo } from '../../ui/undo'
import { usePlanner } from './usePlanner'
import './planner.css'

/**
 * The Session planner, all on one page: a month of what's on (booked sessions, times proposed to you, your own busy
 * times), one day laid out with everyone's busy times side by side, and the plans that ask friends which times suit.
 * Dragging along a day's Sessions line proposes a time; dragging along yours marks you busy. Plans live on the relay
 * (relay/src/directory.ts), so friends can answer while you're away; the maths is in shared/planner.ts.
 */
export function PlannerPanel({
  campaignId,
  campaignName,
  campaignDmId,
  sessionId
}: {
  campaignId: string | null
  campaignName?: string
  /** Who runs the campaign: a player's new plan asks them as well as the other players. */
  campaignDmId?: string
  sessionId: string | null
}): JSX.Element {
  const { state, error, setState } = usePlanner()
  const { friends } = useFriends()
  const [me, setMe] = useState<string | null>(null)
  useEffect(() => {
    void window.goblin.relay.myUserId().then(setMe)
  }, [])
  const today = new Date()
  const [day, setDay] = useState(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()))
  const [editing, setEditing] = useState<PlanView | 'new' | null>(null)
  const [draft, setDraft] = useState<PlanProposal[]>([])
  const [askIds, setAskIds] = useState<string[]>([])
  // Suggesting a time of your own for someone else's plan: the plan, and the time dragged so far.
  const [suggesting, setSuggesting] = useState<{ plan: PlanView; time: PlanProposal | null } | null>(null)
  // A proposed time picked on a day's Sessions line, to answer there.
  const [picked, setPicked] = useState<{ planId: string; proposalId: string } | null>(null)
  const [actError, setActError] = useState<string | null>(null)
  // The times dragged in while making this plan: dragging again on their day replaces them, never anything else.
  const dragged = useRef(new Set<string>())
  const [hours, setHours] = useState(3)

  // Your busy times, saved a moment after you stop changing them.
  const [mine, setMine] = useState<BusyBlock[] | null>(null)
  const [busyNote, setBusyNote] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(timer.current), [])
  const myBusy = mine ?? state?.myBusy ?? []
  function saveBusy(next: BusyBlock[]): void {
    setMine(next)
    clearTimeout(timer.current)
    setBusyNote('Saving…')
    timer.current = setTimeout(() => {
      // Things that are over don't matter to anyone any more.
      const keep = next.filter((b) => Date.parse(b.end) > Date.now())
      void window.goblin.relay.planner.setBusy(keep).then((r) => {
        setBusyNote(r.ok ? null : r.error)
        if (r.ok && state) setState({ ...state, myBusy: keep })
      })
    }, 600)
  }

  // Everyone whose busy times you can see: your friends, and anyone else in your plans.
  const others = useMemo((): Person[] => {
    if (!state) return []
    const byId = new Map<string, Person>(friends.map((f) => [f.userId, { userId: f.userId, username: f.username, busy: state.friendsBusy[f.userId] ?? [] }]))
    for (const m of state.plans.flatMap((p) => p.members)) if (m.userId !== me && !byId.has(m.userId)) byId.set(m.userId, m)
    return [...byId.values()]
  }, [state, friends, me])

  if (!state) return error ? <p className="gb-plan-empty">{error}</p> : <GoblinLoader label="Gathering the party" />

  const putPlan = (plan: PlanView): void => setState({ ...state, plans: [...state.plans.filter((p) => p.id !== plan.id), plan] })
  function startPlan(plan: PlanView | null, first?: PlanProposal): void {
    setSuggesting(null)
    dragged.current = new Set(first ? [first.id] : [])
    setEditing(plan ?? 'new')
    setDraft(plan?.proposals ?? (first ? [first] : []))
    setAskIds(plan?.memberIds ?? [])
  }
  const timeOf = (start: number, end: number, id: string = crypto.randomUUID()): PlanProposal => ({ id, start: new Date(start).toISOString(), minutes: Math.max(15, Math.round((end - start) / 60_000)) })
  // A time dragged on a day's Sessions line: your suggestion, if you're making one; otherwise the plan being made gets
  // it, as that day's one dragged time (dragging again there replaces it); otherwise it starts a new plan.
  function propose(start: number, end: number): void {
    const p = timeOf(start, end)
    if (suggesting) return setSuggesting({ ...suggesting, time: p })
    if (!editing) return startPlan(null, p)
    const replaces = (t: PlanProposal): boolean => dragged.current.has(t.id) && dayKey(new Date(t.start)) === dayKey(new Date(start))
    dragged.current.add(p.id)
    setDraft((ps) => [...ps.filter((t) => !replaces(t)), p].sort((a, b) => a.start.localeCompare(b.start)))
  }
  // Dragging a new or suggested time's edge.
  function resizeTime(id: string, start: number, end: number): void {
    if (suggesting?.time?.id === id) return setSuggesting({ ...suggesting, time: timeOf(start, end, id) })
    setDraft((ps) => ps.map((t) => (t.id === id ? timeOf(start, end, id) : t)).sort((a, b) => a.start.localeCompare(b.start)))
  }
  async function act(r: Promise<{ ok: true; data: PlanView } | { ok: false; error: string }>): Promise<boolean> {
    const res = await r
    if (!res.ok) {
      setActError(res.error)
      return false
    }
    setActError(null)
    putPlan(res.data)
    return true
  }
  async function sendSuggestion(): Promise<void> {
    if (!suggesting?.time) return
    if (await act(window.goblin.relay.planner.suggest(suggesting.plan.id, suggesting.time.start, suggesting.time.minutes))) setSuggesting(null)
  }
  const proposed = state.plans.filter((p) => !p.booked && p.id !== (editing !== 'new' ? editing?.id : undefined))

  return (
    <div className="gb-plan">
      <div className="gb-plan-col gb-plan-col--cal">
        <PlanMonth day={day} onDay={setDay} plans={state.plans} draft={editing ? draft : suggesting?.time ? [suggesting.time] : []} mine={myBusy} others={others} />
        {suggesting && (
          <div className="gb-plan-suggest" role="status">
            <span>
              <strong>Suggest a time for {suggesting.plan.title}</strong>
              <br />
              {suggesting.time ? `${whenLabel(suggesting.time.start, suggesting.time.minutes)}: drag its ends to adjust.` : 'Pick a day, then drag along its Sessions line.'}
            </span>
            <span className="gb-plan-booked-actions">
              <button type="button" className="gb-quest-form-cancel" onClick={() => setSuggesting(null)}>
                Cancel
              </button>
              <button type="button" className="gb-quest-form-save" disabled={!suggesting.time} onClick={() => void sendSuggestion()}>
                Suggest it
              </button>
            </span>
          </div>
        )}
        {actError && <p className="gb-quests-error">{actError}</p>}
        <PlanDay
          day={day}
          mine={myBusy}
          onMine={saveBusy}
          others={others}
          asking={editing ? askIds : null}
          plans={state.plans}
          proposed={proposed}
          draft={editing ? draft : suggesting?.time ? [suggesting.time] : []}
          draftLabel={suggesting ? 'Your suggestion' : 'New plan'}
          minutes={Math.round(hours * 60)}
          onPropose={propose}
          onResizeTime={resizeTime}
          me={me}
          picked={picked}
          onPick={setPicked}
          onVote={(planId, proposalId, answer) => void act(window.goblin.relay.planner.vote(planId, proposalId, answer))}
          onUnsuggest={(planId, proposalId) => void act(window.goblin.relay.planner.unsuggest(planId, proposalId)).then((ok) => ok && setPicked(null))}
          onSuggest={(plan) => {
            setEditing(null)
            setSuggesting({ plan, time: null })
          }}
        />
        {busyNote && (
          <p className="gb-plan-saved" aria-live="polite">
            {busyNote}
          </p>
        )}
      </div>
      <div className="gb-plan-col gb-plan-col--plans">
        {error && <p className="gb-quests-error">{error}</p>}
        {editing ? (
          <PlanForm
            key={editing === 'new' ? 'new' : editing.id}
            plan={editing === 'new' ? null : editing}
            me={me}
            busyOf={(id) => (id === me ? myBusy : (others.find((o) => o.userId === id)?.busy ?? []))}
            friends={friends}
            campaignId={campaignId}
            campaignName={campaignName}
            campaignDmId={campaignDmId}
            sessionId={sessionId}
            times={draft}
            onTimes={setDraft}
            memberIds={askIds}
            onMemberIds={setAskIds}
            hours={hours}
            onHours={setHours}
            day={day}
            onShowDay={setDay}
            onSaved={(plan) => {
              putPlan(plan)
              setEditing(null)
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <Plans
            state={state}
            me={me}
            friends={friends}
            onPlan={putPlan}
            onState={setState}
            onNew={() => startPlan(null)}
            onEdit={(p) => startPlan(p)}
            onShow={(iso) => setDay(startOfDay(new Date(iso)))}
            onSuggest={(plan) => {
              setSuggesting({ plan, time: null })
              const first = plan.proposals.find((t) => Date.parse(t.start) > Date.now())
              if (first) setDay(startOfDay(new Date(first.start)))
            }}
            onUnsuggest={(planId, proposalId) => void act(window.goblin.relay.planner.unsuggest(planId, proposalId))}
          />
        )}
      </div>
    </div>
  )
}

// --- Times, in the viewer's own clock -------------------------------------------

/** Monday first, as days of the week (0 is Sunday). */
const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0]
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_MS = 86_400_000
/** Free stretches start on the half hour. */
const SLOT_MS = 30 * 60_000
/** Dragging along a day's line snaps to quarter hours. */
const SNAP_MS = 15 * 60_000
const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const timeLabel = (ms: number): string => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
const dayLabel = (d: Date): string => d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
const whenLabel = (iso: string, minutes: number): string => {
  const start = new Date(iso)
  const day = start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  return `${day}, ${timeLabel(start.getTime())}–${timeLabel(start.getTime() + minutes * 60_000)}`
}
const sessionEnd = (p: PlanView): number => Date.parse(p.booked!.start) + p.booked!.minutes * 60_000

interface PlanCampaign {
  id: string
  name: string
  dmUserId?: string
}

interface Person {
  userId: string
  username: string
  busy: BusyBlock[]
}

// --- Plans -----------------------------------------------------------------------

const ANSWERS: Array<{ answer: PlanAnswer; label: string }> = [
  { answer: 'yes', label: 'Yes' },
  { answer: 'maybe', label: 'Maybe' },
  { answer: 'no', label: 'No' }
]

function Plans({
  state,
  me,
  friends,
  onPlan,
  onState,
  onNew,
  onEdit,
  onShow,
  onSuggest,
  onUnsuggest
}: {
  state: PlannerState
  me: string | null
  friends: FriendSummary[]
  onPlan: (plan: PlanView) => void
  onState: (s: PlannerState) => void
  onNew: () => void
  onEdit: (plan: PlanView) => void
  /** Shows a time's day on the calendar. */
  onShow: (iso: string) => void
  onSuggest: (plan: PlanView) => void
  onUnsuggest: (planId: string, proposalId: string) => void
}): JSX.Element {
  const [error, setError] = useState<string | null>(null)
  const now = Date.now()
  // Coming up first; past ones fold away at the end.
  const past = (p: PlanView): boolean => !!p.booked && sessionEnd(p) < now
  const plans = [...state.plans].sort((a, b) => Number(past(a)) - Number(past(b)))

  async function remove(plan: PlanView): Promise<void> {
    const r = await window.goblin.relay.planner.remove(plan.id)
    if (!r.ok) return setError(r.error)
    onState({ ...state, plans: state.plans.filter((p) => p.id !== plan.id) })
    // Putting it back makes a new plan with the same people and times (answers start over).
    offerUndo(`Deleted ${plan.title}`, () => {
      void window.goblin.relay.planner.save({ title: plan.title, memberIds: plan.memberIds, proposals: plan.proposals, campaignId: plan.campaignId, campaignName: plan.campaignName }).then((s) => s.ok && onPlan(s.data))
    })
  }

  return (
    <>
      <div className="gb-plan-bar">
        <button type="button" className="gb-quest-form-save" onClick={onNew} disabled={!friends.length} title={friends.length ? undefined : 'Add friends first, from the Friends box'}>
          + Plan a session
        </button>
      </div>
      {error && <p className="gb-quests-error">{error}</p>}
      {plans.length === 0 && <p className="gb-plan-empty">No sessions planned yet. Plan one and pick a few times: your friends say which suit them, and you pencil one in.</p>}
      {plans.map((plan) => (
        <PlanCard key={plan.id} plan={plan} me={me} past={past(plan)} onPlan={onPlan} onEdit={() => onEdit(plan)} onRemove={() => void remove(plan)} onShow={onShow} onSuggest={() => onSuggest(plan)} onUnsuggest={(id) => onUnsuggest(plan.id, id)} />
      ))}
    </>
  )
}

function downloadIcs(plan: PlanView): void {
  const ics = sessionIcs(plan)
  if (!ics) return
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
  a.download = `${plan.title.replace(/[\\/:*?"<>|]/g, '').trim() || 'Session'}.ics`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

function Avatar({ m }: { m: PlanView['members'][number] }): JSX.Element {
  return m.avatar ? <img className="gb-plan-avatar" src={m.avatar} alt="" title={m.username} /> : (
    <span className="gb-plan-avatar" title={m.username} aria-hidden="true">
      {m.username.slice(0, 1).toUpperCase()}
    </span>
  )
}

function PlanCard({
  plan,
  me,
  past,
  onPlan,
  onEdit,
  onRemove,
  onShow,
  onSuggest,
  onUnsuggest
}: {
  plan: PlanView
  me: string | null
  past: boolean
  onPlan: (p: PlanView) => void
  onEdit: () => void
  onRemove: () => void
  onShow: (iso: string) => void
  onSuggest: () => void
  onUnsuggest: (proposalId: string) => void
}): JSX.Element {
  const [error, setError] = useState<string | null>(null)
  const mine = plan.ownerId === me
  const owner = plan.members.find((m) => m.userId === plan.ownerId)
  const name = (id: string): string => plan.members.find((m) => m.userId === id)?.username ?? 'someone'

  async function vote(p: PlanProposal, answer: PlanAnswer): Promise<void> {
    const now = me ? plan.votes[p.id]?.[me] : undefined
    const r = await window.goblin.relay.planner.vote(plan.id, p.id, now === answer ? null : answer)
    if (r.ok) onPlan(r.data)
    else setError(r.error)
  }
  async function book(proposalId: string | null): Promise<void> {
    const r = await window.goblin.relay.planner.book(plan.id, proposalId)
    if (r.ok) onPlan(r.data)
    else setError(r.error)
  }

  return (
    <article className={`gb-plan-card${plan.booked ? ' gb-plan-card--booked' : ''}${past ? ' gb-plan-card--past' : ''}`}>
      <header className="gb-plan-card-head">
        <div>
          <strong>{plan.title}</strong>
          <span className="gb-plan-meta">
            {plan.campaignName && <span className="gb-quest-badge">{plan.campaignName}</span>}
            {mine ? 'You’re organising' : `Planned by ${owner?.username ?? 'a friend'}`}
          </span>
        </div>
        <div className="gb-plan-people">
          {plan.members.map((m) => (
            <Avatar key={m.userId} m={m} />
          ))}
        </div>
      </header>
      {plan.booked && (
        <div className="gb-plan-booked">
          <span>
            <span className="gb-plan-booked-label">{past ? 'Played' : 'Pencilled in'}</span> {whenLabel(plan.booked.start, plan.booked.minutes)}
          </span>
          <span className="gb-plan-booked-actions">
            {!past && (
              <button type="button" className="gb-stash-act" onClick={() => downloadIcs(plan)} title="A calendar file for Google, Outlook or Apple Calendar">
                Add to my calendar
              </button>
            )}
            {mine && !past && (
              <button type="button" className="gb-stash-act" onClick={() => void book(null)}>
                Call it off
              </button>
            )}
          </span>
        </div>
      )}
      {!past && (
        <ul className="gb-plan-times">
          {plan.proposals.map((p) => {
            const votes = plan.votes[p.id] ?? {}
            const mineNow = me ? votes[me] : undefined
            const busy = busyFor(plan.members, p.start, p.minutes)
            const tally = (a: PlanAnswer): string[] => Object.entries(votes).filter(([, v]) => v === a).map(([id]) => name(id))
            const isBooked = plan.booked?.proposalId === p.id
            return (
              <li key={p.id} className={`gb-plan-time${isBooked ? ' gb-plan-time--booked' : ''}`}>
                <div className="gb-plan-time-when">
                  <button type="button" className="gb-plan-link gb-plan-when" onClick={() => onShow(p.start)} title="Show this day on the calendar">
                    {whenLabel(p.start, p.minutes)}
                  </button>
                  {p.by && (
                    <span className="gb-plan-by">
                      {p.by === me ? 'Your suggestion' : `${name(p.by)}’s suggestion`}
                      {(p.by === me || mine) && !isBooked && (
                        <button type="button" className="gb-plan-link" onClick={() => onUnsuggest(p.id)}>
                          take it off
                        </button>
                      )}
                    </span>
                  )}
                  <span className="gb-plan-tally">
                    {(['yes', 'maybe', 'no'] as const).map((a) => {
                      const who = tally(a)
                      return who.length ? (
                        <span key={a} className={`gb-plan-tally-${a}`} title={who.join(', ')}>
                          {a === 'yes' ? '✓' : a === 'maybe' ? '?' : '✕'} {who.length}
                        </span>
                      ) : null
                    })}
                    {busy.length > 0 && <span className="gb-plan-tally-no" title={`Something on then: ${busy.map(name).join(', ')}`}>{busy.length} busy</span>}
                  </span>
                </div>
                <div className="gb-plan-time-acts">
                  <span className="gb-plan-answers" role="group" aria-label="Your answer">
                    {ANSWERS.map(({ answer, label }) => (
                      <button key={answer} type="button" className={`gb-plan-answer gb-plan-answer--${answer}`} aria-pressed={mineNow === answer} onClick={() => void vote(p, answer)}>
                        {label}
                      </button>
                    ))}
                  </span>
                  {mine && !isBooked && (
                    <button type="button" className="gb-quest-form-save gb-plan-book" onClick={() => void book(p.id)}>
                      Book
                    </button>
                  )}
                </div>
              </li>
            )
          })}
          {plan.proposals.length === 0 && <li className="gb-plan-empty">{mine ? 'Add some times for everyone to answer.' : 'No times yet.'}</li>}
        </ul>
      )}
      {error && <p className="gb-quests-error">{error}</p>}
      {!mine && !past && !plan.booked && (
        <footer className="gb-plan-card-foot">
          <button type="button" className="gb-stash-act" onClick={onSuggest} title="None of these suit you? Suggest one that does">
            Suggest another time
          </button>
        </footer>
      )}
      {mine && (
        <footer className="gb-plan-card-foot">
          {!past && (
            <button type="button" className="gb-stash-act" onClick={onEdit}>
              Edit
            </button>
          )}
          <button type="button" className="gb-stash-act" onClick={onRemove}>
            Delete
          </button>
        </footer>
      )}
    </article>
  )
}

/**
 * A new plan, or the organiser changing one: which campaign (whose players it asks), its name, who's asked, and the
 * times to answer: added here by date and time, or from the calendar (a free stretch, or dragging a day's Sessions line).
 */
function PlanForm({
  plan,
  me,
  busyOf,
  friends,
  campaignId,
  campaignName,
  campaignDmId,
  sessionId,
  times,
  onTimes,
  memberIds,
  onMemberIds,
  hours,
  onHours,
  day,
  onShowDay,
  onSaved,
  onCancel
}: {
  plan: PlanView | null
  me: string | null
  busyOf: (userId: string) => BusyBlock[]
  friends: FriendSummary[]
  campaignId: string | null
  campaignName?: string
  campaignDmId?: string
  sessionId: string | null
  times: PlanProposal[]
  onTimes: (times: PlanProposal[]) => void
  memberIds: string[]
  onMemberIds: Dispatch<SetStateAction<string[]>>
  hours: number
  onHours: (hours: number) => void
  /** The day picked on the calendar: new times default to it. */
  day: Date
  onShowDay: (d: Date) => void
  onSaved: (plan: PlanView) => void
  onCancel: () => void
}): JSX.Element {
  const here: PlanCampaign | null = campaignId ? { id: campaignId, name: campaignName ?? 'This campaign', dmUserId: campaignDmId } : null
  const [campaign, setCampaign] = useState<PlanCampaign | null>(plan ? (plan.campaignId ? { id: plan.campaignId, name: plan.campaignName ?? '' } : null) : here)
  const [campaigns, setCampaigns] = useState<PlanCampaign[]>(() => [here, plan?.campaignId ? { id: plan.campaignId, name: plan.campaignName ?? '' } : null].filter((c): c is PlanCampaign => !!c))
  const defaultTitle = (c: PlanCampaign | null): string => (c ? `${c.name}: next session` : '')
  const [title, setTitle] = useState(plan?.title ?? defaultTitle(campaign))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Players of the campaign who can't be asked, because they aren't your friends (the relay only lets you ask friends).
  const [strangers, setStrangers] = useState<string[]>([])
  const [date, setDate] = useState(dayKey(day))
  const [at, setAt] = useState('19:00')
  // Picking a day on the calendar moves the date here too.
  useEffect(() => setDate(dayKey(day)), [day])

  // Every campaign you're in, to pick from.
  useEffect(() => {
    void window.goblin.campaigns.list().then((r) => {
      if (!r.ok) return
      setCampaigns((now) => [...now, ...r.data.filter((c) => !now.some((x) => x.id === c.id)).map((c) => ({ id: c.id, name: c.name, dmUserId: c.dmUserId }))])
    })
  }, [])

  // A new plan asks everyone who's joined its campaign (and whoever runs it), if they're your friends.
  const askCampaign = (c: PlanCampaign | null): void => {
    setStrangers([])
    if (!c) return onMemberIds([])
    const isFriend = (id: string): boolean => friends.some((f) => f.userId === id)
    const dm = c.dmUserId && c.dmUserId !== me && isFriend(c.dmUserId) ? [c.dmUserId] : []
    onMemberIds(dm)
    // A player reaches their own table's campaign through the session; any other is in your own records.
    void window.goblin.campaigns.players(c.id, c.id === campaignId ? (sessionId ?? undefined) : undefined).then((r) => {
      if (!r.ok) return
      onMemberIds((now) => [...new Set([...now, ...r.data.map((p) => p.userId).filter((id) => id !== me && isFriend(id))])])
      setStrangers(r.data.filter((p) => p.userId !== me && !isFriend(p.userId)).map((p) => p.displayName))
    })
  }
  useEffect(() => {
    if (!plan) askCampaign(campaign)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  function pickCampaign(id: string): void {
    const c = campaigns.find((x) => x.id === id) ?? null
    // A name that was only the old campaign's default follows the new one.
    if (!title.trim() || title === defaultTitle(campaign)) setTitle(defaultTitle(c))
    setCampaign(c)
    if (!plan) askCampaign(c)
  }

  function addTime(): void {
    const [y, m, d] = date.split('-').map(Number)
    const [h, min] = at.split(':').map(Number)
    const start = new Date(y, m - 1, d, h || 0, min || 0)
    if (Number.isNaN(start.getTime())) return
    onTimes([...times, { id: crypto.randomUUID(), start: start.toISOString(), minutes: Math.round(hours * 60) }].sort((a, b) => a.start.localeCompare(b.start)))
    onShowDay(startOfDay(start))
  }

  const askable = [...friends, ...(plan?.members.filter((m) => m.userId !== me && !friends.some((f) => f.userId === m.userId)).map((m) => ({ ...m, online: false })) ?? [])]
  // Who has something on during each time: you and everyone you're asking.
  const busyNames = (p: PlanProposal): string[] => {
    const from = Date.parse(p.start)
    const name = (id: string): string => (id === me ? 'you' : (askable.find((f) => f.userId === id)?.username ?? 'someone'))
    return [...(me ? [me] : []), ...memberIds].filter((id) => busyDuring(busyOf(id), from, from + p.minutes * 60_000)).map(name)
  }

  async function save(): Promise<void> {
    if (!title.trim() || !memberIds.length) return setError(title.trim() ? 'Pick who to ask.' : 'Give the session a name.')
    setSaving(true)
    const r = await window.goblin.relay.planner.save({
      id: plan?.id,
      title,
      memberIds,
      proposals: times,
      ...(campaign ? { campaignId: campaign.id, campaignName: campaign.name } : {})
    })
    setSaving(false)
    if (r.ok) onSaved(r.data)
    else setError(r.error)
  }

  return (
    <form
      className="gb-plan-form"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onCancel()
        }
      }}
    >
      <label className="gb-plan-field">
        <span className="gb-quest-form-label">Campaign</span>
        <select className="gb-input" value={campaign?.id ?? ''} onChange={(e) => pickCampaign(e.target.value)}>
          <option value="">None: a one-shot or anything else</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <input className="gb-quest-form-title" autoFocus value={title} placeholder="Name this session" aria-label="Session name" maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      <div className="gb-quest-form-label">Who to ask</div>
      <div className="gb-plan-who">
        {askable.map((f) => (
          <button key={f.userId} type="button" className="gb-quest-for-chip" aria-pressed={memberIds.includes(f.userId)} onClick={() => onMemberIds(memberIds.includes(f.userId) ? memberIds.filter((x) => x !== f.userId) : [...memberIds, f.userId])}>
            {f.username}
          </button>
        ))}
      </div>
      {strangers.length > 0 && <p className="gb-plan-hint">Add {strangers.join(', ')} as friends to ask them too.</p>}
      <div className="gb-quest-form-label">Times to answer</div>
      <div className="gb-plan-add">
        <input className="gb-input" type="date" value={date} aria-label="Day" onChange={(e) => e.target.value && setDate(e.target.value)} />
        <input className="gb-input" type="time" value={at} aria-label="Starts at" onChange={(e) => setAt(e.target.value)} />
        <label className="gb-plan-length">
          for
          <input className="gb-input" type="number" min={0.5} max={24} step={0.5} value={hours} aria-label="How many hours" onChange={(e) => onHours(Math.max(0.5, Math.min(24, Number(e.target.value) || 3)))} />
          h
        </label>
        <button type="button" className="gb-quest-form-save" disabled={!date || !at} onClick={addTime}>
          Add time
        </button>
      </div>
      <p className="gb-plan-hint">Or click a free stretch under the calendar.</p>
      <ul className="gb-plan-times">
        {times.map((p) => (
          <li key={p.id} className="gb-plan-time">
            <span className="gb-plan-time-when">
              <span>{whenLabel(p.start, p.minutes)}</span>
              {busyNames(p).length > 0 && <span className="gb-plan-tally gb-plan-tally-no">Busy: {busyNames(p).join(', ')}</span>}
            </span>
            <button type="button" className="gb-switcher-icon" aria-label="Remove this time" onClick={() => onTimes(times.filter((x) => x.id !== p.id))}>
              ✕
            </button>
          </li>
        ))}
        {times.length === 0 && <li className="gb-plan-empty">No times yet.</li>}
      </ul>
      {error && <p className="gb-quests-error">{error}</p>}
      <div className="gb-quest-form-actions">
        <button type="button" className="gb-quest-form-cancel" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="gb-quest-form-save" disabled={saving || !title.trim() || !memberIds.length}>
          {plan ? 'Save' : 'Ask them'}
        </button>
      </div>
    </form>
  )
}

// --- The calendar ------------------------------------------------------------------

/** A month: booked sessions, times proposed to you (and the plan you're making), your busy times, how many friends are busy. */
function PlanMonth({ day, onDay, plans, draft, mine, others }: { day: Date; onDay: (d: Date) => void; plans: PlanView[]; draft: PlanProposal[]; mine: BusyBlock[]; others: Person[] }): JSX.Element {
  const today = new Date()
  const [month, setMonth] = useState(() => new Date(day.getFullYear(), day.getMonth(), 1))
  // Following the day when something else picks it (a plan's time, say).
  useEffect(() => setMonth((m) => (m.getFullYear() === day.getFullYear() && m.getMonth() === day.getMonth() ? m : new Date(day.getFullYear(), day.getMonth(), 1))), [day])
  // Monday first.
  const lead = (month.getDay() + 6) % 7
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, i) => i - lead + 1)
  const overlaps = (s: number, e: number, from: number): boolean => s < from + DAY_MS && e > from
  const proposals = [...plans.filter((p) => !p.booked).flatMap((p) => p.proposals.map((t) => ({ key: `${p.id}:${t.id}`, title: p.title, t }))), ...draft.map((t) => ({ key: t.id, title: 'New plan', t }))]

  return (
    <>
      <div className="gb-plan-month">
        <button type="button" className="gb-switcher-icon" aria-label="The month before" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
          ‹
        </button>
        <strong>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
        <button type="button" className="gb-switcher-icon" aria-label="The month after" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
          ›
        </button>
      </div>
      <div className="gb-plan-cal">
        {WEEK_DAYS.map((d) => (
          <span key={d} className="gb-plan-week-day">
            {DAY_NAMES[d]}
          </span>
        ))}
        {cells.map((n, i) => {
          if (n < 1 || n > days) return <div key={i} className="gb-plan-cal-day gb-plan-cal-day--out" />
          const date = new Date(month.getFullYear(), month.getMonth(), n)
          const from = date.getTime()
          const minesHere = mine.filter((b) => overlaps(Date.parse(b.start), Date.parse(b.end), from))
          const othersBusy = others.filter((o) => o.busy.some((b) => overlaps(Date.parse(b.start), Date.parse(b.end), from))).length
          const booked = plans.filter((p) => p.booked && overlaps(Date.parse(p.booked.start), sessionEnd(p), from))
          const asked = proposals.filter(({ t }) => overlaps(Date.parse(t.start), Date.parse(t.start) + t.minutes * 60_000, from))
          const chips = [
            ...booked.map((p) => ({ key: p.id, cls: 'session', text: `${timeLabel(Date.parse(p.booked!.start))} ${p.title}` })),
            ...asked.map(({ key, title, t }) => ({ key, cls: 'proposed', text: `${timeLabel(Date.parse(t.start))} ${title}?` })),
            ...minesHere.map((b) => ({ key: b.id, cls: 'mine', text: b.title || 'Busy' }))
          ]
          return (
            <button
              key={i}
              type="button"
              className={`gb-plan-cal-day${dayKey(date) === dayKey(today) ? ' gb-plan-cal-day--today' : ''}${from + DAY_MS <= today.getTime() ? ' gb-plan-cal-day--gone' : ''}`}
              aria-pressed={dayKey(date) === dayKey(day)}
              aria-label={dayLabel(date)}
              onClick={() => onDay(date)}
            >
              <span className="gb-plan-cal-num">
                {n}
                {othersBusy > 0 && (
                  <span className="gb-plan-cal-others" title={`${othersBusy} ${othersBusy === 1 ? 'friend has' : 'friends have'} something on`}>
                    {othersBusy}
                  </span>
                )}
              </span>
              {chips.slice(0, 3).map((c) => (
                <span key={c.key} className={`gb-plan-cal-chip gb-plan-cal-chip--${c.cls}`}>
                  {c.text}
                </span>
              ))}
              {chips.length > 3 && <span className="gb-plan-cal-more">+{chips.length - 3}</span>}
            </button>
          )
        })}
      </div>
    </>
  )
}

interface Bar {
  key: string
  s: number
  e: number
  label?: string
  kind: 'free' | 'session' | 'proposed' | 'draft' | 'busy'
  onClick?: () => void
  /** Makes its ends draggable, to change when it starts or ends. */
  onResize?: (s: number, e: number) => void
  /** Picked on the line (a proposed time being answered). */
  picked?: boolean
}

/**
 * One line of a day, midnight to midnight, each bar with its times written on it. With `onRange`, dragging along it
 * picks a stretch (snapped to quarter hours, its times shown as you go); a click without dragging picks
 * `clickMinutes` from there. A bar with `onResize` has handles at both ends to drag. An empty line says what dragging
 * on it does.
 */
function DayLine({ who, hint, start, bars, onRange, clickMinutes = 60 }: { who: string; hint?: string; start: number; bars: Bar[]; onRange?: (s: number, e: number) => void; clickMinutes?: number }): JSX.Element {
  const [drag, setDrag] = useState<[number, number] | null>(null)
  const [resizing, setResizing] = useState<{ key: string; side: 's' | 'e'; s: number; e: number } | null>(null)
  const track = useRef<HTMLSpanElement>(null)
  const end = start + DAY_MS
  const at = (e: ReactPointerEvent, round: (n: number) => number): number => {
    const r = e.currentTarget.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    return start + round((f * DAY_MS) / SNAP_MS) * SNAP_MS
  }
  const place = (s: number, e: number): CSSProperties => {
    const a = Math.max(s, start)
    const b = Math.min(e, end)
    return { left: `${((a - start) / DAY_MS) * 100}%`, width: `${((b - a) / DAY_MS) * 100}%` }
  }
  const until = (e: number): string => (e >= end ? 'midnight' : timeLabel(e))
  const range = drag ? [Math.min(...drag), Math.max(...drag)] : null
  const shown = bars.filter((b) => b.s < end && b.e > start).map((b) => (resizing?.key === b.key ? { ...b, s: resizing.s, e: resizing.e } : b))
  const handles = (b: Bar): JSX.Element | null =>
    b.onResize ? (
      <>
        {(['s', 'e'] as const).map((side) => (
          <span
            key={side}
            className={`gb-plan-line-handle gb-plan-line-handle--${side}`}
            title={side === 's' ? 'Drag to change when it starts' : 'Drag to change when it ends'}
            onPointerDown={(e) => {
              if (e.button !== 0) return
              e.stopPropagation()
              e.preventDefault()
              track.current?.setPointerCapture(e.pointerId)
              setResizing({ key: b.key, side, s: b.s, e: b.e })
            }}
          />
        ))}
      </>
    ) : null
  // Its times first (a short bar clips the rest), then its name (not for free stretches: the line says that already).
  // Under four hours there's no room on one line, so the start sits over the end.
  const text = (b: Bar): JSX.Element =>
    b.e - b.s < 4 * 3_600_000 ? (
      <span className="gb-plan-line-text gb-plan-line-text--stack">
        <span>{timeLabel(b.s)}</span>
        <span>{until(b.e)}</span>
      </span>
    ) : (
      <span className="gb-plan-line-text">{`${timeLabel(b.s)}–${until(b.e)}${b.label && b.kind !== 'free' ? ` · ${b.label}` : ''}`}</span>
    )
  return (
    <div className="gb-plan-line">
      <span className="gb-plan-line-who" title={hint ? `${who}: ${hint}` : who}>
        {who}
      </span>
      <span
        ref={track}
        className={`gb-plan-line-track${onRange ? ' gb-plan-line-track--pick' : ''}`}
        title={onRange ? hint : undefined}
        onPointerDown={
          onRange
            ? (e) => {
                if (e.button !== 0) return
                e.currentTarget.setPointerCapture(e.pointerId)
                const a = at(e, Math.floor)
                setDrag([a, a])
              }
            : undefined
        }
        onPointerMove={(e) => {
          if (resizing) {
            const t = at(e, Math.round)
            // Never shorter than a quarter hour, and the ends never cross.
            setResizing(resizing.side === 's' ? { ...resizing, s: Math.min(t, resizing.e - SNAP_MS) } : { ...resizing, e: Math.max(t, resizing.s + SNAP_MS) })
          } else if (drag) setDrag([drag[0], at(e, Math.round)])
        }}
        onPointerUp={(e) => {
          if (resizing) {
            const b = bars.find((x) => x.key === resizing.key)
            setResizing(null)
            b?.onResize?.(resizing.s, resizing.e)
            return
          }
          if (!drag || !onRange) return
          setDrag(null)
          // Where the pointer let go, not the last move: a quick drag may not have moved yet.
          const ends = [drag[0], at(e, Math.round)]
          const s = Math.min(...ends)
          const end = Math.max(...ends)
          onRange(s, end - s < SNAP_MS ? s + clickMinutes * 60_000 : end)
        }}
        onPointerCancel={() => {
          setDrag(null)
          setResizing(null)
        }}
      >
        {onRange && !range && !shown.length && <span className="gb-plan-line-empty">{hint}</span>}
        {shown.map((b) =>
          b.onClick ? (
            <span
              key={b.key}
              role="button"
              tabIndex={0}
              className={`gb-plan-line-bar gb-plan-line-bar--${b.kind}${b.picked ? ' gb-plan-line-bar--picked' : ''}`}
              style={place(b.s, b.e)}
              title={`${b.label ? `${b.label}: ` : ''}${timeLabel(b.s)}–${until(b.e)}. ${b.kind === 'busy' ? 'Click to take it off; drag its ends to change it.' : 'Click to answer it.'}`}
              aria-label={`${b.kind === 'busy' ? 'Take off' : 'Answer'} ${b.label ?? 'busy'}, ${timeLabel(b.s)} to ${until(b.e)}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={b.onClick}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return
                e.preventDefault()
                b.onClick?.()
              }}
            >
              {text(b)}
              {handles(b)}
            </span>
          ) : (
            <span key={b.key} className={`gb-plan-line-bar gb-plan-line-bar--${b.kind}`} style={place(b.s, b.e)} title={`${b.label ? `${b.label}: ` : ''}${timeLabel(b.s)}–${until(b.e)}${b.onResize ? '. Drag its ends to change it.' : ''}`} onPointerDown={b.onResize ? (e) => e.stopPropagation() : undefined}>
              {text(b)}
              {handles(b)}
            </span>
          )
        )}
        {range && (
          <span className="gb-plan-line-bar gb-plan-line-bar--ghost" style={place(range[0], Math.max(range[1], range[0] + SNAP_MS))}>
            {text({ key: 'ghost', kind: 'busy', s: range[0], e: Math.max(range[1], range[0] + SNAP_MS) })}
          </span>
        )}
      </span>
    </div>
  )
}

/**
 * One day, everyone side by side: booked and proposed sessions, when you're all free, your busy times (drag to add,
 * click one to take it off) and your friends'. While a plan is being made, its people are shown whether or not they
 * have anything on. Friends see your times, never your titles.
 */
function PlanDay({
  day,
  mine,
  onMine,
  others,
  asking,
  plans,
  proposed,
  draft,
  draftLabel,
  minutes,
  onPropose,
  onResizeTime,
  me,
  picked,
  onPick,
  onVote,
  onUnsuggest,
  onSuggest
}: {
  day: Date
  mine: BusyBlock[]
  onMine: (busy: BusyBlock[]) => void
  others: Person[]
  /** The people a plan being made asks, or null when none is. */
  asking: string[] | null
  plans: PlanView[]
  proposed: PlanView[]
  draft: PlanProposal[]
  draftLabel: string
  minutes: number
  onPropose: (s: number, e: number) => void
  onResizeTime: (id: string, s: number, e: number) => void
  me: string | null
  picked: { planId: string; proposalId: string } | null
  onPick: (p: { planId: string; proposalId: string } | null) => void
  onVote: (planId: string, proposalId: string, answer: PlanAnswer | null) => void
  onUnsuggest: (planId: string, proposalId: string) => void
  onSuggest: (plan: PlanView) => void
}): JSX.Element {
  const start = day.getTime()
  const end = start + DAY_MS
  const here = (b: BusyBlock): boolean => Date.parse(b.start) < end && Date.parse(b.end) > start
  const shown = asking ? others.filter((o) => asking.includes(o.userId)) : others.filter((o) => o.busy.some(here))
  // shortcut: "free" counts from 8am, so nobody's told the party is free at 3am; make it a setting if that bites.
  const windows = freeWindows([mine, ...(asking ? shown : others).map((o) => o.busy)], Math.max(start + 8 * 3_600_000, Math.ceil(Date.now() / SLOT_MS) * SLOT_MS), end, 2 * 3_600_000)
  const until = (e: number): string => (e >= end ? 'midnight' : timeLabel(e))
  const busyBars = (busy: BusyBlock[], own: boolean): Bar[] =>
    busy.filter(here).map((b) => ({
      key: b.id,
      s: Date.parse(b.start),
      e: Date.parse(b.end),
      label: own ? b.title : undefined,
      kind: 'busy',
      ...(own
        ? {
            onClick: () => onMine(mine.filter((x) => x.id !== b.id)),
            onResize: (s: number, e: number) => onMine(mine.map((x) => (x.id === b.id ? { ...x, start: new Date(s).toISOString(), end: new Date(e).toISOString() } : x)))
          }
        : {})
    }))
  const nameIn = (p: PlanView, id: string): string => (id === me ? 'you' : (p.members.find((m) => m.userId === id)?.username ?? 'someone'))
  const sessionBars: Bar[] = [
    ...plans.filter((p) => p.booked).map((p): Bar => ({ key: p.id, s: Date.parse(p.booked!.start), e: sessionEnd(p), label: p.title, kind: 'session' })),
    ...proposed.flatMap((p) =>
      p.proposals.map(
        (t): Bar => ({
          key: `${p.id}:${t.id}`,
          s: Date.parse(t.start),
          e: Date.parse(t.start) + t.minutes * 60_000,
          label: t.by ? `${nameIn(p, t.by)} suggested · ${p.title}` : p.title,
          kind: 'proposed',
          picked: picked?.planId === p.id && picked.proposalId === t.id,
          onClick: () => onPick(picked?.planId === p.id && picked.proposalId === t.id ? null : { planId: p.id, proposalId: t.id })
        })
      )
    ),
    ...draft.map((t): Bar => ({ key: t.id, s: Date.parse(t.start), e: Date.parse(t.start) + t.minutes * 60_000, label: draftLabel, kind: 'draft', onResize: (s, e) => onResizeTime(t.id, s, e) }))
  ]
  const othersFree = asking ? 0 : others.length - shown.length
  const booked = plans.filter((p) => p.booked && Date.parse(p.booked.start) < end && sessionEnd(p) > start)
  const mineHere = mine.filter(here)
  const wholeDay = mineHere.some((b) => Date.parse(b.start) <= start && Date.parse(b.end) >= end)
  const pickedPlan = picked ? proposed.find((p) => p.id === picked.planId) : undefined
  const pickedTime = pickedPlan?.proposals.find((t) => t.id === picked?.proposalId)

  return (
    <section className="gb-plan-day" aria-label={dayLabel(day)}>
      <div className="gb-plan-day-head">
        <strong className="gb-plan-day-title">{dayLabel(day)}</strong>
        {!wholeDay && (
          <button type="button" className="gb-stash-act" onClick={() => onMine([...mine, { id: crypto.randomUUID(), start: new Date(start).toISOString(), end: new Date(end).toISOString() }])}>
            Busy all day
          </button>
        )}
      </div>
      <p className="gb-plan-hint">
        <strong>Drag along your line</strong> to mark when you’re busy, or along Sessions to propose a time; drag a bar’s ends to change it. Click a proposed time to answer it.
      </p>
      <div className="gb-plan-lines">
        <div className="gb-plan-line gb-plan-line--axis" aria-hidden="true">
          <span className="gb-plan-line-who" />
          <span className="gb-plan-line-track">
            {[0, 6, 12, 18].map((h) => (
              <span key={h} className="gb-plan-line-tick" style={{ left: `${(h / 24) * 100}%` }}>
                {new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' })}
              </span>
            ))}
          </span>
        </div>
        <DayLine who="Sessions" hint="Drag here to propose a session time" start={start} bars={sessionBars} onRange={onPropose} clickMinutes={minutes} />
        <DayLine who="All free" start={start} bars={windows.map(([s, e]) => ({ key: String(s), s, e, label: 'Everyone’s free', kind: 'free' }))} />
        <DayLine who="You" hint="Drag here to mark when you’re busy" start={start} bars={busyBars(mine, true)} onRange={(s, e) => onMine([...mine, { id: crypto.randomUUID(), start: new Date(s).toISOString(), end: new Date(e).toISOString() }])} />
        {shown.map((o) => (
          <DayLine key={o.userId} who={o.username} start={start} bars={busyBars(o.busy, false)} />
        ))}
      </div>
      {pickedPlan && pickedTime && (
        <PickedTime plan={pickedPlan} time={pickedTime} me={me} name={(id) => nameIn(pickedPlan, id)} onVote={(a) => onVote(pickedPlan.id, pickedTime.id, a)} onUnsuggest={() => onUnsuggest(pickedPlan.id, pickedTime.id)} onSuggest={() => onSuggest(pickedPlan)} onClose={() => onPick(null)} />
      )}
      <div className="gb-plan-free">
        {windows.length ? (
          <>
            <span className="gb-plan-hint">{asking ? 'Everyone asked is free:' : 'Everyone’s free:'}</span>
            {windows.map(([s, e]) => (
              <button key={s} type="button" className="gb-plan-free-pick" title="Propose a session then" onClick={() => onPropose(s, Math.min(e, s + minutes * 60_000))}>
                {timeLabel(s)}–{until(e)} +
              </button>
            ))}
          </>
        ) : (
          <span className="gb-plan-hint">No two-hour stretch when everyone’s free.</span>
        )}
        {othersFree > 0 && <span className="gb-plan-hint">{`${othersFree} more ${othersFree === 1 ? 'friend has' : 'friends have'} nothing on.`}</span>}
      </div>
      {booked.map((p) => (
        <div key={p.id} className="gb-plan-booked">
          <span>
            <strong>{p.title}</strong> · {whenLabel(p.booked!.start, p.booked!.minutes)}
          </span>
          <button type="button" className="gb-stash-act" onClick={() => downloadIcs(p)}>
            Add to my calendar
          </button>
        </div>
      ))}
      {mineHere.length > 0 && (
        <ul className="gb-plan-times">
          {mineHere.map((b) => (
            <li key={b.id} className="gb-plan-time">
              <span className="gb-plan-mine-when">{Date.parse(b.start) <= start && Date.parse(b.end) >= end ? 'All day' : `${timeLabel(Date.parse(b.start))}–${until(Date.parse(b.end))}`}</span>
              <input
                className="gb-input gb-plan-mine-title"
                defaultValue={b.title ?? ''}
                placeholder="What’s on? (only you see this)"
                aria-label="What's on"
                maxLength={80}
                onBlur={(e) => {
                  const title = e.target.value.trim()
                  if (title !== (b.title ?? '')) onMine(mine.map((x) => (x.id === b.id ? { id: x.id, start: x.start, end: x.end, ...(title ? { title } : {}) } : x)))
                }}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
              <button type="button" className="gb-switcher-icon" aria-label={`Take off ${b.title || 'this'}`} onClick={() => onMine(mine.filter((x) => x.id !== b.id))}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** A proposed time picked on a day's line: who suggested it, who's said yes or no, and your answer. */
function PickedTime({
  plan,
  time,
  me,
  name,
  onVote,
  onUnsuggest,
  onSuggest,
  onClose
}: {
  plan: PlanView
  time: PlanProposal
  me: string | null
  name: (id: string) => string
  onVote: (answer: PlanAnswer | null) => void
  onUnsuggest: () => void
  onSuggest: () => void
  onClose: () => void
}): JSX.Element {
  const votes = plan.votes[time.id] ?? {}
  const mineNow = me ? votes[me] : undefined
  const who = (a: PlanAnswer): string[] => Object.entries(votes).filter(([, v]) => v === a).map(([id]) => name(id))
  const isOwner = plan.ownerId === me
  return (
    <div className="gb-plan-picked">
      <div className="gb-plan-picked-head">
        <span>
          <strong>{plan.title}</strong> · {whenLabel(time.start, time.minutes)}
          <br />
          <span className="gb-plan-by">{time.by ? `${time.by === me ? 'You' : name(time.by)} suggested this` : `Proposed by ${name(plan.ownerId)}`}</span>
        </span>
        <button type="button" className="gb-switcher-icon" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      <span className="gb-plan-tally">
        {who('yes').length > 0 && <span className="gb-plan-tally-yes">✓ {who('yes').join(', ')}</span>}
        {who('maybe').length > 0 && <span className="gb-plan-tally-maybe">? {who('maybe').join(', ')}</span>}
        {who('no').length > 0 && <span className="gb-plan-tally-no">✕ {who('no').join(', ')}</span>}
        {!Object.keys(votes).length && 'Nobody’s answered yet.'}
      </span>
      <div className="gb-plan-picked-acts">
        <span className="gb-plan-answers" role="group" aria-label="Your answer">
          {(['yes', 'no'] as const).map((a) => (
            <button key={a} type="button" className={`gb-plan-answer gb-plan-answer--${a}`} aria-pressed={mineNow === a} onClick={() => onVote(mineNow === a ? null : a)}>
              {a === 'yes' ? 'Yes, works for me' : 'No'}
            </button>
          ))}
        </span>
        {(time.by === me || isOwner) && time.by && (
          <button type="button" className="gb-stash-act" onClick={onUnsuggest}>
            Take it off
          </button>
        )}
        {!isOwner && (
          <button type="button" className="gb-stash-act" onClick={onSuggest}>
            Suggest another time
          </button>
        )}
      </div>
    </div>
  )
}
