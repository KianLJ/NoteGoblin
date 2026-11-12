import { usePartyPresence } from '../player/PartyList'
import { WorldMap } from './WorldMap'
import { ReputationTracker } from './ReputationTracker'
import { GoblinLoader } from '../../ui/GoblinLoader'
import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { NoteSidebar } from './NoteSidebar'
import { NoteEditor } from './NoteEditor'
import { CampaignSwitcher } from './CampaignSwitcher'
import { ConnectedPlayersList } from './ConnectedPlayersList'
import { CalendarPanel } from './CalendarPanel'
import { monsterToCombatant } from './InitiativeTracker'
import { FileIcon, PawIcon } from './icons'
import { useKnownPlayerSheets } from './useKnownPlayerSheets'
import { DmInitiativeTool } from './DmInitiativeTool'
import { TimerDockButton, TimerMini, TimerPanel } from '../canvas/SessionTimer'
import { CalendarMini, InitiativeMini, PartyMini, SessionsMini } from '../canvas/toolMinis'
import { playCue, resolveEncounterMonsters, SceneDeleteButton, SessionPresenter, SessionsList } from './SessionTimeline'
import { loadSavedEncounters } from '../../data/savedEncounters'
import { ShowToPlayersButton } from './ShowToPlayersButton'
import { HostButton } from './HostButton'
import { QuestLog } from './QuestLog'
import { stripDmAsides } from '@shared/sessionDeck'
import { getCanvasImage } from '../canvas/canvasImages'
import { useSessionDecks } from './useSessionDecks'
import { SessionIcon } from './panelIcons'
import { dropEntry, putEntry, useCanvasEntries } from '../canvas/canvasEntries'
import { MonsterEditor } from '../bestiary/MonsterEditor'
import type { PackMonster } from '../../data/packMonsters'
import { entryItems } from '../canvas/entryItems'
import { CharacterSheetEditor } from '../player/CharacterSheetEditor'
import { UserIcon } from '../player/icons'
import { DiceButton } from '../dice/DiceButton'
import { TestPlayersMenu } from '../combat/TestPlayersMenu'
import { setEncounter, switchToEncounterBattle } from '../combat/encounterStore'
import { Canvas, type CanvasHandle, type CanvasPoint } from '../canvas/Canvas'
import { toolItems, type CanvasItem, type ToolContents } from '../canvas/toolItems'
import { useCanvasLayout } from '../canvas/useCanvasLayout'
import {
  COLLECTION_PREFIX,
  MINI_SIZE,
  addCollection,
  addNode,
  findNode,
  layoutAt,
  readingOrder,
  removeCollection,
  removeNode,
  renameNode,
  sceneSpot,
  sessionCollections,
  snap
} from '@shared/canvasLayout'
import { DYNAMIC_SIZE, HEADER_TOOLS, TOOL_META, TOOLS_BY_MODE } from '@shared/canvasTools'
import type { ContextMenuItem } from '../../ui/ContextMenu'
import { TOOL_ICONS } from '../canvas/toolIcons'
import { QuickSearch, QuickSearchButton, noteTarget, useQuickSearchKey } from '../canvas/QuickSearch'
import type { NotesWorkspace } from './useNotesWorkspace'
import type { Campaign, CharacterSheet } from '@shared/ipc'
import type { BestiaryMonster } from '../../data/bestiary'
import type { SessionDeck } from '@shared/sessionDeck'
import { Button } from '../../ui/Button'

/** A scene's box in its session's collection. */
// Room for the scene's cues at the top and still a good stretch of writing space under them.
const SCENE_SIZE = { w: 560, h: 640 }

// Loaded the first time a monster is picked, so the app starts without its code.
const Bestiary = lazy(() => import('../bestiary/Bestiary').then((m) => ({ default: m.Bestiary })))


interface CampaignWorkspaceProps {
  /** null while the DM has no campaign open yet — the campaign switcher still floats in the canvas's corner, so there's always somewhere to create one. */
  campaign: Campaign | null
  workspace: NotesWorkspace
  onSwitchCampaign: (campaign: Campaign) => void
  /** Fired when the currently-open campaign gets deleted from the switcher — drops back to "no campaign open" instead of continuing to show one that no longer exists. */
  onCampaignDeleted: () => void
  /** The session id once hosting is on — for live presence, and for HostButton's Start/Stop beside the campaign's name. */
  hostedSessionId?: string | null
  onHostedSessionChange: (sessionId: string | null) => void
  /** Every connected player's currently-selected character, kept live. Their sheets are remembered after they leave (see useKnownPlayerSheets). */
  playerCharacters: Map<string, CharacterSheet>
  /** The connected players' characters plus the DM's test players' — for the Initiative box. */
  combatCharacters: Map<string, CharacterSheet>
  /** Opens the Combat screen (the initiative tracker, encounter building and vehicles live there). */
  onOpenCombat?: () => void
  /** The tools the app shell provides to both modes (Codex, Content Packs, Music, Messages, ...). */
  sharedTools: ToolContents
  canvasRef: RefObject<CanvasHandle>
}

/**
 * The DM's workspace: a canvas (see canvas/Canvas.tsx) holding the notes
 * tree, every open note, players' sheets, monster statblocks and the DM's
 * tools. Open notes are useNotesWorkspace's open tabs, one box each. A note
 * picked in the tree gets a box of its own; following a link inside a note
 * (or stepping through a session's scenes) loads into that same box.
 */
export function CampaignWorkspace({
  campaign,
  workspace,
  onSwitchCampaign,
  onCampaignDeleted,
  hostedSessionId,
  onHostedSessionChange,
  playerCharacters,
  combatCharacters,
  onOpenCombat,
  sharedTools,
  canvasRef
}: CampaignWorkspaceProps): JSX.Element {
  const [layout, setLayout, nav] = useCanvasLayout('dm')
  const knownSheets = useKnownPlayerSheets(campaign?.id ?? null, playerCharacters)
  const entries = useCanvasEntries('dm')
  // One set of session decks for the Sessions list, each session's box and the presenter (the DM's local path — see Calendar's note below).
  const decksApi = useSessionDecks(campaign?.id ?? null, null)
  // The statblock box open in the monster editor (its box, and the creature), if any.
  const [editingStatblock, setEditingStatblock] = useState<{ nodeId: string; monster: PackMonster } | null>(null)
  // Where a monster picked from the right-click menu's Codex goes; null while the picker is shut.
  const [monsterPickAt, setMonsterPickAt] = useState<CanvasPoint | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  // Who's at the table while hosting: whom a handout can go to.
  const tablePlayers = usePartyPresence(hostedSessionId ?? null, campaign?.id ?? null)
  const rootRef = useRef<HTMLDivElement>(null)
  useQuickSearchKey(rootRef, setSearchOpen)

  /** Puts a monster's statblock on the canvas (or brings its box into view) — at `at`, or a free spot. */
  function openMonster(monster: BestiaryMonster, at?: CanvasPoint): void {
    putEntry('dm', { kind: 'monster', monster })
    canvasRef.current?.openAt(`monster:${monster.index}`, DYNAMIC_SIZE.monster, at)
  }
  // --- Sessions: each one's scenes are note boxes in a collection of its own, in the order they read (see readingOrder) ---
  const sessionHere = nav.names[nav.names.length - 1]?.sessionDeckId
  const deckHere = sessionHere ? decksApi.decks.find((d) => d.id === sessionHere) : undefined
  const sceneIdsHere = new Set(deckHere?.scenes.map((s) => `note:${s.noteId}`))
  // Ordered by hand: the session's own order (of the scenes with a box here); otherwise the order the boxes read in.
  const manualHere = !!deckHere && !!nav.names[nav.names.length - 1]?.manualOrder
  const sequence = !deckHere
    ? undefined
    : manualHere
      ? deckHere.scenes.map((s) => `note:${s.noteId}`).filter((id) => layout.nodes.some((n) => n.id === id && !n.pinned))
      : readingOrder(layout.nodes.filter((n) => sceneIdsHere.has(n.id)))
  const sequenceKey = sequence?.join(',')
  const liveDeck = decksApi.decks.find((d) => d.id === decksApi.live.deckId)
  const liveNoteId = liveDeck?.scenes[decksApi.live.sceneIndex]?.noteId

  /** Puts a saved encounter's monsters into the fight. */
  function loadEncounter(monsters: BestiaryMonster[], encounterId: string): void {
    // A battle made for this encounter comes up on the battle map, so its enemies land where they were placed.
    switchToEncounterBattle(encounterId)
    setEncounter((s) => ({ ...s, combatants: [...s.combatants, ...monsters.map(monsterToCombatant)] }))
    onOpenCombat?.()
  }

  // A scene coming up while presenting — the first one, or stepping to another from anywhere — runs its cues:
  // its first music (unless that's switched off), and its first encounter if it's set to load (once a presentation,
  // so stepping back and forth doesn't add the monsters twice). Not for whatever was already live as this opened.
  const cueRun = useRef<{ key: string | null; loaded: Set<string> }>({ key: null, loaded: new Set() })
  const liveScene = liveDeck?.scenes[decksApi.live.sceneIndex]
  useEffect(() => {
    const run = cueRun.current
    if (!decksApi.live.deckId) {
      run.key = ''
      run.loaded.clear()
      return
    }
    if (!liveDeck || !liveScene) return
    const key = `${liveDeck.id}:${decksApi.live.sceneIndex}`
    const first = run.key === null
    if (run.key === key) return
    run.key = key
    if (first) return
    if (liveScene.autoMusic !== false && liveScene.music[0]) playCue(liveScene.music[0], hostedSessionId ?? null)
    const encId = liveScene.encounterIds[0]
    if (liveScene.autoEncounter && encId && !run.loaded.has(encId)) {
      const saved = loadSavedEncounters().find((e) => e.id === encId)
      if (saved) {
        run.loaded.add(encId)
        loadEncounter(resolveEncounterMonsters(saved), encId)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decksApi.live.deckId, decksApi.live.sceneIndex, liveDeck, liveScene])

  // Scenes on no canvas yet (an older session's, or one added from elsewhere) come into the session's collection,
  // after the ones there. A layout effect, so they're placed here before the canvas would give them a spot of its own.
  useLayoutEffect(() => {
    if (!deckHere || !workspace.notes) return
    const missing = deckHere.scenes.filter((s) => !nav.placed.has(`note:${s.noteId}`) && workspace.notes!.some((n) => n.id === s.noteId))
    if (missing.length === 0) return
    const there = deckHere.scenes.length - missing.length
    setLayout((l) => missing.reduce((acc, s, k) => addNode(acc, `note:${s.noteId}`, SCENE_SIZE, 0, 0, sceneSpot(there + k, SCENE_SIZE)), l))
  }, [deckHere, workspace.notes, nav.placed, setLayout])

  // Moving a scene's box changes the session's order to match; while presenting, the live scene stays the live one.
  const sentOrder = useRef('')
  /** Puts the session's scenes in this order (of box ids); scenes without a box keep their places after them. */
  function orderScenes(ids: string[]): void {
    if (!deckHere) return
    const order = ids.map((id) => id.slice('note:'.length))
    const next = [...order.map((id) => deckHere.scenes.find((s) => s.noteId === id)!).filter(Boolean), ...deckHere.scenes.filter((s) => !order.includes(s.noteId))]
    const key = next.map((s) => s.noteId).join(',')
    if (key === deckHere.scenes.map((s) => s.noteId).join(',') || key === sentOrder.current) return
    sentOrder.current = key
    void decksApi.reorderScenes(deckHere.id, next)
    if (liveDeck?.id === deckHere.id && liveNoteId) {
      const at = next.findIndex((s) => s.noteId === liveNoteId)
      if (at !== decksApi.live.sceneIndex) decksApi.setLiveSceneIndex(at)
    }
  }
  useEffect(() => {
    if (!deckHere || !sequenceKey || manualHere) return
    orderScenes(sequenceKey.split(','))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckHere, sequenceKey, manualHere])
  /** Ordering by hand on or off, kept on the session's collection. */
  function setManualOrder(on: boolean): void {
    const at = nav.path
    const cid = at[at.length - 1]
    nav.update(at.slice(0, -1), (parent) => {
      const c = parent.collections?.[cid]
      if (!c) return parent
      const rest = { ...c }
      delete rest.manualOrder
      return { ...parent, collections: { ...parent.collections, [cid]: on ? { ...rest, manualOrder: true } : rest } }
    })
  }

  /** Goes into a session's collection — making it first, with a box per scene, if it has none yet. `enter: false` only makes it. */
  function openSession(deck: SessionDeck, at?: CanvasPoint, enter = true): void {
    const found = sessionCollections(nav.root).find((s) => s.collection.sessionDeckId === deck.id)
    if (found) {
      if (enter) nav.enterPath(found.path)
      return
    }
    const cid = crypto.randomUUID()
    const box = findNode(layout, 'sessions')
    const v = layout.viewport
    const spot = at ?? (box ? { x: box.x + box.w + 32, y: box.y } : { x: (200 - v.x) / v.zoom, y: (160 - v.y) / v.zoom })
    const nodes = deck.scenes
      .filter((s) => !nav.placed.has(`note:${s.noteId}`))
      .map((s, i) => ({ id: `note:${s.noteId}`, ...sceneSpot(i, SCENE_SIZE), z: i + 1 }))
    setLayout((l) => addCollection(l, cid, deck.title || 'Untitled Session', spot, { sessionDeckId: deck.id, nodes }))
    if (enter) nav.enter(cid)
  }

  /** Where a session's collection lives, and whether its tile is closed (shelved: kept, opened from the Sessions box). */
  function sessionPlace(deck: SessionDeck): { path: string[]; shelved: boolean } | undefined {
    const found = sessionCollections(nav.root).find((s) => s.collection.sessionDeckId === deck.id)
    if (!found) return undefined
    const cid = found.path[found.path.length - 1]
    return { path: found.path, shelved: !findNode(layoutAt(nav.root, found.path.slice(0, -1)), `${COLLECTION_PREFIX}${cid}`) }
  }

  /** Puts a shelved session's tile back, in view on the canvas it lives on. */
  function unshelveSession(deck: SessionDeck): void {
    const place = sessionPlace(deck)
    if (!place?.shelved) return
    const parent = place.path.slice(0, -1)
    const tile = `${COLLECTION_PREFIX}${place.path[place.path.length - 1]}`
    nav.update(parent, (l) => {
      const v = l.viewport
      return addNode(l, tile, { w: MINI_SIZE, h: MINI_SIZE }, 0, 0, { x: snap((200 - v.x) / v.zoom), y: snap((160 - v.y) / v.zoom), w: MINI_SIZE, h: MINI_SIZE })
    })
    if (parent.join('/') === nav.path.join('/')) setTimeout(() => canvasRef.current?.reveal(tile), 0)
  }

  /** A new session with its first scene, as a tile on this canvas (not opened). */
  async function newSession(at?: CanvasPoint): Promise<void> {
    const deck = await decksApi.createDeck('Untitled Session')
    if (!deck) return
    const note = await decksApi.addScene(deck.id, 'Scene 1')
    openSession(note ? { ...deck, scenes: [{ noteId: note.id, encounterIds: [], music: [] }] } : deck, at, false)
    if (note) addNoteLocally(note)
  }

  async function addSceneAt(deck: SessionDeck, at: CanvasPoint): Promise<void> {
    const note = await decksApi.addScene(deck.id, `Scene ${deck.scenes.length + 1}`)
    if (!note) return
    // Placed before the note arrives, so the scene import above doesn't put it somewhere else first.
    canvasRef.current?.openAt(`note:${note.id}`, SCENE_SIZE, at)
    addNoteLocally(note)
  }

  function deleteScene(deck: SessionDeck, noteId: string): void {
    void decksApi.removeScene(deck.id, noteId)
    removeNoteLocally(noteId)
    setLayout((l) => removeNode(l, `note:${noteId}`))
  }

  /** The session's gone (and its scenes' notes with it) — its collection goes too. */
  function deleteSession(deck: SessionDeck): void {
    const found = sessionCollections(nav.root).find((s) => s.collection.sessionDeckId === deck.id)
    if (found) nav.update(found.path.slice(0, -1), (l) => removeCollection(l, found.path[found.path.length - 1]))
    deck.scenes.forEach((s) => removeNoteLocally(s.noteId))
  }

  const renameTimer = useRef<ReturnType<typeof setTimeout>>()
  function renameSession(deck: SessionDeck, title: string): void {
    void decksApi.renameDeck(deck.id, title)
    const found = sessionCollections(nav.root).find((s) => s.collection.sessionDeckId === deck.id)
    if (found) nav.update(found.path.slice(0, -1), (l) => ({ ...l, collections: { ...l.collections, [found.path[found.path.length - 1]]: { ...found.collection, name: title } } }))
  }
  // Renaming the session's collection (its breadcrumb) renames the session too, once typing stops.
  const canvasNav = deckHere
    ? {
        ...nav,
        rename: (name: string) => {
          nav.rename(name)
          clearTimeout(renameTimer.current)
          renameTimer.current = setTimeout(() => void decksApi.renameDeck(deckHere.id, name.trim() || 'Untitled Session'), 500)
        }
      }
    : nav

  /** Brings a scene's box into view, going into its session's collection first if need be. */
  function showScene(deck: SessionDeck | undefined, noteId: string): void {
    if (deck && deckHere?.id !== deck.id) openSession(deck)
    // After the collection's canvas has mounted.
    setTimeout(() => canvasRef.current?.reveal(`note:${noteId}`), 0)
  }

  const {
    notes,
    folders,
    error,
    tabNotes,
    openNote,
    navigateToNote,
    createNote,
    saveNote,
    deleteNote,
    addNoteLocally,
    removeNoteLocally,
    createFolder,
    renameFolder,
    moveFolder,
    deleteFolder,
    duplicateNote,
    duplicateFolder
  } = workspace

  /** Loads a note into a note's box — the active one unless `from` says which — keeping where that box sits; or reveals the note's own box if it's open already. */
  function navigate(noteId: string, from: string | null = workspace.activeId): void {
    if (from && from !== noteId && !tabNotes.some((n) => n.id === noteId)) setLayout((l) => renameNode(l, `note:${from}`, `note:${noteId}`))
    navigateToNote(noteId, from)
    canvasRef.current?.reveal(`note:${noteId}`)
  }

  function openInNewBox(noteId: string): void {
    openNote(noteId)
    canvasRef.current?.reveal(`note:${noteId}`)
  }

  const tools: ToolContents = {
    ...sharedTools,
    notes: (
      <NoteSidebar
        notes={notes ?? []}
        folders={folders ?? []}
        isDm
        activeId={workspace.activeId}
        myUserId={campaign?.dmUserId ?? null}
        campaignId={campaign?.id ?? null}
        // A note not open yet gets a box of its own; an open one is brought into view.
        onSelect={openInNewBox}
        onOpenInNewTab={openInNewBox}
        onCreateNote={async (visibility, folderId) => {
          const id = await createNote(visibility, folderId)
          if (id) canvasRef.current?.reveal(`note:${id}`)
          return id
        }}
        onCreateFolder={(visibility, name, parentFolderId) => createFolder(visibility, name, parentFolderId)}
        onRenameNote={(noteId, title) => saveNote(noteId, { title })}
        onTogglePinNote={(noteId, pinned) => saveNote(noteId, { pinned })}
        onDeleteNote={deleteNote}
        onRenameFolder={renameFolder}
        onDeleteFolder={deleteFolder}
        onMoveNote={(noteId, folderId, visibility) => saveNote(noteId, { folderId, visibility })}
        onMoveFolder={moveFolder}
        onPasteNote={duplicateNote}
        onPasteFolder={duplicateFolder}
      />
    ),
    players: {
      mini: <PartyMini sessionId={hostedSessionId ?? null} campaignId={campaign?.id ?? null} />,
      full: (
        <div style={{ overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: 'var(--space-2) var(--space-3) 0' }}>
            <span style={{ flex: 1, fontSize: 11, color: 'var(--text-muted)' }}>Stand-ins for testing, as party members:</span>
            <TestPlayersMenu />
          </div>
          <ConnectedPlayersList
            sessionId={hostedSessionId ?? null}
            campaignId={campaign?.id ?? null}
            playerCharacters={playerCharacters}
            onSelectPlayer={(userId) => canvasRef.current?.openAt(`playerSheet:${userId}`, DYNAMIC_SIZE.playerSheet)}
          />
        </div>
      )
    },
    // Calendar and Sessions always take the local/direct path, never the hosted session id: the DM is never a
    // joined participant of their own session, so routing over the relay would fail with "not connected to that
    // session". Saves and presenting still reach connected players — registerIpc.ts checks getHostedSession().
    initiative: {
      full: <DmInitiativeTool sessionId={hostedSessionId ?? null} campaignId={campaign?.id ?? null} combatCharacters={combatCharacters} onOpenMonster={(m) => openMonster(m)} />,
      mini: <InitiativeMini />
    },
    timer: { full: <TimerPanel />, mini: <TimerMini /> },
    worldmap: (
      <WorldMap
        sessionId={null}
        campaignId={campaign?.id ?? null}
        readOnly={false}
        noteTitles={(notes ?? []).map((n) => n.title).filter(Boolean)}
        onOpenNote={(title) => {
          const found = (notes ?? []).find((n) => n.title.trim().toLowerCase() === title.toLowerCase())
          if (found) openInNewBox(found.id)
        }}
        onOpenTool={(tool) => canvasRef.current?.openTool(tool)}
      />
    ),
    reputation: (
      <ReputationTracker
        sessionId={null}
        campaignId={campaign?.id ?? null}
        readOnly={false}
        noteTitles={(notes ?? []).map((n) => n.title).filter(Boolean)}
        onOpenNote={(title) => {
          const found = (notes ?? []).find((n) => n.title.trim().toLowerCase() === title.toLowerCase())
          if (found) openInNewBox(found.id)
        }}
      />
    ),
    quests: (
      <QuestLog
        sessionId={null}
        campaignId={campaign?.id ?? null}
        readOnly={false}
        noteTitles={(notes ?? []).map((n) => n.title).filter(Boolean)}
        onOpenNote={(title) => {
          const found = (notes ?? []).find((n) => n.title.trim().toLowerCase() === title.toLowerCase())
          if (found) openInNewBox(found.id)
        }}
      />
    ),
    calendar: {
      full: <CalendarPanel sessionId={null} campaignId={campaign?.id ?? null} readOnly={false} notes={notes ?? []} />,
      mini: <CalendarMini sessionId={null} campaignId={campaign?.id ?? null} />
    },
    sessions: {
      full: (
        <SessionsList
          api={decksApi}
          onOpen={(deck) => openSession(deck)}
          onNew={() => void newSession()}
          onDelete={deleteSession}
          onRename={renameSession}
          shelved={(deck) => !!sessionPlace(deck)?.shelved}
          onUnshelve={unshelveSession}
        />
      ),
      mini: <SessionsMini api={decksApi} notes={notes ?? []} />
    }
  }

  const items: CanvasItem[] = [
    ...toolItems('dm', layout, tools, TOOL_ICONS),
    ...[...tabNotes, ...(notes ?? []).filter((n) => !tabNotes.some((t) => t.id === n.id) && findNode(layout, `note:${n.id}`))].map(
      (note): CanvasItem => ({
        id: `note:${note.id}`,
        title: note.title || 'Untitled',
        icon: <FileIcon />,
        size: DYNAMIC_SIZE.note,
        onFocus: () => workspace.setActiveId(note.id),
        onClose: () => workspace.closeTab(note.id),
        // A scene in its session's collection: deleted from its own button, never just closed (it would only come back).
        ...(deckHere && sceneIdsHere.has(`note:${note.id}`) ? { noClose: true } : {}),
        actions: (hostedSessionId || (deckHere && sceneIdsHere.has(`note:${note.id}`))) && (
          <>
            {hostedSessionId && (
              // Its text without the DM-only (::) parts — every player it goes to sees the same thing.
              <ShowToPlayersButton players={tablePlayers} build={async () => ({ id: crypto.randomUUID(), title: note.title || 'Untitled', kind: 'note', markdown: stripDmAsides(note.bodyMarkdown) })} />
            )}
            {deckHere && sceneIdsHere.has(`note:${note.id}`) && <SceneDeleteButton onDelete={() => deleteScene(deckHere, note.id)} />}
          </>
        ),
        className: note.id === liveNoteId ? 'gb-canvas-node--live' : undefined,
        content: (
          <NoteEditor
            key={note.id}
            note={note}
            notes={notes ?? []}
            sessionId={hostedSessionId ?? null}
            // The DM always has edit power over notes in their own campaign — the same blanket allowance
            // campaignService.updateNote grants server-side.
            onSave={(patch) => saveNote(note.id, patch)}
            onNavigateToNote={(id) => navigate(id, note.id)}
            onOpenInNewTab={openInNewBox}
            onCreateAndLinkNote={(title) => createNote(note.visibility, null, title)}
          />
        )
      })
    ),
    // A player's sheet box stays open (and keeps its place) whether or not they're connected — live while they are, as last seen while they're not.
    ...knownSheets
      .filter((known) => findNode(layout, `playerSheet:${known.userId}`))
      .map(
        (known): CanvasItem => ({
          id: `playerSheet:${known.userId}`,
          title: `${known.sheet.name || 'Unnamed Character'} — ${known.live ? 'read only' : `last seen ${new Date(known.seenAt).toLocaleDateString()}`}`,
          icon: <UserIcon />,
          size: DYNAMIC_SIZE.playerSheet,
          content: (
            <CharacterSheetEditor key={known.sheet.id} character={known.sheet} readOnly canRoll sessionId={hostedSessionId ?? null} onSave={() => {}} />
          )
        })
      ),
    ...entryItems(
      'dm',
      layout,
      entries,
      (nodeId, monster) => setEditingStatblock({ nodeId, monster: monster as PackMonster }),
      hostedSessionId
        ? (image) => (
            <ShowToPlayersButton
              players={tablePlayers}
              build={async () => {
                const src = await getCanvasImage(image.id)
                return src ? { id: crypto.randomUUID(), title: image.name, kind: 'image', src } : null
              }}
            />
          )
        : undefined
    )
  ]

  async function newNoteAt(visibility: 'dm' | 'shared', at: CanvasPoint): Promise<void> {
    const id = await createNote(visibility)
    if (id) canvasRef.current?.openAt(`note:${id}`, DYNAMIC_SIZE.note, at)
  }

  /** The right-click menu on empty canvas: new things to put at the spot clicked (Add ▸), then players' sheets to open there. */
  function contextMenu(at: CanvasPoint): { add: ContextMenuItem[]; open: ContextMenuItem[] } {
    const add: ContextMenuItem[] = []
    if (campaign) {
      add.push(
        { label: 'Party note', icon: <FileIcon />, onSelect: () => void newNoteAt('shared', at) },
        { label: 'DM-only note', icon: <FileIcon />, onSelect: () => void newNoteAt('dm', at) }
      )
    }
    if (deckHere) add.unshift({ label: 'Scene', icon: <SessionIcon />, onSelect: () => void addSceneAt(deckHere, at) })
    add.push({ label: 'Monster statblock…', icon: <PawIcon />, onSelect: () => setMonsterPickAt(at) })
    if (campaign) add.push({ label: 'Session', icon: <SessionIcon />, onSelect: () => void newSession(at) })
    const open: ContextMenuItem[] = knownSheets.map(
      (known): ContextMenuItem => ({
        label: `Open ${known.sheet.name || 'Unnamed Character'}’s sheet${known.live ? '' : ' (away)'}`,
        icon: <UserIcon />,
        onSelect: () => canvasRef.current?.openAt(`playerSheet:${known.userId}`, DYNAMIC_SIZE.playerSheet, at)
      })
    )
    // The built-in tools aren't new things, so they're not under Add: one Tools ▸ to open any that's closed, here.
    const closedTools = TOOLS_BY_MODE.dm.filter((kind) => tools[kind] !== undefined && !HEADER_TOOLS.includes(kind) && !findNode(layout, kind))
    if (closedTools.length > 0) {
      open.push({
        label: 'Open a tool here',
        separatorBefore: true,
        submenu: closedTools.map((kind) => ({ label: TOOL_META[kind].title, icon: TOOL_ICONS[kind], onSelect: () => canvasRef.current?.openTool(kind, at) }))
      })
    }
    return { add, open }
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'flex', flex: 1, minHeight: 0 }}>
      <QuickSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        quests={{ campaignId: campaign?.id ?? null, sessionId: null, onOpen: () => canvasRef.current?.openTool('quests'), onOpenTool: (tool) => canvasRef.current?.openTool(tool) }}
        onOpenPage={(url) => canvasRef.current?.openBrowser(url)}
        tools={TOOLS_BY_MODE.dm
          .filter((kind) => !HEADER_TOOLS.includes(kind))
          .map((kind) => ({ id: kind, name: TOOL_META[kind].title, hint: 'Tool', icon: TOOL_ICONS[kind], onSelect: () => canvasRef.current?.openTool(kind) }))}
        notes={(notes ?? []).map((note) =>
          noteTarget(note, () => {
            const deck = note.sceneDeckId ? decksApi.decks.find((d) => d.id === note.sceneDeckId) : undefined
            if (deck) showScene(deck, note.id)
            else openInNewBox(note.id)
          })
        )}
        onOpenMonster={(monster) => openMonster(monster)}
      />
      {error && (
        <p
          key={error}
          className="gb-toast-fade"
          style={{
            position: 'absolute',
            zIndex: 10,
            color: 'var(--danger)',
            fontSize: 13,
            padding: 'var(--space-2) var(--space-5)',
            background: 'var(--bg-surface)'
          }}
        >
          {error}
        </p>
      )}
      {decksApi.live.deckId && (
        <SessionPresenter
          api={decksApi}
          notes={notes ?? []}
          hostedSessionId={hostedSessionId ?? null}
          onStep={(noteId) => showScene(liveDeck, noteId)}
          onLoadEncounter={loadEncounter}
        />
      )}
      <Canvas
        // A fresh canvas (its own pan and zoom) for each collection opened.
        key={nav.path.join('/')}
        nav={canvasNav}
        sequence={sequence}
        onSequenceMove={
          manualHere && sequence
            ? (id, to) => {
                const rest = sequence.filter((x) => x !== id)
                orderScenes([...rest.slice(0, to), id, ...rest.slice(to)])
              }
            : undefined
        }
        crumbExtra={
          deckHere && (
          <>
          <Button
            variant="secondary"
            className="gb-session-crumb-action"
            style={{ fontSize: 12 }}
            aria-pressed={manualHere}
            onClick={() => setManualOrder(!manualHere)}
            title={manualHere ? 'Scenes are in the order you set: click a scene’s number to move it. Click to order them by where their boxes are instead.' : 'Scenes are in the order their boxes read, left to right and top to bottom. Click to set the order by hand instead.'}
          >
            {manualHere ? 'Order: set by hand' : 'Order: by layout'}
          </Button>
          {liveDeck?.id === deckHere.id ? (
            <Button variant="secondary" className="gb-session-crumb-action" style={{ fontSize: 12 }} onClick={decksApi.stopPresenting}>
              Stop presenting
            </Button>
          ) : (
            <Button variant="primary" className="gb-session-crumb-action" style={{ fontSize: 12 }} disabled={deckHere.scenes.length === 0} onClick={() => decksApi.present(deckHere.id)}>
              ▶ Present
            </Button>
          )}
          </>
          )
        }
        ref={canvasRef}
        mode="dm"
        layout={layout}
        setLayout={setLayout}
        items={items}
        toolIcons={TOOL_ICONS}
        // The timer has its own live button in the dock (below), not a plain icon.
        hiddenTools={[...HEADER_TOOLS, 'timer']}
        dock={<TimerDockButton onOpen={() => canvasRef.current?.openTool('timer')} onClose={() => canvasRef.current?.closeTool('timer')} />}
        floating={<DiceButton sessionId={hostedSessionId ?? null} />}
        contextMenu={contextMenu}
        title={campaign?.name}
        titleExtra={campaign && <HostButton hostedSessionId={hostedSessionId ?? null} onHostedSessionChange={onHostedSessionChange} />}
        corner={
          <>
            <CampaignSwitcher
              canCreate
              current={campaign}
              onSelect={onSwitchCampaign}
              onCurrentDeleted={onCampaignDeleted}
              hostedSessionId={hostedSessionId ?? null}
            />
            <QuickSearchButton onClick={() => setSearchOpen(true)} />
          </>
        }
      />
      {editingStatblock && (
        <MonsterEditor
          monster={editingStatblock.monster}
          onClose={() => setEditingStatblock(null)}
          onSaved={(saved) => {
            const { nodeId } = editingStatblock
            const nextId = `monster:${saved.index}`
            // A copy is a different creature: its box takes the copy's id, where the original's box was.
            if (nextId !== nodeId) {
              setLayout((l) => renameNode(l, nodeId, nextId))
              dropEntry('dm', nodeId)
            }
            putEntry('dm', { kind: 'monster', monster: saved })
            setEditingStatblock(null)
          }}
        />
      )}
      {monsterPickAt && (
        <Suspense fallback={<GoblinLoader overlay size="lg" label="Opening the Codex" />}>
          <Bestiary
            onClose={() => setMonsterPickAt(null)}
            onPick={(monster) => {
              openMonster(monster, monsterPickAt)
              setMonsterPickAt(null)
            }}
            sessionId={hostedSessionId ?? null}
          />
        </Suspense>
      )}
    </div>
  )
}
