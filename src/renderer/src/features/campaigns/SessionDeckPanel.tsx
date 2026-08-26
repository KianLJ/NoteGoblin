import { useEffect, useRef, useState } from 'react'
import type { Note } from '@shared/ipc'
import type { SessionDeck } from '@shared/sessionDeck'
import { useSessionDecks } from './useSessionDecks'
import { Button } from '../../ui/Button'
import { BESTIARY } from '../../data/bestiary'
import { loadCustomMonsters } from '../../data/customBestiary'
import { loadSavedEncounters, type SavedEncounter } from '../../data/savedEncounters'
import type { BestiaryMonster } from '../../data/bestiary'
import { playSfx } from '../audio/soundEffects'
import { pickMood, playSpecificTrack } from '../audio/musicEngine'

interface SessionDeckPanelProps {
  campaignId: string | null
  /** The joined-session id (player reading over the relay) — null for the DM's own local/direct path, same convention as CalendarPanel. */
  sessionId: string | null
  /** DM-only — the DM's actual hosted-session id (RightPanel's own `sessionId` prop), used only to gate Goblin Bard broadcasts when a scene's linked mood auto-plays. Distinct from `sessionId` above, which for the DM is always null (their local/direct path) — see RightPanel.tsx's doc comment on why those can't be the same prop. Omitted/null for a player, who never triggers music. */
  hostedSessionId?: string | null
  /** True for a player's read-only view — hides authoring/presenting/encounter controls and shows the "DM has moved on" banner instead. */
  readOnly: boolean
  /** Every note in this campaign the caller already has loaded — used only to look up a scene's title/content by id, never fetched separately. */
  notes: Note[]
  /** Opens a scene's note as a tab in the main pane, exactly like any other note — see NoteEditor.tsx. */
  onOpenScene: (noteId: string) => void
  /** DM-only — patches the caller's own `notes` array the instant a scene note is created/removed (see useNotesWorkspace.ts's addNoteLocally). Without this, a scene created while not actively hosting never reaches `notes` at all, and clicking it does nothing. Omitted for a player, who never creates or removes scenes. */
  onSceneCreated?: (note: Note) => void
  onSceneRemoved?: (noteId: string) => void
  /** DM-only — "Load Encounter" on the live scene resolves the saved encounter to its monster list and hands it up to whichever sibling owns the Initiative Tracker (see RightPanel.tsx). Omitted for a player, who never sees the button. */
  onLoadEncounter?: (monsters: BestiaryMonster[]) => void
  /** Non-null while browsing a cached offline snapshot — decks come from that snapshot instead of a live IPC fetch, and there's never a live cursor to follow (see useSessionDecks.ts). Always undefined/null for the DM, who never has an offline view of their own campaign. */
  offlineDecks?: SessionDeck[] | null
}

function resolveEncounterMonsters(enc: SavedEncounter): BestiaryMonster[] {
  const all = [...loadCustomMonsters(), ...BESTIARY]
  return enc.monsterIndexes.map((idx) => all.find((m) => m.index === idx)).filter((m): m is BestiaryMonster => !!m)
}

/**
 * The DM's control surface for session decks — present/select/reorder
 * scenes here; a scene's actual written content is a real Note (see
 * shared/sessionDeck.ts), opened as a normal tab via onOpenScene with the
 * exact same NoteEditor, title field, and markdown toolbar any other note
 * gets. `::`-prefixed lines in a scene are stripped for players on every
 * note read path (see campaignService's toNoteJson), not just this one.
 */
export function SessionDeckPanel({
  campaignId,
  sessionId,
  hostedSessionId = null,
  readOnly,
  notes,
  onOpenScene,
  onSceneCreated,
  onSceneRemoved,
  onLoadEncounter,
  offlineDecks
}: SessionDeckPanelProps): JSX.Element {
  const { decks, live, createDeck, renameDeck, reorderScenes, removeDeck, addScene, removeScene, present, setLiveSceneIndex, stopPresenting } =
    useSessionDecks(campaignId, sessionId, offlineDecks)
  const [openDeckId, setOpenDeckId] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [savedEncounters, setSavedEncounters] = useState<SavedEncounter[]>(() => loadSavedEncounters())

  const openDeck = decks.find((d) => d.id === openDeckId) ?? null
  const isPresentingThisDeck = !readOnly && !!openDeck && live.deckId === openDeck.id

  // While actively presenting, the panel's own selection always tracks the
  // live cursor directly — there's no separate "browsing" position to fall
  // behind on your own presentation.
  useEffect(() => {
    if (isPresentingThisDeck) setSelectedIndex(live.sceneIndex)
  }, [isPresentingThisDeck, live.sceneIndex])

  useEffect(() => {
    setSavedEncounters(loadSavedEncounters())
  }, [openDeckId, selectedIndex])

  // Mirrors of state this effect needs read-access to without re-running
  // every time they change (only a genuine live-cursor change should ever
  // trigger it) — see the effect below.
  const openDeckIdRef = useRef(openDeckId)
  openDeckIdRef.current = openDeckId
  const selectedIndexRef = useRef(selectedIndex)
  selectedIndexRef.current = selectedIndex
  // onOpenScene is a fresh closure every render on the player side
  // (navigateToNote isn't memoized in useNotesWorkspace/usePlayerWorkspace)
  // — mirrored the same way so the effect below doesn't have to list it as
  // a dependency. It used to, and that was the actual bug behind "pressing
  // Prev just snaps back to the live scene": any unrelated re-render handed
  // the effect a new onOpenScene reference, which re-ran it even though
  // nothing about `live` had changed, right after a manual Prev/Next click
  // — sometimes winning the race against that click's own state update and
  // re-snapping selectedIndex back to the live position it had just left.
  const onOpenSceneRef = useRef(onOpenScene)
  onOpenSceneRef.current = onOpenScene
  const prevLiveRef = useRef<{ deckId: string | null; sceneIndex: number }>({ deckId: null, sceneIndex: -1 })

  // A player who's caught up to the live scene (or hasn't opened anything
  // yet) rides along automatically when the DM advances — auto-opens the
  // deck/note the first time a session goes live, then keeps following as
  // long as they stay on whatever's currently live. The moment they browse
  // away from the live position, this stops moving them and the "DM has
  // moved on" banner (below) takes over instead — see isBehind.
  useEffect(() => {
    if (!readOnly || !live.deckId) return
    // The live-cursor push (instant, over the websocket) and the deck list
    // refetch it depends on (a full sessionDecks.list round trip, triggered
    // by the same "Present" click via campaigns.onChanged) don't arrive
    // together — the deck can easily still be missing here the first time
    // this runs. Rather than silently giving up, bail without marking this
    // live position "handled" so the effect tries again once `decks`
    // actually updates (it's in the dependency array below).
    const targetDeck = decks.find((d) => d.id === live.deckId)
    const noteId = targetDeck?.scenes[live.sceneIndex]?.noteId
    if (!noteId) return

    const prev = prevLiveRef.current
    const isFirstSighting = openDeckIdRef.current === null
    const wasCaughtUp = openDeckIdRef.current === prev.deckId && selectedIndexRef.current === prev.sceneIndex
    prevLiveRef.current = live
    if (isFirstSighting || wasCaughtUp) {
      // Only an actual live advance dings here — silently catching up to
      // wherever the DM already is (isFirstSighting) isn't "the scene
      // changed" from this player's perspective, just opening the panel.
      if (wasCaughtUp) playSfx('sceneAdvance')
      setOpenDeckId(live.deckId)
      setSelectedIndex(live.sceneIndex)
      onOpenSceneRef.current(noteId)
    }
  }, [live.deckId, live.sceneIndex, readOnly, decks])

  if (!campaignId) return <EmptyState text="No campaign open." />

  if (!openDeck) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {!readOnly && (
          <div style={{ padding: 'var(--space-2) var(--space-3)', borderBottom: '1px solid var(--border-subtle)' }}>
            <Button
              variant="secondary"
              style={{ width: '100%', fontSize: 12 }}
              onClick={async () => {
                const created = await createDeck('Untitled Session')
                if (created) {
                  setOpenDeckId(created.id)
                  setSelectedIndex(0)
                }
              }}
            >
              + New Session
            </Button>
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {decks.length === 0 && <EmptyState text={readOnly ? 'No sessions yet.' : 'Create a session deck to get started.'} />}
          {decks.map((deck) => {
            const isLive = live.deckId === deck.id
            return (
              <div key={deck.id} style={{ display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--border-subtle)' }}>
                <button
                  type="button"
                  onClick={() => {
                    setOpenDeckId(deck.id)
                    setSelectedIndex(live.deckId === deck.id ? Math.max(0, live.sceneIndex) : 0)
                  }}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: 'left',
                    padding: 'var(--space-2) var(--space-3)',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deck.title || 'Untitled Session'}</span>
                  {isLive && <LiveBadge />}
                </button>
                {!readOnly && (
                  <button
                    type="button"
                    title="Delete this session"
                    onClick={() => removeDeck(deck.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: '0 var(--space-3)' }}
                  >
                    ×
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const deck = openDeck
  const scenes = deck.scenes
  const sceneCount = scenes.length
  const clampedIndex = Math.min(Math.max(selectedIndex, 0), Math.max(sceneCount - 1, 0))
  const currentScene = scenes[clampedIndex]
  const isBehind = readOnly && live.deckId === deck.id && live.sceneIndex !== clampedIndex && live.sceneIndex >= 0
  const currentEncounter = currentScene?.encounterId ? savedEncounters.find((e) => e.id === currentScene.encounterId) : undefined

  function selectScene(index: number): void {
    const next = Math.min(Math.max(index, 0), Math.max(sceneCount - 1, 0))
    const changed = next !== clampedIndex
    if (changed) playSfx('sceneAdvance')
    setSelectedIndex(next)
    if (isPresentingThisDeck) setLiveSceneIndex(next)
    const nextScene = scenes[next]
    if (nextScene) onOpenScene(nextScene.noteId)
    // Only an actual advance while live triggers the linked mood — reopening
    // the same scene you're already on (changed === false) shouldn't restart
    // the music, same reasoning as the sceneAdvance sfx above.
    if (changed && isPresentingThisDeck && nextScene?.trackId) {
      playSpecificTrack(nextScene.trackId, 2500, hostedSessionId)
    } else if (changed && isPresentingThisDeck && nextScene?.moodId) {
      pickMood(nextScene.moodId, 2500, hostedSessionId)
    }
  }

  async function handleAddScene(): Promise<void> {
    const note = await addScene(deck.id, `Scene ${sceneCount + 1}`)
    if (note) {
      onSceneCreated?.(note)
      setSelectedIndex(sceneCount)
      onOpenScene(note.id)
    }
  }

  function handleRemoveScene(noteId: string): void {
    void removeScene(deck.id, noteId)
    onSceneRemoved?.(noteId)
  }

  function moveScene(index: number, dir: -1 | 1): void {
    const target = index + dir
    if (target < 0 || target >= scenes.length) return
    const next = [...scenes]
    ;[next[index], next[target]] = [next[target], next[index]]
    void reorderScenes(deck.id, next)
    if (clampedIndex === index) setSelectedIndex(target)
    else if (clampedIndex === target) setSelectedIndex(index)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--space-2) var(--space-3)', borderBottom: '1px solid var(--border-subtle)' }}>
        <button
          type="button"
          onClick={() => setOpenDeckId(null)}
          title="Back to sessions"
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}
        >
          ←
        </button>
        {readOnly ? (
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600 }}>
            {deck.title || 'Untitled Session'}
          </span>
        ) : (
          <input
            className="gb-input"
            value={deck.title}
            onChange={(e) => renameDeck(deck.id, e.target.value)}
            style={{ flex: 1, minWidth: 0, fontSize: 13 }}
          />
        )}
        {!readOnly &&
          (isPresentingThisDeck ? (
            <Button variant="secondary" style={{ fontSize: 11, flexShrink: 0 }} onClick={stopPresenting}>
              Stop Presenting
            </Button>
          ) : (
            <Button variant="primary" style={{ fontSize: 11, flexShrink: 0 }} onClick={() => present(deck.id)} disabled={sceneCount === 0}>
              Present
            </Button>
          ))}
      </div>

      {isBehind && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 6,
            padding: 'var(--space-2) var(--space-3)',
            background: 'var(--accent-subtle)',
            borderBottom: '1px solid var(--border-subtle)',
            fontSize: 12
          }}
        >
          <span>The DM has moved on.</span>
          <button
            type="button"
            onClick={() => selectScene(live.sceneIndex)}
            style={{ background: 'none', border: 'none', color: 'var(--accent-hover)', fontWeight: 600, cursor: 'pointer', fontSize: 12 }}
          >
            Jump to their scene
          </button>
        </div>
      )}

      {isPresentingThisDeck && currentEncounter && onLoadEncounter && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 6,
            padding: 'var(--space-2) var(--space-3)',
            borderBottom: '1px solid var(--border-subtle)',
            fontSize: 12
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Encounter: {currentEncounter.name}</span>
          <Button variant="secondary" style={{ fontSize: 11, flexShrink: 0 }} onClick={() => onLoadEncounter(resolveEncounterMonsters(currentEncounter))}>
            Load Encounter
          </Button>
        </div>
      )}

      {!readOnly && (
        <div style={{ padding: 'var(--space-2) var(--space-3)', borderBottom: '1px solid var(--border-subtle)' }}>
          <Button variant="secondary" style={{ width: '100%', fontSize: 12 }} onClick={handleAddScene}>
            + Add Scene
          </Button>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {sceneCount === 0 && <EmptyState text="No scenes yet." />}
        {scenes.map((scene, index) => {
          const note = notes.find((n) => n.id === scene.noteId)
          const isSelected = index === clampedIndex
          const isLiveScene = live.deckId === deck.id && live.sceneIndex === index
          return (
            <div key={scene.noteId}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  background: isSelected ? 'var(--accent-subtle)' : 'transparent',
                  borderBottom: isSelected ? 'none' : '1px solid var(--border-subtle)'
                }}
              >
                <button
                  type="button"
                  onClick={() => selectScene(index)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: 'left',
                    padding: 'var(--space-2) var(--space-3)',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    color: isSelected ? 'var(--accent-hover)' : 'var(--text-primary)',
                    fontSize: 12
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 600, flexShrink: 0 }}>{index + 1}.</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note?.title || 'Untitled Scene'}</span>
                    {isLiveScene && <LiveBadge />}
                  </div>
                </button>
                {!readOnly && (
                  <div style={{ display: 'flex', flexShrink: 0, paddingRight: 4 }}>
                    <button type="button" disabled={index === 0} onClick={() => moveScene(index, -1)} title="Move up" style={smallBtnStyle}>
                      ↑
                    </button>
                    <button type="button" disabled={index === scenes.length - 1} onClick={() => moveScene(index, 1)} title="Move down" style={smallBtnStyle}>
                      ↓
                    </button>
                    <button type="button" onClick={() => handleRemoveScene(scene.noteId)} title="Delete scene" style={smallBtnStyle}>
                      ×
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {sceneCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-2) var(--space-3)', borderTop: '1px solid var(--border-subtle)' }}>
          <button type="button" disabled={clampedIndex <= 0} onClick={() => selectScene(clampedIndex - 1)} className="gb-btn gb-btn--secondary" style={{ fontSize: 12 }}>
            ← Prev
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Scene {clampedIndex + 1} / {sceneCount}
          </span>
          <button
            type="button"
            disabled={clampedIndex >= sceneCount - 1}
            onClick={() => selectScene(clampedIndex + 1)}
            className="gb-btn gb-btn--secondary"
            style={{ fontSize: 12 }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}

const smallBtnStyle = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 12,
  padding: '0 4px'
} as const

function LiveBadge(): JSX.Element {
  return (
    <span
      style={{
        flexShrink: 0,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.03em',
        color: 'var(--danger)',
        border: '1px solid var(--danger)',
        borderRadius: 'var(--radius-sm)',
        padding: '1px 5px'
      }}
    >
      LIVE
    </span>
  )
}

function EmptyState({ text }: { text: string }): JSX.Element {
  return <div style={{ padding: 'var(--space-3)', fontSize: 12, color: 'var(--text-muted)' }}>{text}</div>
}
