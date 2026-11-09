import { useEffect, useState } from 'react'
import { getMusicState, subscribeMusic } from '../audio/musicEngine'
import { useEncounter } from '../combat/encounterStore'

/**
 * What the canvas's light is tinted by right now: 'combat' while the DM's
 * fight is running, else the Goblin Bard mood that's playing (its group id,
 * e.g. 'tavernRespite' — the table hears the same mood, so a player's canvas
 * follows too), else nothing. Colours are canvas.css's, per value.
 */
export function useCanvasMood(): string | null {
  const [music, setMusic] = useState(getMusicState)
  useEffect(() => subscribeMusic(() => setMusic(getMusicState())), [])
  const [encounter] = useEncounter()
  if (encounter.turnIndex >= 0 && encounter.combatants.length > 0) return 'combat'
  return music.playing && music.groupId ? music.groupId : null
}
