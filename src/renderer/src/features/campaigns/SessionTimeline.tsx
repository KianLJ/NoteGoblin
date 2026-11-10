import { useState } from 'react'
import type { Note } from '@shared/ipc'
import type { SceneMusic, SessionDeck } from '@shared/sessionDeck'
import { cueLabel } from './SceneCues'
import type { BestiaryMonster } from '../../data/bestiary'
import { loadAllMonsters } from '../../data/packMonsters'
import { loadSavedEncounters, type SavedEncounter } from '../../data/savedEncounters'
import { playSfx } from '../audio/soundEffects'
import { pickMood, playSpecificTrack } from '../audio/musicEngine'
import { Button } from '../../ui/Button'
import { ArrowLeftIcon, ArrowRightIcon, PlusIcon, XIcon } from '../../ui/icons'
import { PencilIcon } from './icons'
import type { useSessionDecks } from './useSessionDecks'
import './sessions.css'

export type SessionDecksApi = ReturnType<typeof useSessionDecks>

export function resolveEncounterMonsters(enc: SavedEncounter): BestiaryMonster[] {
  const all = loadAllMonsters()
  return enc.monsterIndexes.map((idx) => all.find((m) => m.index === idx)).filter((m): m is BestiaryMonster => !!m)
}

/** Plays one of a scene's music cues for the table: its track, or a random one from its mood. */
export function playCue(cue: SceneMusic, hostedSessionId: string | null): void {
  if (cue.trackId) playSpecificTrack(cue.trackId, 2500, hostedSessionId)
  else pickMood(cue.moodId, 2500, hostedSessionId)
}

/** Moves the live presentation to `index`: the players follow, and the scene's first music cue plays. */
export function goLive(api: SessionDecksApi, deck: SessionDeck, index: number, hostedSessionId: string | null): void {
  const scene = deck.scenes[index]
  if (!scene) return
  if (index !== api.live.sceneIndex) playSfx('sceneAdvance')
  api.setLiveSceneIndex(index)
  if (scene.music[0]) playCue(scene.music[0], hostedSessionId)
}

/**
 * The DM's Sessions box: every session, to open, present, rename or delete,
 * and a button for a new one. A session's scenes live in a collection of its
 * own on the canvas (one note box per scene, numbered in the order they read)
 * — Open goes in there.
 */
export function SessionsList({
  api,
  onOpen,
  onNew,
  onDelete,
  onRename,
  shelved,
  onUnshelve
}: {
  api: SessionDecksApi
  /** Whether a session's collection tile is closed (shelved) — it's still there, opened from here. */
  shelved: (deck: SessionDeck) => boolean
  /** Puts a shelved session's tile back on the canvas. */
  onUnshelve: (deck: SessionDeck) => void
  onOpen: (deck: SessionDeck) => void
  /** Renames the session and its collection together. */
  onRename: (deck: SessionDeck, title: string) => void
  onNew: () => void
  /** After the session's gone — its collection goes with it. */
  onDelete: (deck: SessionDeck) => void
}): JSX.Element {
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  function finishRename(): void {
    const deck = renaming && api.decks.find((d) => d.id === renaming.id)
    if (deck) onRename(deck, renaming!.title.trim() || 'Untitled Session')
    setRenaming(null)
  }

  if (api.decks.length === 0) {
    return (
      <div className="gb-session-start">
        <strong>No sessions yet</strong>
        <span>A session is a run of scenes you present to the table, one after another. Each gets a collection of its own on the canvas.</span>
        <Button variant="primary" onClick={onNew}>
          + New session
        </Button>
      </div>
    )
  }

  return (
    <div className="gb-session-list">
      {api.decks.map((d) => {
        const live = api.live.deckId === d.id
        return (
          <div key={d.id} className={live ? 'gb-session-row gb-session-row--live' : 'gb-session-row'}>
            {renaming?.id === d.id ? (
              <input
                className="gb-input"
                autoFocus
                value={renaming.title}
                onChange={(e) => setRenaming({ id: d.id, title: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') finishRename()
                  if (e.key === 'Escape') setRenaming(null)
                }}
                onBlur={finishRename}
                aria-label="Session name"
              />
            ) : (
              <button type="button" className="gb-session-row-open" title="Open this session's scenes" onClick={() => onOpen(d)}>
                <span className="gb-session-row-title">{d.title || 'Untitled Session'}</span>
                <span className="gb-session-row-meta">
                  {live && <span className="gb-scene-live">Live</span>}
                  {d.scenes.length} {d.scenes.length === 1 ? 'scene' : 'scenes'}
                  {shelved(d) && ' · tile closed'}
                </span>
              </button>
            )}
            {live ? (
              <Button variant="secondary" style={{ fontSize: 12 }} onClick={api.stopPresenting}>
                Stop
              </Button>
            ) : (
              <Button
                variant="secondary"
                style={{ fontSize: 12 }}
                disabled={d.scenes.length === 0}
                onClick={() => {
                  api.present(d.id)
                  onOpen(d)
                }}
              >
                ▶ Present
              </Button>
            )}
            {shelved(d) && (
              <button type="button" className="gb-session-menu-icon" title="Put its tile back on the canvas" aria-label={`Put ${d.title || 'Untitled Session'} back on the canvas`} onClick={() => onUnshelve(d)}>
                <PlusIcon size={12} />
              </button>
            )}
            <button type="button" className="gb-session-menu-icon" title="Rename" aria-label={`Rename ${d.title || 'Untitled Session'}`} onClick={() => setRenaming({ id: d.id, title: d.title })}>
              <PencilIcon />
            </button>
            {confirmDelete === d.id ? (
              <button
                type="button"
                className="gb-session-menu-confirm"
                onBlur={() => setConfirmDelete(null)}
                onClick={() => {
                  setConfirmDelete(null)
                  void api.removeDeck(d.id).then(() => onDelete(d))
                }}
              >
                Delete?
              </button>
            ) : (
              <button type="button" className="gb-session-menu-icon gb-session-menu-icon--danger" title="Delete session and its scenes" aria-label={`Delete ${d.title || 'Untitled Session'}`} onClick={() => setConfirmDelete(d.id)}>
                <XIcon size={12} />
              </button>
            )}
          </div>
        )
      })}
      <button type="button" className="gb-session-menu-new" onClick={onNew}>
        + New session
      </button>
    </div>
  )
}

/** A scene box's own delete button (scenes have no close: closing one would only bring it straight back). */
export function SceneDeleteButton({ onDelete }: { onDelete: () => void }): JSX.Element {
  const [confirm, setConfirm] = useState(false)
  return confirm ? (
    <button type="button" className="gb-session-menu-confirm" onBlur={() => setConfirm(false)} onClick={onDelete} autoFocus>
      Delete scene?
    </button>
  ) : (
    <button type="button" className="gb-canvas-node-close" title="Delete scene" aria-label="Delete scene" onClick={() => setConfirm(true)}>
      <XIcon size={12} />
    </button>
  )
}

/**
 * While a session is being presented: a small control pinned to the top of
 * the screen — previous, the scene you're on, next, load its encounter, stop.
 * Stepping brings the live scene's box into view.
 */
export function SessionPresenter({
  api,
  notes,
  hostedSessionId,
  onStep,
  onLoadEncounter
}: {
  api: SessionDecksApi
  notes: Note[]
  hostedSessionId: string | null
  /** After stepping (or a click on the scene's name) — the DM's canvas brings the scene's box into view. */
  onStep: (noteId: string) => void
  onLoadEncounter: (monsters: BestiaryMonster[], encounterId: string) => void
}): JSX.Element | null {
  const deck = api.decks.find((d) => d.id === api.live.deckId)
  if (!deck) return null
  const index = Math.max(0, api.live.sceneIndex)
  const scene = deck.scenes[index]
  const note = scene && notes.find((n) => n.id === scene.noteId)
  const saved = loadSavedEncounters()
  const encounters = (scene?.encounterIds ?? []).map((id) => saved.find((e) => e.id === id)).filter((e): e is SavedEncounter => !!e)

  function step(to: number): void {
    goLive(api, deck!, to, hostedSessionId)
    const next = deck!.scenes[to]
    if (next) onStep(next.noteId)
  }

  return (
    <div className="gb-presenter" role="toolbar" aria-label="Presenting">
      <span className="gb-scene-live">Live</span>
      <button type="button" className="gb-presenter-step" disabled={index <= 0} onClick={() => step(index - 1)} aria-label="Previous scene">
        <ArrowLeftIcon size={14} />
      </button>
      <button type="button" className="gb-presenter-scene" onClick={() => scene && onStep(scene.noteId)} title="Show this scene">
        <span className="gb-presenter-count">
          {deck.title || 'Session'} · {index + 1}/{deck.scenes.length}
        </span>
        <span className="gb-presenter-title">{note?.title || 'Untitled Scene'}</span>
      </button>
      <button type="button" className="gb-presenter-step" disabled={index >= deck.scenes.length - 1} onClick={() => step(index + 1)} aria-label="Next scene">
        <ArrowRightIcon size={14} />
      </button>
      {(encounters.length > 0 || (scene?.music.length ?? 0) > 0) && (
        <div className="gb-presenter-cues">
          {encounters.map((enc) => (
            <button key={enc.id} type="button" className="gb-presenter-action gb-presenter-action--fight" onClick={() => onLoadEncounter(resolveEncounterMonsters(enc), enc.id)} title={`Load “${enc.name}” into the fight`}>
              ⚔ {enc.name}
            </button>
          ))}
          {scene?.music.map((cue, i) => (
            <button
              key={i}
              type="button"
              className="gb-presenter-action gb-presenter-action--music"
              onClick={() => playCue(cue, hostedSessionId)}
              title={i === 0 ? 'Played when this scene came up — click to play it again' : 'Play this for the table'}
            >
              ♪ {cueLabel(cue)}
            </button>
          ))}
        </div>
      )}
      <button type="button" className="gb-presenter-action" onClick={api.stopPresenting}>
        Stop
      </button>
    </div>
  )
}
