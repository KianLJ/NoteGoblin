import { NoteSidebar } from './NoteSidebar'
import { NoteEditor } from './NoteEditor'
import { RightPanel } from './RightPanel'
import { CampaignSwitcher } from './CampaignSwitcher'
import { AccountSettingsButton } from '../account/AccountSettingsButton'
import type { NotesWorkspace } from './useNotesWorkspace'
import type { Campaign } from '@shared/ipc'

interface CampaignWorkspaceProps {
  /** null while the DM has no campaign open yet — the sidebar (and its switcher/settings footer) still renders so there's always somewhere to create one. */
  campaign: Campaign | null
  myDisplayName: string
  workspace: NotesWorkspace
  onSwitchCampaign: (campaign: Campaign) => void
  /** The DM's own loopback address once hosting is on — passed through so RightPanel can show live presence. */
  hostingSelfAddress?: string | null
}

/** Sidebar + editor + (once a campaign is open) right panel — the tab strip lives in AppShell's header now (see WorkspaceHeaderBar), not here. */
export function CampaignWorkspace({
  campaign,
  myDisplayName,
  workspace,
  onSwitchCampaign,
  hostingSelfAddress
}: CampaignWorkspaceProps): JSX.Element {
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
        isDm
        activeId={workspace.activeId}
        onSelect={openNote}
        onCreate={campaign ? createNote : undefined}
        footer={
          <>
            <CampaignSwitcher canCreate current={campaign} onSelect={onSwitchCampaign} />
            <AccountSettingsButton />
          </>
        }
      />

      <div style={{ flex: 1, minHeight: 0, background: 'var(--bg-surface)', overflowY: 'auto' }}>
        {!campaign ? (
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

      {campaign && <RightPanel selfAddress={hostingSelfAddress ?? null} campaignId={campaign.id} />}
    </div>
  )
}
