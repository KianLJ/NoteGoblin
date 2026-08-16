import { useState } from 'react'
import { PlayerSidebar } from './PlayerSidebar'
import { CharacterSheetEditor } from './CharacterSheetEditor'
import { CharacterCreationWizard } from './CharacterCreationWizard'
import { CharacterSwitcher } from './CharacterSwitcher'
import { NoteEditor } from '../campaigns/NoteEditor'
import { AccountSettingsButton } from '../account/AccountSettingsButton'
import type { PlayerWorkspace } from './usePlayerWorkspace'

interface PlayerWorkspaceBodyProps {
  workspace: PlayerWorkspace
  myDisplayName: string
  connectedLabel: string | null
  onConnected: (address: string, label: string) => void
}

export function PlayerWorkspaceBody({
  workspace,
  myDisplayName,
  connectedLabel,
  onConnected
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
    resync,
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
    error
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
          style={{
            position: 'absolute',
            color: 'var(--danger)',
            fontSize: 13,
            padding: 'var(--space-2) var(--space-5)'
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
        myDisplayName={myDisplayName}
        onSelectNote={(id) => openTab({ kind: 'note', id })}
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
        onResync={resync}
        connectedLabel={connectedLabel}
        onConnected={onConnected}
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
            onSave={(patch) => saveNote(activeNote.id, patch)}
            onNavigateToNote={(id) => openTab({ kind: 'note', id })}
            onCreateAndLinkNote={(title) => createNote(null, title)}
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
              : 'Select a character, or connect to a table from the sidebar'}
          </div>
        )}
      </div>
    </div>
  )
}
