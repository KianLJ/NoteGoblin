import { useEffect, useState } from 'react'
import type { Folder, Note } from '@shared/ipc'

/**
 * Owns notes/tabs state for one open campaign. Called once at the AppShell
 * level (always, even when no campaign is open — campaignId is then null and
 * this is a no-op) so both the header's tab strip and the sidebar/editor body
 * share a single source of truth instead of each fetching independently.
 */
export function useNotesWorkspace(address: string | undefined, campaignId: string | null) {
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [folders, setFolders] = useState<Folder[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openTabs, setOpenTabs] = useState<string[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    if (!campaignId) {
      setNotes(null)
      setFolders(null)
      setOpenTabs([])
      setActiveId(null)
      setError(null)
      return
    }
    refresh(campaignId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, campaignId])

  function refresh(id: string): void {
    window.goblin.notes.list(id, address).then((result) => {
      if (!result.ok) {
        setError(result.error)
        return
      }
      setNotes(result.data)
    })
    window.goblin.folders.list(id, address).then((result) => {
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

  function closeTab(noteId: string): void {
    setOpenTabs((tabs) => {
      const next = tabs.filter((id) => id !== noteId)
      setActiveId((current) => (current === noteId ? (next[next.length - 1] ?? null) : current))
      return next
    })
  }

  async function createNote(visibility: 'dm' | 'shared', folderId: string | null = null): Promise<void> {
    if (!campaignId) return
    setError(null)
    const result = await window.goblin.notes.create(
      campaignId,
      { title: 'Untitled', bodyMarkdown: '', visibility, folderId },
      address
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
    patch: { title?: string; bodyMarkdown?: string; folderId?: string | null; visibility?: 'dm' | 'shared' }
  ): Promise<void> {
    if (!campaignId) return
    const result = await window.goblin.notes.update(campaignId, noteId, patch, address)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotes((prev) => prev?.map((n) => (n.id === noteId ? result.data : n)) ?? prev)
  }

  async function deleteNote(noteId: string): Promise<void> {
    if (!campaignId) return
    const result = await window.goblin.notes.remove(campaignId, noteId, address)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotes((prev) => prev?.filter((n) => n.id !== noteId) ?? prev)
    closeTab(noteId)
  }

  async function createFolder(
    visibility: 'dm' | 'shared',
    name: string,
    parentFolderId: string | null = null
  ): Promise<string | undefined> {
    if (!campaignId) return undefined
    setError(null)
    const result = await window.goblin.folders.create(campaignId, { name, visibility, parentFolderId }, address)
    if (!result.ok) {
      setError(result.error)
      return undefined
    }
    setFolders((prev) => (prev ? [...prev, result.data] : [result.data]))
    return result.data.id
  }

  async function renameFolder(folderId: string, name: string): Promise<void> {
    if (!campaignId) return
    const result = await window.goblin.folders.update(campaignId, folderId, { name }, address)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setFolders((prev) => prev?.map((f) => (f.id === folderId ? result.data : f)) ?? prev)
  }

  async function moveFolder(
    folderId: string,
    parentFolderId: string | null,
    visibility?: 'dm' | 'shared'
  ): Promise<void> {
    if (!campaignId) return
    const result = await window.goblin.folders.update(
      campaignId,
      folderId,
      { parentFolderId, ...(visibility ? { visibility } : {}) },
      address
    )
    if (!result.ok) {
      setError(result.error)
      return
    }
    setFolders((prev) => prev?.map((f) => (f.id === folderId ? result.data : f)) ?? prev)
  }

  async function deleteFolder(folderId: string): Promise<void> {
    if (!campaignId) return
    const result = await window.goblin.folders.remove(campaignId, folderId, address)
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
    targetVisibility: 'dm' | 'shared'
  ): Promise<void> {
    if (!campaignId) return
    const source = notes?.find((n) => n.id === sourceId)
    if (!source) return
    setError(null)
    const result = await window.goblin.notes.create(
      campaignId,
      { title: source.title, bodyMarkdown: source.bodyMarkdown, visibility: targetVisibility, folderId: targetFolderId },
      address
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
    targetVisibility: 'dm' | 'shared'
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
    closeTab,
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
