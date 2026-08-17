import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ResizableSidebar } from '../../ui/ResizableSidebar'
import { LockIcon, PlusIcon } from '../campaigns/icons'
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
  onCreateNote: (visibility: 'shared' | 'private', folderId: string | null) => void
  onCreateFolder: (
    visibility: 'shared' | 'private',
    name: string,
    parentFolderId: string | null
  ) => Promise<string | undefined>
  onRenameNote: (noteId: string, title: string) => void
  onDeleteNote: (noteId: string) => void
  onRenameFolder: (folderId: string, name: string) => void
  onDeleteFolder: (folderId: string) => void
  onMoveNote: (noteId: string, folderId: string | null, visibility: 'dm' | 'shared' | 'private') => void
  onMoveFolder: (folderId: string, parentFolderId: string | null, visibility: 'dm' | 'shared' | 'private') => void
  onPasteNote: (sourceNoteId: string, targetFolderId: string | null, targetVisibility: 'dm' | 'shared' | 'private') => void
  onPasteFolder: (sourceFolderId: string, targetParentId: string | null, targetVisibility: 'dm' | 'shared' | 'private') => void
  /** Whether you're connected to a session at all — connection status/resync itself now lives in the Friends menu, this just decides which empty-state hint to show. */
  connectedLabel: string | null
  /** The character switcher + account settings — rendered here so they're visually part of the sidebar, not a floating overlay. */
  footer: ReactNode
}

const MIN_PANE_HEIGHT = 60

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
  const [partyHeight, setPartyHeight] = useState(240)
  const [dragging, setDragging] = useState(false)
  const splitRef = useRef<HTMLDivElement>(null)

  // Same window-level-listener pattern as NoteSidebar's split — pointer
  // capture on a thin handle is unreliable during a fast drag.
  useEffect(() => {
    if (!dragging) return
    function handleMove(e: PointerEvent): void {
      if (!splitRef.current) return
      const rect = splitRef.current.getBoundingClientRect()
      const raw = e.clientY - rect.top
      setPartyHeight(Math.min(rect.height - MIN_PANE_HEIGHT, Math.max(MIN_PANE_HEIGHT, raw)))
    }
    function handleUp(): void {
      setDragging(false)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [dragging])

  useEffect(() => {
    const el = splitRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      const height = el.getBoundingClientRect().height
      setPartyHeight((prev) => Math.min(prev, Math.max(MIN_PANE_HEIGHT, height - MIN_PANE_HEIGHT)))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const myNotes = notes ?? []
  const myFolders = folders ?? []

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
        ref={splitRef}
        style={{
          height: '100%',
          borderRight: '1px solid var(--border-subtle)',
          background: 'var(--bg-sunken)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden'
        }}
      >
        {activeCampaign ? (
          <>
            <div style={{ height: partyHeight, minHeight: 0, overflowY: 'auto', flexShrink: 0 }}>
              <NoteTreeSection
                title="Party Notes"
                storageKey={`${activeCampaign.id}:party`}
                visibility="shared"
                fill
                notes={myNotes.filter((n) => n.visibility === 'shared')}
                folders={myFolders.filter((f) => f.visibility === 'shared')}
                activeId={activeTab?.kind === 'note' ? activeTab.id : null}
                myUserId={myUserId}
                onSelectNote={onSelectNote}
                onCreateNote={(folderId) => onCreateNote('shared', folderId)}
                onCreateFolder={(name, parentFolderId) => onCreateFolder('shared', name, parentFolderId)}
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

            <div
              onPointerDown={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              title="Drag to resize"
              style={{ height: 6, flexShrink: 0, cursor: 'row-resize', position: 'relative' }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 2,
                  left: 0,
                  right: 0,
                  height: 1,
                  background: 'var(--border-subtle)'
                }}
              />
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <NoteTreeSection
                title="Private Notes"
                headerIcon={<LockIcon />}
                storageKey={`${activeCampaign.id}:private`}
                visibility="private"
                fill
                notes={myNotes.filter((n) => n.visibility === 'private')}
                folders={myFolders.filter((f) => f.visibility === 'private')}
                activeId={activeTab?.kind === 'note' ? activeTab.id : null}
                myUserId={myUserId}
                onSelectNote={onSelectNote}
                onCreateNote={(folderId) => onCreateNote('private', folderId)}
                onCreateFolder={(name, parentFolderId) => onCreateFolder('private', name, parentFolderId)}
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
          </>
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
