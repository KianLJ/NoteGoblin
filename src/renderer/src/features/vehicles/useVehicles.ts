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
// The latest save per campaign: a save's result (or failure) that comes back after a newer change was made is
// ignored, so clicking quickly doesn't flick the numbers back to an older state while the saves catch up.
let saveCount = 0
const latestSave = new Map<string, number>()
// Saves still on their way, per campaign. Each save also has the app re-read the list (so other panels and players
// catch up) — but a re-read that started before, or while, a save of ours was in flight is older than what's on
// screen, and would put the hull or a component back for a moment (the jitter when clicking quickly). It's skipped.
const inFlight = new Map<string, number>()
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
    const seqAtStart = latestSave.get(id)
    void window.goblin.vehicles.get(id, sessionId ?? undefined).then((result) => {
      if (!result.ok) return setError(result.error)
      if ((inFlight.get(id) ?? 0) > 0 || latestSave.get(id) !== seqAtStart) return
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
    const mine = ++saveCount
    latestSave.set(campaignId, mine)
    inFlight.set(campaignId, (inFlight.get(campaignId) ?? 0) + 1)
    const result = await window.goblin.vehicles.save(campaignId, next).finally(() => inFlight.set(campaignId, (inFlight.get(campaignId) ?? 1) - 1))
    const latest = latestSave.get(campaignId) === mine
    if (!result.ok) {
      // Only the latest change puts the last saved list back; a newer one is already on its way.
      if (latest) {
        setDoc(saved.current)
        shareVehicles(campaignId, saved.current, self)
      }
      setError(result.error)
      return false
    }
    saved.current = result.data
    if (latest) {
      setDoc(result.data)
      shareVehicles(campaignId, result.data, self)
    }
    setError(null)
    return true
  }

  return { doc, save, error }
}
