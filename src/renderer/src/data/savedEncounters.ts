/** A DM-saved monster roster from the Initiative Tracker's Encounter Builder (InitiativeTracker.tsx) — local to this installation, in localStorage, same as custom monsters/NPCs. `monsterIndexes` has one entry per copy (three Goblins = the goblin's index repeated three times), matching how the builder's count draft serializes. */
export interface SavedEncounter {
  id: string
  name: string
  monsterIndexes: string[]
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
