import { useEffect, useMemo, useRef, useState } from 'react'
import {
  changeStanding,
  MAX_STANDING,
  MIN_STANDING,
  REP_KIND_LABEL,
  REP_KINDS,
  standingLabel,
  type CampaignReputation,
  type RepEntry,
  type RepKind
} from '@shared/reputation'
import { offerUndo } from '../../ui/undo'
import { GoblinLoader } from '../../ui/GoblinLoader'
import { PencilIcon, XIcon } from '../../ui/icons'
import './reputation.css'

/**
 * The Reputation box (shared/reputation.ts): where the party stands with the world's NPCs, factions, guilds,
 * temples and kingdoms. Each shows a −10…+10 meter and its standing's name; − and + move it (the DM's), noting the
 * change, and a change's reason can be written in its history and shown to the party or kept. Entries nest under who
 * they answer to. Each is secret until the DM shows it with its eye; a player sees the shown ones, read-only.
 */
export function ReputationTracker({
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
  noteTitles?: string[]
}): JSX.Element {
  const [doc, setDoc] = useState<CampaignReputation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(doc)
  latest.current = doc

  useEffect(() => {
    if (!campaignId) return setDoc(null)
    const read = (): void => {
      void window.goblin.reputation.get(campaignId, sessionId ?? undefined).then((r) => {
        if (r.ok) setDoc(r.data)
        else setError(r.error)
      })
    }
    read()
    return window.goblin.campaigns.onChanged((e) => {
      if (e.campaignId === campaignId) read()
    })
  }, [campaignId, sessionId])

  function save(entries: RepEntry[]): void {
    if (!campaignId || readOnly) return
    const next = { entries }
    setDoc(next)
    void window.goblin.reputation.save(campaignId, next).then((r) => {
      if (!r.ok) setError(r.error)
    })
  }
  const update = (id: string, f: (e: RepEntry) => RepEntry): void => save((latest.current?.entries ?? []).map((e) => (e.id === id ? f(e) : e)))

  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<RepKind | 'all'>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  const entries = doc?.entries ?? []
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries])
  const q = query.trim().toLowerCase()
  const matches = (e: RepEntry): boolean => (kind === 'all' || e.kind === kind) && (!q || e.name.toLowerCase().includes(q) || (e.description ?? '').toLowerCase().includes(q))
  // While searching or filtering, a flat list; otherwise each entry under the one it answers to.
  const filtering = !!q || kind !== 'all'
  const roots = filtering ? entries.filter(matches) : entries.filter((e) => !e.partOf || !byId.has(e.partOf))
  const children = (id: string): RepEntry[] => (filtering ? [] : entries.filter((e) => e.partOf === id))

  function nudge(e: RepEntry, delta: number): void {
    update(e.id, (x) => changeStanding(x, delta, '', x.shared, crypto.randomUUID(), new Date().toISOString()))
    setOpen(e.id)
  }

  function remove(e: RepEntry): void {
    const before = entries
    // Its members stay, answering to whoever it answered to.
    save(entries.filter((x) => x.id !== e.id).map((x) => (x.partOf === e.id ? { ...x, partOf: e.partOf } : x)))
    offerUndo(`Deleted ${e.name}`, () => save(before))
  }

  function card(e: RepEntry, depth: number): JSX.Element {
    const kids = children(e.id)
    if (editing === e.id)
      return (
        <li key={e.id}>
          <EntryForm initial={e} entries={entries} noteTitles={noteTitles} onCancel={() => setEditing(null)} onSave={(next) => (update(e.id, () => next), setEditing(null))} />
        </li>
      )
    const isOpen = open === e.id
    return (
      <li key={e.id} className="gb-rep-li" style={{ ['--depth' as string]: depth }}>
        <div className={`gb-rep${e.shared ? '' : ' gb-rep--secret'}${isOpen ? ' gb-rep--open' : ''}`} data-tier={standingLabel(e.standing).toLowerCase()}>
          <div className="gb-rep-head">
            <button type="button" className="gb-rep-name" onClick={() => setOpen(isOpen ? null : e.id)} aria-expanded={isOpen}>
              <span className="gb-rep-kind">{REP_KIND_LABEL[e.kind]}</span>
              <span className="gb-rep-title">{e.name}</span>
              {!readOnly && !e.shared && <span className="gb-quest-badge">Secret</span>}
            </button>
            {!readOnly && (
              <span className="gb-rep-actions">
                <button type="button" className="gb-switcher-icon" onClick={() => setEditing(e.id)} title="Edit" aria-label={`Edit ${e.name}`}>
                  <PencilIcon size={12} />
                </button>
                <button
                  type="button"
                  className="gb-switcher-icon"
                  onClick={() => update(e.id, (x) => ({ ...x, shared: !x.shared }))}
                  title={e.shared ? 'The party knows them — click to hide' : 'Secret — click to show the party'}
                  aria-pressed={e.shared}
                  aria-label="The party knows them"
                >
                  <EyeGlyph open={e.shared} />
                </button>
                <button type="button" className="gb-switcher-icon gb-switcher-icon--danger" onClick={() => remove(e)} title="Delete" aria-label={`Delete ${e.name}`}>
                  <XIcon size={12} />
                </button>
              </span>
            )}
          </div>
          <div className="gb-rep-standing">
            {!readOnly && (
              <button type="button" className="gb-rep-step" onClick={() => nudge(e, -1)} disabled={e.standing <= MIN_STANDING} aria-label={`Worse with ${e.name}`} title="Worse">
                −
              </button>
            )}
            <Meter standing={e.standing} />
            {!readOnly && (
              <button type="button" className="gb-rep-step" onClick={() => nudge(e, 1)} disabled={e.standing >= MAX_STANDING} aria-label={`Better with ${e.name}`} title="Better">
                +
              </button>
            )}
            <span className="gb-rep-tier">
              {standingLabel(e.standing)}
              <span className="gb-rep-num">{e.standing > 0 ? `+${e.standing}` : e.standing}</span>
            </span>
          </div>
          {isOpen && (
            <div className="gb-rep-more">
              {e.partOf && byId.get(e.partOf) && <span className="gb-rep-partof">Part of {byId.get(e.partOf)!.name}</span>}
              {e.description && <p className="gb-rep-desc">{e.description}</p>}
              {!readOnly && e.secret && <p className="gb-rep-secret">{e.secret}</p>}
              {e.noteTitle && onOpenNote && (
                <button type="button" className="gb-quest-note" onClick={() => onOpenNote(e.noteTitle!)}>
                  {e.noteTitle} ›
                </button>
              )}
              <History entry={e} readOnly={readOnly} onChange={(history) => update(e.id, (x) => ({ ...x, history }))} />
            </div>
          )}
        </div>
        {kids.length > 0 && <ul className="gb-rep-list">{kids.map((k) => card(k, depth + 1))}</ul>}
      </li>
    )
  }

  if (!campaignId) return <p className="gb-stash-empty gb-rep-pad">Open a campaign to see where the party stands.</p>
  if (!doc) return <GoblinLoader label="Gathering the gossip" />
  return (
    <div className="gb-reps">
      <div className="gb-rep-top">
        <input className="gb-input gb-rep-search" value={query} placeholder="Find someone" aria-label="Find someone" onChange={(e) => setQuery(e.target.value)} />
        {!readOnly && editing !== 'new' && (
          <button type="button" className="gb-quests-new" onClick={() => setEditing('new')}>
            + New
          </button>
        )}
      </div>
      <div className="gb-rep-kinds" role="group" aria-label="Show only">
        {(['all', ...REP_KINDS] as const).map((k) => (
          <button key={k} type="button" className="gb-quest-for-chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {k === 'all' ? 'All' : REP_KIND_LABEL[k] + (k === 'npc' ? 's' : k === 'other' ? '' : 's')}
          </button>
        ))}
      </div>
      {editing === 'new' && (
        <EntryForm
          entries={entries}
          noteTitles={noteTitles}
          onCancel={() => setEditing(null)}
          onSave={(next) => {
            save([...entries, next])
            setEditing(null)
            setOpen(next.id)
          }}
        />
      )}
      {error && <p className="gb-quests-error">{error}</p>}
      {entries.length === 0 && editing !== 'new' ? (
        <div className="gb-quests-empty">
          <p>{readOnly ? 'No one yet — the DM adds the people and powers you deal with.' : 'No one yet. Add the NPCs, factions and kingdoms the party deals with; each stays secret until you show it.'}</p>
        </div>
      ) : roots.length === 0 ? (
        <p className="gb-stash-hint">No one matches.</p>
      ) : (
        <ul className="gb-rep-list">{roots.map((e) => card(e, 0))}</ul>
      )}
    </div>
  )
}

/** −10…+10: a bar from the middle, red to one side, green to the other. */
function Meter({ standing }: { standing: number }): JSX.Element {
  const half = (Math.abs(standing) / MAX_STANDING) * 50
  return (
    <span className="gb-rep-meter" role="meter" aria-valuemin={MIN_STANDING} aria-valuemax={MAX_STANDING} aria-valuenow={standing} aria-label={standingLabel(standing)}>
      <span className={`gb-rep-meter-fill ${standing < 0 ? 'gb-rep-meter-fill--bad' : 'gb-rep-meter-fill--good'}`} style={standing < 0 ? { right: '50%', width: `${half}%` } : { left: '50%', width: `${half}%` }} />
      <span className="gb-rep-meter-mid" />
    </span>
  )
}

/** What moved a standing, newest first. The DM writes why, and shows a change to the party or keeps it. */
function History({ entry, readOnly, onChange }: { entry: RepEntry; readOnly: boolean; onChange: (history: RepEntry['history']) => void }): JSX.Element | null {
  const list = [...entry.history].reverse()
  if (!list.length) return readOnly ? null : <p className="gb-stash-hint">Use − and + to move it; each change is noted here.</p>
  return (
    <ul className="gb-rep-history" aria-label="What changed it">
      {list.map((h) => (
        <li key={h.id} className={!readOnly && !h.known ? 'gb-rep-change--kept' : undefined}>
          <span className={`gb-rep-delta ${h.delta > 0 ? 'gb-rep-delta--up' : 'gb-rep-delta--down'}`}>{h.delta > 0 ? `+${h.delta}` : h.delta}</span>
          {readOnly ? (
            <span className="gb-rep-reason">{h.reason || 'Something changed.'}</span>
          ) : (
            <>
              <input
                className="gb-rep-reason-input"
                defaultValue={h.reason}
                placeholder="Why? (Enter to keep)"
                aria-label="Why it changed"
                maxLength={240}
                onBlur={(e) => e.target.value !== h.reason && onChange(entry.history.map((x) => (x.id === h.id ? { ...x, reason: e.target.value.trim() } : x)))}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
              <button
                type="button"
                className="gb-switcher-icon"
                onClick={() => onChange(entry.history.map((x) => (x.id === h.id ? { ...x, known: !x.known } : x)))}
                title={h.known ? 'The party knows why — click to keep it to yourself' : 'Kept to yourself — click to show the party'}
                aria-pressed={h.known}
                aria-label="The party knows why"
              >
                <EyeGlyph open={h.known} />
              </button>
            </>
          )}
          {h.at && <time className="gb-rep-when" dateTime={h.at}>{new Date(h.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</time>}
        </li>
      ))}
    </ul>
  )
}

/** Adding or editing someone: their name and kind, who they answer to, what the party knows, your notes, a note. */
function EntryForm({
  initial,
  entries,
  noteTitles,
  onSave,
  onCancel
}: {
  initial?: RepEntry
  entries: RepEntry[]
  noteTitles?: string[]
  onSave: (e: RepEntry) => void
  onCancel: () => void
}): JSX.Element {
  const [d, setD] = useState<RepEntry>(initial ?? { id: crypto.randomUUID(), name: '', kind: 'npc', standing: 0, shared: false, history: [] })
  const set = <K extends keyof RepEntry>(k: K, v: RepEntry[K]): void => setD((p) => ({ ...p, [k]: v }))
  // Not itself, nor anyone under it.
  const under = (id: string): boolean => {
    let e = entries.find((x) => x.id === id)
    for (let i = 0; e && i < 50; i++) {
      if (e.id === d.id) return true
      e = e.partOf ? entries.find((x) => x.id === e!.partOf) : undefined
    }
    return false
  }
  const parents = entries.filter((e) => e.id !== d.id && !under(e.id))
  return (
    <form
      className="gb-quest-form gb-rep-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (d.name.trim()) onSave({ ...d, name: d.name.trim(), description: d.description?.trim() || undefined, secret: d.secret?.trim() || undefined, noteTitle: d.noteTitle?.trim() || undefined, partOf: d.partOf || undefined })
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onCancel()
        }
      }}
    >
      <input className="gb-quest-form-title" autoFocus value={d.name} placeholder="Who, or what?" aria-label="Name" maxLength={120} onChange={(e) => set('name', e.target.value)} />
      <div className="gb-rep-form-row">
        <select className="gb-input" value={d.kind} aria-label="Kind" onChange={(e) => set('kind', e.target.value as RepKind)}>
          {REP_KINDS.map((k) => (
            <option key={k} value={k}>
              {REP_KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <select className="gb-input" value={d.partOf ?? ''} aria-label="Part of" onChange={(e) => set('partOf', e.target.value || undefined)}>
          <option value="">Answers to no one</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              Part of {p.name}
            </option>
          ))}
        </select>
      </div>
      {!initial && (
        <label className="gb-rep-start">
          Starts at
          <input type="range" min={MIN_STANDING} max={MAX_STANDING} value={d.standing} onChange={(e) => set('standing', Number(e.target.value))} aria-label="Starting standing" />
          <span>
            {standingLabel(d.standing)} ({d.standing > 0 ? `+${d.standing}` : d.standing})
          </span>
        </label>
      )}
      <textarea className="gb-input" rows={2} value={d.description ?? ''} placeholder="What the party knows of them" aria-label="What the party knows" onChange={(e) => set('description', e.target.value)} />
      <textarea className="gb-input" rows={2} value={d.secret ?? ''} placeholder="Your notes — players never see these" aria-label="Your secret notes" onChange={(e) => set('secret', e.target.value)} />
      <input className="gb-input" value={d.noteTitle ?? ''} list={noteTitles ? 'gb-rep-notes' : undefined} placeholder="Linked note (optional)" aria-label="Linked note" onChange={(e) => set('noteTitle', e.target.value)} />
      {noteTitles && (
        <datalist id="gb-rep-notes">
          {noteTitles.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      )}
      <label className="gb-quest-form-toggle">
        <input type="checkbox" checked={d.shared} onChange={(e) => set('shared', e.target.checked)} />
        <span className="gb-toggle-track" aria-hidden="true" />
        The party knows them
      </label>
      <div className="gb-quest-form-actions">
        <button type="button" className="gb-quest-form-cancel" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="gb-quest-form-save" disabled={!d.name.trim()}>
          {initial ? 'Save' : 'Add'}
        </button>
      </div>
    </form>
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
