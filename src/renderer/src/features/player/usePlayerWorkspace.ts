import { useEffect, useState } from 'react'
import type { Campaign, CampaignSnapshot, CharacterSheet, Folder, Note } from '@shared/ipc'
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
  // Sticky across tab switches — unlike activeTab/activeCharacter (which go
  // null the moment you switch to a note tab), this is what the DM/other
  // players should keep seeing: whichever character you had open most
  // recently, not "nothing" just because you're reading a note right now.
  const [lastCharacterId, setLastCharacterId] = useState<string | null>(null)
  // Offline snapshots — a read-only fallback for a joined campaign when the
  // DM isn't currently hosting. `isOffline` is true only while viewing a
  // cached snapshot (never while actually connected); `offlineSyncedAt` is
  // that snapshot's timestamp, for the "as of" label in the UI.
  const [offlineSnapshots, setOfflineSnapshots] = useState<CampaignSnapshot[] | null>(null)
  const [isOffline, setIsOffline] = useState(false)
  const [offlineSyncedAt, setOfflineSyncedAt] = useState<string | null>(null)

  // Auto-dismiss — an error toast that sits there forever just gets in the
  // way of the sidebar/editor beneath it once you've read it.
  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), 5000)
    return () => clearTimeout(timer)
  }, [error])

  useEffect(() => {
    refreshCharacters()
    refreshOfflineSnapshots()
  }, [])

  useEffect(() => {
    setActiveCampaign(null)
    setIsOffline(false)
    setOfflineSyncedAt(null)
    if (!sessionId) return
    resyncActiveCampaign(sessionId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  useEffect(() => {
    if (isOffline) return
    if (!activeCampaign) {
      setNotes(null)
      setFolders(null)
      return
    }
    refreshNotes(activeCampaign)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, activeCampaign?.id, isOffline])

  useEffect(() => {
    if (!activeCampaign || isOffline) return
    const campaign = activeCampaign
    return window.goblin.campaigns.onChanged((event) => {
      if (event.campaignId === campaign.id) refreshNotes(campaign)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCampaign?.id, isOffline])

  // Live push for when the DM switches their active campaign after we've
  // already connected — used to require the manual "Sync" button.
  useEffect(() => {
    if (!sessionId) return
    return window.goblin.campaigns.onActiveChanged(() => resyncActiveCampaign(sessionId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // Records whichever character tab you last had open — deliberately never
  // cleared just because you switched to a note tab, so the table's view of
  // "who you're playing" survives you reading/writing notes.
  useEffect(() => {
    if (activeTab?.kind === 'character') setLastCharacterId(activeTab.id)
  }, [activeTab])

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

  /** Auto-joins whatever campaign the DM currently has active, rather than making you pick one — the DM decides what "the table" is. Also used by the live active-campaign-changed push, and by the manual "Sync" button as a fallback. */
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

  /** Also writes through to the offline snapshot cache once both lists land — see the `snapshots` IPC surface — so this campaign stays browsable read-only once the DM stops hosting. */
  function refreshNotes(campaign: Campaign): void {
    const campaignId = campaign.id
    Promise.all([window.goblin.notes.list(campaignId, sessionId), window.goblin.folders.list(campaignId, sessionId)]).then(
      ([notesResult, foldersResult]) => {
        if (!notesResult.ok) {
          setError(notesResult.error)
          return
        }
        setNotes(notesResult.data)
        if (!foldersResult.ok) {
          setError(foldersResult.error)
          return
        }
        setFolders(foldersResult.data)
        window.goblin.snapshots.save(campaign, notesResult.data, foldersResult.data).then(refreshOfflineSnapshots)
      }
    )
  }

  /** Every campaign previously cached while connected — shown as an "Offline" fallback for when the DM isn't currently hosting. */
  function refreshOfflineSnapshots(): void {
    window.goblin.snapshots.list().then((result) => {
      if (result.ok) setOfflineSnapshots(result.data)
    })
  }

  /** Opens a cached snapshot read-only — the last-known state of a joined campaign, for browsing while the DM isn't hosting. */
  function openOfflineCampaign(campaignId: string): void {
    setError(null)
    window.goblin.snapshots.get(campaignId).then((result) => {
      if (!result.ok || !result.data) {
        setError(result.ok ? "That campaign hasn't been synced yet." : result.error)
        return
      }
      setIsOffline(true)
      setOfflineSyncedAt(result.data.syncedAt)
      setActiveCampaign(result.data.campaign)
      setNotes(result.data.notes)
      setFolders(result.data.folders)
    })
  }


  function openTab(ref: PlayerTabRef): void {
    setTabs((prev) => (prev.some((t) => sameTab(t, ref)) ? prev : [...prev, ref]))
    setActiveTabState(ref)
  }

  /** Wikilink navigation replaces the active tab's slot instead of always adding a new one (the "preview tab" pattern) — switches to the target's existing tab instead of duplicating it if it's already open. Explicit "open in new tab" still goes through openTab. */
  function navigateToNote(noteId: string): void {
    const ref: PlayerTabRef = { kind: 'note', id: noteId }
    setTabs((prev) => {
      if (prev.some((t) => sameTab(t, ref))) return prev
      if (!activeTab) return [...prev, ref]
      return prev.map((t) => (sameTab(t, activeTab) ? ref : t))
    })
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

  /** Drag-and-drop tab reordering — moves `dragged` to sit just before `target` in the strip. A no-op if either ref isn't currently an open tab. */
  function moveTab(dragged: PlayerTabRef, target: PlayerTabRef): void {
    if (sameTab(dragged, target)) return
    setTabs((prev) => {
      if (!prev.some((t) => sameTab(t, dragged)) || !prev.some((t) => sameTab(t, target))) return prev
      const withoutDragged = prev.filter((t) => !sameTab(t, dragged))
      const targetIndex = withoutDragged.findIndex((t) => sameTab(t, target))
      return [...withoutDragged.slice(0, targetIndex), dragged, ...withoutDragged.slice(targetIndex)]
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
    if (!activeCampaign || !guardOnline()) return
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
    if (!activeCampaign || !guardOnline()) return
    const result = await window.goblin.notes.update(activeCampaign.id, id, patch, sessionId)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotes((prev) => prev?.map((n) => (n.id === id ? result.data : n)) ?? prev)
  }

  async function deleteNote(id: string): Promise<void> {
    if (!activeCampaign || !guardOnline()) return
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
    if (!activeCampaign || !guardOnline()) return undefined
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
    if (!activeCampaign || !guardOnline()) return
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
    if (!activeCampaign || !guardOnline()) return
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
    if (!activeCampaign || !guardOnline()) return
    const result = await window.goblin.folders.remove(activeCampaign.id, folderId, sessionId)
    if (!result.ok) {
      setError(result.error)
      return
    }
    refreshNotes(activeCampaign)
  }

  /** Copy-paste for a single note. */
  async function duplicateNote(
    sourceId: string,
    targetFolderId: string | null,
    targetVisibility: 'dm' | 'shared' | 'private'
  ): Promise<void> {
    if (!activeCampaign || !guardOnline()) return
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
    if (!activeCampaign || !guardOnline()) return
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

  /** Every mutation below goes through this first — an offline snapshot is read-only, so calls simply no-op with an explanatory error rather than pretending to save. */
  function guardOnline(): boolean {
    if (isOffline) {
      setError("You're viewing an offline snapshot — connect to the DM to make changes.")
      return false
    }
    return true
  }

  const activeCharacter =
    activeTab?.kind === 'character' ? (characters?.find((c) => c.id === activeTab.id) ?? null) : null
  const activeNote =
    activeTab?.kind === 'note' ? (notes?.find((n) => n.id === activeTab.id) ?? null) : null
  // What the table should be told you're playing — falls back to the last
  // character tab you had open (see the effect above) when you're currently
  // on a note tab, instead of announcing "nothing selected."
  const lastActiveCharacter = activeCharacter ?? characters?.find((c) => c.id === lastCharacterId) ?? null

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
    navigateToNote,
    closeTab,
    moveTab,
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
    activeNote,
    lastActiveCharacter,
    offlineSnapshots,
    isOffline,
    offlineSyncedAt,
    openOfflineCampaign,
    refreshOfflineSnapshots
  }
}

export type PlayerWorkspace = ReturnType<typeof usePlayerWorkspace>
