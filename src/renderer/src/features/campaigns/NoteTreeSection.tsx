import {
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode
} from 'react'
import type { Folder, Note } from '@shared/ipc'
import { ContextMenu, type ContextMenuItem, type ContextMenuState } from '../../ui/ContextMenu'
import {
  ChevronRightIcon,
  CollapseAllIcon,
  ExpandAllIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  LocateIcon,
  NewFolderIcon,
  NewNoteIcon,
  SortIcon
} from './icons'

type SortMode = 'name' | 'modified' | 'created'
type ItemKind = 'note' | 'folder'
export interface ClipboardItem {
  kind: ItemKind
  id: string
}
export interface ClipboardState {
  mode: 'copy' | 'cut'
  items: ClipboardItem[]
}

const DRAG_MIME = 'application/x-notegoblin-item'

function makeKey(kind: ItemKind, id: string): string {
  return `${kind}:${id}`
}

function parseKey(key: string): ClipboardItem {
  const i = key.indexOf(':')
  return { kind: key.slice(0, i) as ItemKind, id: key.slice(i + 1) }
}

/** True if `targetFolderId` is `ancestorId` itself or lives anywhere under it — used to block dropping a folder into its own subtree. */
function isSelfOrDescendantFolder(folders: Folder[], ancestorId: string, targetFolderId: string): boolean {
  let current: string | null = targetFolderId
  while (current) {
    if (current === ancestorId) return true
    current = folders.find((f) => f.id === current)?.parentFolderId ?? null
  }
  return false
}

/** All descendant folder ids under `rootId` (breadth-first), used to size up a folder's subtree before an irreversible delete. */
function descendantFolderIds(folders: Folder[], rootId: string): string[] {
  const result: string[] = []
  const queue = [rootId]
  while (queue.length) {
    const current = queue.shift() as string
    for (const f of folders) {
      if (f.parentFolderId === current) {
        result.push(f.id)
        queue.push(f.id)
      }
    }
  }
  return result
}

/** Confirms an irreversible batch delete, naming how many notes/folders are actually involved once folder subtrees are counted. Notes-only deletes don't confirm (matches the existing single-note Delete, which never has). */
function confirmDelete(folders: Folder[], notes: Note[], folderIds: string[], noteIds: string[]): boolean {
  if (folderIds.length === 0) return true
  const allFolderIds = new Set(folderIds)
  for (const id of folderIds) descendantFolderIds(folders, id).forEach((d) => allFolderIds.add(d))
  const noteIdSet = new Set(noteIds)
  for (const n of notes) {
    if (n.folderId && allFolderIds.has(n.folderId)) noteIdSet.add(n.id)
  }
  const folderCount = allFolderIds.size
  const noteCount = noteIdSet.size
  const parts: string[] = [`${folderCount} folder${folderCount === 1 ? '' : 's'}`]
  if (noteCount > 0) parts.unshift(`${noteCount} note${noteCount === 1 ? '' : 's'}`)
  return window.confirm(`Delete ${parts.join(' and ')}? This can't be undone.`)
}

interface NoteTreeSectionProps {
  title: string
  headerIcon?: ReactNode
  /** Scopes localStorage persistence (collapsed folders) — pass something unique per campaign+section, e.g. `${campaignId}:dm`. */
  storageKey: string
  /** This section's own visibility — stamped onto anything dropped/pasted in from a differently-visible section, so crossing sections actually changes what a note/folder is visible to, not just where it sits. */
  visibility: 'dm' | 'shared'
  notes: Note[]
  folders: Folder[]
  activeId: string | null
  /** Rename/Delete/drag/cut only work for items you authored — compared by id against authorUserId, matching the same author-only rule the server enforces, so this just avoids offering actions that would silently fail. null while your own id isn't known yet (e.g. relay still connecting), which just means nothing appears owned yet. */
  myUserId: string | null
  /** When true, this section stretches to fill its container's full height so right-click and drop targets cover the whole pane, not just where items are rendered. */
  fill?: boolean
  /** Shared across every section in the sidebar (lifted up) so Ctrl+C in one section and Ctrl+V in another — e.g. Shared to DM Only — works like cut/copy across folders in a file manager. */
  clipboard: ClipboardState | null
  onSetClipboard: (items: ClipboardItem[], mode: 'copy' | 'cut') => void
  onClearClipboard: () => void
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
}

function loadCollapsed(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

function compareByMode(mode: SortMode, a: { name: string; createdAt: string; updatedAt: string }, b: typeof a): number {
  if (mode === 'name') return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  if (mode === 'modified') return b.updatedAt.localeCompare(a.updatedAt)
  return b.createdAt.localeCompare(a.createdAt)
}

/** One folder/note tree — used for the DM's "Shared Notes" and "DM Only" sections, and the player's "Campaign Notes" section. Owns its own sort/collapse/selection/context-menu/rename state, scoped by `storageKey`. */
export function NoteTreeSection({
  title,
  headerIcon,
  storageKey,
  visibility,
  notes,
  folders,
  activeId,
  myUserId,
  fill,
  clipboard,
  onSetClipboard,
  onClearClipboard,
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
  onPasteFolder
}: NoteTreeSectionProps): JSX.Element {
  const collapsedStorageKey = `gb-tree-collapsed:${storageKey}`
  const [sortMode, setSortMode] = useState<SortMode>('name')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => loadCollapsed(collapsedStorageKey))
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [renamingNoteId, setRenamingNoteId] = useState<string | null>(null)
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const lastSelectedKeyRef = useRef<string | null>(null)
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map())
  const sortMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    localStorage.setItem(collapsedStorageKey, JSON.stringify([...collapsed]))
  }, [collapsed, collapsedStorageKey])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) setSortMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function toggleFolder(id: string): void {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function childFolders(parentId: string | null): Folder[] {
    return [...folders.filter((f) => f.parentFolderId === parentId)].sort((a, b) =>
      compareByMode(sortMode, { ...a, name: a.name }, { ...b, name: b.name })
    )
  }

  function childNotes(folderId: string | null): Note[] {
    return [...notes.filter((n) => n.folderId === folderId)].sort((a, b) =>
      compareByMode(sortMode, { ...a, name: a.title }, { ...b, name: b.title })
    )
  }

  /** Depth-first visible order (folders, recursing into expanded ones, then notes, at every level) — matches render order exactly, used for shift-range-select and Ctrl+A. */
  function visibleRows(parentId: string | null): ClipboardItem[] {
    const result: ClipboardItem[] = []
    for (const f of childFolders(parentId)) {
      result.push({ kind: 'folder', id: f.id })
      if (!collapsed.has(f.id)) result.push(...visibleRows(f.id))
    }
    for (const n of childNotes(parentId)) {
      result.push({ kind: 'note', id: n.id })
    }
    return result
  }

  function handleItemClick(e: ReactMouseEvent, kind: ItemKind, id: string): void {
    const key = makeKey(kind, id)
    if (e.shiftKey && lastSelectedKeyRef.current) {
      const rows = visibleRows(null).map((r) => makeKey(r.kind, r.id))
      const from = rows.indexOf(lastSelectedKeyRef.current)
      const to = rows.indexOf(key)
      if (from !== -1 && to !== -1) {
        const [lo, hi] = from < to ? [from, to] : [to, from]
        setSelected(new Set(rows.slice(lo, hi + 1)))
        return
      }
    }
    if (e.ctrlKey || e.metaKey) {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
      lastSelectedKeyRef.current = key
      return
    }
    setSelected(new Set([key]))
    lastSelectedKeyRef.current = key
  }

  function startRenameSelected(): void {
    if (selected.size !== 1) return
    const { kind, id } = parseKey([...selected][0])
    if (kind === 'note') {
      const note = notes.find((n) => n.id === id)
      if (!note) return
      setRenamingNoteId(id)
      setRenameValue(note.title)
    } else {
      const folder = folders.find((f) => f.id === id)
      if (!folder) return
      setRenamingFolderId(id)
      setRenameValue(folder.name)
    }
  }

  function deleteSelected(): void {
    const items = [...selected].map(parseKey)
    const folderIds = items.filter((i) => i.kind === 'folder').map((i) => i.id)
    const noteIds = items.filter((i) => i.kind === 'note').map((i) => i.id)
    if (folderIds.length === 0 && noteIds.length === 0) return
    if (!confirmDelete(folders, notes, folderIds, noteIds)) return
    noteIds.forEach(onDeleteNote)
    folderIds.forEach(onDeleteFolder)
    setSelected(new Set())
  }

  /** Paste lands inside the single selected folder, if exactly one is selected — otherwise at this section's root. */
  function pasteTargetFolderId(): string | null {
    if (selected.size !== 1) return null
    const only = parseKey([...selected][0])
    return only.kind === 'folder' ? only.id : null
  }

  function handleCopyOrCut(mode: 'copy' | 'cut'): void {
    if (selected.size === 0) return
    const mine = [...selected].map(parseKey).filter((item) => {
      if (item.kind === 'note') return notes.find((n) => n.id === item.id)?.authorUserId === myUserId
      return folders.find((f) => f.id === item.id)?.authorUserId === myUserId
    })
    if (mine.length === 0) return
    onSetClipboard(mine, mode)
  }

  function handlePaste(): void {
    if (!clipboard || clipboard.items.length === 0) return
    const targetFolderId = pasteTargetFolderId()
    if (clipboard.mode === 'cut') {
      for (const item of clipboard.items) {
        if (item.kind === 'note') {
          onMoveNote(item.id, targetFolderId, visibility)
        } else if (
          targetFolderId === null ||
          (item.id !== targetFolderId && !isSelfOrDescendantFolder(folders, item.id, targetFolderId))
        ) {
          onMoveFolder(item.id, targetFolderId, visibility)
        }
      }
      onClearClipboard()
    } else {
      for (const item of clipboard.items) {
        if (item.kind === 'note') onPasteNote(item.id, targetFolderId, visibility)
        else onPasteFolder(item.id, targetFolderId, visibility)
      }
    }
  }

  function handleKeyDown(e: ReactKeyboardEvent): void {
    if (renamingNoteId || renamingFolderId) return
    const mod = e.ctrlKey || e.metaKey
    if (e.key === 'F2') {
      e.preventDefault()
      startRenameSelected()
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      deleteSelected()
    } else if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      setSelected(new Set(visibleRows(null).map((r) => makeKey(r.kind, r.id))))
    } else if (e.key === 'Escape') {
      setSelected(new Set())
    } else if (mod && e.key.toLowerCase() === 'c') {
      e.preventDefault()
      handleCopyOrCut('copy')
    } else if (mod && e.key.toLowerCase() === 'x') {
      e.preventDefault()
      handleCopyOrCut('cut')
    } else if (mod && e.key.toLowerCase() === 'v') {
      e.preventDefault()
      handlePaste()
    }
  }

  async function handleCreateFolder(parentFolderId: string | null): Promise<void> {
    const id = await onCreateFolder('New Folder', parentFolderId)
    if (!id) return
    setRenamingFolderId(id)
    setRenameValue('New Folder')
    if (parentFolderId) {
      setCollapsed((prev) => {
        const next = new Set(prev)
        next.delete(parentFolderId)
        return next
      })
    }
  }

  function handleDragStart(e: ReactDragEvent, payload: ClipboardItem): void {
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
    e.dataTransfer.effectAllowed = 'move'
    setDraggingKey(makeKey(payload.kind, payload.id))
  }

  function handleDragEnd(): void {
    setDraggingKey(null)
    setDragOverKey(null)
  }

  function readDragPayload(e: ReactDragEvent): ClipboardItem | null {
    try {
      const raw = e.dataTransfer.getData(DRAG_MIME)
      if (!raw) return null
      return JSON.parse(raw) as ClipboardItem
    } catch {
      return null
    }
  }

  function handleFolderDragOver(e: ReactDragEvent, folder: Folder): void {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDragOverKey(`folder:${folder.id}`)
  }

  function handleFolderDragLeave(folder: Folder): void {
    setDragOverKey((k) => (k === `folder:${folder.id}` ? null : k))
  }

  function handleFolderDrop(e: ReactDragEvent, folder: Folder): void {
    e.preventDefault()
    e.stopPropagation()
    setDragOverKey(null)
    setDraggingKey(null)
    const payload = readDragPayload(e)
    if (!payload) return
    if (payload.kind === 'note') {
      onMoveNote(payload.id, folder.id, visibility)
    } else if (payload.id !== folder.id && !isSelfOrDescendantFolder(folders, payload.id, folder.id)) {
      onMoveFolder(payload.id, folder.id, visibility)
    }
  }

  function handleRootDragOver(e: ReactDragEvent): void {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverKey('root')
  }

  function handleRootDrop(e: ReactDragEvent): void {
    e.preventDefault()
    setDragOverKey(null)
    setDraggingKey(null)
    const payload = readDragPayload(e)
    if (!payload) return
    if (payload.kind === 'note') onMoveNote(payload.id, null, visibility)
    else onMoveFolder(payload.id, null, visibility)
  }

  function openBackgroundMenu(e: ReactMouseEvent): void {
    e.preventDefault()
    e.stopPropagation()
    const items: ContextMenuItem[] = [
      { label: 'New Note', icon: <NewNoteIcon />, onSelect: () => onCreateNote(null) },
      { label: 'New Folder', icon: <NewFolderIcon />, onSelect: () => void handleCreateFolder(null) }
    ]
    if (clipboard && clipboard.items.length > 0) {
      items.push({ label: 'Paste', onSelect: handlePaste })
    }
    setMenu({ x: e.clientX, y: e.clientY, items })
  }

  function openFolderMenu(e: ReactMouseEvent, folder: Folder): void {
    e.preventDefault()
    e.stopPropagation()
    if (!selected.has(makeKey('folder', folder.id))) setSelected(new Set([makeKey('folder', folder.id)]))
    const items: ContextMenuItem[] = [
      { label: 'New Note', icon: <NewNoteIcon />, onSelect: () => onCreateNote(folder.id) },
      { label: 'New Folder', icon: <NewFolderIcon />, onSelect: () => void handleCreateFolder(folder.id) }
    ]
    if (clipboard && clipboard.items.length > 0) {
      items.push({
        label: 'Paste',
        onSelect: () => {
          setSelected(new Set([makeKey('folder', folder.id)]))
          handlePaste()
        }
      })
    }
    if (folder.authorUserId === myUserId) {
      items.push(
        { label: 'Cut', onSelect: () => onSetClipboard([{ kind: 'folder', id: folder.id }], 'cut') },
        { label: 'Copy', onSelect: () => onSetClipboard([{ kind: 'folder', id: folder.id }], 'copy') },
        {
          label: 'Rename',
          onSelect: () => {
            setRenamingFolderId(folder.id)
            setRenameValue(folder.name)
          }
        },
        {
          label: 'Delete',
          danger: true,
          onSelect: () => {
            if (confirmDelete(folders, notes, [folder.id], [])) onDeleteFolder(folder.id)
          }
        }
      )
    }
    setMenu({ x: e.clientX, y: e.clientY, items })
  }

  function openNoteMenu(e: ReactMouseEvent, note: Note): void {
    e.preventDefault()
    e.stopPropagation()
    if (!selected.has(makeKey('note', note.id))) setSelected(new Set([makeKey('note', note.id)]))
    if (note.authorUserId !== myUserId) return
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Cut', onSelect: () => onSetClipboard([{ kind: 'note', id: note.id }], 'cut') },
        { label: 'Copy', onSelect: () => onSetClipboard([{ kind: 'note', id: note.id }], 'copy') },
        {
          label: 'Rename',
          onSelect: () => {
            setRenamingNoteId(note.id)
            setRenameValue(note.title)
          }
        },
        { label: 'Delete', danger: true, onSelect: () => onDeleteNote(note.id) }
      ]
    })
  }

  function commitFolderRename(): void {
    if (renamingFolderId && renameValue.trim()) onRenameFolder(renamingFolderId, renameValue.trim())
    setRenamingFolderId(null)
  }

  function commitNoteRename(): void {
    if (renamingNoteId && renameValue.trim()) onRenameNote(renamingNoteId, renameValue.trim())
    setRenamingNoteId(null)
  }

  function locateActive(): void {
    if (!activeId) return
    const note = notes.find((n) => n.id === activeId)
    if (!note) return
    const ancestors: string[] = []
    let current = note.folderId
    while (current) {
      ancestors.push(current)
      const parent = folders.find((f) => f.id === current)
      current = parent?.parentFolderId ?? null
    }
    if (ancestors.length) {
      setCollapsed((prev) => {
        const next = new Set(prev)
        ancestors.forEach((id) => next.delete(id))
        return next
      })
    }
    requestAnimationFrame(() => {
      const el = rowRefs.current.get(activeId)
      if (!el) return
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.style.background = 'var(--accent-subtle)'
      el.style.transition = 'none'
      requestAnimationFrame(() => {
        el.style.transition = 'background-color 900ms ease'
        el.style.background = ''
      })
    })
  }

  function renderFolder(folder: Folder, depth: number): ReactNode {
    const isCollapsed = collapsed.has(folder.id)
    const isRenaming = renamingFolderId === folder.id
    const isDragging = draggingKey === `folder:${folder.id}`
    const isDragOver = dragOverKey === `folder:${folder.id}`
    const isMine = folder.authorUserId === myUserId
    const isSelected = selected.has(makeKey('folder', folder.id))
    const isCutPending = clipboard?.mode === 'cut' && clipboard.items.some((i) => i.kind === 'folder' && i.id === folder.id)
    return (
      <div key={folder.id}>
        <div
          tabIndex={0}
          draggable={!isRenaming && isMine}
          title={isMine ? undefined : `Created by ${folder.authorDisplayName}`}
          onDragStart={(e) => handleDragStart(e, { kind: 'folder', id: folder.id })}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleFolderDragOver(e, folder)}
          onDragLeave={() => handleFolderDragLeave(folder)}
          onDrop={(e) => handleFolderDrop(e, folder)}
          onContextMenu={(e) => openFolderMenu(e, folder)}
          onClick={(e) => {
            e.stopPropagation()
            if (isRenaming) return
            handleItemClick(e, 'folder', folder.id)
            if (!e.ctrlKey && !e.metaKey && !e.shiftKey) toggleFolder(folder.id)
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px var(--space-3)',
            paddingLeft: 8 + depth * 14,
            cursor: 'pointer',
            fontSize: 13,
            color: 'var(--text-secondary)',
            opacity: isDragging || isCutPending ? 0.5 : 1,
            background: isDragOver ? 'var(--accent-subtle)' : isSelected ? 'var(--bg-surface-raised)' : 'transparent',
            boxShadow: isSelected ? 'inset 0 0 0 1px var(--border-strong)' : 'none',
            outline: isDragOver ? '1px dashed var(--accent)' : 'none',
            outlineOffset: -1
          }}
        >
          <span
            style={{
              display: 'flex',
              flexShrink: 0,
              transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
              transition: 'transform 100ms'
            }}
          >
            <ChevronRightIcon />
          </span>
          {isCollapsed ? <FolderIcon /> : <FolderOpenIcon />}
          {isRenaming ? (
            <input
              autoFocus
              className="gb-input"
              value={renameValue}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitFolderRename}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') commitFolderRename()
                if (e.key === 'Escape') setRenamingFolderId(null)
              }}
              style={{ fontSize: 13, padding: '1px 4px', flex: 1, minWidth: 0 }}
            />
          ) : (
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {folder.name}
            </span>
          )}
        </div>
        {!isCollapsed && (
          <div>
            {childFolders(folder.id).map((f) => renderFolder(f, depth + 1))}
            {childNotes(folder.id).map((n) => renderNote(n, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  function renderNote(note: Note, depth: number): ReactNode {
    const isRenaming = renamingNoteId === note.id
    const active = note.id === activeId
    const isDragging = draggingKey === `note:${note.id}`
    const isMine = note.authorUserId === myUserId
    const isSelected = selected.has(makeKey('note', note.id))
    const isCutPending = clipboard?.mode === 'cut' && clipboard.items.some((i) => i.kind === 'note' && i.id === note.id)
    return (
      <div
        key={note.id}
        ref={(el) => {
          if (el) rowRefs.current.set(note.id, el)
          else rowRefs.current.delete(note.id)
        }}
        draggable={!isRenaming && isMine}
        onDragStart={(e) => handleDragStart(e, { kind: 'note', id: note.id })}
        onDragEnd={handleDragEnd}
        onContextMenu={(e) => openNoteMenu(e, note)}
        style={{ opacity: isDragging || isCutPending ? 0.5 : 1 }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            if (isRenaming) return
            handleItemClick(e, 'note', note.id)
            if (!e.ctrlKey && !e.metaKey && !e.shiftKey) onSelectNote(note.id)
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            width: '100%',
            textAlign: 'left',
            padding: '5px var(--space-3)',
            paddingLeft: 8 + depth * 14 + 14,
            background: active ? 'var(--accent-subtle)' : isSelected ? 'var(--bg-surface-raised)' : 'transparent',
            border: 'none',
            borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
            boxShadow: isSelected ? 'inset 0 0 0 1px var(--border-strong)' : 'none',
            color: active ? 'var(--accent-hover)' : 'var(--text-secondary)',
            fontSize: 13,
            cursor: 'pointer'
          }}
        >
          <FileIcon />
          {isRenaming ? (
            <input
              autoFocus
              className="gb-input"
              value={renameValue}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitNoteRename}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') commitNoteRename()
                if (e.key === 'Escape') setRenamingNoteId(null)
              }}
              style={{ fontSize: 13, padding: '1px 4px', flex: 1, minWidth: 0 }}
            />
          ) : (
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {note.title || 'Untitled'}
            </span>
          )}
          {visibility === 'shared' && !isRenaming && (
            <span
              title={`Created by ${note.authorDisplayName}`}
              style={{
                flexShrink: 0,
                fontSize: 10,
                color: 'var(--text-muted)',
                background: 'var(--bg-sunken)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '1px 5px',
                maxWidth: 80,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {note.authorDisplayName}
            </span>
          )}
        </button>
      </div>
    )
  }

  const rootFolders = childFolders(null)
  const rootNotes = childNotes(null)

  return (
    <div
      onKeyDown={handleKeyDown}
      style={
        fill
          ? { height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }
          : { marginBottom: 'var(--space-3)' }
      }
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px var(--space-3)',
          flexShrink: 0
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-muted)'
          }}
        >
          {headerIcon}
          {title}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ToolbarButton title="New note" onClick={() => onCreateNote(null)}>
            <NewNoteIcon />
          </ToolbarButton>
          <ToolbarButton title="New folder" onClick={() => void handleCreateFolder(null)}>
            <NewFolderIcon />
          </ToolbarButton>
          <div ref={sortMenuRef} style={{ position: 'relative' }}>
            <ToolbarButton title={`Sort by ${sortMode}`} onClick={() => setSortMenuOpen((o) => !o)}>
              <SortIcon />
            </ToolbarButton>
            {sortMenuOpen && (
              <div
                className="gb-card"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  right: 0,
                  width: 130,
                  padding: 'var(--space-1)',
                  zIndex: 20
                }}
              >
                {(['name', 'modified', 'created'] as SortMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setSortMode(mode)
                      setSortMenuOpen(false)
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '6px var(--space-2)',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      background: sortMode === mode ? 'var(--accent-subtle)' : 'transparent',
                      color: 'var(--text-primary)',
                      fontSize: 12,
                      cursor: 'pointer',
                      textTransform: 'capitalize'
                    }}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ToolbarButton title="Collapse all folders" onClick={() => setCollapsed(new Set(folders.map((f) => f.id)))}>
            <CollapseAllIcon />
          </ToolbarButton>
          <ToolbarButton title="Expand all folders" onClick={() => setCollapsed(new Set())}>
            <ExpandAllIcon />
          </ToolbarButton>
          <ToolbarButton title="Find the open file" onClick={locateActive}>
            <LocateIcon />
          </ToolbarButton>
        </div>
      </div>

      <div
        onContextMenu={openBackgroundMenu}
        onClick={() => setSelected(new Set())}
        onDragOver={handleRootDragOver}
        onDragLeave={() => setDragOverKey((k) => (k === 'root' ? null : k))}
        onDrop={handleRootDrop}
        style={
          fill
            ? { flex: 1, minHeight: 0, background: dragOverKey === 'root' ? 'var(--accent-subtle)' : 'transparent' }
            : { minHeight: 8, background: dragOverKey === 'root' ? 'var(--accent-subtle)' : 'transparent' }
        }
      >
        {rootFolders.map((f) => renderFolder(f, 0))}
        {rootNotes.map((n) => renderNote(n, 0))}
        {rootFolders.length === 0 && rootNotes.length === 0 && (
          <div style={{ padding: '4px var(--space-3)', fontSize: 12, color: 'var(--text-muted)' }}>No notes</div>
        )}
      </div>

      <ContextMenu state={menu} onClose={() => setMenu(null)} />
    </div>
  )
}

function ToolbarButton({
  title,
  onClick,
  children
}: {
  title: string
  onClick: () => void
  children: ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'none',
        border: 'none',
        color: 'var(--text-muted)',
        cursor: 'pointer',
        padding: 3,
        borderRadius: 'var(--radius-sm)'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-surface-raised)'
        e.currentTarget.style.color = 'var(--text-primary)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'none'
        e.currentTarget.style.color = 'var(--text-muted)'
      }}
    >
      {children}
    </button>
  )
}
