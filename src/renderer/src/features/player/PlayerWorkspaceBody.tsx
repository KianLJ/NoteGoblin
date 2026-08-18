import { useState } from 'react'
import { PlayerSidebar } from './PlayerSidebar'
import { PartySidebar } from './PartySidebar'
import { CharacterSheetEditor } from './CharacterSheetEditor'
import { CharacterCreationWizard } from './CharacterCreationWizard'
import { CharacterSwitcher } from './CharacterSwitcher'
import { NoteEditor } from '../campaigns/NoteEditor'
import { AccountSettingsButton } from '../account/AccountSettingsButton'
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
    openOfflineCampaign
  } = workspace

  const [wizardOpen, setWizardOpen] = useState(false)

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
        footer={
          <>
            <CharacterSwitcher
              characters={characters}
              current={activeCharacter}
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

      {activeCampaign && !isOffline && (
        <PartySidebar
          sessionId={sessionId}
          campaignId={activeCampaign.id}
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
      )}
    </div>
  )
}
