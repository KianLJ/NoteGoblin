import { useEffect, useRef, useState } from 'react'
import type { CampaignVehicles } from '@shared/vehicles'

/**
 * A campaign's tracked vehicles (see shared/vehicles.ts) — fetched once,
 * refetched whenever the campaign changes (a DM save broadcasts that, like
 * the calendar). `save` is DM-only and applies optimistically, so damage and
 * fuel clicks feel instant; a failed save puts the last saved list back.
 */
export function useVehicles(sessionId: string | null, campaignId: string | null) {
  const [doc, setDoc] = useState<CampaignVehicles>({ vehicles: [] })
  const [error, setError] = useState<string | null>(null)
  const saved = useRef<CampaignVehicles>({ vehicles: [] })

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
    const result = await window.goblin.vehicles.save(campaignId, next)
    if (!result.ok) {
      setDoc(saved.current)
      setError(result.error)
      return false
    }
    saved.current = result.data
    setError(null)
    return true
  }

  return { doc, save, error }
}
