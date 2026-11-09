import { useEffect, useRef, useState } from 'react'
import type { CharacterSheet } from '@shared/ipc'

/** A player's sheet as the DM last saw it: live while they're connected, the stored copy while they're away. */
export interface KnownPlayerSheet {
  userId: string
  sheet: CharacterSheet
  live: boolean
  /** When the stored copy last updated (ms since epoch). */
  seenAt: number
}

type Stored = Record<string, { sheet: CharacterSheet; seenAt: number }>

function storageKey(campaignId: string): string {
  return `gb-player-sheets:${campaignId}`
}

function load(campaignId: string | null): Stored {
  if (!campaignId) return {}
  try {
    const raw = localStorage.getItem(storageKey(campaignId))
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    return parsed && typeof parsed === 'object' ? (parsed as Stored) : {}
  } catch {
    return {}
  }
}

/**
 * Every player sheet the DM has seen in this campaign. A connected player's
 * live sheet replaces the stored copy as it changes, and the copy stays after
 * they leave, so the DM can still open it — and it picks up their changes as
 * soon as they rejoin.
 *
 * shortcut: kept in localStorage (portraits are downscaled, so a table's worth fits easily) — move to the host database if campaigns start carrying dozens of players.
 */
export function useKnownPlayerSheets(campaignId: string | null, live: Map<string, CharacterSheet>): KnownPlayerSheet[] {
  const [stored, setStored] = useState<Stored>(() => load(campaignId))

  useEffect(() => setStored(load(campaignId)), [campaignId])

  // Saves when a sheet arrives or changes — not on a campaign switch, which would file the last table's players under the new campaign.
  const campaignRef = useRef(campaignId)
  campaignRef.current = campaignId
  useEffect(() => {
    const campaignId = campaignRef.current
    if (!campaignId || live.size === 0) return
    setStored((prev) => {
      const next = { ...prev }
      for (const [userId, sheet] of live) next[userId] = { sheet, seenAt: Date.now() }
      try {
        localStorage.setItem(storageKey(campaignId), JSON.stringify(next))
      } catch {
        /* best-effort — the live sheet still shows */
      }
      return next
    })
  }, [live])

  const userIds = new Set([...Object.keys(stored), ...live.keys()])
  return [...userIds]
    .map((userId) => {
      const liveSheet = live.get(userId)
      return liveSheet
        ? { userId, sheet: liveSheet, live: true, seenAt: Date.now() }
        : { userId, sheet: stored[userId].sheet, live: false, seenAt: stored[userId].seenAt }
    })
    .sort((a, b) => (a.sheet.name || '').localeCompare(b.sheet.name || ''))
}
