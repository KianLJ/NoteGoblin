import { useEffect, useState } from 'react'
import type { Campaign, CharacterSheet, Folder, Note } from '@shared/ipc'
import type { CharacterSheetData } from '@shared/dnd5e'

export type PlayerTabRef = { kind: 'character'; id: string } | { kind: 'note'; id: string }

function sameTab(a: PlayerTabRef, b: PlayerTabRef): boolean {
  return a.kind === b.kind && a.id === b.id
}

/**
 * Mirrors useNotesWorkspace's shape but for the player side, where the
 * sidebar mixes two different kinds of "files" — your own characters
 * (always available, local, campaign-independent) and the connected
 * table's campaigns/notes — sharing one tab strip between them,
 * Obsidian-style. Also owns campaign discovery/joining for the connected
 * host, since that's what decides which notes are even in scope.
 */
export function usePlayerWorkspace(sessionId: string | undefined) {
  const [characters, setCharacters] = useState<CharacterSheet[] | null>(null)
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null)
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [folders, setFolders] = useState<Folder[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tabs, setTabs] = useState<PlayerTabRef[]>([])
  const [activeTab, setActiveTabState] = useState<PlayerTabRef | null>(null)

  // Auto-dismiss — an error toast that sits there forever just gets in the
  // way of the sidebar/editor beneath it once you've read it.
  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), 5000)
    return () => clearTimeout(timer)
  }, [error])

  useEffect(() => {
    refreshCharacters()
  }, [])

  useEffect(() => {
    setActiveCampaign(null)
    if (!sessionId) return
    resyncActiveCampaign(sessionId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  useEffect(() => {
    if (!activeCampaign) {
      setNotes(null)
      setFolders(null)
      return
    }
    refreshNotes(activeCampaign.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, activeCampaign?.id])

  useEffect(() => {
    if (!activeCampaign) return
    const campaignId = activeCampaign.id
    return window.goblin.campaigns.onChanged((event) => {
      if (event.campaignId === campaignId) refreshNotes(campaignId)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCampaign?.id])

  /** Runs once at startup (see the mount effect below) — characters come back ordered most-recently-updated first, so opening the first one here means whichever character you were last working on is already up when you switch into player mode, instead of landing on an empty state. */
  function refreshCharacters(): void {
    window.goblin.characters.list().then((result) => {
      if (!result.ok) {
        setError(result.error)
        return
      }
      setCharacters(result.data)
      if (result.data.length > 0) {
        openTab({ kind: 'character', id: result.data[0].id })
      }
    })
  }

  /** Auto-joins whatever campaign the DM currently has active, rather than making you pick one — the DM decides what "the table" is. Also doubles as a manual "catch up" if the DM switches campaigns after you've already connected (there's no live push for that yet). */
  function resyncActiveCampaign(addr: string): void {
    setError(null)
    window.goblin.campaigns.joinActive(addr).then((result) => {
      if (!result.ok) {
        setError(result.error)
        setActiveCampaign(null)
        return
      }
      setActiveCampaign(result.data)
    })
  }

  function refreshNotes(campaignId: string): void {
    window.goblin.notes.list(campaignId, sessionId).then((result) => {
      if (!result.ok) {
        setError(result.error)
        return
      }
      setNotes(result.data)
    })
    window.goblin.folders.list(campaignId, sessionId).then((result) => {
      if (!result.ok) {
        setError(result.error)
        return
      }
      setFolders(result.data)
    })
  }


  function openTab(ref: PlayerTabRef): void {
    setTabs((prev) => (prev.some((t) => sameTab(t, ref)) ? prev : [...prev, ref]))
    setActiveTabState(ref)
  }

  function closeTab(ref: PlayerTabRef): void {
    setTabs((prev) => {
      const next = prev.filter((t) => !sameTab(t, ref))
      setActiveTabState((current) =>
        current && sameTab(current, ref) ? (next[next.length - 1] ?? null) : current
      )
      return next
    })
  }

  async function createCharacter(name: string, sheet: CharacterSheetData): Promise<void> {
    setError(null)
    const result = await window.goblin.characters.create(name, sheet)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setCharacters((prev) => (prev ? [result.data, ...prev] : [result.data]))
    openTab({ kind: 'character', id: result.data.id })
  }

  async function saveCharacter(id: string, patch: Partial<CharacterSheetData> & { name?: string }): Promise<void> {
    const result = await window.goblin.characters.update(id, patch)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setCharacters((prev) => prev?.map((c) => (c.id === id ? result.data : c)) ?? prev)
  }

  async function deleteCharacter(id: string): Promise<void> {
    const result = await window.goblin.characters.remove(id)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setCharacters((prev) => prev?.filter((c) => c.id !== id) ?? prev)
    closeTab({ kind: 'character', id })
  }

  async function createNote(
    visibility: 'dm' | 'shared' | 'private',
    folderId: string | null = null,
    title: string = 'Untitled'
  ): Promise<void> {
    if (!activeCampaign) return
    setError(null)
    const result = await window.goblin.notes.create(
      activeCampaign.id,
      { title, bodyMarkdown: '', visibility, folderId },
      sessionId
    )
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotes((prev) => (prev ? [result.data, ...prev] : [result.data]))
    openTab({ kind: 'note', id: result.data.id })
  }

  async function saveNote(
    id: string,
    patch: {
      title?: string
      bodyMarkdown?: string
      folderId?: string | null
      visibility?: 'dm' | 'shared' | 'private'
      editorUserIds?: string[]
    }
  ): Promise<void> {
    if (!activeCampaign) return
    const result = await window.goblin.notes.update(activeCampaign.id, id, patch, sessionId)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotes((prev) => prev?.map((n) => (n.id === id ? result.data : n)) ?? prev)
  }

  async function deleteNote(id: string): Promise<void> {
    if (!activeCampaign) return
    const result = await window.goblin.notes.remove(activeCampaign.id, id, sessionId)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotes((prev) => prev?.filter((n) => n.id !== id) ?? prev)
    closeTab({ kind: 'note', id })
  }

  async function createFolder(
    visibility: 'dm' | 'shared' | 'private',
    name: string,
    parentFolderId: string | null = null
  ): Promise<string | undefined> {
    if (!activeCampaign) return undefined
    setError(null)
    const result = await window.goblin.folders.create(
      activeCampaign.id,
      { name, visibility, parentFolderId },
      sessionId
    )
    if (!result.ok) {
      setError(result.error)
      return undefined
    }
    setFolders((prev) => (prev ? [...prev, result.data] : [result.data]))
    return result.data.id
  }

  async function renameFolder(folderId: string, name: string): Promise<void> {
    if (!activeCampaign) return
    const result = await window.goblin.folders.update(activeCampaign.id, folderId, { name }, sessionId)
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
    if (!activeCampaign) return
    const result = await window.goblin.folders.update(
      activeCampaign.id,
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
    if (!activeCampaign) return
    const result = await window.goblin.folders.remove(activeCampaign.id, folderId, sessionId)
    if (!result.ok) {
      setError(result.error)
      return
    }
    refreshNotes(activeCampaign.id)
  }

  /** Copy-paste for a single note. */
  async function duplicateNote(
    sourceId: string,
    targetFolderId: string | null,
    targetVisibility: 'dm' | 'shared' | 'private'
  ): Promise<void> {
    if (!activeCampaign) return
    const source = notes?.find((n) => n.id === sourceId)
    if (!source) return
    setError(null)
    const result = await window.goblin.notes.create(
      activeCampaign.id,
      { title: source.title, bodyMarkdown: source.bodyMarkdown, visibility: targetVisibility, folderId: targetFolderId },
      sessionId
    )
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotes((prev) => (prev ? [result.data, ...prev] : [result.data]))
  }

  /** Copy-paste for a folder — recursively duplicates its whole subtree under the new parent, from a stable snapshot of notes/folders taken when called. */
  async function duplicateFolder(
    sourceId: string,
    targetParentId: string | null,
    targetVisibility: 'dm' | 'shared' | 'private'
  ): Promise<void> {
    if (!activeCampaign) return
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

  const activeCharacter =
    activeTab?.kind === 'character' ? (characters?.find((c) => c.id === activeTab.id) ?? null) : null
  const activeNote =
    activeTab?.kind === 'note' ? (notes?.find((n) => n.id === activeTab.id) ?? null) : null

  const tabItems = tabs.map((ref) =>
    ref.kind === 'character'
      ? { ref, title: characters?.find((c) => c.id === ref.id)?.name ?? '…' }
      : { ref, title: notes?.find((n) => n.id === ref.id)?.title ?? '…' }
  )

  return {
    characters,
    activeCampaign,
    notes,
    folders,
    error,
    tabItems,
    activeTab,
    setActiveTab: openTab,
    openTab,
    closeTab,
    resync: () => sessionId && resyncActiveCampaign(sessionId),
    createCharacter,
    saveCharacter,
    deleteCharacter,
    createNote,
    saveNote,
    deleteNote,
    createFolder,
    renameFolder,
    moveFolder,
    deleteFolder,
    duplicateNote,
    duplicateFolder,
    activeCharacter,
    activeNote
  }
}

export type PlayerWorkspace = ReturnType<typeof usePlayerWorkspace>
