import { useEffect, useRef, useState } from 'react'
import { coinLabel, coinList, coinsPhrase, hasItemsToStash, hasPayout, rewardLabels, STANDARD_COINS, type CampaignQuests, type CoinName, type Quest, type QuestHint, type QuestStatus } from '@shared/quests'
import { useActivePackRegistry } from '../content/pickerContent'
import type { QuestAwardResult } from '@shared/ipc'
import { PencilIcon, XIcon } from '../../ui/icons'
import { offerUndo } from '../../ui/undo'
import { useBrowserAccount } from '../browser/browserAccount'
import { PartyStash, type StashPurse } from './PartyStash'
import { CodexItemPicker, openCodexEntry } from './CodexItemPicker'
import type { CodexRef } from '@shared/codexRef'

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

const FINISHED_OPEN_KEY = 'gb-quests-finished-open'
const STATUS_LABEL: Record<QuestStatus, string> = { active: 'Open', done: 'Done', failed: 'Failed' }
const NEXT_STATUS: Record<QuestStatus, QuestStatus> = { active: 'done', done: 'failed', failed: 'active' }

/** The currencies the campaign's packs know (the standard five, renamed or not, and any they add), for naming a quest's coins. */
export function useCoinNames(): CoinName[] {
  return useActivePackRegistry().registry.vocabulary.currencies
}

/** What the form edits: a quest's fields, with the amounts as typed. */
interface Draft {
  title: string
  giver: string
  detail: string
  /** A coin field each, in the order they were added. */
  coins: Array<{ id: string; amount: string }>
  xp: string
  items: string
  /** Items from the Codex. */
  entries: CodexRef[]
  noteTitle: string
  shared: boolean
  /** Who it's for: user ids, none for the whole party. */
  forPlayers: string[]
}

const EMPTY_DRAFT: Draft = { title: '', giver: '', detail: '', coins: [{ id: 'gp', amount: '' }], xp: '', items: '', entries: [], noteTitle: '', shared: false, forPlayers: [] }

function toDraft(q: Quest): Draft {
  return {
    title: q.title,
    giver: q.giver ?? '',
    detail: q.detail,
    coins: coinList(q.rewardCoins).length ? coinList(q.rewardCoins).map(([id, n]) => ({ id, amount: String(n) })) : [{ id: 'gp', amount: '' }],
    xp: q.rewardXp ? String(q.rewardXp) : '',
    items: q.rewardItems ?? '',
    entries: q.rewardEntries ?? [],
    noteTitle: q.noteTitle ?? '',
    shared: q.shared,
    forPlayers: q.forPlayers ?? []
  }
}

function fromDraft(d: Draft, base: Pick<Quest, 'id' | 'status'>): Quest {
  const amount = (s: string): number | undefined => {
    const n = Math.floor(Number(s))
    return Number.isFinite(n) && n > 0 ? n : undefined
  }
  const coins: Record<string, number> = {}
  for (const c of d.coins) {
    const n = amount(c.amount)
    if (n) coins[c.id] = (coins[c.id] ?? 0) + n
  }
  return {
    ...base,
    title: d.title.trim(),
    detail: d.detail.trim(),
    shared: d.shared,
    giver: d.giver.trim() || undefined,
    rewardCoins: Object.keys(coins).length ? coins : undefined,
    rewardXp: amount(d.xp),
    rewardItems: d.items.trim() || undefined,
    rewardEntries: d.entries.length ? d.entries : undefined,
    noteTitle: d.noteTitle.trim() || undefined,
    forPlayers: d.forPlayers.length ? d.forPlayers : undefined
  }
}

/**
 * The Quests box. The DM writes quests in a small form — who gave it, what's needed, what it pays (coins of any kind, XP,
 * anything else) and whether the party knows yet — then ticks them off or fails them; a player sees just the
 * known ones, read-only. Open quests first, then the finished ones. Finishing one reminds the DM what to hand out.
 */
export function QuestLog(props: QuestLogProps): JSX.Element {
  const [tab, setTab] = useState<'quests' | 'stash'>('quests')
  return (
    <div className="gb-quests-box">
      <div className="gb-quests-tabs" role="tablist" aria-label="Quests or the party stash">
        {(['quests', 'stash'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className="gb-quests-tab" onClick={() => setTab(t)}>
            {t === 'quests' ? 'Quests' : 'Party stash'}
          </button>
        ))}
      </div>
      {tab === 'quests' ? <QuestList {...props} /> : <PartyStash sessionId={props.sessionId} campaignId={props.campaignId} isDm={!props.readOnly} purse={props.purse} />}
    </div>
  )
}

interface QuestLogProps {
  sessionId: string | null
  campaignId: string | null
  readOnly: boolean
  onOpenNote?: (title: string) => void
  /** Offered when linking a note. */
  noteTitles?: string[]
  /** A player's character, whose purse the stash's coins go to and come from. */
  purse?: StashPurse
}

function QuestList({ sessionId, campaignId, readOnly, onOpenNote, noteTitles }: QuestLogProps): JSX.Element {
  const { quests, save, flush, error } = useQuests(sessionId, campaignId)
  const coinNames = useCoinNames()
  const players = useCampaignPlayers(campaignId, sessionId)
  // 'new' while writing a new quest, a quest's id while editing it.
  const [editing, setEditing] = useState<string | null>(null)
  // A quest just finished: what happened to its reward (handed out, or why not), shown for a moment.
  const [justDone, setJustDone] = useState<{ quest: Quest; result: QuestAwardResult | null } | null>(null)
  useEffect(() => {
    if (!justDone) return
    const t = setTimeout(() => setJustDone(null), justDone.result?.ok === false ? 9000 : 7000)
    return () => clearTimeout(t)
  }, [justDone])

  // Finished quests start folded away; opening them is remembered on this computer.
  const [finishedOpen, setFinishedOpen] = useState(() => {
    try {
      return localStorage.getItem(FINISHED_OPEN_KEY) === '1'
    } catch {
      return false
    }
  })
  function toggleFinished(next: boolean): void {
    setFinishedOpen(next)
    try {
      localStorage.setItem(FINISHED_OPEN_KEY, next ? '1' : '0')
    } catch {
      /* not remembered */
    }
  }

  const open = quests.filter((q) => q.status === 'active')
  const finished = quests.filter((q) => q.status !== 'active')

  function setStatus(q: Quest, status: QuestStatus): void {
    save(quests.map((x) => (x.id === q.id ? { ...x, status } : x)))
    if (status !== 'done' || rewardLabels(q).length === 0) return setJustDone(null)
    // Coins and XP not yet paid, or items not yet in the stash: hand them out.
    if ((q.rewarded || !hasPayout(q)) && !hasItemsToStash(q)) return setJustDone({ quest: q, result: null })
    void handOut(q)
  }

  /** Gives a finished quest's coins and XP to the party (split between them), once its new status is saved. */
  async function handOut(q: Quest): Promise<void> {
    if (!campaignId) return
    await flush()
    setJustDone({ quest: q, result: await window.goblin.quests.award(campaignId, q.id) })
  }

  // The log as it is now, for putting a deleted quest or hint back into (it may have changed since).
  const latest = useRef(quests)
  latest.current = quests

  function removeQuest(q: Quest): void {
    const at = quests.findIndex((x) => x.id === q.id)
    save(quests.filter((x) => x.id !== q.id))
    offerUndo(`Deleted “${q.title || 'Untitled quest'}”`, () => {
      const now = latest.current.filter((x) => x.id !== q.id)
      save([...now.slice(0, at), q, ...now.slice(at)])
    })
  }

  function removeHint(q: Quest, hint: QuestHint): void {
    const at = (q.hints ?? []).findIndex((h) => h.id === hint.id)
    save(quests.map((x) => (x.id === q.id ? { ...x, hints: (x.hints ?? []).filter((h) => h.id !== hint.id) } : x)))
    offerUndo('Deleted a hint', () => {
      save(
        latest.current.map((x) => {
          if (x.id !== q.id) return x
          const hints = (x.hints ?? []).filter((h) => h.id !== hint.id)
          return { ...x, hints: [...hints.slice(0, at), hint, ...hints.slice(at)] }
        })
      )
    })
  }

  function submit(d: Draft): void {
    if (editing === 'new') save([fromDraft(d, { id: crypto.randomUUID(), status: 'active' }), ...quests])
    else save(quests.map((q) => (q.id === editing ? fromDraft(d, q) : q)))
    setEditing(null)
  }

  function card(q: Quest): JSX.Element {
    if (editing === q.id) return <QuestForm key={q.id} initial={toDraft(q)} isNew={false} noteTitles={noteTitles} coinNames={coinNames} players={players} onSubmit={submit} onCancel={() => setEditing(null)} />
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
          {q.forPlayers?.length ? <ForWhom ids={q.forPlayers} players={players} /> : null}
          {q.detail && <p className="gb-quest-detail">{q.detail}</p>}
          <RewardChips quest={q} coinNames={coinNames} />
          {(!readOnly || (q.hints?.length ?? 0) > 0) && (
            <QuestHints
              hints={q.hints ?? []}
              readOnly={readOnly}
              onChange={(hints) => save(quests.map((x) => (x.id === q.id ? { ...x, hints } : x)))}
              onRemove={(hint) => removeHint(q, hint)}
            />
          )}
          {readOnly && campaignId && <MyQuestNotes campaignId={campaignId} questId={q.id} />}
          {q.noteTitle && onOpenNote && (
            <button type="button" className="gb-quest-note" onClick={() => onOpenNote(q.noteTitle!)}>
              {q.noteTitle} ›
            </button>
          )}
          {!readOnly && q.status === 'done' && ((!q.rewarded && hasPayout(q)) || hasItemsToStash(q)) ? (
            <button type="button" className="gb-quest-handout" onClick={() => void handOut(q)} title="Split the coins and XP between the players at the table, and put its items in the party stash">
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
            <button type="button" className="gb-switcher-icon gb-switcher-icon--danger" onClick={() => removeQuest(q)} title="Delete" aria-label={`Delete ${q.title}`}>
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
      {justDone && <CompleteBanner quest={justDone.quest} result={justDone.result} coinNames={coinNames} />}
      {editing === 'new' && <QuestForm initial={EMPTY_DRAFT} isNew noteTitles={noteTitles} coinNames={coinNames} players={players} onSubmit={submit} onCancel={() => setEditing(null)} />}
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
              <button type="button" className="gb-quests-heading gb-quests-heading--toggle" aria-expanded={finishedOpen} onClick={() => toggleFinished(!finishedOpen)}>
                <span className="gb-quest-hints-caret" aria-hidden="true" />
                Finished · {finished.length}
              </button>
              {finishedOpen && <ul className="gb-quest-list">{finished.map(card)}</ul>}
            </>
          )}
        </>
      )}
    </div>
  )
}

interface TablePlayer {
  userId: string
  displayName: string
}

/** The campaign's players, by name — whom a quest can be for. */
export function useCampaignPlayers(campaignId: string | null, sessionId: string | null): TablePlayer[] {
  const [players, setPlayers] = useState<TablePlayer[]>([])
  useEffect(() => {
    if (!campaignId) return setPlayers([])
    let live = true
    void window.goblin.campaigns.players(campaignId, sessionId ?? undefined).then((r) => {
      if (live && r.ok) setPlayers(r.data)
    })
    return () => {
      live = false
    }
  }, [campaignId, sessionId])
  return players
}

/** "For Ann and Bram" on a quest that isn't the whole party's. */
function ForWhom({ ids, players }: { ids: string[]; players: TablePlayer[] }): JSX.Element {
  const names = ids.map((id) => players.find((p) => p.userId === id)?.displayName ?? 'a player who left')
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]
  return (
    <span className="gb-quest-for-whom" title="Only they have this quest, and share its reward">
      For {list}
    </span>
  )
}

/**
 * A player's own notes on a quest — what they want to remember, their theories — folded away like the hints. Just
 * theirs: kept on their computer under their account, never sent to the DM or the table.
 */
function MyQuestNotes({ campaignId, questId }: { campaignId: string; questId: string }): JSX.Element {
  const account = useBrowserAccount() ?? 'guest'
  const key = `gb-quest-mynotes:${account}:${campaignId}:${questId}`
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(key) ?? ''
    } catch {
      return ''
    }
  })
  const save = (next: string): void => {
    setText(next)
    try {
      if (next.trim()) localStorage.setItem(key, next)
      else localStorage.removeItem(key)
    } catch {
      /* not kept */
    }
  }
  return (
    <details className="gb-quest-hints gb-quest-mynotes">
      <summary>
        <span className="gb-quest-hints-caret" aria-hidden="true" />
        My notes
        {text.trim() && <span className="gb-quest-hints-shown">written</span>}
      </summary>
      <textarea
        className="gb-quest-mynotes-text"
        value={text}
        rows={3}
        placeholder="Only you see these: what to remember, who to ask, your theories…"
        aria-label="My notes on this quest"
        maxLength={4000}
        onChange={(e) => save(e.target.value)}
      />
    </details>
  )
}

/**
 * A quest's notes and hints, folded away under one line until someone needs them. The DM writes them and shows
 * each to the party with its eye (they start hidden, like a quest); a player sees just the shown ones.
 */
function QuestHints({
  hints,
  readOnly,
  onChange,
  onRemove
}: {
  hints: QuestHint[]
  readOnly: boolean
  onChange: (hints: QuestHint[]) => void
  onRemove: (hint: QuestHint) => void
}): JSX.Element {
  const [draft, setDraft] = useState('')
  const shown = hints.filter((h) => h.shown).length
  const add = (): void => {
    const text = draft.trim()
    if (!text) return
    onChange([...hints, { id: crypto.randomUUID(), text, shown: false }])
    setDraft('')
  }
  return (
    <details className="gb-quest-hints">
      <summary>
        <span className="gb-quest-hints-caret" aria-hidden="true" />
        {hints.length === 0 ? 'Add notes and hints' : `Notes and hints · ${hints.length}`}
        {!readOnly && hints.length > 0 && <span className="gb-quest-hints-shown">{shown === 0 ? 'none shown' : shown === hints.length ? 'all shown' : `${shown} shown`}</span>}
      </summary>
      {hints.length > 0 && (
        <ul>
          {hints.map((h) => (
            <li key={h.id} className={!readOnly && !h.shown ? 'gb-quest-hint--hidden' : undefined}>
              <span className="gb-quest-hint-text">{h.text}</span>
              {!readOnly && (
                <span className="gb-quest-hint-actions">
                  <button
                    type="button"
                    className="gb-switcher-icon"
                    onClick={() => onChange(hints.map((x) => (x.id === h.id ? { ...x, shown: !x.shown } : x)))}
                    title={h.shown ? 'The party can see this — click to hide it' : 'Hidden — click to show the party'}
                    aria-pressed={h.shown}
                    aria-label="The party can see this"
                  >
                    <EyeGlyph open={h.shown} />
                  </button>
                  <button type="button" className="gb-switcher-icon gb-switcher-icon--danger" onClick={() => onRemove(h)} title="Delete" aria-label="Delete this hint">
                    <XIcon size={11} />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <input
          className="gb-quest-hint-new"
          value={draft}
          placeholder="A reminder or a clue, then Enter"
          aria-label="New note or hint"
          maxLength={500}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          onBlur={add}
        />
      )}
    </details>
  )
}

/** After finishing a quest: what each player got (or, if it couldn't be handed out, why — with the totals to give by hand). */
function CompleteBanner({ quest, result, coinNames }: { quest: Quest; result: QuestAwardResult | null; coinNames: CoinName[] }): JSX.Element {
  const shares = result?.ok ? [coinsPhrase(result.coinsEach, coinNames), result.xpEach ? `${result.xpEach.toLocaleString()} XP` : ''].filter(Boolean) : []
  const leftover = result?.ok ? coinsPhrase(result.coinsLeftover, coinNames) : ''
  return (
    <div className={`gb-quest-complete${result && !result.ok ? ' gb-quest-complete--pending' : ''}`} role="status">
      <strong>Quest complete: {quest.title}</strong>
      {result?.ok ? (
        <span>
          {result.players ? (
            <>
              {result.players === 1 ? 'The player gets' : `Each of the ${result.players} players gets`} {shares.join(shares[0]?.includes(' and ') ? ', and ' : ' and ')}
              {leftover ? ` (${leftover} didn’t split evenly)` : ''}, added to their character.
            </>
          ) : null}
          {result.stashed.length ? ` ${result.stashed.join(', ')} went into the party stash.` : ''}
        </span>
      ) : (
        <span>
          Reward the party — {rewardLabels(quest, coinNames).join(' · ')}
          {result && !result.ok ? `. Not handed out: ${result.error}` : ''}
          {result && !result.ok && result.stashed?.length ? ` (${result.stashed.join(', ')} did go into the party stash.)` : ''}
        </span>
      )}
    </div>
  )
}

/** Writing or editing a quest: its name, who gave it, what's needed, what it pays, a note, and whether the party knows. */
function QuestForm({
  initial,
  isNew,
  noteTitles,
  coinNames,
  players,
  onSubmit,
  onCancel
}: {
  initial: Draft
  isNew: boolean
  noteTitles?: string[]
  coinNames: CoinName[]
  players: TablePlayer[]
  onSubmit: (d: Draft) => void
  onCancel: () => void
}): JSX.Element {
  const [d, setD] = useState(initial)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => setD((prev) => ({ ...prev, [key]: value }))
  const digits = (s: string): string => s.replace(/[^\d]/g, '').slice(0, 7)
  const setCoin = (i: number, amount: string): void => setD((prev) => ({ ...prev, coins: prev.coins.map((c, j) => (j === i ? { ...c, amount } : c)) }))
  // Coins not in the form yet: the standard five, then any the packs add.
  const known = [...STANDARD_COINS.map((id) => ({ id, name: coinNames.find((c) => c.id === id)?.name ?? id })), ...coinNames.filter((c) => !(STANDARD_COINS as readonly string[]).includes(c.id))]
  const addable = known.filter((c) => !d.coins.some((x) => x.id === c.id))
  const [focusCoin, setFocusCoin] = useState<string | null>(null)
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
        {d.coins.map((c, i) => (
          <label key={c.id} className="gb-reward-field gb-reward--coin" style={coinStyle(c.id)}>
            <CoinGlyph />
            <input
              inputMode="numeric"
              value={c.amount}
              placeholder="0"
              aria-label={`${known.find((k) => k.id === c.id)?.name ?? c.id} reward`}
              autoFocus={focusCoin === c.id}
              onChange={(e) => setCoin(i, digits(e.target.value))}
            />
            <span>{coinLabel(c.id, coinNames)}</span>
            {d.coins.length > 1 && (
              <button type="button" className="gb-reward-field-remove" aria-label={`Remove ${coinLabel(c.id, coinNames)}`} title="Remove" onClick={() => set('coins', d.coins.filter((_, j) => j !== i))}>
                ×
              </button>
            )}
          </label>
        ))}
        <label className="gb-reward-field gb-reward--xp">
          <StarGlyph />
          <input inputMode="numeric" value={d.xp} placeholder="0" aria-label="XP reward" onChange={(e) => set('xp', digits(e.target.value))} />
          <span>XP</span>
        </label>
        {addable.length > 0 && (
          <select
            className="gb-reward-add"
            value=""
            aria-label="Add a currency"
            onChange={(e) => {
              const id = e.target.value
              if (!id) return
              set('coins', [...d.coins, { id, amount: '' }])
              setFocusCoin(id)
            }}
          >
            <option value="">+ Currency</option>
            {addable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {coinLabel(c.id, coinNames) !== c.name ? ` (${coinLabel(c.id, coinNames)})` : ''}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="gb-quest-rewards gb-quest-form-entries">
        {d.entries.map((e) => (
          <span key={`${e.kind}:${e.id}`} className="gb-reward gb-reward--item">
            <SwordGlyph />
            {e.name}
            <button type="button" className="gb-reward-entry-remove" aria-label={`Take ${e.name} off the reward`} title="Take it off" onClick={() => set('entries', d.entries.filter((x) => !(x.kind === e.kind && x.id === e.id)))}>
              ×
            </button>
          </span>
        ))}
        <CodexItemPicker label={d.entries.length ? '+ Another from the Codex' : '+ An item from the Codex'} onPick={(ref) => !d.entries.some((x) => x.kind === ref.kind && x.id === ref.id) && set('entries', [...d.entries, ref])} />
      </div>
      <label className="gb-reward-field gb-reward-field--wide gb-reward--item">
        <GiftGlyph />
        <input value={d.items} placeholder="Anything else: a favour, a title, a map" aria-label="Other reward" onChange={(e) => set('items', e.target.value)} />
      </label>
      <input className="gb-input" value={d.noteTitle} list={noteTitles ? 'gb-quest-notes' : undefined} placeholder="Linked note (optional)" aria-label="Linked note" onChange={(e) => set('noteTitle', e.target.value)} />
      {noteTitles && (
        <datalist id="gb-quest-notes">
          {noteTitles.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      )}
      {players.length > 0 && (
        <>
          <div className="gb-quest-form-label">For</div>
          <div className="gb-quest-for" role="group" aria-label="Who the quest is for">
            <button type="button" className="gb-quest-for-chip" aria-pressed={d.forPlayers.length === 0} onClick={() => set('forPlayers', [])}>
              The whole party
            </button>
            {players.map((p) => {
              const on = d.forPlayers.includes(p.userId)
              return (
                <button
                  key={p.userId}
                  type="button"
                  className="gb-quest-for-chip"
                  aria-pressed={on}
                  onClick={() => set('forPlayers', on ? d.forPlayers.filter((id) => id !== p.userId) : [...d.forPlayers, p.userId])}
                >
                  {p.displayName}
                </button>
              )
            })}
          </div>
        </>
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

/** Each coin its own metal; a pack's coins get a colour of their own from their id. */
const COIN_COLOURS: Record<string, string> = { pp: '#7d9bb0', gp: '#b8860b', ep: '#6f9a7d', sp: '#8a8f99', cp: '#b0643a' }
export function coinStyle(id: string): React.CSSProperties {
  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) % 360
  return { '--reward': COIN_COLOURS[id] ?? `hsl(${hash} 45% 50%)` } as React.CSSProperties
}

/** A quest's rewards as chips: each coin in its colour, then XP, then anything else. */
export function RewardChips({ quest: q, coinNames, className }: { quest: Quest; coinNames: CoinName[]; className?: string }): JSX.Element | null {
  const coins = coinList(q.rewardCoins)
  if (!coins.length && !q.rewardXp && !q.rewardItems && !q.rewardEntries?.length) return null
  return (
    <div className={`gb-quest-rewards${className ? ` ${className}` : ''}`} aria-label="Rewards">
      {coins.map(([id, n]) => (
        <span key={id} className="gb-reward gb-reward--coin" style={coinStyle(id)}>
          <CoinGlyph />
          {n.toLocaleString()} {coinLabel(id, coinNames)}
        </span>
      ))}
      {q.rewardXp && (
        <span className="gb-reward gb-reward--xp">
          <StarGlyph />
          {q.rewardXp.toLocaleString()} XP
        </span>
      )}
      {q.rewardEntries?.map((e) => (
        <button key={`${e.kind}:${e.id}`} type="button" className="gb-reward gb-reward--item gb-reward--entry" title={`Open ${e.name} from the Codex`} onClick={(ev) => openCodexEntry(ev.currentTarget, e)}>
          <SwordGlyph />
          {e.name}
        </button>
      ))}
      {q.rewardItems && (
        <span className="gb-reward gb-reward--item">
          <GiftGlyph />
          {q.rewardItems}
        </span>
      )}
    </div>
  )
}

/** An item from the Codex, on a reward: a sword. */
export function SwordGlyph(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M13.5 2.5 6.5 9.5M13.5 2.5H11l-6.6 6.6M13.5 2.5V5l-6.6 6.6M4 9.5l2.5 2.5M3 13l1.6-1.6M2.5 10.5l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function CoinGlyph(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="8" r="3.4" stroke="currentColor" strokeWidth="1" opacity="0.6" />
    </svg>
  )
}

export function StarGlyph(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.8l1.8 4 4.3.4-3.3 2.9 1 4.2L8 11.1l-3.8 2.2 1-4.2-3.3-2.9 4.3-.4Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

export function GiftGlyph(): JSX.Element {
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
