import { NoteSidebar } from './NoteSidebar'
import { NoteEditor } from './NoteEditor'
import { RightPanel } from './RightPanel'
import { CampaignSwitcher } from './CampaignSwitcher'
import { AccountSettingsButton } from '../account/AccountSettingsButton'
import { CharacterSheetEditor } from '../player/CharacterSheetEditor'
import type { NotesWorkspace } from './useNotesWorkspace'
import type { Campaign, CharacterSheet } from '@shared/ipc'

interface CampaignWorkspaceProps {
  /** null while the DM has no campaign open yet — the sidebar (and its switcher/settings footer) still renders so there's always somewhere to create one. */
  campaign: Campaign | null
  workspace: NotesWorkspace
  onSwitchCampaign: (campaign: Campaign) => void
  /** The session id once hosting is on — passed through so RightPanel can show live presence. */
  hostedSessionId?: string | null
  /** Every connected player's currently-selected character, kept live — passed through to RightPanel's ConnectedPlayersList so clicking a player opens their sheet below. */
  playerCharacters: Map<string, CharacterSheet>
  /** Set when viewing a player's character (read-only) instead of a note — takes over the main pane until closed or a note is opened. */
  viewedPlayerCharacter: CharacterSheet | null
  onViewPlayerCharacter: (character: CharacterSheet | null) => void
}

/** Sidebar + editor + (once a campaign is open) right panel — the tab strip lives in AppShell's header now (see WorkspaceHeaderBar), not here. */
export function CampaignWorkspace({
  campaign,
  workspace,
  onSwitchCampaign,
  hostedSessionId,
  playerCharacters,
  viewedPlayerCharacter,
  onViewPlayerCharacter
}: CampaignWorkspaceProps): JSX.Element {
  const {
    notes,
    folders,
    error,
    activeNote,
    openNote,
    createNote,
    saveNote,
    deleteNote,
    createFolder,
    renameFolder,
    moveFolder,
    deleteFolder,
    duplicateNote,
    duplicateFolder
  } = workspace

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      {error && (
        <p
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

      <NoteSidebar
        notes={notes ?? []}
        folders={folders ?? []}
        isDm
        activeId={workspace.activeId}
        myUserId={campaign?.dmUserId ?? null}
        campaignId={campaign?.id ?? null}
        onSelect={(id) => {
          onViewPlayerCharacter(null)
          openNote(id)
        }}
        onCreateNote={(visibility, folderId) => createNote(visibility, folderId)}
        onCreateFolder={(visibility, name, parentFolderId) => createFolder(visibility, name, parentFolderId)}
        onRenameNote={(noteId, title) => saveNote(noteId, { title })}
        onDeleteNote={deleteNote}
        onRenameFolder={renameFolder}
        onDeleteFolder={deleteFolder}
        onMoveNote={(noteId, folderId, visibility) => saveNote(noteId, { folderId, visibility })}
        onMoveFolder={moveFolder}
        onPasteNote={duplicateNote}
        onPasteFolder={duplicateFolder}
        footer={
          <>
            <CampaignSwitcher canCreate current={campaign} onSelect={onSwitchCampaign} />
            <AccountSettingsButton />
          </>
        }
      />

      <div style={{ flex: 1, minHeight: 0, background: 'var(--bg-surface)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {viewedPlayerCharacter ? (
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
              <span>Viewing {viewedPlayerCharacter.name}'s sheet — read only</span>
              <button
                type="button"
                onClick={() => onViewPlayerCharacter(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}
              >
                Close
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <CharacterSheetEditor
                key={viewedPlayerCharacter.id}
                character={viewedPlayerCharacter}
                readOnly
                onSave={() => {}}
                onDelete={() => {}}
              />
            </div>
          </>
        ) : !campaign ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: 13
            }}
          >
            No campaign yet — add one in the sidebar.
          </div>
        ) : activeNote ? (
          <NoteEditor
            key={activeNote.id}
            note={activeNote}
            notes={notes ?? []}
            readOnly={
              activeNote.authorUserId !== campaign?.dmUserId && !activeNote.editorUserIds.includes(campaign?.dmUserId ?? '')
            }
            onSave={(patch) => saveNote(activeNote.id, patch)}
            onNavigateToNote={openNote}
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
              fontSize: 13
            }}
          >
            {(notes?.length ?? 0) > 0 ? 'Select a note to open it' : 'Create your first note from the sidebar'}
          </div>
        )}
      </div>

      {campaign && (
        <RightPanel
          sessionId={hostedSessionId ?? null}
          campaignId={campaign.id}
          playerCharacters={playerCharacters}
          onSelectPlayer={onViewPlayerCharacter}
        />
      )}
    </div>
  )
}
