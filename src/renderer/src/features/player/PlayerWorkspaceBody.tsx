import { useEffect, useRef, useState } from 'react'
import { PlayerSidebar } from './PlayerSidebar'
import { PartySidebar } from './PartySidebar'
import { CharacterSheetEditor } from './CharacterSheetEditor'
import { CharacterCreationWizard } from './CharacterCreationWizard'
import { CharacterSwitcher } from './CharacterSwitcher'
import { NoteEditor } from '../campaigns/NoteEditor'
import { AccountSettingsButton } from '../account/AccountSettingsButton'
import { Modal } from '../../ui/Modal'
import { Button } from '../../ui/Button'
import type { PlayerWorkspace } from './usePlayerWorkspace'
import type { CharacterSheet } from '@shared/ipc'

interface PlayerWorkspaceBodyProps {
  workspace: PlayerWorkspace
  /** Your own relay account id — null until the relay connects. This is what authorUserId on a note/folder you create gets stamped with (see sessionHost.ts's dispatch()), so it's what ownership checks in the sidebar compare against. */
  myUserId: string | null
  /** The joined session id — needed directly (not just via workspace) for PartySidebar's presence subscription. */
  sessionId: string | null
  connectedLabel: string | null
}

export function PlayerWorkspaceBody({
  workspace,
  myUserId,
  sessionId,
  connectedLabel
}: PlayerWorkspaceBodyProps): JSX.Element {
  const {
    characters,
    activeCampaign,
    notes,
    folders,
    activeTab,
    activeCharacter,
    lastActiveCharacter,
    activeNote,
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
    closeOfflineCampaign
  } = workspace

  const [wizardOpen, setWizardOpen] = useState(false)

  // Prompted once per fresh join (not on every reconnect/resync of the same
  // session, and not just from reopening the app while already in one) —
  // refreshCharacters already picked a reasonable default (whichever
  // character you last touched) so the table isn't sitting empty while you
  // decide, but a new session is exactly the moment "which of my characters
  // am I playing at this table" actually needs an answer instead of a
  // silent guess. Still fully optional — closing it leaves that default in
  // place, and the switcher in the corner can change it anytime after.
  const [characterPromptOpen, setCharacterPromptOpen] = useState(false)
  const prevSessionIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (sessionId && sessionId !== prevSessionIdRef.current && characters && characters.length > 1) {
      setCharacterPromptOpen(true)
    }
    prevSessionIdRef.current = sessionId
  }, [sessionId, characters])

  // A party member's sheet, viewed read-only via PartySidebar — a one-off
  // fetch (see window.goblin.characters.getPlayerCharacter), not something
  // kept live, so it reflects whatever they had selected at the moment you
  // clicked rather than updating as they play. Takes over the main pane
  // (same precedence CampaignWorkspace.tsx gives its own DM-side version)
  // until explicitly closed.
  const [viewedPartyMemberUserId, setViewedPartyMemberUserId] = useState<string | null>(null)
  const [viewedPartyMemberCharacter, setViewedPartyMemberCharacter] = useState<CharacterSheet | null | undefined>(undefined)

  async function viewPartyMemberCharacter(userId: string): Promise<void> {
    setViewedPartyMemberUserId(userId)
    setViewedPartyMemberCharacter(undefined)
    const result = await window.goblin.characters.getPlayerCharacter(userId)
    setViewedPartyMemberCharacter(result.ok ? result.data : null)
  }

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      {wizardOpen && (
        <CharacterCreationWizard
          onCreate={(name, sheet) => {
            createCharacter(name, sheet)
            setWizardOpen(false)
          }}
          onClose={() => setWizardOpen(false)}
        />
      )}

      {characterPromptOpen && characters && (
        <Modal onClose={() => setCharacterPromptOpen(false)} width={400}>
          <h2 style={{ margin: '0 0 4px', fontFamily: 'var(--font-display)', fontSize: 18 }}>Which character?</h2>
          <p style={{ margin: '0 0 var(--space-3)', fontSize: 13, color: 'var(--text-muted)' }}>
            Choose who you're playing at this table — you can always switch later from the corner.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {characters.map((c) => (
              <Button
                key={c.id}
                variant={activeCharacter?.id === c.id ? 'primary' : 'secondary'}
                onClick={() => {
                  openTab({ kind: 'character', id: c.id })
                  setCharacterPromptOpen(false)
                }}
                style={{ justifyContent: 'flex-start' }}
              >
                {c.name || 'Unnamed Character'}
              </Button>
            ))}
          </div>
        </Modal>
      )}

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

      <PlayerSidebar
        activeCampaign={activeCampaign}
        notes={notes}
        folders={folders}
        activeTab={activeTab}
        myUserId={myUserId}
        onSelectNote={(id) => navigateToNote(id)}
        onOpenNoteInNewTab={(id) => openTab({ kind: 'note', id })}
        onCreateNote={createNote}
        onCreateFolder={createFolder}
        onRenameNote={(noteId, title) => saveNote(noteId, { title })}
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
        footer={
          <>
            <CharacterSwitcher
              characters={characters}
              current={lastActiveCharacter}
              onSelect={(character) => openTab({ kind: 'character', id: character.id })}
              onRequestCreate={() => setWizardOpen(true)}
              onDelete={(character) => deleteCharacter(character.id)}
            />
            <AccountSettingsButton />
          </>
        }
      />

      <div style={{ flex: 1, minHeight: 0, background: 'var(--bg-surface)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {viewedPartyMemberUserId ? (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-2) var(--space-5)',
                borderBottom: '1px solid var(--border-subtle)',
                fontSize: 12,
                color: 'var(--text-muted)',
                flexShrink: 0
              }}
            >
              <span>
                {viewedPartyMemberCharacter === undefined
                  ? 'Loading…'
                  : viewedPartyMemberCharacter
                    ? `Viewing ${viewedPartyMemberCharacter.name}'s sheet — read only`
                    : "Couldn't load that character — they may have disconnected or changed selection."}
              </span>
              <button
                type="button"
                onClick={() => setViewedPartyMemberUserId(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}
              >
                Close
              </button>
            </div>
            {viewedPartyMemberCharacter && (
              <div style={{ flex: 1, minHeight: 0 }}>
                <CharacterSheetEditor key={viewedPartyMemberCharacter.id} character={viewedPartyMemberCharacter} readOnly onSave={() => {}} />
              </div>
            )}
          </>
        ) : activeCharacter ? (
          <CharacterSheetEditor
            key={activeCharacter.id}
            character={activeCharacter}
            onSave={(patch) => saveCharacter(activeCharacter.id, patch)}
          />
        ) : activeNote ? (
          <NoteEditor
            key={activeNote.id}
            note={activeNote}
            notes={notes ?? []}
            sessionId={sessionId}
            readOnly={
              isOffline ||
              (activeNote.authorUserId !== myUserId && !activeNote.editorUserIds.includes(myUserId ?? ''))
            }
            onSave={(patch) => saveNote(activeNote.id, patch)}
            onNavigateToNote={navigateToNote}
            onOpenInNewTab={(id) => openTab({ kind: 'note', id })}
            onCreateAndLinkNote={(title) => createNote(activeNote.visibility, null, title)}
          />
        ) : (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: 13,
              textAlign: 'center',
              padding: 'var(--space-6)'
            }}
          >
            {connectedLabel
              ? 'Select a character or a note to get started'
              : 'Select a character, or join a friend’s game from the Friends menu'}
          </div>
        )}
      </div>

      {/* Always rendered, not gated on having an active campaign — Dice (and, once connected, Initiative) are
          useful before you've joined anyone's table, not just after. campaignId is null and every note-editor-grant
          control simply has nothing to act on until a campaign/note exists; PartySidebar already handles that. */}
      <PartySidebar
        sessionId={sessionId}
        campaignId={!isOffline ? activeCampaign?.id ?? null : null}
        campaignName={!isOffline ? activeCampaign?.name ?? null : null}
        myUserId={myUserId}
        dmUserId={!isOffline ? activeCampaign?.dmUserId ?? null : null}
        dmDisplayName={!isOffline ? activeCampaign?.dmDisplayName ?? null : null}
        activeNote={activeNote}
        onToggleEditor={(noteId, userId, grant) => {
          const note = notes?.find((n) => n.id === noteId)
          if (!note) return
          const next = grant ? [...note.editorUserIds, userId] : note.editorUserIds.filter((id) => id !== userId)
          saveNote(noteId, { editorUserIds: next })
        }}
        onViewCharacter={viewPartyMemberCharacter}
      />
    </div>
  )
}
