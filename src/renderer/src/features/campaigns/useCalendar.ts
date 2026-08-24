import { useEffect, useState } from 'react'
import type { CampaignCalendar } from '@shared/ipc'
import type { CalendarConfig } from '@shared/calendar'

/** Mirrors useNotesWorkspace's fetch-once-then-refetch-on-campaigns.onChanged pattern — the calendar is small, DM-edited-as-a-whole-document data, so a wholesale re-fetch on any change (rather than diffing a pushed payload) is the right call here too. */
export function useCalendar(sessionId: string | undefined, campaignId: string | null) {
  const [calendar, setCalendar] = useState<CampaignCalendar | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), 5000)
    return () => clearTimeout(timer)
  }, [error])

  useEffect(() => {
    if (!campaignId) {
      setCalendar(null)
      return
    }
    refresh(campaignId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, campaignId])

  useEffect(() => {
    if (!campaignId) return
    return window.goblin.campaigns.onChanged((event) => {
      if (event.campaignId === campaignId) refresh(campaignId)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId])

  function refresh(id: string): void {
    setLoading(true)
    window.goblin.calendar.get(id, sessionId).then((result) => {
      setLoading(false)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setCalendar(result.data)
    })
  }

  async function save(config: CalendarConfig): Promise<boolean> {
    if (!campaignId) return false
    const result = await window.goblin.calendar.save(campaignId, config, sessionId)
    if (!result.ok) {
      setError(result.error)
      return false
    }
    setCalendar(result.data)
    return true
  }

  async function remove(): Promise<boolean> {
    if (!campaignId) return false
    const result = await window.goblin.calendar.remove(campaignId, sessionId)
    if (!result.ok) {
      setError(result.error)
      return false
    }
    setCalendar(null)
    return true
  }

  return { calendar, loading, error, save, remove }
}
