import { PlayerSidebar } from './PlayerSidebar'
import { CharacterEditor } from './CharacterEditor'
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
    campaigns,
    activeCampaign,
    notes,
    folders,
    activeTab,
    activeCharacter,
    activeNote,
    openTab,
    joinCampaign,
    selectCampaign,
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

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
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
        characters={characters ?? []}
        campaigns={campaigns}
        activeCampaign={activeCampaign}
        notes={notes}
        folders={folders}
        activeTab={activeTab}
        myDisplayName={myDisplayName}
        onSelectCharacter={(id) => openTab({ kind: 'character', id })}
        onSelectNote={(id) => openTab({ kind: 'note', id })}
        onCreateCharacter={() => createCharacter('New Character')}
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
        onJoinCampaign={joinCampaign}
        onSelectCampaign={selectCampaign}
        connectedLabel={connectedLabel}
        onConnected={onConnected}
        footer={
          <>
            <CharacterSwitcher
              characters={characters}
              current={activeCharacter}
              onSelect={(character) => openTab({ kind: 'character', id: character.id })}
              onCreate={(name) => createCharacter(name)}
            />
            <AccountSettingsButton />
          </>
        }
      />

      <div style={{ flex: 1, minHeight: 0, background: 'var(--bg-surface)', overflowY: 'auto' }}>
        {activeCharacter ? (
          <CharacterEditor
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
