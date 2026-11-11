import { useEffect, useRef, useState } from 'react'
import { rewardLabels, type CampaignQuests, type Quest, type QuestStatus } from '@shared/quests'
import type { QuestAwardResult } from '@shared/ipc'
import { PencilIcon, XIcon } from '../../ui/icons'

/**
 * A campaign's quest log (shared/quests.ts), re-read whenever the campaign changes (a DM save broadcasts that).
 * `save` is the DM's: it shows at once and puts the last saved log back if it fails.
 */
function useQuests(sessionId: string | null, campaignId: string | null): { quests: Quest[]; save: (next: Quest[]) => void; flush: () => Promise<void>; error: string | null } {
  const [quests, setQuests] = useState<Quest[]>([])
  const [error, setError] = useState<string | null>(null)
  const saved = useRef<Quest[]>([])
  // A save waiting for clicks to pause; re-reads are skipped meanwhile, so they can't put back an older log.
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; next: Quest[] } | null>(null)

  useEffect(() => {
    if (!campaignId) return setQuests([])
    const read = (): void => {
      if (pending.current) return
      void window.goblin.quests.get(campaignId, sessionId ?? undefined).then((r) => {
        if (pending.current) return
        if (!r.ok) return setError(r.error)
        saved.current = r.data.quests
        setQuests(r.data.quests)
        setError(null)
      })
    }
    read()
    return window.goblin.campaigns.onChanged((e) => {
      if (e.campaignId === campaignId) read()
    })
  }, [sessionId, campaignId])

  function persist(id: string, next: Quest[]): Promise<void> {
    pending.current = null
    return window.goblin.quests.save(id, { quests: next } satisfies CampaignQuests).then((r) => {
      if (r.ok) saved.current = r.data.quests
      else {
        setError(r.error)
        setQuests(saved.current)
      }
    })
  }

  /** Writes a waiting change now — before something that reads the saved log (handing out a reward). */
  function flush(): Promise<void> {
    if (!pending.current || !campaignId) return Promise.resolve()
    clearTimeout(pending.current.timer)
    return persist(campaignId, pending.current.next)
  }

  // Shown at once; written (and sent to players) once changes pause for a moment.
  function save(next: Quest[]): void {
    if (!campaignId) return
    setQuests(next)
    if (pending.current) clearTimeout(pending.current.timer)
    pending.current = { next, timer: setTimeout(() => persist(campaignId, next), 400) }
  }

  // Closing the box (or switching campaign) right after a change still saves it.
  useEffect(
    () => () => {
      if (pending.current && campaignId) {
        clearTimeout(pending.current.timer)
        void persist(campaignId, pending.current.next)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [campaignId]
  )

  return { quests, save, flush, error }
}

const STATUS_LABEL: Record<QuestStatus, string> = { active: 'Open', done: 'Done', failed: 'Failed' }
const NEXT_STATUS: Record<QuestStatus, QuestStatus> = { active: 'done', done: 'failed', failed: 'active' }

/** What the form edits: a quest's fields, with the amounts as typed. */
interface Draft {
  title: string
  giver: string
  detail: string
  gold: string
  xp: string
  items: string
  noteTitle: string
  shared: boolean
}

const EMPTY_DRAFT: Draft = { title: '', giver: '', detail: '', gold: '', xp: '', items: '', noteTitle: '', shared: false }

function toDraft(q: Quest): Draft {
  return {
    title: q.title,
    giver: q.giver ?? '',
    detail: q.detail,
    gold: q.rewardGold ? String(q.rewardGold) : '',
    xp: q.rewardXp ? String(q.rewardXp) : '',
    items: q.rewardItems ?? '',
    noteTitle: q.noteTitle ?? '',
    shared: q.shared
  }
}

function fromDraft(d: Draft, base: Pick<Quest, 'id' | 'status'>): Quest {
  const amount = (s: string): number | undefined => {
    const n = Math.floor(Number(s))
    return Number.isFinite(n) && n > 0 ? n : undefined
  }
  return {
    ...base,
    title: d.title.trim(),
    detail: d.detail.trim(),
    shared: d.shared,
    giver: d.giver.trim() || undefined,
    rewardGold: amount(d.gold),
    rewardXp: amount(d.xp),
    rewardItems: d.items.trim() || undefined,
    noteTitle: d.noteTitle.trim() || undefined
  }
}

/**
 * The Quests box. The DM writes quests in a small form — who gave it, what's needed, what it pays (gold, XP,
 * anything else) and whether the party knows yet — then ticks them off or fails them; a player sees just the
 * known ones, read-only. Open quests first, then the finished ones. Finishing one reminds the DM what to hand out.
 */
export function QuestLog({
  sessionId,
  campaignId,
  readOnly,
  onOpenNote,
  noteTitles
}: {
  sessionId: string | null
  campaignId: string | null
  readOnly: boolean
  onOpenNote?: (title: string) => void
  /** Offered when linking a note. */
  noteTitles?: string[]
}): JSX.Element {
  const { quests, save, flush, error } = useQuests(sessionId, campaignId)
  // 'new' while writing a new quest, a quest's id while editing it.
  const [editing, setEditing] = useState<string | null>(null)
  // A quest just finished: what happened to its reward (handed out, or why not), shown for a moment.
  const [justDone, setJustDone] = useState<{ quest: Quest; result: QuestAwardResult | null } | null>(null)
  useEffect(() => {
    if (!justDone) return
    const t = setTimeout(() => setJustDone(null), justDone.result?.ok === false ? 9000 : 7000)
    return () => clearTimeout(t)
  }, [justDone])

  const open = quests.filter((q) => q.status === 'active')
  const finished = quests.filter((q) => q.status !== 'active')

  function setStatus(q: Quest, status: QuestStatus): void {
    save(quests.map((x) => (x.id === q.id ? { ...x, status } : x)))
    if (status !== 'done' || rewardLabels(q).length === 0) return setJustDone(null)
    if (q.rewarded || (!q.rewardGold && !q.rewardXp)) return setJustDone({ quest: q, result: null })
    void handOut(q)
  }

  /** Gives a finished quest's gold and XP to the party (split between them), once its new status is saved. */
  async function handOut(q: Quest): Promise<void> {
    if (!campaignId) return
    await flush()
    setJustDone({ quest: q, result: await window.goblin.quests.award(campaignId, q.id) })
  }

  function submit(d: Draft): void {
    if (editing === 'new') save([fromDraft(d, { id: crypto.randomUUID(), status: 'active' }), ...quests])
    else save(quests.map((q) => (q.id === editing ? fromDraft(d, q) : q)))
    setEditing(null)
  }

  function card(q: Quest): JSX.Element {
    if (editing === q.id) return <QuestForm key={q.id} initial={toDraft(q)} isNew={false} noteTitles={noteTitles} onSubmit={submit} onCancel={() => setEditing(null)} />
    return (
      <li key={q.id} className={`gb-quest gb-quest--${q.status}${q.shared ? '' : ' gb-quest--hidden'}`}>
        <button
          type="button"
          className="gb-quest-status"
          disabled={readOnly}
          onClick={() => setStatus(q, NEXT_STATUS[q.status])}
          title={readOnly ? STATUS_LABEL[q.status] : `${STATUS_LABEL[q.status]} — click for ${STATUS_LABEL[NEXT_STATUS[q.status]]}`}
          aria-label={`${q.title}: ${STATUS_LABEL[q.status]}`}
        >
          {q.status === 'done' ? '✓' : q.status === 'failed' ? '✕' : ''}
        </button>
        <div className="gb-quest-body">
          <div className="gb-quest-head">
            <span className="gb-quest-title">{q.title || 'Untitled quest'}</span>
            {q.status !== 'active' && <span className={`gb-quest-badge gb-quest-badge--${q.status}`}>{STATUS_LABEL[q.status]}</span>}
            {!readOnly && !q.shared && <span className="gb-quest-badge">Secret</span>}
          </div>
          {q.giver && <span className="gb-quest-giver">from {q.giver}</span>}
          {q.detail && <p className="gb-quest-detail">{q.detail}</p>}
          {rewardLabels(q).length > 0 && (
            <div className="gb-quest-rewards" aria-label="Rewards">
              {q.rewardGold && (
                <span className="gb-reward gb-reward--gold">
                  <CoinGlyph />
                  {q.rewardGold.toLocaleString()} gp
                </span>
              )}
              {q.rewardXp && (
                <span className="gb-reward gb-reward--xp">
                  <StarGlyph />
                  {q.rewardXp.toLocaleString()} XP
                </span>
              )}
              {q.rewardItems && (
                <span className="gb-reward gb-reward--item">
                  <GiftGlyph />
                  {q.rewardItems}
                </span>
              )}
            </div>
          )}
          {q.noteTitle && onOpenNote && (
            <button type="button" className="gb-quest-note" onClick={() => onOpenNote(q.noteTitle!)}>
              {q.noteTitle} ›
            </button>
          )}
          {!readOnly && q.status === 'done' && !q.rewarded && (q.rewardGold || q.rewardXp) ? (
            <button type="button" className="gb-quest-handout" onClick={() => void handOut(q)} title="Split the gold and XP between the players at the table">
              Hand out rewards
            </button>
          ) : null}
          {q.rewarded && <span className="gb-quest-paid">Rewards handed out</span>}
        </div>
        {!readOnly && (
          <span className="gb-quest-actions">
            <button type="button" className="gb-switcher-icon" onClick={() => setEditing(q.id)} title="Edit" aria-label={`Edit ${q.title}`}>
              <PencilIcon size={12} />
            </button>
            <button
              type="button"
              className="gb-switcher-icon"
              onClick={() => save(quests.map((x) => (x.id === q.id ? { ...x, shared: !x.shared } : x)))}
              title={q.shared ? 'The party knows — click to hide it' : 'Secret — click to show the party'}
              aria-pressed={q.shared}
              aria-label="The party knows about this"
            >
              <EyeGlyph open={q.shared} />
            </button>
            <button type="button" className="gb-switcher-icon gb-switcher-icon--danger" onClick={() => save(quests.filter((x) => x.id !== q.id))} title="Delete" aria-label={`Delete ${q.title}`}>
              <XIcon size={12} />
            </button>
          </span>
        )}
      </li>
    )
  }

  return (
    <div className="gb-quests">
      <div className="gb-quests-top">
        <span className="gb-quests-count">
          {open.length} open{finished.length > 0 ? ` · ${finished.length} finished` : ''}
        </span>
        {!readOnly && editing !== 'new' && (
          <button type="button" className="gb-quests-new" onClick={() => setEditing('new')}>
            + New quest
          </button>
        )}
      </div>
      {justDone && <CompleteBanner quest={justDone.quest} result={justDone.result} />}
      {editing === 'new' && <QuestForm initial={EMPTY_DRAFT} isNew noteTitles={noteTitles} onSubmit={submit} onCancel={() => setEditing(null)} />}
      {error && <p className="gb-quests-error">{error}</p>}
      {quests.length === 0 && editing !== 'new' ? (
        <div className="gb-quests-empty">
          <ScrollGlyph />
          <p>{readOnly ? 'No quests yet — the DM adds them as the story unfolds.' : 'No quests yet. Write one and what it pays — it stays secret until you show the party.'}</p>
        </div>
      ) : (
        <>
          <ul className="gb-quest-list">{open.map(card)}</ul>
          {finished.length > 0 && (
            <>
              <div className="gb-quests-heading">Finished</div>
              <ul className="gb-quest-list">{finished.map(card)}</ul>
            </>
          )}
        </>
      )}
    </div>
  )
}

/** After finishing a quest: what each player got (or, if it couldn't be handed out, why — with the totals to give by hand). */
function CompleteBanner({ quest, result }: { quest: Quest; result: QuestAwardResult | null }): JSX.Element {
  const shares = result?.ok ? [result.goldEach ? `${result.goldEach.toLocaleString()} gp` : '', result.xpEach ? `${result.xpEach.toLocaleString()} XP` : ''].filter(Boolean) : []
  return (
    <div className={`gb-quest-complete${result && !result.ok ? ' gb-quest-complete--pending' : ''}`} role="status">
      <strong>Quest complete: {quest.title}</strong>
      {result?.ok ? (
        <span>
          {result.players === 1 ? 'The player gets' : `Each of the ${result.players} players gets`} {shares.join(' and ')}
          {result.goldLeftover > 0 ? ` (${result.goldLeftover} gp didn’t split evenly)` : ''}, added to their character.
          {quest.rewardItems ? ` Also: ${quest.rewardItems}.` : ''}
        </span>
      ) : (
        <span>
          Reward the party — {rewardLabels(quest).join(' · ')}
          {result && !result.ok ? `. Not handed out: ${result.error}` : ''}
        </span>
      )}
    </div>
  )
}

/** Writing or editing a quest: its name, who gave it, what's needed, what it pays, a note, and whether the party knows. */
function QuestForm({ initial, isNew, noteTitles, onSubmit, onCancel }: { initial: Draft; isNew: boolean; noteTitles?: string[]; onSubmit: (d: Draft) => void; onCancel: () => void }): JSX.Element {
  const [d, setD] = useState(initial)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => setD((prev) => ({ ...prev, [key]: value }))
  const digits = (s: string): string => s.replace(/[^\d]/g, '').slice(0, 7)
  return (
    <form
      className="gb-quest-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (d.title.trim()) onSubmit(d)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onCancel()
        }
      }}
    >
      <input className="gb-quest-form-title" autoFocus value={d.title} placeholder="Name the quest" aria-label="Quest" onChange={(e) => set('title', e.target.value)} />
      <input className="gb-input" value={d.giver} placeholder="Given by" aria-label="Given by" onChange={(e) => set('giver', e.target.value)} />
      <textarea className="gb-input" rows={2} value={d.detail} placeholder="What needs doing" aria-label="What needs doing" onChange={(e) => set('detail', e.target.value)} />
      <div className="gb-quest-form-label">Reward</div>
      <div className="gb-quest-form-rewards">
        <label className="gb-reward-field gb-reward--gold">
          <CoinGlyph />
          <input inputMode="numeric" value={d.gold} placeholder="0" aria-label="Gold reward" onChange={(e) => set('gold', digits(e.target.value))} />
          <span>gp</span>
        </label>
        <label className="gb-reward-field gb-reward--xp">
          <StarGlyph />
          <input inputMode="numeric" value={d.xp} placeholder="0" aria-label="XP reward" onChange={(e) => set('xp', digits(e.target.value))} />
          <span>XP</span>
        </label>
      </div>
      <label className="gb-reward-field gb-reward-field--wide gb-reward--item">
        <GiftGlyph />
        <input value={d.items} placeholder="Anything else: a +1 sword, a favour" aria-label="Other reward" onChange={(e) => set('items', e.target.value)} />
      </label>
      <input className="gb-input" value={d.noteTitle} list={noteTitles ? 'gb-quest-notes' : undefined} placeholder="Linked note (optional)" aria-label="Linked note" onChange={(e) => set('noteTitle', e.target.value)} />
      {noteTitles && (
        <datalist id="gb-quest-notes">
          {noteTitles.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      )}
      <label className="gb-quest-form-toggle">
        <input type="checkbox" checked={d.shared} onChange={(e) => set('shared', e.target.checked)} />
        <span className="gb-toggle-track" aria-hidden="true" />
        The party knows about this
      </label>
      <div className="gb-quest-form-actions">
        <button type="button" className="gb-quest-form-cancel" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="gb-quest-form-save" disabled={!d.title.trim()}>
          {isNew ? 'Add quest' : 'Save'}
        </button>
      </div>
    </form>
  )
}

function CoinGlyph(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="8" r="3.4" stroke="currentColor" strokeWidth="1" opacity="0.6" />
    </svg>
  )
}

function StarGlyph(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.8l1.8 4 4.3.4-3.3 2.9 1 4.2L8 11.1l-3.8 2.2 1-4.2-3.3-2.9 4.3-.4Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

function GiftGlyph(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.5" y="6" width="11" height="7.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1.8 6h12.4M8 6v7.5M8 6C6.5 3 4 3.2 4.5 4.6 5 6 8 6 8 6Zm0 0c1.5-3 4-2.8 3.5-1.4C11 6 8 6 8 6Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

function ScrollGlyph(): JSX.Element {
  return (
    <svg width="40" height="40" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 2.5h7.5a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 12.5V4a1.5 1.5 0 0 1 1-1.5Z" stroke="currentColor" strokeWidth="0.8" strokeLinejoin="round" />
      <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h2.5" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" />
    </svg>
  )
}

function EyeGlyph({ open }: { open: boolean }): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8Z" stroke="currentColor" strokeWidth="1.2" />
      {open ? <circle cx="8" cy="8" r="2" fill="currentColor" /> : <path d="M2.5 13.5l11-11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />}
    </svg>
  )
}
