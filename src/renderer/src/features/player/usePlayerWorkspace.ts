import { useEffect, useRef, useState } from 'react'
import type { Campaign, CharacterSheet, Note } from '@shared/ipc'

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
export function usePlayerWorkspace(address: string | undefined) {
  const [characters, setCharacters] = useState<CharacterSheet[] | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null)
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null)
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tabs, setTabs] = useState<PlayerTabRef[]>([])
  const [activeTab, setActiveTabState] = useState<PlayerTabRef | null>(null)

  const autoOpenedForRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    refreshCharacters()
  }, [])

  useEffect(() => {
    setActiveCampaign(null)
    setCampaigns(null)
    if (!address) return
    refreshCampaigns(address)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])

  useEffect(() => {
    if (!activeCampaign) {
      setNotes(null)
      return
    }
    refreshNotes(activeCampaign.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, activeCampaign?.id])

  function refreshCharacters(): void {
    window.goblin.characters.list().then((result) => {
      if (!result.ok) {
        setError(result.error)
        return
      }
      setCharacters(result.data)
    })
  }

  function refreshCampaigns(addr: string): void {
    window.goblin.campaigns.list(addr).then((result) => {
      if (!result.ok) {
        setError(result.error)
        return
      }
      setCampaigns(result.data)
      // Auto-open the most recent campaign you're already part of, once per
      // connected host — you can still switch/join others from the sidebar.
      if (autoOpenedForRef.current !== addr) {
        autoOpenedForRef.current = addr
        const mine = result.data.filter((c) => c.myRole !== null)
        if (mine.length > 0) setActiveCampaign(mine[0])
      }
    })
  }

  function refreshNotes(campaignId: string): void {
    window.goblin.notes.list(campaignId, address).then((result) => {
      if (!result.ok) {
        setError(result.error)
        return
      }
      setNotes(result.data)
    })
  }

  async function joinCampaign(campaignId: string): Promise<void> {
    if (!address) return
    setError(null)
    const result = await window.goblin.campaigns.join(campaignId, address)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setActiveCampaign(result.data)
    refreshCampaigns(address)
  }

  function selectCampaign(campaign: Campaign): void {
    setActiveCampaign(campaign)
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

  async function createCharacter(name: string): Promise<void> {
    setError(null)
    const result = await window.goblin.characters.create(name)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setCharacters((prev) => (prev ? [result.data, ...prev] : [result.data]))
    openTab({ kind: 'character', id: result.data.id })
  }

  async function saveCharacter(id: string, patch: { name?: string; notes?: string }): Promise<void> {
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

  async function createNote(): Promise<void> {
    if (!activeCampaign) return
    setError(null)
    const result = await window.goblin.notes.create(
      activeCampaign.id,
      { title: 'Untitled', bodyMarkdown: '', visibility: 'shared' },
      address
    )
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotes((prev) => (prev ? [result.data, ...prev] : [result.data]))
    openTab({ kind: 'note', id: result.data.id })
  }

  async function saveNote(id: string, patch: { title?: string; bodyMarkdown?: string }): Promise<void> {
    if (!activeCampaign) return
    const result = await window.goblin.notes.update(activeCampaign.id, id, patch, address)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotes((prev) => prev?.map((n) => (n.id === id ? result.data : n)) ?? prev)
  }

  async function deleteNote(id: string): Promise<void> {
    if (!activeCampaign) return
    const result = await window.goblin.notes.remove(activeCampaign.id, id, address)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotes((prev) => prev?.filter((n) => n.id !== id) ?? prev)
    closeTab({ kind: 'note', id })
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
    campaigns,
    activeCampaign,
    notes,
    error,
    tabItems,
    activeTab,
    setActiveTab: openTab,
    openTab,
    closeTab,
    joinCampaign,
    selectCampaign,
    createCharacter,
    saveCharacter,
    deleteCharacter,
    createNote,
    saveNote,
    deleteNote,
    activeCharacter,
    activeNote
  }
}

export type PlayerWorkspace = ReturnType<typeof usePlayerWorkspace>
