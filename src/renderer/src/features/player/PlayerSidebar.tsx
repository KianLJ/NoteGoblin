import { useState, type ReactNode } from 'react'
import { ResizableSidebar } from '../../ui/ResizableSidebar'
import { PlusIcon } from '../campaigns/icons'
import { NoteTreeSection, type ClipboardItem, type ClipboardState } from '../campaigns/NoteTreeSection'
import type { Campaign, Folder, Note } from '@shared/ipc'
import type { PlayerTabRef } from './usePlayerWorkspace'

interface PlayerSidebarProps {
  activeCampaign: Campaign | null
  notes: Note[] | null
  folders: Folder[] | null
  activeTab: PlayerTabRef | null
  myUserId: string | null
  onSelectNote: (id: string) => void
  onCreateNote: (folderId: string | null) => void
  onCreateFolder: (name: string, parentFolderId: string | null) => Promise<string | undefined>
  onRenameNote: (noteId: string, title: string) => void
  onDeleteNote: (noteId: string) => void
  onRenameFolder: (folderId: string, name: string) => void
  onDeleteFolder: (folderId: string) => void
  onMoveNote: (noteId: string, folderId: string | null, visibility: 'dm' | 'shared') => void
  onMoveFolder: (folderId: string, parentFolderId: string | null, visibility: 'dm' | 'shared') => void
  onPasteNote: (sourceNoteId: string, targetFolderId: string | null, targetVisibility: 'dm' | 'shared') => void
  onPasteFolder: (sourceFolderId: string, targetParentId: string | null, targetVisibility: 'dm' | 'shared') => void
  /** Whether you're connected to a session at all — connection status/resync itself now lives in the Friends menu, this just decides which empty-state hint to show. */
  connectedLabel: string | null
  /** The character switcher + account settings — rendered here so they're visually part of the sidebar, not a floating overlay. */
  footer: ReactNode
}

export function PlayerSidebar({
  activeCampaign,
  notes,
  folders,
  activeTab,
  myUserId,
  onSelectNote,
  onCreateNote,
  onCreateFolder,
  onRenameNote,
  onDeleteNote,
  onRenameFolder,
  onDeleteFolder,
  onMoveNote,
  onMoveFolder,
  onPasteNote,
  onPasteFolder,
  connectedLabel,
  footer
}: PlayerSidebarProps): JSX.Element {
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null)

  return (
    <ResizableSidebar
      defaultWidth={220}
      footer={
        <div
          style={{
            borderRight: '1px solid var(--border-subtle)',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--bg-sunken)',
            padding: 'var(--space-2)',
            display: 'flex',
            gap: 'var(--space-2)',
            flexShrink: 0,
            minWidth: 0
          }}
        >
          {footer}
        </div>
      }
    >
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid var(--border-subtle)',
          background: 'var(--bg-sunken)'
        }}
      >
        {activeCampaign ? (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <NoteTreeSection
              title="Campaign Notes"
              storageKey={`${activeCampaign.id}:player`}
              visibility="shared"
              fill
              notes={notes ?? []}
              folders={folders ?? []}
              activeId={activeTab?.kind === 'note' ? activeTab.id : null}
              myUserId={myUserId}
              onSelectNote={onSelectNote}
              onCreateNote={onCreateNote}
              onCreateFolder={onCreateFolder}
              onRenameNote={onRenameNote}
              onDeleteNote={onDeleteNote}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              onMoveNote={onMoveNote}
              onMoveFolder={onMoveFolder}
              onPasteNote={onPasteNote}
              onPasteFolder={onPasteFolder}
              clipboard={clipboard}
              onSetClipboard={(items: ClipboardItem[], mode) => setClipboard({ items, mode })}
              onClearClipboard={() => setClipboard(null)}
            />
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-2) 0' }}>
            <Section title="Campaign Notes">
              <EmptyHint>
                {connectedLabel ? "Waiting for the DM's campaign" : 'Join a friend’s game from the Friends menu'}
              </EmptyHint>
            </Section>
          </div>
        )}
      </div>
    </ResizableSidebar>
  )
}

function Section({
  title,
  onCreate,
  children
}: {
  title: string
  onCreate?: () => void
  children: ReactNode
}): JSX.Element {
  return (
    <div style={{ marginBottom: 'var(--space-3)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px var(--space-3)'
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-muted)'
          }}
        >
          {title}
        </span>
        {onCreate && (
          <button
            type="button"
            onClick={onCreate}
            title="New"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: 2,
              display: 'flex'
            }}
          >
            <PlusIcon />
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

function EmptyHint({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div style={{ padding: '4px var(--space-3)', fontSize: 12, color: 'var(--text-muted)' }}>
      {children}
    </div>
  )
}
