import { useEffect, useState } from 'react'
import type { Note } from '@shared/ipc'

/**
 * Owns notes/tabs state for one open campaign. Called once at the AppShell
 * level (always, even when no campaign is open — campaignId is then null and
 * this is a no-op) so both the header's tab strip and the sidebar/editor body
 * share a single source of truth instead of each fetching independently.
 */
export function useNotesWorkspace(address: string | undefined, campaignId: string | null) {
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openTabs, setOpenTabs] = useState<string[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    if (!campaignId) {
      setNotes(null)
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

  async function createNote(visibility: 'dm' | 'shared'): Promise<void> {
    if (!campaignId) return
    setError(null)
    const result = await window.goblin.notes.create(
      campaignId,
      { title: 'Untitled', bodyMarkdown: '', visibility },
      address
    )
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotes((prev) => (prev ? [result.data, ...prev] : [result.data]))
    openNote(result.data.id)
  }

  async function saveNote(noteId: string, patch: { title?: string; bodyMarkdown?: string }): Promise<void> {
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

  const activeNote = notes?.find((n) => n.id === activeId) ?? null
  const tabNotes = notes
    ? (openTabs.map((id) => notes.find((n) => n.id === id)).filter(Boolean) as Note[])
    : []

  return {
    notes,
    error,
    activeNote,
    tabNotes,
    activeId,
    setActiveId,
    openNote,
    closeTab,
    createNote,
    saveNote,
    deleteNote
  }
}

export type NotesWorkspace = ReturnType<typeof useNotesWorkspace>
