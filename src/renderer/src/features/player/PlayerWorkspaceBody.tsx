import { useState } from 'react'
import { PlayerSidebar } from './PlayerSidebar'
import { PartySidebar } from './PartySidebar'
import { CharacterSheetEditor } from './CharacterSheetEditor'
import { CharacterCreationWizard } from './CharacterCreationWizard'
import { CharacterSwitcher } from './CharacterSwitcher'
import { NoteEditor } from '../campaigns/NoteEditor'
import { AccountSettingsButton } from '../account/AccountSettingsButton'
import type { PlayerWorkspace } from './usePlayerWorkspace'

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
            />
            <AccountSettingsButton />
          </>
        }
      />

      <div style={{ flex: 1, minHeight: 0, background: 'var(--bg-surface)', overflowY: 'auto' }}>
        {activeCharacter ? (
          <CharacterSheetEditor
            key={activeCharacter.id}
            character={activeCharacter}
            onSave={(patch) => saveCharacter(activeCharacter.id, patch)}
            onDelete={() => deleteCharacter(activeCharacter.id)}
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
        />
      )}
    </div>
  )
}
