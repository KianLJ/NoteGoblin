import type { Placement } from '@shared/battleMap'

/** A DM-saved monster roster from the Initiative Tracker's Encounter Builder (InitiativeTracker.tsx) — local to this installation, in localStorage, same as custom monsters/NPCs. `monsterIndexes` has one entry per copy (three Goblins = the goblin's index repeated three times), matching how the builder's count draft serializes. */
export interface SavedEncounter {
  id: string
  name: string
  monsterIndexes: string[]
  /** Lower-case labels to find it by in the library ("forest", "boss"). Older saves have none. */
  tags?: string[]
  /**
   * Where its monsters stand on the battle map, by slot ("goblin#2" — see shared/battleMap.ts's slotOf), saved
   * from the Combat view. Loading the encounter (from a session scene, or the battle menu) puts them back there.
   */
  placements?: Record<string, Placement>
  createdAt: string
}

const STORAGE_KEY = 'gb-saved-encounters'

export function loadSavedEncounters(): SavedEncounter[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SavedEncounter[]) : []
  } catch {
    return []
  }
}

export function saveSavedEncounters(list: SavedEncounter[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    /* best-effort */
  }
}

/** The spots of an encounter's own monsters out of a map's remembered placements ("goblin#1", "goblin#2"…). */
export function encounterPlacements(enc: SavedEncounter, placements: Record<string, Placement>): Record<string, Placement> {
  const kinds = new Set(enc.monsterIndexes)
  return Object.fromEntries(Object.entries(placements).filter(([slot]) => kinds.has(slot.slice(0, slot.lastIndexOf('#')))))
}
