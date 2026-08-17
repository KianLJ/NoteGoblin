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
  onCreateNote: (visibility: 'dm' | 'shared' | 'private', folderId: string | null) => void
  onCreateFolder: (
    visibility: 'dm' | 'shared' | 'private',
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
  /** The campaign switcher + account settings — rendered here so they're visually part of the sidebar, not a floating overlay. */
  footer: ReactNode
}

const MIN_PANE_HEIGHT = 60

/** A drag-to-resize pane height, dragged from a divider below it — `splitRef` is the shared container both drag math and the resize-clamp effect measure against. */
function useSplitHeight(
  splitRef: React.RefObject<HTMLDivElement>,
  initial: number
): [number, () => void, (next: number | ((prev: number) => number)) => void] {
  const [height, setHeight] = useState(initial)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!dragging) return
    function handleMove(e: PointerEvent): void {
      if (!splitRef.current) return
      const rect = splitRef.current.getBoundingClientRect()
      const raw = e.clientY - rect.top
      setHeight(Math.min(rect.height - MIN_PANE_HEIGHT, Math.max(MIN_PANE_HEIGHT, raw)))
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
  }, [dragging, splitRef])

  return [height, () => setDragging(true), setHeight]
}

function Divider({ onStartDrag }: { onStartDrag: () => void }): JSX.Element {
  return (
    <div
      onPointerDown={(e) => {
        e.preventDefault()
        onStartDrag()
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
  )
}

export function NoteSidebar({
  notes,
  folders,
  isDm,
  activeId,
  myUserId,
  campaignId,
  onSelect,
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
  const splitRef = useRef<HTMLDivElement>(null)
  // Lifted above every section so Ctrl+C in one and Ctrl+V in another works,
  // the same way dragging across them does.
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null)
  const [partyHeight, startPartyDrag, setPartyHeight] = useSplitHeight(splitRef, 200)
  const [privateHeight, startPrivateDrag, setPrivateHeight] = useSplitHeight(splitRef, 160)

  // partyHeight/privateHeight are fixed pixel values chosen (by default or by
  // dragging) against whatever the split's available height was at the time —
  // they never otherwise reconcile against the container. Without this,
  // shrinking the window (or the sidebar) below that combined value leaves
  // the two fixed-height panes still claiming their old heights
  // (flexShrink: 0), pushing the DM Only pane below them — and visually, the
  // footer below that — out of their normal, "locked" position instead of
  // the split just compressing. Re-clamp both on every resize, keeping the
  // bottom (DM Only) pane's flex:1 share above the floor.
  useEffect(() => {
    const el = splitRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      const height = el.getBoundingClientRect().height
      const maxCombined = Math.max(MIN_PANE_HEIGHT * 2, height - MIN_PANE_HEIGHT)
      setPartyHeight((prev) => Math.min(prev, maxCombined - MIN_PANE_HEIGHT))
      setPrivateHeight((prev) => Math.min(prev, maxCombined - MIN_PANE_HEIGHT))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [setPartyHeight, setPrivateHeight])

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
        <div style={{ height: isDm ? partyHeight : '100%', minHeight: 0, overflowY: 'auto', flexShrink: 0 }}>
          <NoteTreeSection
            title="Party Notes"
            storageKey={`${storageBase}:shared`}
            visibility="shared"
            fill
            notes={notes.filter((n) => n.visibility === 'shared')}
            folders={folders.filter((f) => f.visibility === 'shared')}
            activeId={activeId}
            myUserId={myUserId}
            onSelectNote={onSelect}
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
            <Divider onStartDrag={startPartyDrag} />

            <div style={{ height: privateHeight, minHeight: 0, overflowY: 'auto', flexShrink: 0 }}>
              <NoteTreeSection
                title="Private Notes"
                headerIcon={<LockIcon />}
                storageKey={`${storageBase}:private`}
                visibility="private"
                fill
                notes={notes.filter((n) => n.visibility === 'private' && n.authorUserId === myUserId)}
                folders={folders.filter((f) => f.visibility === 'private' && f.authorUserId === myUserId)}
                activeId={activeId}
                myUserId={myUserId}
                onSelectNote={onSelect}
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

            <Divider onStartDrag={startPrivateDrag} />

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <NoteTreeSection
                title="DM Only"
                headerIcon={<LockIcon />}
                storageKey={`${storageBase}:dm`}
                visibility="dm"
                fill
                notes={notes.filter((n) => n.visibility === 'dm')}
                folders={folders.filter((f) => f.visibility === 'dm')}
                activeId={activeId}
                myUserId={myUserId}
                onSelectNote={onSelect}
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
