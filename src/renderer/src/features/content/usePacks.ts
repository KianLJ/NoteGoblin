import { useEffect, useState } from 'react'
import type { CampaignPack, LibraryPack } from '@shared/ipc'
import type { ContentPack } from '@shared/content/schema'
import { setActivePacks } from '@shared/content/sheet'
import { setLibraryPacksForMonsters } from '../../data/packMonsters'

const LIBRARY_CHANGED = 'goblin:pack-library-changed'

/** Tells every useLibraryPacks to re-fetch — call after importing or removing a pack. */
export function notifyPackLibraryChanged(): void {
  window.dispatchEvent(new Event(LIBRARY_CHANGED))
}

/** This identity's personal pack library (see shared/ipc.ts's `packs`), kept fresh across imports/removals. */
export function useLibraryPacks(): { packs: LibraryPack[] | null; error: string | null; refresh: () => void } {
  const [packs, setPacks] = useState<LibraryPack[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  function refresh(): void {
    window.goblin.packs.list().then((result) => {
      if (result.ok) {
        setPacks(result.data)
        setError(null)
      } else setError(result.error)
    })
  }

  useEffect(() => {
    refresh()
    const onChange = (): void => refresh()
    window.addEventListener(LIBRARY_CHANGED, onChange)
    return () => window.removeEventListener(LIBRARY_CHANGED, onChange)
  }, [])

  return { packs, error, refresh }
}

/**
 * The packs enabled for a campaign — the DM's own (no sessionId) or, as a
 * player, fetched from the DM over the session. Re-fetched whenever the
 * campaign changes (the DM enabling/disabling/updating a pack broadcasts
 * that). An older host without packs support just yields none.
 */
export function useCampaignPacks(
  campaignId: string | null,
  sessionId?: string
): { packs: CampaignPack[] | null; error: string | null; refresh: () => void; setPacks: (packs: CampaignPack[]) => void } {
  const [packs, setPacks] = useState<CampaignPack[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  function refresh(): void {
    if (!campaignId) return
    window.goblin.campaignPacks.list(campaignId, sessionId).then((result) => {
      if (result.ok) {
        setPacks(result.data)
        setError(null)
      } else {
        setPacks([])
        setError(result.error)
      }
    })
  }

  useEffect(() => {
    setPacks(null)
    if (!campaignId) return
    refresh()
    return window.goblin.campaigns.onChanged((event) => {
      if (event.campaignId === campaignId) refresh()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, sessionId])

  return { packs, error, refresh, setPacks }
}

/**
 * Makes `campaignPacks` the packs every sheet derives with while a
 * campaign is open, and the whole personal library otherwise (see
 * shared/content/sheet.ts's active packs). Mounted once, in AppShell.
 */
export function useApplyActivePacks(campaignPacks: ContentPack[] | null): void {
  const { packs: library } = useLibraryPacks()
  useEffect(() => {
    setActivePacks(campaignPacks ?? (library ?? []).map((p) => p.pack))
    setLibraryPacksForMonsters((library ?? []).map((p) => p.pack))
  }, [campaignPacks, library])
}
