import { useEffect, useState } from 'react'
import { DRAW_FADE_MS, readMark, type MapMark } from '@shared/battleMap'

/**
 * Everyone else's pointers and drawings on the battle map, as they come in.
 * A pointer goes a moment after it's let go (or goes quiet); a drawing stays
 * DRAW_FADE_MS after it's finished, fading at the end. `sessionId`: a
 * player's session (only its marks); null for the DM.
 */
export function useMapMarks(sessionId: string | null): MapMark[] {
  const [marks, setMarks] = useState<Record<string, MapMark>>({})
  useEffect(() => {
    const timers = new Map<string, ReturnType<typeof setTimeout>>()
    const forget = (id: string, after: number): void => {
      clearTimeout(timers.get(id))
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id)
          setMarks((all) => {
            if (!(id in all)) return all
            const next = { ...all }
            delete next[id]
            return next
          })
        }, after)
      )
    }
    const off = window.goblin.battleMap.onMark(({ sessionId: from, mark: raw }) => {
      if (sessionId && from !== sessionId) return
      const mark = readMark(raw)
      if (!mark) return
      setMarks((all) => ({ ...all, [mark.id]: mark }))
      // A mark that goes quiet (a dropped connection) is forgotten too.
      forget(mark.id, mark.kind === 'pointer' ? (mark.done ? 300 : 2500) : mark.done ? DRAW_FADE_MS : DRAW_FADE_MS + 5000)
    })
    return () => {
      off()
      for (const t of timers.values()) clearTimeout(t)
    }
  }, [sessionId])
  return Object.values(marks)
}
