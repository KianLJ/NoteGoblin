/** A DM-authored reusable NPC — distinct from a monster stat block (see bestiary.ts): no combat stats by default, just enough to reuse an NPC across sessions (name, race, role, notes, portrait). Stored the same way custom monsters are (see customBestiary.ts): local to this installation, in localStorage, not campaign-scoped. */
export interface Npc {
  id: string
  name: string
  race: string
  occupation: string
  notes: string
  portraitDataUrl: string | null
  createdAt: string
}

const STORAGE_KEY = 'gb-custom-npcs'

export function loadNpcs(): Npc[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Npc[]) : []
  } catch {
    return []
  }
}

function saveAll(npcs: Npc[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(npcs))
  } catch {
    /* best-effort — a full localStorage quota shouldn't crash the save action */
  }
}

export function createNpc(input: Omit<Npc, 'id' | 'createdAt'>): Npc {
  const npc: Npc = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
  const all = loadNpcs()
  all.push(npc)
  saveAll(all)
  return npc
}

export function updateNpc(id: string, patch: Partial<Omit<Npc, 'id' | 'createdAt'>>): Npc | undefined {
  const all = loadNpcs()
  const idx = all.findIndex((n) => n.id === id)
  if (idx === -1) return undefined
  all[idx] = { ...all[idx], ...patch }
  saveAll(all)
  return all[idx]
}

export function removeNpc(id: string): void {
  saveAll(loadNpcs().filter((n) => n.id !== id))
}
