import { NoteSidebar } from './NoteSidebar'
import { NoteEditor } from './NoteEditor'
import { RightPanel } from './RightPanel'
import { CampaignSwitcher } from './CampaignSwitcher'
import { AccountSettingsButton } from '../account/AccountSettingsButton'
import { CharacterSheetEditor } from '../player/CharacterSheetEditor'
import { renderStatblockHtml } from '../../statblock'
import type { NotesWorkspace } from './useNotesWorkspace'
import type { Campaign, CharacterSheet } from '@shared/ipc'
import type { BestiaryMonster } from '../../data/bestiary'

interface CampaignWorkspaceProps {
  /** null while the DM has no campaign open yet — the sidebar (and its switcher/settings footer) still renders so there's always somewhere to create one. */
  campaign: Campaign | null
  workspace: NotesWorkspace
  onSwitchCampaign: (campaign: Campaign) => void
  /** Fired when the currently-open campaign gets deleted from the switcher — drops back to "no campaign open" instead of continuing to show one that no longer exists. */
  onCampaignDeleted: () => void
  /** The session id once hosting is on — passed through so RightPanel can show live presence. */
  hostedSessionId?: string | null
  /** Every connected player's currently-selected character, kept live — passed through to RightPanel's ConnectedPlayersList so clicking a player opens their sheet below. */
  playerCharacters: Map<string, CharacterSheet>
  /** Whose character is being viewed (read-only) instead of a note, if anyone — takes over the main pane until closed or a note is opened. Deliberately just the id, not the character itself: deriving it fresh from playerCharacters on every render (below) is what keeps the read-only view live instead of frozen at whatever it looked like at the moment you clicked. */
  viewedPlayerUserId: string | null
  onViewPlayerUserId: (userId: string | null) => void
  /** Enemy statblock tabs opened from the Initiative tracker (see InitiativeTracker.tsx's onSelectMonster) — several can be open at once, same as notes; `activeMonsterTab` (an index into this list, or null) is which one currently takes over the main pane, same "until closed or something else is opened" deal viewedPlayerUserId has. */
  monsterTabs: BestiaryMonster[]
  activeMonsterTab: string | null
  onOpenMonsterTab: (monster: BestiaryMonster) => void
  onSelectMonsterTab: (index: string | null) => void
}

/** Sidebar + editor + (once a campaign is open) right panel — the tab strip lives in AppShell's header now (see WorkspaceHeaderBar), not here. */
export function CampaignWorkspace({
  campaign,
  workspace,
  onSwitchCampaign,
  onCampaignDeleted,
  hostedSessionId,
  playerCharacters,
  viewedPlayerUserId,
  onViewPlayerUserId,
  monsterTabs,
  activeMonsterTab,
  onOpenMonsterTab,
  onSelectMonsterTab
}: CampaignWorkspaceProps): JSX.Element {
  const viewedPlayerCharacter = viewedPlayerUserId ? (playerCharacters.get(viewedPlayerUserId) ?? null) : null
  const activeMonster = activeMonsterTab ? monsterTabs.find((m) => m.index === activeMonsterTab) ?? null : null
  const {
    notes,
    folders,
    error,
    activeNote,
    openNote,
    navigateToNote,
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

      <NoteSidebar
        notes={notes ?? []}
        folders={folders ?? []}
        isDm
        activeId={workspace.activeId}
        myUserId={campaign?.dmUserId ?? null}
        campaignId={campaign?.id ?? null}
        onSelect={(id) => {
          onViewPlayerUserId(null)
          onSelectMonsterTab(null)
          navigateToNote(id)
        }}
        onOpenInNewTab={(id) => {
          onViewPlayerUserId(null)
          onSelectMonsterTab(null)
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
            <CampaignSwitcher canCreate current={campaign} onSelect={onSwitchCampaign} onCurrentDeleted={onCampaignDeleted} />
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
                onClick={() => onViewPlayerUserId(null)}
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
              />
            </div>
          </>
        ) : activeMonster ? (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-5)' }}>
            <div className="gb-markdown" dangerouslySetInnerHTML={{ __html: renderStatblockHtml(activeMonster, false) }} />
          </div>
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
            sessionId={hostedSessionId ?? null}
            // The DM always has edit power over notes in their own campaign
            // (this workspace only ever shows campaigns they DM) — matches
            // the same blanket allowance campaignService.updateNote grants
            // server-side, so this is just keeping the UI from offering a
            // save that would otherwise actually succeed.
            onSave={(patch) => saveNote(activeNote.id, patch)}
            onNavigateToNote={navigateToNote}
            onOpenInNewTab={openNote}
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
          myUserId={campaign.dmUserId}
          playerCharacters={playerCharacters}
          onSelectPlayer={(userId) => {
            onSelectMonsterTab(null)
            onViewPlayerUserId(userId)
          }}
          onSelectMonster={onOpenMonsterTab}
        />
      )}
    </div>
  )
}
