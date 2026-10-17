import type { ContentPack } from '@shared/content/schema'
import { registryForPacks } from '@shared/content/migrate'
import { getActivePacks } from '@shared/content/sheet'
import { SRD_PACK_ID, srdPack } from '@shared/content/srd'
import { PACK_FORMAT_VERSION } from '@shared/content/schema'
import { monsterEntry, packMonsterRecords } from '@shared/content/monsters'
import { BESTIARY, type BestiaryMonster } from './bestiary'
import { loadCustomMonsters, saveCustomMonster } from './customBestiary'
import type { StatblockData } from '../statblock'

// Creatures from content packs (docs/homebrew-engine.md, phase 8). A pack
// monster is a statblock (the same shape a ```statblock note block and the
// SRD bestiary use) with an id. They're DM reference material rather than
// character rules, so the Codex, encounter builder, initiative tracker and
// note autocomplete offer every pack in your library plus the open
// campaign's — not only the packs sheets derive with.
//
// "Save to Bestiary" and new creatures go into your personal "My Creatures"
// pack, so they can be exported, shared and edited in the Workshop like any
// other content. Creatures saved before packs existed live in localStorage
// until moved (moveLocalMonstersToPack); they keep their old index, so
// saved encounters still find them.

export const PERSONAL_MONSTER_PACK_ID = 'my-creatures'

let libraryPacks: ContentPack[] = []
const listeners = new Set<() => void>()

/** The library as AppShell last fetched it (see useApplyActivePacks). */
export function setLibraryPacksForMonsters(packs: ContentPack[]): void {
  libraryPacks = packs
  for (const l of listeners) l()
}

/** Called whenever the library packs change (active-pack changes come through subscribeActivePacks). */
export function subscribeLibraryMonsters(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export interface PackMonster extends BestiaryMonster {
  packId?: string
  packName?: string
  /** "<pack>:<local id>" — where to edit it. */
  fullId?: string
}

/** Every non-SRD monster in `packs` (overrides and hides applied) as bestiary entries. */
export function packMonsters(packs: ContentPack[]): PackMonster[] {
  if (packs.length === 0) return []
  return packMonsterRecords(registryForPacks([srdPack(), ...packs]), packs) as unknown as PackMonster[]
}

/** The packs monsters come from: the active ones (the open campaign's) plus the whole library. */
export function monsterPacks(): ContentPack[] {
  const active = getActivePacks()
  return [...active, ...libraryPacks.filter((p) => !active.some((a) => a.id === p.id))]
}

/** Every creature the app offers: ones still saved on this device, pack creatures, then the SRD. */
export function loadAllMonsters(): PackMonster[] {
  return [...loadCustomMonsters(), ...packMonsters(monsterPacks()), ...BESTIARY]
}

async function personalPack(): Promise<{ pack: Record<string, unknown> & { monsters: Array<Record<string, unknown>> }; exists: boolean } | { error: string }> {
  const result = await window.goblin.packs.list()
  if (!result.ok) return { error: result.error }
  const existing = result.data.find((p) => p.pack.id === PERSONAL_MONSTER_PACK_ID)?.pack
  if (existing) return { pack: structuredClone(existing) as unknown as Record<string, unknown> & { monsters: Array<Record<string, unknown>> }, exists: true }
  return {
    exists: false,
    pack: {
      formatVersion: PACK_FORMAT_VERSION,
      id: PERSONAL_MONSTER_PACK_ID,
      name: 'My Creatures',
      version: '1.0.0',
      author: '',
      description: 'Creatures saved from notes and the Codex.',
      dependsOn: [SRD_PACK_ID],
      monsters: []
    }
  }
}

async function savePersonalPack(pack: Record<string, unknown>): Promise<string | null> {
  const saved = await window.goblin.packs.save(pack, PERSONAL_MONSTER_PACK_ID)
  if (!saved.ok) return saved.error
  if (!saved.data.saved) return saved.data.issues.map((i) => `${i.path ? `${i.path}: ` : ''}${i.message}`).join(' ')
  window.dispatchEvent(new Event('goblin:pack-library-changed'))
  return null
}

/**
 * "Save to Bestiary": adds a statblock to the My Creatures pack (creating it
 * the first time). Falls back to this device's old local list when the pack
 * can't be written (not logged in), so the save never just fails.
 */
export async function saveMonster(data: StatblockData): Promise<{ name: string }> {
  const found = await personalPack()
  if (!('error' in found)) {
    const monsters = found.pack.monsters ?? []
    const entry = monsterEntry(data as unknown as Record<string, unknown>, monsters.map((m) => String(m.id)))
    const error = await savePersonalPack({ ...found.pack, monsters: [...monsters, entry] })
    if (!error) return { name: String(entry.name) }
  }
  return saveCustomMonster(data)
}

/** Removes a creature from the My Creatures pack. */
export async function removePersonalMonster(fullId: string): Promise<string | null> {
  const found = await personalPack()
  if ('error' in found) return found.error
  const localId = fullId.slice(fullId.indexOf(':') + 1)
  return savePersonalPack({ ...found.pack, monsters: (found.pack.monsters ?? []).filter((m) => m.id !== localId) })
}

/**
 * Moves every creature saved on this device into My Creatures, keeping each
 * one's old index (so saved encounters still resolve it), then clears the
 * local list. Returns how many moved, or the error that stopped it.
 */
export async function moveLocalMonstersToPack(): Promise<{ moved: number } | { error: string }> {
  const local = loadCustomMonsters()
  if (local.length === 0) return { moved: 0 }
  const found = await personalPack()
  if ('error' in found) return found
  const monsters = [...(found.pack.monsters ?? [])]
  for (const m of local) monsters.push(monsterEntry(m as unknown as Record<string, unknown>, monsters.map((x) => String(x.id))))
  const error = await savePersonalPack({ ...found.pack, monsters })
  if (error) return { error }
  try {
    localStorage.removeItem('gb-custom-monsters')
  } catch {
    /* nothing to clear */
  }
  return { moved: local.length }
}
