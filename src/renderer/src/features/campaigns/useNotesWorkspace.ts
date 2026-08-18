import { useEffect, useRef, useState } from 'react'
import type { Folder, Note } from '@shared/ipc'

/**
 * Owns notes/tabs state for one open campaign. Called once at the AppShell
 * level (always, even when no campaign is open — campaignId is then null and
 * this is a no-op) so both the header's tab strip and the sidebar/editor body
 * share a single source of truth instead of each fetching independently.
 */

function tabsStorageKey(campaignId: string): string {
  return `gb-open-tabs:${campaignId}`
}

function loadPersistedTabs(campaignId: string): { openTabs: string[]; activeId: string | null } {
  try {
    const raw = localStorage.getItem(tabsStorageKey(campaignId))
    if (!raw) return { openTabs: [], activeId: null }
    const parsed = JSON.parse(raw) as { openTabs?: unknown; activeId?: unknown }
    const openTabs = Array.isArray(parsed.openTabs) ? parsed.openTabs.filter((id): id is string => typeof id === 'string') : []
    const activeId = typeof parsed.activeId === 'string' ? parsed.activeId : null
    return { openTabs, activeId }
  } catch {
    return { openTabs: [], activeId: null }
  }
}

export function useNotesWorkspace(sessionId: string | undefined, campaignId: string | null) {
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [folders, setFolders] = useState<Folder[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openTabs, setOpenTabs] = useState<string[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  // Which campaign's persisted tabs have already been restored this session
  // — restoring is a one-time thing per campaign switch, not something that
  // should re-run (and stomp on whatever you have open) every time a live
  // 'campaigns.onChanged' event triggers a background refresh.
  const restoredForRef = useRef<string | null>(null)

  // Auto-dismiss — an error toast that sits there forever just gets in the
  // way of the sidebar/editor beneath it once you've read it.
  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), 5000)
    return () => clearTimeout(timer)
  }, [error])

  useEffect(() => {
    if (!campaignId) {
      setNotes(null)
      setFolders(null)
      setOpenTabs([])
      setActiveId(null)
      setError(null)
      return
    }
    // Clear immediately on switching to a different campaign — otherwise the
    // previous campaign's tabs stay in state (just silently unresolvable)
    // until this campaign's own persisted tabs get restored below.
    if (restoredForRef.current !== campaignId) {
      setOpenTabs([])
      setActiveId(null)
    }
    refresh(campaignId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, campaignId])

  useEffect(() => {
    if (!campaignId) return
    return window.goblin.campaigns.onChanged((event) => {
      if (event.campaignId === campaignId) refresh(campaignId)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId])

  // Persist whenever the open tabs (or which one's active) actually change —
  // so they survive closing and reopening the app, not just switching
  // screens within one run of it.
  useEffect(() => {
    if (!campaignId || restoredForRef.current !== campaignId) return
    localStorage.setItem(tabsStorageKey(campaignId), JSON.stringify({ openTabs, activeId }))
  }, [campaignId, openTabs, activeId])

  function refresh(id: string): void {
    window.goblin.notes.list(id, sessionId).then((result) => {
      if (!result.ok) {
        setError(result.error)
        return
      }
      setNotes(result.data)
      if (restoredForRef.current !== id) {
        restoredForRef.current = id
        const persisted = loadPersistedTabs(id)
        const validIds = new Set(result.data.map((n) => n.id))
        const restoredTabs = persisted.openTabs.filter((tabId) => validIds.has(tabId))
        setOpenTabs(restoredTabs)
        setActiveId(persisted.activeId && restoredTabs.includes(persisted.activeId) ? persisted.activeId : (restoredTabs[restoredTabs.length - 1] ?? null))
      }
    })
    window.goblin.folders.list(id, sessionId).then((result) => {
      if (!result.ok) {
        setError(result.error)
        return
      }
      setFolders(result.data)
    })
  }

  function openNote(noteId: string): void {
    setOpenTabs((tabs) => (tabs.includes(noteId) ? tabs : [...tabs, noteId]))
    setActiveId(noteId)
  }

  /** Wikilink navigation replaces the active tab's slot instead of always adding a new one — the "preview tab" pattern (VS Code, Obsidian): clicking through a chain of links doesn't leave a trail of tabs behind. Switches to the target's existing tab instead of duplicating it if it's already open. Explicit "open in new tab" still goes through openNote. */
  function navigateToNote(noteId: string): void {
    setOpenTabs((tabs) => {
      if (tabs.includes(noteId)) return tabs
      if (activeId === null) return [...tabs, noteId]
      return tabs.map((id) => (id === activeId ? noteId : id))
    })
    setActiveId(noteId)
  }

  function closeTab(noteId: string): void {
    setOpenTabs((tabs) => {
      const next = tabs.filter((id) => id !== noteId)
      setActiveId((current) => (current === noteId ? (next[next.length - 1] ?? null) : current))
      return next
    })
  }

  /** Drag-and-drop tab reordering — moves `draggedId` to sit just before `targetId` in the strip. A no-op if either id isn't currently an open tab. */
  function moveTab(draggedId: string, targetId: string): void {
    if (draggedId === targetId) return
    setOpenTabs((tabs) => {
      if (!tabs.includes(draggedId) || !tabs.includes(targetId)) return tabs
      const withoutDragged = tabs.filter((id) => id !== draggedId)
      const targetIndex = withoutDragged.indexOf(targetId)
      return [...withoutDragged.slice(0, targetIndex), draggedId, ...withoutDragged.slice(targetIndex)]
    })
  }

  async function createNote(
    visibility: 'dm' | 'shared' | 'private',
    folderId: string | null = null,
    title: string = 'Untitled'
  ): Promise<void> {
    if (!campaignId) return
    setError(null)
    const result = await window.goblin.notes.create(
      campaignId,
      { title, bodyMarkdown: '', visibility, folderId },
      sessionId
    )
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotes((prev) => (prev ? [result.data, ...prev] : [result.data]))
    openNote(result.data.id)
  }

  async function saveNote(
    noteId: string,
    patch: { title?: string; bodyMarkdown?: string; folderId?: string | null; visibility?: 'dm' | 'shared' | 'private' }
  ): Promise<void> {
    if (!campaignId) return
    const result = await window.goblin.notes.update(campaignId, noteId, patch, sessionId)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotes((prev) => prev?.map((n) => (n.id === noteId ? result.data : n)) ?? prev)
  }

  async function deleteNote(noteId: string): Promise<void> {
    if (!campaignId) return
    const result = await window.goblin.notes.remove(campaignId, noteId, sessionId)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotes((prev) => prev?.filter((n) => n.id !== noteId) ?? prev)
    closeTab(noteId)
  }

  async function createFolder(
    visibility: 'dm' | 'shared' | 'private',
    name: string,
    parentFolderId: string | null = null
  ): Promise<string | undefined> {
    if (!campaignId) return undefined
    setError(null)
    const result = await window.goblin.folders.create(campaignId, { name, visibility, parentFolderId }, sessionId)
    if (!result.ok) {
      setError(result.error)
      return undefined
    }
    setFolders((prev) => (prev ? [...prev, result.data] : [result.data]))
    return result.data.id
  }

  async function renameFolder(folderId: string, name: string): Promise<void> {
    if (!campaignId) return
    const result = await window.goblin.folders.update(campaignId, folderId, { name }, sessionId)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setFolders((prev) => prev?.map((f) => (f.id === folderId ? result.data : f)) ?? prev)
  }

  async function moveFolder(
    folderId: string,
    parentFolderId: string | null,
    visibility?: 'dm' | 'shared' | 'private'
  ): Promise<void> {
    if (!campaignId) return
    const result = await window.goblin.folders.update(
      campaignId,
      folderId,
      { parentFolderId, ...(visibility ? { visibility } : {}) },
      sessionId
    )
    if (!result.ok) {
      setError(result.error)
      return
    }
    setFolders((prev) => prev?.map((f) => (f.id === folderId ? result.data : f)) ?? prev)
  }

  async function deleteFolder(folderId: string): Promise<void> {
    if (!campaignId) return
    const result = await window.goblin.folders.remove(campaignId, folderId, sessionId)
    if (!result.ok) {
      setError(result.error)
      return
    }
    // Deletes everything in the subtree server-side — refetch rather than
    // trying to locally replicate which notes/folders just disappeared.
    refresh(campaignId)
  }

  /** Copy-paste for a single note — a plain duplicate, unlike moveNote (cut-paste) which reuses saveNote's folderId patch. */
  async function duplicateNote(
    sourceId: string,
    targetFolderId: string | null,
    targetVisibility: 'dm' | 'shared' | 'private'
  ): Promise<void> {
    if (!campaignId) return
    const source = notes?.find((n) => n.id === sourceId)
    if (!source) return
    setError(null)
    const result = await window.goblin.notes.create(
      campaignId,
      { title: source.title, bodyMarkdown: source.bodyMarkdown, visibility: targetVisibility, folderId: targetFolderId },
      sessionId
    )
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotes((prev) => (prev ? [result.data, ...prev] : [result.data]))
  }

  /** Copy-paste for a folder — recursively duplicates every sub-folder and note beneath it too, mirroring the structure under the new parent. Walks the notes/folders arrays as they were when called (a stable snapshot), not whatever they've become by the time deep recursion finishes. */
  async function duplicateFolder(
    sourceId: string,
    targetParentId: string | null,
    targetVisibility: 'dm' | 'shared' | 'private'
  ): Promise<void> {
    if (!campaignId) return
    const sourceFolders = folders ?? []
    const sourceNotes = notes ?? []
    const source = sourceFolders.find((f) => f.id === sourceId)
    if (!source) return

    async function copySubtree(folderId: string, parentId: string | null): Promise<void> {
      const original = sourceFolders.find((f) => f.id === folderId)
      if (!original) return
      const newId = await createFolder(targetVisibility, original.name, parentId)
      if (!newId) return
      for (const child of sourceFolders.filter((f) => f.parentFolderId === folderId)) {
        await copySubtree(child.id, newId)
      }
      for (const note of sourceNotes.filter((n) => n.folderId === folderId)) {
        await duplicateNote(note.id, newId, targetVisibility)
      }
    }

    await copySubtree(source.id, targetParentId)
  }

  const activeNote = notes?.find((n) => n.id === activeId) ?? null
  const tabNotes = notes
    ? (openTabs.map((id) => notes.find((n) => n.id === id)).filter(Boolean) as Note[])
    : []

  return {
    notes,
    folders,
    error,
    activeNote,
    tabNotes,
    activeId,
    setActiveId,
    openNote,
    navigateToNote,
    closeTab,
    moveTab,
    createNote,
    saveNote,
    deleteNote,
    createFolder,
    renameFolder,
    moveFolder,
    deleteFolder,
    duplicateNote,
    duplicateFolder
  }
}

export type NotesWorkspace = ReturnType<typeof useNotesWorkspace>
