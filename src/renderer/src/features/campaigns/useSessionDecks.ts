import { useCallback, useEffect, useState } from 'react'
import type { SessionDeck, LiveSceneState } from '@shared/sessionDeck'
import type { Note } from '@shared/ipc'

/**
 * Session decks for one campaign, plus the live presentation cursor. Deck
 * list/ordering changes are picked up via the same campaigns.onChanged
 * refetch signal notes/folders/calendar already use (a scene's actual
 * title/body is a real Note, refreshed the normal way through that same
 * signal — see useNotesWorkspace.ts/usePlayerWorkspace.ts). The live cursor
 * is a separate, lighter push (sessionDecks.onSceneChanged) so clicking
 * "Next Scene" doesn't mean re-fetching every deck on every click.
 */
export function useSessionDecks(campaignId: string | null, sessionId: string | null, offlineDecks?: SessionDeck[] | null) {
  const isOffline = offlineDecks != null
  const [decks, setDecks] = useState<SessionDeck[]>([])
  const [loading, setLoading] = useState(false)
  const [live, setLive] = useState<LiveSceneState>({ deckId: null, sceneIndex: -1 })

  const refresh = useCallback(async () => {
    if (isOffline) {
      setDecks(offlineDecks)
      return
    }
    if (!campaignId) {
      setDecks([])
      return
    }
    setLoading(true)
    const result = await window.goblin.sessionDecks.list(campaignId, sessionId ?? undefined)
    if (result.ok) setDecks(result.data)
    setLoading(false)
  }, [campaignId, sessionId, isOffline, offlineDecks])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (isOffline) return
    return window.goblin.campaigns.onChanged((event) => {
      if (campaignId && event.campaignId === campaignId) void refresh()
    })
  }, [campaignId, refresh, isOffline])

  useEffect(() => {
    // Nothing is "live" while browsing a cached snapshot — there's no
    // connection to receive a presentation cursor over even if one exists.
    if (isOffline || !campaignId) {
      setLive({ deckId: null, sceneIndex: -1 })
      return
    }
    let cancelled = false
    void window.goblin.sessionDecks.getLive(campaignId, sessionId ?? undefined).then((result) => {
      if (!cancelled && result.ok) setLive(result.data)
    })
    const unsubscribe = window.goblin.sessionDecks.onSceneChanged((update) => {
      if (update.campaignId === campaignId) setLive({ deckId: update.deckId, sceneIndex: update.sceneIndex })
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [campaignId, sessionId, isOffline])

  async function createDeck(title: string): Promise<SessionDeck | undefined> {
    if (isOffline || !campaignId) return undefined
    const result = await window.goblin.sessionDecks.create(campaignId, title, sessionId ?? undefined)
    if (!result.ok) return undefined
    await refresh()
    return result.data
  }

  async function renameDeck(deckId: string, title: string): Promise<void> {
    if (isOffline || !campaignId) return
    const result = await window.goblin.sessionDecks.update(campaignId, deckId, { title }, sessionId ?? undefined)
    if (result.ok) setDecks((prev) => prev.map((d) => (d.id === deckId ? result.data : d)))
  }

  /** Reorders and/or relinks encounters — `scenes` must be exactly this deck's existing scenes (see campaignService.validateSceneReorder), just reordered and/or with different encounterId values. */
  async function reorderScenes(deckId: string, scenes: SessionDeck['scenes']): Promise<void> {
    if (isOffline || !campaignId) return
    const result = await window.goblin.sessionDecks.update(campaignId, deckId, { scenes }, sessionId ?? undefined)
    if (result.ok) setDecks((prev) => prev.map((d) => (d.id === deckId ? result.data : d)))
  }

  async function removeDeck(deckId: string): Promise<void> {
    if (isOffline || !campaignId) return
    await window.goblin.sessionDecks.remove(campaignId, deckId, sessionId ?? undefined)
    await refresh()
  }

  async function addScene(deckId: string, title: string): Promise<Note | undefined> {
    if (isOffline || !campaignId) return undefined
    const result = await window.goblin.sessionDecks.addScene(campaignId, deckId, title, sessionId ?? undefined)
    if (!result.ok) return undefined
    await refresh()
    return result.data
  }

  async function removeScene(deckId: string, noteId: string): Promise<void> {
    if (isOffline || !campaignId) return
    await window.goblin.sessionDecks.removeScene(campaignId, deckId, noteId, sessionId ?? undefined)
    await refresh()
  }

  function present(deckId: string): void {
    if (!isOffline && campaignId) void window.goblin.sessionDecks.present(campaignId, deckId)
  }

  function setLiveSceneIndex(index: number): void {
    if (!isOffline) void window.goblin.sessionDecks.setScene(index)
  }

  function stopPresenting(): void {
    if (!isOffline) void window.goblin.sessionDecks.stopPresenting()
  }

  return {
    decks,
    loading,
    live,
    createDeck,
    renameDeck,
    reorderScenes,
    removeDeck,
    addScene,
    removeScene,
    present,
    setLiveSceneIndex,
    stopPresenting
  }
}
