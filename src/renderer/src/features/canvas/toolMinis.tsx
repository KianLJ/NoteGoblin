import { useEffect, useState } from 'react'
import { activeSeasonForDate, weekdayIndexForDate } from '@shared/calendar'
import { MUSIC_LIBRARY, findTrack } from '../../data/musicLibrary'
import { findSfxCue } from '../../data/sfxLibrary'
import { getMusicState, subscribeMusic, togglePlayPause, skipTrack } from '../audio/musicEngine'
import { findCustomTrack, subscribeCustomMusic, YOUR_MUSIC_GROUP } from '../audio/customMusicStore'
import { audioName, subscribeAudioNames } from '../audio/audioNames'
import { audioGroups } from '../audio/audioGroups'
import { playSfxCue, recentSfx, rememberRecentSfx, subscribeRecentSfx } from '../audio/sfxBoardEngine'
import { useCalendar } from '../campaigns/useCalendar'
import { useEncounter } from '../combat/encounterStore'
import { usePartyPresence } from '../player/PartyList'
import { useSessionDecks } from '../campaigns/useSessionDecks'
import { goLive, type SessionDecksApi } from '../campaigns/SessionTimeline'
import { ArrowLeftIcon, ArrowRightIcon } from '../../ui/icons'
import type { Note } from '@shared/ipc'
import type { SessionDeck } from '@shared/sessionDeck'
import type { PlayerVisibleInitiativeState } from '@shared/encounter'
import './toolMinis.css'

// The small views tools show while their box is minimized (see shared/canvasTools.ts's TOOL_MINI).

const MINI_FADE_MS = 2500

/** Re-renders on any of these stores' changes. */
function useStores(...subscribers: ((l: () => void) => () => void)[]): void {
  const [, setTick] = useState(0)
  useEffect(() => {
    const offs = subscribers.map((s) => s(() => setTick((t) => t + 1)))
    return () => offs.forEach((off) => off())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/** What's playing, with play/pause and skip. */
export function MusicMini({ sessionId }: { sessionId: string | null }): JSX.Element {
  useStores(subscribeMusic, subscribeCustomMusic, subscribeAudioNames)
  const state = getMusicState()
  const track = state.trackId ? (findTrack(state.trackId) ?? findCustomTrack(state.trackId)) : null
  const mood =
    MUSIC_LIBRARY.find((g) => g.id === state.groupId)?.label ?? (state.groupId === YOUR_MUSIC_GROUP ? 'Your music' : audioGroups('mood').find((g) => g.id === state.groupId)?.label)
  return (
    <div className={`mini-music${state.playing ? ' mini-music--playing' : ''}`}>
      <div className="mini-music-top">
        <span className="mini-eq" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="mini-music-text">
          <strong>{track ? audioName(track.id, track.title) : 'Nothing playing'}</strong>
          <small>{mood ? `${mood}${state.playing ? '' : ' · paused'}` : 'Open to pick a mood'}</small>
        </span>
      </div>
      <div className="mini-transport">
        <button
          type="button"
          className="mini-round"
          disabled={!state.groupId}
          onClick={() => skipTrack(-1, MINI_FADE_MS, sessionId)}
          aria-label="Previous song"
          title="Previous song"
        >
          <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" style={{ transform: 'scaleX(-1)' }}>
            <path d="M1.5 1.5v9l6-4.5-6-4.5Z" />
            <rect x="8.2" y="1.5" width="1.8" height="9" rx="0.5" />
          </svg>
        </button>
        <button
          type="button"
          className="mini-round mini-round--big"
          disabled={!state.trackId}
          onClick={() => togglePlayPause(MINI_FADE_MS, sessionId)}
          aria-label={state.playing ? 'Pause' : 'Play'}
          title={state.playing ? 'Pause' : 'Play'}
        >
          {state.playing ? (
            <svg width="15" height="15" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
              <rect x="2.5" y="1.5" width="2.5" height="9" rx="0.6" />
              <rect x="7" y="1.5" width="2.5" height="9" rx="0.6" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
              <path d="M3 1.5v9l7-4.5-7-4.5Z" />
            </svg>
          )}
        </button>
        <button type="button" className="mini-round" disabled={!state.groupId} onClick={() => skipTrack(1, MINI_FADE_MS, sessionId)} aria-label="Next song" title="Next song">
          <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
            <path d="M1.5 1.5v9l6-4.5-6-4.5Z" />
            <rect x="8.2" y="1.5" width="1.8" height="9" rx="0.5" />
          </svg>
        </button>
      </div>
    </div>
  )
}

/** The sound board pads you've hit lately, ready to hit again. */
export function SoundBoardMini({ sessionId }: { sessionId: string | null }): JSX.Element {
  useStores(subscribeRecentSfx, subscribeCustomMusic, subscribeAudioNames)
  const pads = recentSfx()
    .map((id) => {
      const cue = findSfxCue(id)
      const label = cue ? audioName(id, cue.label) : findCustomTrack(id)?.title
      return label ? { id, label } : null
    })
    .filter((p): p is { id: string; label: string } => !!p)
  if (pads.length === 0) return <div className="mini-empty">Sounds you play show up here, ready to play again.</div>
  return (
    <div className="mini-pads">
      {pads.map((p) => (
        <button
          key={p.id}
          type="button"
          className="mini-pad"
          onClick={() => {
            playSfxCue(p.id, sessionId)
            rememberRecentSfx(p.id)
          }}
          title={`Play ${p.label}`}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}

/** Today in the campaign: the day, weekday and month, and the time. */
export function CalendarMini({ sessionId, campaignId }: { sessionId: string | null; campaignId: string | null }): JSX.Element {
  const { calendar } = useCalendar(sessionId ?? undefined, campaignId)
  const config = calendar?.config
  if (!config || config.months.length === 0) return <div className="mini-empty">No calendar yet</div>
  const date = config.currentDate
  const season = activeSeasonForDate(config, date)
  const weekday = config.weekdays[weekdayIndexForDate(config, date)]
  return (
    <div className="mini-date">
      <span className="mini-date-day" style={season?.color ? { background: season.color } : undefined}>
        {date.day}
      </span>
      <span className="mini-date-text">
        <strong>{weekday?.name}</strong>
        <small>{[config.months[date.monthIndex]?.name, config.timeOfDay].filter(Boolean).join(' · ')}</small>
      </span>
    </div>
  )
}

/** Whose turn it is, how they're doing, and who's next. */
export function InitiativeMini(): JSX.Element {
  const [state] = useEncounter()
  const order = state.combatants
  if (state.turnIndex < 0 || order.length === 0) return <div className="mini-empty">{order.length ? `${order.length} ready · not started` : 'No fight on'}</div>
  const now = order[state.turnIndex]
  const next = order[(state.turnIndex + 1) % order.length]
  const hp = now.maxHp > 0 ? Math.max(0, Math.min(1, now.currentHp / now.maxHp)) : 0
  return (
    <div className="mini-turn">
      <small>Round {state.round}</small>
      <strong>{now.name}</strong>
      <div className="mini-hp" title={`${now.currentHp} / ${now.maxHp} HP`}>
        <i className={hp <= 0.25 ? 'mini-hp--low' : undefined} style={{ width: `${hp * 100}%` }} />
      </div>
      {next && next.id !== now.id && <small>Next: {next.name}</small>}
    </div>
  )
}

/** Who's at the table: a face per player, and how many. */
export function PartyMini({ sessionId, campaignId }: { sessionId: string | null; campaignId: string | null }): JSX.Element {
  const players = usePartyPresence(sessionId, campaignId)
  if (!sessionId) return <div className="mini-empty">Not in a session</div>
  if (players.length === 0) return <div className="mini-empty">Nobody here yet</div>
  return (
    <div className="mini-party">
      <span className="mini-faces">
        {players.slice(0, 5).map((p) => {
          const name = p.characterName || p.displayName
          return (
            <span key={p.userId} className="mini-face" title={p.characterName ? `${p.characterName} (${p.displayName})` : p.displayName}>
              {p.avatar ? <img className="gb-face-img" src={p.avatar} alt="" /> : name.trim().charAt(0).toUpperCase()}
            </span>
          )
        })}
        {players.length > 5 && <span className="mini-face mini-face--more">+{players.length - 5}</span>}
      </span>
      <small>{players.length} at the table</small>
    </div>
  )
}

/** The DM's live session: which scene, with back and next. */
export function SessionsMini({ api, notes, hostedSessionId }: { api: SessionDecksApi; notes: Note[]; hostedSessionId: string | null }): JSX.Element {
  const deck = api.decks.find((d) => d.id === api.live.deckId)
  const index = api.live.sceneIndex
  if (!deck || index < 0)
    return <div className="mini-empty">{api.decks.length ? `${api.decks.length} ${api.decks.length === 1 ? 'session' : 'sessions'} · not presenting` : 'No sessions yet'}</div>
  const title = notes.find((n) => n.id === deck.scenes[index]?.noteId)?.title || 'Untitled scene'
  return (
    <div className="mini-scene">
      <span className="mini-scene-text">
        <small>
          Live · scene {index + 1} of {deck.scenes.length}
        </small>
        <strong>{title}</strong>
      </span>
      <button
        type="button"
        className="mini-round"
        disabled={index <= 0}
        onClick={() => goLive(api, deck, index - 1, hostedSessionId)}
        aria-label="Previous scene"
        title="Previous scene"
      >
        <ArrowLeftIcon size={12} />
      </button>
      <button
        type="button"
        className="mini-round mini-round--big"
        disabled={index >= deck.scenes.length - 1}
        onClick={() => goLive(api, deck, index + 1, hostedSessionId)}
        aria-label="Next scene"
        title="Next scene"
      >
        <ArrowRightIcon size={13} />
      </button>
    </div>
  )
}

/** A player's view of the live session: the scene the DM is on, to open. */
export function PlayerSessionsMini({
  sessionId,
  campaignId,
  notes,
  offlineDecks,
  onOpenNote
}: {
  sessionId: string | null
  campaignId: string | null
  notes: Note[]
  offlineDecks: SessionDeck[] | null
  onOpenNote: (noteId: string) => void
}): JSX.Element {
  const { decks, live } = useSessionDecks(campaignId, sessionId, offlineDecks)
  const deck = decks.find((d) => d.id === live.deckId)
  const noteId = deck?.scenes[live.sceneIndex]?.noteId
  if (!deck || !noteId) return <div className="mini-empty">Nothing being shown right now</div>
  return (
    <div className="mini-scene">
      <span className="mini-scene-text">
        <small>The DM is showing</small>
        <strong>{notes.find((n) => n.id === noteId)?.title || 'A scene'}</strong>
      </span>
      <button type="button" className="gb-btn gb-btn--secondary mini-scene-open" onClick={() => onOpenNote(noteId)}>
        Read it
      </button>
    </div>
  )
}

/** A player's turn order: whose turn it is, and who's next. */
export function PlayerInitiativeMini({ sessionId }: { sessionId: string | null }): JSX.Element {
  const [state, setState] = useState<PlayerVisibleInitiativeState | null>(null)
  useEffect(() => {
    // Like the full turn order: the fight as it stands, then live changes.
    let cancelled = false
    if (sessionId)
      void window.goblin.initiative.get().then((r) => {
        if (!cancelled && r.ok && r.data) setState(r.data)
      })
    const off = window.goblin.initiative.onUpdate((u) => {
      if (u.sessionId === sessionId) setState(u.state)
    })
    return () => {
      cancelled = true
      off()
    }
  }, [sessionId])
  if (!state || state.turnIndex < 0 || state.combatants.length === 0) return <div className="mini-empty">No fight on</div>
  const now = state.combatants[state.turnIndex]
  const next = state.combatants[(state.turnIndex + 1) % state.combatants.length]
  return (
    <div className="mini-turn">
      <small>Round {state.round}</small>
      <strong>{now.isSelf ? 'Your turn' : now.name}</strong>
      {next && next.id !== now.id && <small>Next: {next.isSelf ? 'you' : next.name}</small>}
    </div>
  )
}
