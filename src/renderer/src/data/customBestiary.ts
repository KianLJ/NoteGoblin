import type { BestiaryMonster } from './bestiary'
import type { StatblockData } from '../statblock'
import { xpForCr } from '@shared/encounter'

const STORAGE_KEY = 'gb-custom-monsters'

function crToNumeric(cr: string): number {
  const trimmed = cr.trim()
  if (trimmed.includes('/')) {
    const [n, d] = trimmed.split('/').map(Number)
    return d ? n / d : 0
  }
  return Number(trimmed) || 0
}

export function loadCustomMonsters(): BestiaryMonster[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as BestiaryMonster[]) : []
  } catch {
    return []
  }
}

function saveAll(monsters: BestiaryMonster[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(monsters))
  } catch {
    /* best-effort — a full localStorage quota shouldn't crash the save action */
  }
}

/** Builds a bestiary-shaped entry from a parsed ```statblock block (see statblock.ts) and adds it to the custom roster — the "Save to Bestiary" action on a rendered statblock card, and "New Creature" in the Bestiary panel itself. */
export function saveCustomMonster(data: StatblockData): BestiaryMonster {
  const cr = data.cr ?? '0'
  const monster: BestiaryMonster = {
    ...data,
    name: data.name?.trim() || 'Unnamed Creature',
    type: data.type?.trim() || 'unknown',
    index: `custom-${crypto.randomUUID()}`,
    crNumeric: crToNumeric(cr),
    xp: xpForCr(cr)
  }
  const all = loadCustomMonsters()
  all.push(monster)
  saveAll(all)
  return monster
}

export function removeCustomMonster(index: string): void {
  saveAll(loadCustomMonsters().filter((m) => m.index !== index))
}

export function isCustomMonster(index: string): boolean {
  return index.startsWith('custom-')
}
