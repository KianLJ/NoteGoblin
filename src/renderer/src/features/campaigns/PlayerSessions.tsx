import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import type { Note } from '@shared/ipc'
import type { SessionDeck } from '@shared/sessionDeck'
import { useSessionDecks } from './useSessionDecks'
import { renderNoteMarkdown } from '../../markdown'
import { rollInlineDice } from '../dice/inlineDice'
import { playSfx } from '../audio/soundEffects'
import { ArrowLeftIcon } from '../../ui/icons'
import './sessions.css'
import { useMyUserId } from '../account/avatar'

interface PlayerSessionsProps {
  campaignId: string | null
  /** The joined session — null when not in one (an offline snapshot, say). */
  sessionId: string | null
  notes: Note[]
  /** Browsing a cached snapshot: its decks, and nothing is ever live. */
  offlineDecks?: SessionDeck[] | null
  /** Opens a note in a box of its own — only ever when the player asks (a scene's "Open as a note", a link in it). */
  onOpenNote: (noteId: string) => void
}

/**
 * A player's Sessions box. Everything happens inside the box: nothing opens
 * on the canvas unless you ask. While the DM presents, it shows the scene
 * they're on and keeps up as they move. Pick another scene to read back and
 * it stays there, with a bar to catch up. Out of a live session, it lists
 * the sessions played so far. Players only ever get the scenes the DM has
 * presented (see campaignService.listSessionDecks).
 */
export function PlayerSessions({ campaignId, sessionId, notes, offlineDecks, onOpenNote }: PlayerSessionsProps): JSX.Element {
  const { decks, live } = useSessionDecks(campaignId, sessionId, offlineDecks)
  // The session being read: null follows the live one (or shows the list when nothing is live).
  const [deckId, setDeckId] = useState<string | 'list' | null>(null)
  // The scene being read back: null follows the DM's.
  const [picked, setPicked] = useState<string | null>(null)

  const liveDeck = decks.find((d) => d.id === live.deckId)
  const liveNoteId = liveDeck?.scenes[live.sceneIndex]?.noteId ?? null
  const deck = deckId === 'list' ? undefined : deckId ? decks.find((d) => d.id === deckId) : liveDeck
  const isLiveDeck = !!deck && deck.id === liveDeck?.id
  const shownNoteId = deck ? (picked && deck.scenes.some((s) => s.noteId === picked) ? picked : isLiveDeck && liveNoteId ? liveNoteId : (deck.scenes[deck.scenes.length - 1]?.noteId ?? null)) : null
  const following = isLiveDeck && !picked

  // A soft chime when the DM moves on, for whoever's following along. Nothing opens or moves.
  const lastLive = useRef(liveNoteId)
  useEffect(() => {
    if (liveNoteId && lastLive.current && liveNoteId !== lastLive.current && following) playSfx('sceneAdvance')
    lastLive.current = liveNoteId
  }, [liveNoteId, following])

  // A new presentation starting brings the box back to it.
  useEffect(() => {
    if (!live.deckId) return
    setDeckId(null)
    setPicked(null)
  }, [live.deckId])

  if (!campaignId) return <div className="gb-session-start">No campaign open.</div>

  if (!deck) {
    return (
      <div className="gb-session-list">
        {decks.length === 0 ? (
          <div className="gb-session-start">
            <strong>No sessions yet</strong>
            <span>When the DM presents a session, its scenes show up here.</span>
          </div>
        ) : (
          decks.map((d) => (
            <div key={d.id} className={d.id === liveDeck?.id ? 'gb-session-row gb-session-row--live' : 'gb-session-row'}>
              <button
                type="button"
                className="gb-session-row-open"
                onClick={() => {
                  setDeckId(d.id)
                  setPicked(null)
                }}
              >
                <span className="gb-session-row-title">{d.title || 'Untitled Session'}</span>
                <span className="gb-session-row-meta">
                  {d.id === liveDeck?.id && <span className="gb-scene-live">Live</span>}
                  {d.scenes.length} {d.scenes.length === 1 ? 'scene' : 'scenes'}
                </span>
              </button>
            </div>
          ))
        )}
      </div>
    )
  }

  const note = shownNoteId ? notes.find((n) => n.id === shownNoteId) : undefined
  const liveIndex = isLiveDeck && liveNoteId ? deck.scenes.findIndex((s) => s.noteId === liveNoteId) : -1

  return (
    <div className="gb-psession">
      <div className="gb-psession-head">
        <button type="button" className="gb-session-menu-icon" title="All sessions" aria-label="All sessions" onClick={() => setDeckId('list')}>
          <ArrowLeftIcon size={14} />
        </button>
        <span className="gb-psession-title">{deck.title || 'Untitled Session'}</span>
        {isLiveDeck && <span className="gb-scene-live">Live</span>}
      </div>
      <div className="gb-psession-scenes" role="tablist" aria-label="Scenes">
        {deck.scenes.map((s, i) => (
          <button
            key={s.noteId}
            type="button"
            role="tab"
            aria-selected={s.noteId === shownNoteId}
            className={`gb-psession-scene${s.noteId === shownNoteId ? ' gb-psession-scene--on' : ''}${i === liveIndex ? ' gb-psession-scene--live' : ''}`}
            title={notes.find((n) => n.id === s.noteId)?.title || 'Untitled Scene'}
            onClick={() => setPicked(i === liveIndex ? null : s.noteId)}
          >
            {i + 1}
          </button>
        ))}
      </div>
      {isLiveDeck && !following && liveIndex >= 0 && (
        <div className="gb-psession-behind">
          <span>The DM is on scene {liveIndex + 1}.</span>
          <button type="button" onClick={() => setPicked(null)}>
            Follow along
          </button>
        </div>
      )}
      <SceneText note={note} notes={notes} onOpenNote={onOpenNote} sessionId={sessionId} />
    </div>
  )
}

/** A scene's words, read-only, in the box. Its links open their notes in boxes of their own. */
function SceneText({ note, notes, onOpenNote, sessionId }: { note: Note | undefined; notes: Note[]; onOpenNote: (id: string) => void; sessionId: string | null }): JSX.Element {
  const knownTitles = useMemo(() => new Set(notes.map((n) => (n.title || 'Untitled').toLowerCase())), [notes])
  const myId = useMyUserId()
  const html = useMemo(() => (note ? renderNoteMarkdown(note.bodyMarkdown, knownTitles, note.campaignId, undefined, myId ? { userId: myId, label: note.hiddenLabel } : undefined) : ''), [note, knownTitles, myId])
  if (!note) return <div className="gb-session-start">Waiting for the scene…</div>

  function onClick(e: MouseEvent<HTMLDivElement>): void {
    const link = (e.target as HTMLElement).closest<HTMLElement>('[data-wikilink]')
    if (!link) {
      rollInlineDice(e, sessionId)
      return
    }
    e.preventDefault()
    const title = (link.dataset.wikilink ?? '').toLowerCase()
    const target = notes.find((n) => (n.title || 'Untitled').toLowerCase() === title)
    if (target) onOpenNote(target.id)
  }

  return (
    <div className="gb-psession-body">
      <div className="gb-psession-scene-head">
        <h2>{note.title || 'Untitled Scene'}</h2>
        <button type="button" className="gb-btn gb-btn--ghost" style={{ fontSize: 12 }} onClick={() => onOpenNote(note.id)} title="Open this scene in a box of its own">
          Open as a note
        </button>
      </div>
      <div className="gb-markdown" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
