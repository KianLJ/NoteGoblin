import { NoteSidebar } from './NoteSidebar'
import { NoteEditor } from './NoteEditor'
import type { NotesWorkspace } from './useNotesWorkspace'
import type { Campaign } from '@shared/ipc'

interface CampaignWorkspaceProps {
  campaign: Campaign
  myDisplayName: string
  workspace: NotesWorkspace
}

/** Sidebar + editor split — the tab strip lives in AppShell's header now (see WorkspaceHeaderBar), not here. */
export function CampaignWorkspace({ campaign, myDisplayName, workspace }: CampaignWorkspaceProps): JSX.Element {
  const isDm = campaign.myRole === 'dm'
  const { notes, error, activeNote, openNote, createNote, saveNote, deleteNote } = workspace

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

      <NoteSidebar
        notes={notes ?? []}
        isDm={isDm}
        activeId={workspace.activeId}
        onSelect={openNote}
        onCreate={createNote}
      />

      <div style={{ flex: 1, minHeight: 0, background: 'var(--bg-surface)', overflowY: 'auto' }}>
        {activeNote ? (
          <NoteEditor
            key={activeNote.id}
            note={activeNote}
            canDelete={activeNote.authorDisplayName === myDisplayName}
            onSave={(patch) => saveNote(activeNote.id, patch)}
            onDelete={() => deleteNote(activeNote.id)}
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
    </div>
  )
}
