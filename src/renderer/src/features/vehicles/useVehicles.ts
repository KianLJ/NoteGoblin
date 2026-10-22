import { useEffect, useRef, useState } from 'react'
import type { CampaignVehicles } from '@shared/vehicles'

/**
 * A campaign's tracked vehicles (see shared/vehicles.ts) — fetched once,
 * refetched whenever the campaign changes (a DM save broadcasts that, like
 * the calendar). `save` is DM-only and applies optimistically, so damage and
 * fuel clicks feel instant; a failed save puts the last saved list back.
 * Every copy of this hook in the app hears each other's saves, so a vehicle
 * made in the Vehicles tab is known straight away to the battle map (its
 * token's size) and the Combat tab.
 */
const listeners = new Set<(campaignId: string, doc: CampaignVehicles, from: object) => void>()
function shareVehicles(campaignId: string, doc: CampaignVehicles, from: object): void {
  for (const l of listeners) l(campaignId, doc, from)
}

export function useVehicles(sessionId: string | null, campaignId: string | null) {
  const [doc, setDoc] = useState<CampaignVehicles>({ vehicles: [] })
  const [error, setError] = useState<string | null>(null)
  const saved = useRef<CampaignVehicles>({ vehicles: [] })
  const self = useRef({}).current

  // Another copy of this hook saved (or put back) this campaign's vehicles.
  useEffect(() => {
    const hear = (id: string, next: CampaignVehicles, from: object): void => {
      if (id !== campaignId || from === self) return
      saved.current = next
      setDoc(next)
    }
    listeners.add(hear)
    return () => {
      listeners.delete(hear)
    }
  }, [campaignId, self])

  function refresh(id: string): void {
    void window.goblin.vehicles.get(id, sessionId ?? undefined).then((result) => {
      if (!result.ok) return setError(result.error)
      saved.current = result.data
      setDoc(result.data)
      setError(null)
    })
  }

  useEffect(() => {
    if (!campaignId) return setDoc({ vehicles: [] })
    refresh(campaignId)
    return window.goblin.campaigns.onChanged((event) => {
      if (event.campaignId === campaignId) refresh(campaignId)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, campaignId])

  async function save(next: CampaignVehicles): Promise<boolean> {
    if (!campaignId) return false
    setDoc(next)
    shareVehicles(campaignId, next, self)
    const result = await window.goblin.vehicles.save(campaignId, next)
    if (!result.ok) {
      setDoc(saved.current)
      shareVehicles(campaignId, saved.current, self)
      setError(result.error)
      return false
    }
    saved.current = result.data
    shareVehicles(campaignId, result.data, self)
    setError(null)
    return true
  }

  return { doc, save, error }
}
