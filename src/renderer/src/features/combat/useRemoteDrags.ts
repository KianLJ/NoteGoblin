import { useEffect, useState } from 'react'
import type { Pt } from '@shared/battleMap'

/**
 * Tokens someone else is dragging right now, where they are (top-left, in
 * squares) — the DM hears players' drags, players hear the DM's and each
 * other's. When a drag ends, the token stays where it was let go a moment
 * longer, so it doesn't flick back before the move itself arrives; a drag
 * that goes quiet (a dropped connection) is forgotten after a few seconds.
 * `sessionId`: a player's session (their events only); null for the DM.
 */
export function useRemoteDrags(sessionId: string | null): Record<string, Pt> {
  const [drags, setDrags] = useState<Record<string, Pt>>({})
  useEffect(() => {
    const timers = new Map<string, ReturnType<typeof setTimeout>>()
    const forget = (id: string, after: number): void => {
      clearTimeout(timers.get(id))
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id)
          setDrags((d) => {
            if (!(id in d)) return d
            const next = { ...d }
            delete next[id]
            return next
          })
        }, after)
      )
    }
    const off = window.goblin.battleMap.onDrag(({ sessionId: from, combatantId, x, y }) => {
      if (sessionId && from !== sessionId) return
      if (x === null || y === null) {
        forget(combatantId, 700)
        return
      }
      setDrags((d) => ({ ...d, [combatantId]: { x, y } }))
      forget(combatantId, 4000)
    })
    return () => {
      off()
      for (const t of timers.values()) clearTimeout(t)
    }
  }, [sessionId])
  return drags
}
