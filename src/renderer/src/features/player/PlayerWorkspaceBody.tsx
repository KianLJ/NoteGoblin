import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { WorldMap } from '../campaigns/WorldMap'
import { ReputationTracker } from '../campaigns/ReputationTracker'
import { GoblinLoader } from '../../ui/GoblinLoader'
import { CalendarMini, PartyMini, PlayerInitiativeMini, PlayerSessionsMini } from '../canvas/toolMinis'
import { createPortal } from 'react-dom'
import { PlayerSidebar } from './PlayerSidebar'
import { PartyList, usePartyPresence } from './PartyList'
import { PlayerInitiativeView } from './PlayerInitiativeView'
import { CharacterSheetEditor } from './CharacterSheetEditor'
import { CharacterCreator } from './creator/CharacterCreator'
import { CharacterSwitcher, LeaveTableButton } from './CharacterSwitcher'
import { ForceRollPrompt } from './ForceRollPrompt'
import { UserIcon } from './icons'
import { NoteEditor } from '../campaigns/NoteEditor'
import { CalendarPanel } from '../campaigns/CalendarPanel'
import { PlayerSessions } from '../campaigns/PlayerSessions'
import { FileIcon } from '../campaigns/icons'
import { VehiclesPanel } from '../vehicles/VehiclesPanel'
import { DiceButton } from '../dice/DiceButton'
import { Canvas, type CanvasHandle, type CanvasPoint } from '../canvas/Canvas'
import { toolItems, type CanvasItem, type ToolContents } from '../canvas/toolItems'
import { KeepAliveOutlet, useKeepAliveHost } from '../canvas/KeepAlive'
import { useCanvasLayout } from '../canvas/useCanvasLayout'
import { renameNode } from '@shared/canvasLayout'
import { DYNAMIC_SIZE, HEADER_TOOLS, TOOL_META, TOOLS_BY_MODE } from '@shared/canvasTools'
import { findNode } from '@shared/canvasLayout'
import type { ContextMenuItem } from '../../ui/ContextMenu'
import { TOOL_ICONS } from '../canvas/toolIcons'
import { QuickSearch, QuickSearchButton, noteTarget, useQuickSearchKey } from '../canvas/QuickSearch'
import { HandoutViewer } from './HandoutViewer'
import { QuestRewardNotice } from './QuestRewardNotice'
import { QuestAnnouncer } from './QuestAnnouncer'
import { addCoins, takeCoins } from '@shared/quests'
import { QuestLog } from '../campaigns/QuestLog'
import { useCanvasEntries } from '../canvas/canvasEntries'
import { entryItems } from '../canvas/entryItems'
import { Modal } from '../../ui/Modal'
import { Button } from '../../ui/Button'
import type { PlayerWorkspace, PlayerTabRef } from './usePlayerWorkspace'
import type { CharacterSheet } from '@shared/ipc'

interface PlayerWorkspaceBodyProps {
  workspace: PlayerWorkspace
  /** Your own relay account id — null until the relay connects. This is what authorUserId on a note/folder you create gets stamped with (see sessionHost.ts's dispatch()), so it's what ownership checks in the notes tree compare against. */
  myUserId: string | null
  /** The joined session id — for the Party list's presence subscription, and for CharacterSwitcher's own Leave control. */
  sessionId: string | null
  connectedLabel: string | null
  /** Fired after sessions.leave() resolves — clears the parent's joinedSession state, same as the DM-initiated disconnect path AppShell already handles. */
  onLeaveSession: () => void
  /** The tools the app shell provides to both modes (Codex, Content Packs, Messages, ...). */
  sharedTools: ToolContents
  canvasRef: RefObject<CanvasHandle>
}

function tabId(ref: PlayerTabRef): string {
  return `${ref.kind}:${ref.id}`
}

/**
 * The player's workspace: a canvas (see canvas/Canvas.tsx) holding the notes
 * tree, a box for each open character and note (usePlayerWorkspace's open
 * tabs — the box you last clicked into is the active tab), a party member's
 * sheet when you open one, and the table's tools.
 */
export function PlayerWorkspaceBody({
  workspace,
  myUserId,
  sessionId,
  connectedLabel,
  onLeaveSession,
  sharedTools,
  canvasRef
}: PlayerWorkspaceBodyProps): JSX.Element {
  const {
    characters,
    activeCampaign,
    notes,
    folders,
    sessionDecks,
    activeTab,
    activeCharacter,
    lastActiveCharacter,
    activeNote,
    tabItems,
    openTab,
    navigateToNote,
    createCharacter,
    saveCharacter,
    deleteCharacter,
    createNote,
    saveNote,
    deleteNote,
    createFolder,
    renameFolder,
    moveFolder,
    deleteFolder,
    duplicateNote,
    duplicateFolder,
    error,
    isOffline,
    offlineSyncedAt,
    offlineSnapshots,
    openOfflineCampaign,
    closeOfflineCampaign,
    deleteOfflineCampaign,
    campaignPacks
  } = workspace
  const [layout, setLayout, nav] = useCanvasLayout('player')
  const entries = useCanvasEntries('player')
  const party = usePartyPresence(sessionId, !isOffline ? (activeCampaign?.id ?? null) : null)

  // The DM starting a presentation brings the Sessions box out for a player who doesn't have it on their canvas
  // (once per presentation — closing it again while the DM steps through leaves it closed).
  const placedRef = useRef(nav.placed)
  placedRef.current = nav.placed
  const campaignIdForDecks = !isOffline ? (activeCampaign?.id ?? null) : null
  useEffect(() => {
    if (!sessionId || !campaignIdForDecks) return
    let lastDeck: string | null = null
    return window.goblin.sessionDecks.onSceneChanged((update) => {
      if (update.campaignId !== campaignIdForDecks) return
      if (update.deckId && update.deckId !== lastDeck && !placedRef.current.has('sessions')) canvasRef.current?.openTool('sessions')
      lastDeck = update.deckId
    })
  }, [sessionId, campaignIdForDecks, canvasRef])
  // The turn order only learns about the fight from live pushes (no fetch on mount), so it keeps running while its box is closed.
  const initiativeHost = useKeepAliveHost()

  // The character creator takes the whole page: a new character, or an existing one being edited.
  const [creator, setCreator] = useState<{ editing: CharacterSheet | null } | null>(null)

  // Prompted once per fresh join (not on every reconnect/resync of the same
  // session, and not just from reopening the app while already in one) —
  // refreshCharacters already picked a reasonable default (whichever
  // character you last touched) so the table isn't sitting empty while you
  // decide, but a new session is exactly the moment "which of my characters
  // am I playing at this table" actually needs an answer instead of a
  // silent guess. Still fully optional — closing it leaves that default in
  // place, and the switcher in the canvas's corner can change it anytime after.
  const [characterPromptOpen, setCharacterPromptOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  // Titles of the notes you have, so a handout's links show as links.
  const knownTitles = useMemo(() => new Set((notes ?? []).map((n) => n.title.toLowerCase())), [notes])
  const rootRef = useRef<HTMLDivElement>(null)
  useQuickSearchKey(rootRef, setSearchOpen)
  const prevSessionIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (sessionId && sessionId !== prevSessionIdRef.current && characters && characters.length > 1) {
      setCharacterPromptOpen(true)
    }
    prevSessionIdRef.current = sessionId
  }, [sessionId, characters])

  // A party member's sheet, viewed read-only from the Party tool — a one-off
  // fetch (see window.goblin.characters.getPlayerCharacter), not something
  // kept live, so it reflects whatever they had selected at the moment you
  // clicked rather than updating as they play.
  const [viewedPartyMemberUserId, setViewedPartyMemberUserId] = useState<string | null>(null)
  const [viewedPartyMemberCharacter, setViewedPartyMemberCharacter] = useState<CharacterSheet | null | undefined>(undefined)

  async function viewPartyMemberCharacter(userId: string): Promise<void> {
    setViewedPartyMemberUserId(userId)
    setViewedPartyMemberCharacter(undefined)
    canvasRef.current?.reveal('partySheet:viewed')
    const result = await window.goblin.characters.getPlayerCharacter(userId)
    setViewedPartyMemberCharacter(result.ok ? result.data : null)
  }

  function open(ref: PlayerTabRef): void {
    openTab(ref)
    canvasRef.current?.reveal(tabId(ref))
  }

  const openTabAndReveal = (ref: PlayerTabRef): void => open(ref)

  /** Loads a note into a box — the active one unless `from` says which — keeping where that box sits; or reveals the note's own box if it's open already. */
  function navigate(noteId: string, from: PlayerTabRef | null = activeTab): void {
    const target: PlayerTabRef = { kind: 'note', id: noteId }
    const alreadyOpen = tabItems.some((t) => tabId(t.ref) === tabId(target))
    if (from && !alreadyOpen) setLayout((l) => renameNode(l, tabId(from), tabId(target)))
    navigateToNote(noteId, from)
    canvasRef.current?.reveal(tabId(target))
  }

  if (creator) {
    const editing = creator.editing
    return (
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <CharacterCreator
          key={editing?.id ?? 'new'}
          initial={editing}
          // A new character in a campaign starts on that campaign's packs.
          campaignPackIds={activeCampaign && campaignPacks ? campaignPacks.map((p) => p.id) : null}
          onCreate={(name, sheet) => {
            if (editing) {
              void saveCharacter(editing.id, { ...sheet, name })
              open({ kind: 'character', id: editing.id })
            } else createCharacter(name, sheet)
            setCreator(null)
          }}
          onClose={() => setCreator(null)}
        />
      </div>
    )
  }

  const tools: ToolContents = {
    ...sharedTools,
    notes: (
      <PlayerSidebar
        activeCampaign={activeCampaign}
        notes={notes}
        folders={folders}
        activeTab={activeTab}
        myUserId={myUserId}
        // A note not open yet gets a box of its own; an open one is brought into view.
        onSelectNote={(id) => open({ kind: 'note', id })}
        onOpenNoteInNewTab={(id) => open({ kind: 'note', id })}
        onCreateNote={createNote}
        onCreateFolder={createFolder}
        onRenameNote={(noteId, title) => saveNote(noteId, { title })}
        onTogglePinNote={(noteId, pinned) => saveNote(noteId, { pinned })}
        onDeleteNote={deleteNote}
        onRenameFolder={renameFolder}
        onDeleteFolder={deleteFolder}
        onMoveNote={(noteId, folderId, visibility) => saveNote(noteId, { folderId, visibility })}
        onMoveFolder={moveFolder}
        onPasteNote={duplicateNote}
        onPasteFolder={duplicateFolder}
        connectedLabel={connectedLabel}
        isOffline={isOffline}
        offlineSyncedAt={offlineSyncedAt}
        offlineSnapshots={offlineSnapshots}
        onOpenOfflineCampaign={openOfflineCampaign}
        onCloseOfflineCampaign={closeOfflineCampaign}
        onDeleteOfflineCampaign={deleteOfflineCampaign}
      />
    ),
    party: {
      mini: <PartyMini sessionId={sessionId} campaignId={!isOffline ? (activeCampaign?.id ?? null) : null} />,
      full: (
        <PartyList
          sessionId={sessionId}
          campaignId={!isOffline ? (activeCampaign?.id ?? null) : null}
          myUserId={myUserId}
          activeNote={activeNote}
          onToggleEditor={(noteId, userId, grant) => {
            const note = notes?.find((n) => n.id === noteId)
            if (!note) return
            const next = grant ? [...note.editorUserIds, userId] : note.editorUserIds.filter((id) => id !== userId)
            saveNote(noteId, { editorUserIds: next })
          }}
          onViewCharacter={viewPartyMemberCharacter}
        />
      )
    },
    initiative: { full: <KeepAliveOutlet host={initiativeHost} />, mini: <PlayerInitiativeMini sessionId={sessionId} /> },
    // The DM's world map, through the fog, with the pins they've shown.
    worldmap: (
      <WorldMap
        sessionId={sessionId}
        campaignId={!isOffline ? (activeCampaign?.id ?? null) : null}
        readOnly
        onOpenNote={(title) => {
          const found = (notes ?? []).find((n) => n.title.trim().toLowerCase() === title.toLowerCase())
          if (found) open({ kind: 'note', id: found.id })
        }}
        onOpenTool={(tool) => canvasRef.current?.openTool(tool)}
      />
    ),
    // Only the people and powers the DM has shown the party, without the DM's notes.
    reputation: (
      <ReputationTracker
        sessionId={sessionId}
        campaignId={!isOffline ? (activeCampaign?.id ?? null) : null}
        readOnly
        onOpenNote={(title) => {
          const found = (notes ?? []).find((n) => n.title.trim().toLowerCase() === title.toLowerCase())
          if (found) open({ kind: 'note', id: found.id })
        }}
      />
    ),
    // Only the quests the DM has shown the party.
    quests: (
      <QuestLog
        sessionId={sessionId}
        campaignId={!isOffline ? (activeCampaign?.id ?? null) : null}
        readOnly
        onOpenNote={(title) => {
          const found = (notes ?? []).find((n) => n.title.trim().toLowerCase() === title.toLowerCase())
          if (found) open({ kind: 'note', id: found.id })
        }}
        // Coins out of the stash go to the character you're playing, and coins put in come out of their purse.
        purse={
          lastActiveCharacter
            ? {
                name: lastActiveCharacter.name || 'your character',
                give: (coin, n) => void saveCharacter(lastActiveCharacter.id, addCoins(lastActiveCharacter, { [coin]: n })),
                take: (coin, n) => {
                  const left = takeCoins(lastActiveCharacter, coin, n)
                  if (left) void saveCharacter(lastActiveCharacter.id, left)
                  return !!left
                }
              }
            : undefined
        }
      />
    ),
    calendar: {
      full: <CalendarPanel sessionId={sessionId} campaignId={!isOffline ? (activeCampaign?.id ?? null) : null} readOnly />,
      mini: <CalendarMini sessionId={sessionId} campaignId={!isOffline ? (activeCampaign?.id ?? null) : null} />
    },
    sessions: {
      mini: (
        <PlayerSessionsMini
          sessionId={sessionId}
          campaignId={activeCampaign?.id ?? null}
          notes={notes ?? []}
          offlineDecks={isOffline ? (sessionDecks ?? []) : null}
          onOpenNote={(id) => openTabAndReveal({ kind: 'note', id })}
        />
      ),
      full: (
        <PlayerSessions
          sessionId={sessionId}
          // Stays set while offline (unlike Calendar's), so a cached deck list still has something to key off of.
          campaignId={activeCampaign?.id ?? null}
          notes={notes ?? []}
          // Only when asked: a box of its own, never swapped into the note you had open.
          onOpenNote={(id) => openTabAndReveal({ kind: 'note', id })}
          offlineDecks={isOffline ? (sessionDecks ?? []) : null}
        />
      )
    }
  }

  const items: CanvasItem[] = [...toolItems('player', layout, tools, TOOL_ICONS), ...entryItems('player', layout, entries)]
  for (const { ref, title } of tabItems) {
    if (ref.kind === 'character') {
      const character = characters?.find((c) => c.id === ref.id)
      if (!character) continue
      items.push({
        id: tabId(ref),
        title: character.name || 'Unnamed Character',
        icon: <UserIcon />,
        size: DYNAMIC_SIZE.character,
        onFocus: () => {
          if (!activeTab || tabId(activeTab) !== tabId(ref)) openTab(ref)
        },
        onClose: () => workspace.closeTab(ref),
        content: <CharacterSheetEditor key={character.id} character={character} onSave={(patch) => saveCharacter(character.id, patch)} sessionId={sessionId} />
      })
    } else {
      const note = notes?.find((n) => n.id === ref.id)
      if (!note) continue
      items.push({
        id: tabId(ref),
        title: title || 'Untitled',
        icon: <FileIcon />,
        size: DYNAMIC_SIZE.note,
        onFocus: () => {
          if (!activeTab || tabId(activeTab) !== tabId(ref)) openTab(ref)
        },
        onClose: () => workspace.closeTab(ref),
        content: (
          <NoteEditor
            key={note.id}
            note={note}
            notes={notes ?? []}
            sessionId={sessionId}
            readOnly={
              isOffline ||
              // A scene is always DM-authored/edited — never editable by a
              // player even in the (currently unreachable, but not worth
              // relying on) case an editor grant somehow got applied to one.
              !!note.sceneDeckId ||
              (note.authorUserId !== myUserId && !note.editorUserIds.includes(myUserId ?? ''))
            }
            hideMonsters={!!sessionId}
            onSave={(patch) => saveNote(note.id, patch)}
            onNavigateToNote={(id) => navigate(id, ref)}
            onOpenInNewTab={(id) => open({ kind: 'note', id })}
            onCreateAndLinkNote={(linkTitle) => createNote(note.visibility, null, linkTitle)}
          />
        )
      })
    }
  }
  if (viewedPartyMemberUserId) {
    items.push({
      id: 'partySheet:viewed',
      title:
        viewedPartyMemberCharacter === undefined
          ? 'Loading…'
          : viewedPartyMemberCharacter
            ? `${viewedPartyMemberCharacter.name || 'Unnamed Character'} — read only`
            : 'Character unavailable',
      icon: <UserIcon />,
      size: DYNAMIC_SIZE.partySheet,
      onClose: () => setViewedPartyMemberUserId(null),
      content: viewedPartyMemberCharacter ? (
        <CharacterSheetEditor key={viewedPartyMemberCharacter.id} character={viewedPartyMemberCharacter} readOnly onSave={() => {}} />
      ) : (
        viewedPartyMemberCharacter === undefined ? (
          <GoblinLoader label="Fetching their sheet" />
        ) : (
          <p style={{ padding: 'var(--space-4)', fontSize: 13, color: 'var(--text-muted)' }}>Couldn’t load that character — they may have disconnected or changed selection.</p>
        )
      )
    })
  }

  async function newNoteAt(visibility: 'shared' | 'private', at: CanvasPoint): Promise<void> {
    const id = await createNote(visibility)
    if (id) canvasRef.current?.openAt(`note:${id}`, DYNAMIC_SIZE.note, at)
  }

  /** The right-click menu on empty canvas: new things to put at the spot clicked (Add ▸), then sheets to open there. */
  function contextMenu(at: CanvasPoint): { add: ContextMenuItem[]; open: ContextMenuItem[] } {
    const add: ContextMenuItem[] = []
    if (activeCampaign && !isOffline) {
      add.push(
        { label: 'Party note', icon: <FileIcon />, onSelect: () => void newNoteAt('shared', at) },
        { label: 'Private note', icon: <FileIcon />, onSelect: () => void newNoteAt('private', at) }
      )
    }
    add.push({ label: 'Character…', icon: <UserIcon />, onSelect: () => setCreator({ editing: null }) })
    const open: ContextMenuItem[] = [
      ...(characters ?? []).map(
        (c): ContextMenuItem => ({
          label: `Open ${c.name || 'Unnamed Character'}’s sheet`,
          icon: <UserIcon />,
          onSelect: () => {
            canvasRef.current?.openAt(`character:${c.id}`, DYNAMIC_SIZE.character, at)
            openTabAndReveal({ kind: 'character', id: c.id })
          }
        })
      ),
      ...party
        .filter((p) => p.userId !== myUserId && p.characterName)
        .map(
          (p, i): ContextMenuItem => ({
            label: `Open ${p.characterName}’s sheet (${p.displayName})`,
            icon: <UserIcon />,
            separatorBefore: i === 0,
            onSelect: () => {
              canvasRef.current?.openAt('partySheet:viewed', DYNAMIC_SIZE.partySheet, at)
              void viewPartyMemberCharacter(p.userId)
            }
          })
        )
    ]
    // The built-in tools aren't new things, so they're not under Add: one Tools ▸ to open any that's closed, here.
    const closedTools = TOOLS_BY_MODE.player.filter((kind) => tools[kind] !== undefined && !HEADER_TOOLS.includes(kind) && !findNode(layout, kind))
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
        quests={{ campaignId: !isOffline ? (activeCampaign?.id ?? null) : null, sessionId, onOpen: () => canvasRef.current?.openTool('quests'), onOpenTool: (tool) => canvasRef.current?.openTool(tool) }}
        onOpenPage={(url) => canvasRef.current?.openBrowser(url)}
        tools={[
          ...TOOLS_BY_MODE.player
            .filter((kind) => tools[kind] !== undefined && !HEADER_TOOLS.includes(kind))
            .map((kind) => ({ id: kind, name: TOOL_META[kind].title, hint: 'Tool', icon: TOOL_ICONS[kind], onSelect: () => canvasRef.current?.openTool(kind) })),
          ...(characters ?? []).map((c) => ({ id: `character:${c.id}`, name: c.name || 'Unnamed Character', hint: 'Character', icon: <UserIcon />, onSelect: () => open({ kind: 'character', id: c.id }) }))
        ]}
        notes={(notes ?? []).map((note) => noteTarget(note, () => open({ kind: 'note', id: note.id })))}
      />
      <HandoutViewer knownTitles={knownTitles} />
      <QuestAnnouncer sessionId={sessionId} campaignId={!isOffline ? (activeCampaign?.id ?? null) : null} onOpenQuests={() => canvasRef.current?.openTool('quests')} />
      <QuestRewardNotice
        character={lastActiveCharacter}
        onApply={(c, reward) =>
          void saveCharacter(c.id, {
            experiencePoints: (c.experiencePoints ?? 0) + reward.xp,
            ...addCoins(c, reward.coins)
          })
        }
      />
      <Modal open={characterPromptOpen && !!characters} onClose={() => setCharacterPromptOpen(false)} width={400}>
        <h2 style={{ margin: '0 0 4px', fontFamily: 'var(--font-display)', fontSize: 18 }}>Which character?</h2>
        <p style={{ margin: '0 0 var(--space-3)', fontSize: 13, color: 'var(--text-muted)' }}>
          Choose who you're playing at this table — you can always switch later from the bottom-left corner.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(characters ?? []).map((c) => (
            <Button
              key={c.id}
              variant={activeCharacter?.id === c.id ? 'primary' : 'secondary'}
              onClick={() => {
                open({ kind: 'character', id: c.id })
                setCharacterPromptOpen(false)
              }}
              style={{ justifyContent: 'flex-start' }}
            >
              {c.name || 'Unnamed Character'}
            </Button>
          ))}
        </div>
      </Modal>

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

      <Canvas
        // A fresh canvas (its own pan and zoom) for each collection opened.
        key={nav.path.join('/')}
        nav={nav}
        ref={canvasRef}
        mode="player"
        layout={layout}
        setLayout={setLayout}
        items={items}
        toolIcons={TOOL_ICONS}
        hiddenTools={HEADER_TOOLS}
        contextMenu={contextMenu}
        // A saved layout's note and character boxes only show while their tab is open — so loading it opens them.
        onRestoreBoxes={(ids) => {
          for (const id of ids) {
            const [kind, ...rest] = id.split(':')
            const ref = { kind, id: rest.join(':') } as PlayerTabRef
            if ((kind === 'note' && notes?.some((n) => n.id === ref.id)) || (kind === 'character' && characters?.some((c) => c.id === ref.id))) {
              if (!tabItems.some((t) => tabId(t.ref) === id)) openTab(ref)
            }
          }
        }}
        floating={<DiceButton sessionId={sessionId} />}
        title={sessionId && !isOffline ? activeCampaign?.name : undefined}
        titleExtra={sessionId && <LeaveTableButton onLeft={onLeaveSession} />}
        corner={
          <>
            <CharacterSwitcher
              characters={characters}
              current={lastActiveCharacter}
              onSelect={(character) => open({ kind: 'character', id: character.id })}
              onRequestCreate={() => setCreator({ editing: null })}
              onRequestEdit={(character) => setCreator({ editing: character })}
              onDelete={(character) => deleteCharacter(character.id)}
              sessionId={sessionId}
            />
            <QuickSearchButton onClick={() => setSearchOpen(true)} />
          </>
        }
      />

      {createPortal(
        // The turn order, and the party's vehicles beside it.
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', flex: 1, minHeight: 0, overflow: 'auto' }}>
          <div style={{ minHeight: 0, overflowY: 'auto', borderRight: '1px solid var(--border-subtle)' }}>
            <PlayerInitiativeView sessionId={sessionId} />
          </div>
          <div style={{ minHeight: 0 }}>
            <VehiclesPanel sessionId={sessionId} rollSessionId={sessionId} campaignId={!isOffline ? (activeCampaign?.id ?? null) : null} readOnly myUserId={myUserId} />
          </div>
        </div>,
        initiativeHost
      )}
      {/* The character the table sees you playing, even while a note is the box in front. */}
      <ForceRollPrompt sessionId={sessionId} character={lastActiveCharacter ?? null} />
    </div>
  )
}
