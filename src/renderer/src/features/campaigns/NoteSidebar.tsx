import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LockIcon } from './icons'
import { NoteTreeSection, type ClipboardItem, type ClipboardState } from './NoteTreeSection'
import { ResizableSidebar } from '../../ui/ResizableSidebar'
import type { Folder, Note } from '@shared/ipc'

interface NoteSidebarProps {
  notes: Note[]
  folders: Folder[]
  isDm: boolean
  activeId: string | null
  myUserId: string | null
  /** null while there's no campaign open yet — tree still renders (empty), creation is a no-op until one exists. */
  campaignId: string | null
  onSelect: (id: string) => void
  onOpenInNewTab: (id: string) => void
  onCreateNote: (visibility: 'dm' | 'shared', folderId: string | null) => void
  onCreateFolder: (visibility: 'dm' | 'shared', name: string, parentFolderId: string | null) => Promise<string | undefined>
  onRenameNote: (noteId: string, title: string) => void
  onDeleteNote: (noteId: string) => void
  onRenameFolder: (folderId: string, name: string) => void
  onDeleteFolder: (folderId: string) => void
  // These four are passed straight through to NoteTreeSection (shared with
  // PlayerSidebar, which still needs 'private'), so they stay typed for the
  // full union even though a DM's own sections here only ever pass
  // 'dm'/'shared' — narrowing them would break assignability, not runtime
  // behavior.
  onMoveNote: (noteId: string, folderId: string | null, visibility: 'dm' | 'shared' | 'private') => void
  onMoveFolder: (folderId: string, parentFolderId: string | null, visibility: 'dm' | 'shared' | 'private') => void
  onPasteNote: (sourceNoteId: string, targetFolderId: string | null, targetVisibility: 'dm' | 'shared' | 'private') => void
  onPasteFolder: (sourceFolderId: string, targetParentId: string | null, targetVisibility: 'dm' | 'shared' | 'private') => void
  /** The campaign switcher + account settings — rendered here so they're visually part of the sidebar, not a floating overlay. */
  footer: ReactNode
}

const MIN_PANE_HEIGHT = 60

export function NoteSidebar({
  notes,
  folders,
  isDm,
  activeId,
  myUserId,
  campaignId,
  onSelect,
  onOpenInNewTab,
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
  footer
}: NoteSidebarProps): JSX.Element {
  const storageBase = campaignId ?? 'none'
  const [partyHeight, setPartyHeight] = useState(240)
  const [dragging, setDragging] = useState(false)
  const splitRef = useRef<HTMLDivElement>(null)
  // Lifted above both sections so Ctrl+C in Party Notes and Ctrl+V in DM
  // Only (or vice versa) works, the same way dragging across them does.
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null)

  // Same window-level-listener approach as ResizableSidebar's horizontal
  // handle, for the same reason: pointer capture on a thin handle is
  // unreliable during a fast drag.
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

  // partyHeight is a fixed pixel value chosen (by default or by dragging)
  // against whatever the split's available height was at the time — it never
  // otherwise reconciles against the container. Without this, shrinking the
  // window (or the sidebar) below that value leaves the Party pane still
  // claiming its old height (flexShrink: 0), pushing the divider/DM Only pane
  // — and visually, the footer below them — out of their normal, "locked"
  // position instead of the split just compressing. Re-clamp on every resize.
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

  return (
    <ResizableSidebar
      defaultWidth={220}
      collapseStorageKey="gb-sidebar-collapsed:notes"
      widthStorageKey="gb-sidebar-width:notes"
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
        <div style={{ height: isDm ? partyHeight : '100%', minHeight: 0, overflowY: 'auto', flexShrink: 0 }}>
          <NoteTreeSection
            // Forces a remount when the real campaign id replaces the
            // 'none' placeholder (or when switching between campaigns) —
            // without it, the collapsed-folders state loaded by this
            // component's lazy useState initializer at the 'none' mount
            // never gets reloaded from the correct localStorage key once
            // storageKey changes, since a changed prop alone doesn't rerun
            // that initializer. See loadCollapsed/storageKey below.
            key={`${storageBase}:shared`}
            title="Party Notes"
            storageKey={`${storageBase}:shared`}
            visibility="shared"
            isDm={isDm}
            fill
            notes={notes.filter((n) => n.visibility === 'shared')}
            folders={folders.filter((f) => f.visibility === 'shared')}
            activeId={activeId}
            myUserId={myUserId}
            onSelectNote={onSelect}
            onOpenNoteInNewTab={onOpenInNewTab}
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

        {isDm && (
          <>
            <div
              onPointerDown={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              title="Drag to resize"
              style={{
                height: 6,
                flexShrink: 0,
                cursor: 'row-resize',
                position: 'relative'
              }}
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
                key={`${storageBase}:dm`}
                title="DM Only"
                headerIcon={<LockIcon />}
                storageKey={`${storageBase}:dm`}
                visibility="dm"
                isDm={isDm}
                fill
                notes={notes.filter((n) => n.visibility === 'dm')}
                folders={folders.filter((f) => f.visibility === 'dm')}
                activeId={activeId}
                myUserId={myUserId}
                onSelectNote={onSelect}
                onOpenNoteInNewTab={onOpenInNewTab}
                onCreateNote={(folderId) => onCreateNote('dm', folderId)}
                onCreateFolder={(name, parentFolderId) => onCreateFolder('dm', name, parentFolderId)}
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
        )}
      </div>
    </ResizableSidebar>
  )
}
