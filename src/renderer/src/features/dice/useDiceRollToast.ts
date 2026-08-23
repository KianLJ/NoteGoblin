import { useEffect, useRef, useState } from 'react'
import type { DiceRollLogEntry } from '@shared/dice'
import { ensureDiceLogListening, getDiceLog, subscribeDiceLog } from './diceLogStore'

const VISIBLE_MS = 5000

/**
 * A transient "someone just rolled" bubble for the Dice tab button — surfaces
 * the newest entry for a few seconds whenever the shared log grows, so a
 * roll doesn't go unnoticed just because you're on a different tab. Clears
 * itself the moment the Dice tab actually becomes active, since the tray
 * itself already shows the same information there.
 */
export function useDiceRollToast(isDiceTabActive: boolean): DiceRollLogEntry | null {
  const [toast, setToast] = useState<DiceRollLogEntry | null>(null)
  const seenIds = useRef<Set<string>>(new Set())
  const hideTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    ensureDiceLogListening()
    // Seed with whatever's already in the log so mounting doesn't treat every past roll as new.
    for (const entry of getDiceLog()) seenIds.current.add(entry.id)
    return subscribeDiceLog(() => {
      const [latest] = getDiceLog()
      if (!latest || seenIds.current.has(latest.id)) return
      seenIds.current.add(latest.id)
      setToast(latest)
      clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(() => setToast(null), VISIBLE_MS)
    })
  }, [])

  useEffect(() => {
    if (isDiceTabActive) {
      setToast(null)
      clearTimeout(hideTimer.current)
    }
  }, [isDiceTabActive])

  return toast
}
