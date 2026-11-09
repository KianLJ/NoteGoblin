import { useSyncExternalStore } from 'react'
import type { CanvasMode } from '@shared/canvasTools'
import type { BestiaryMonster } from '../../data/bestiary'
import type { Sticky } from './StickyNote'
import type { CanvasImage } from './ImageBox'

/**
 * Things put on a canvas from the Codex or the right-click menu: a monster's
 * statblock, an NPC, piece of equipment, spell or magic item, a content pack's
 * homebrew entry (id: its Codex key), a sticky note or an image.
 * Kept here by canvas node id, per mode — the layout only knows where each
 * box sits, and a box is open while the layout holds it.
 */
/** The Codex's own kinds of entry that go on the canvas by id. */
export type CodexEntryKind = 'npc' | 'equipment' | 'spell' | 'magicItem' | 'homebrew'

export type CanvasEntry = { kind: 'monster'; monster: BestiaryMonster } | { kind: CodexEntryKind; id: string; name: string } | Sticky | CanvasImage

export function entryNodeId(entry: CanvasEntry): string {
  if (entry.kind === 'monster') return `monster:${entry.monster.index}`
  if (entry.kind === 'image') return `image:${entry.id}`
  return entry.kind === 'sticky' ? `sticky:${entry.id}` : `entry:${entry.kind}:${entry.id}`
}

const listeners = new Set<() => void>()
const cache: Partial<Record<CanvasMode, Record<string, CanvasEntry>>> = {}

function storageKey(mode: CanvasMode): string {
  return `gb-canvas-entries:${mode}`
}

function load(mode: CanvasMode): Record<string, CanvasEntry> {
  try {
    const raw = localStorage.getItem(storageKey(mode))
    if (raw) return JSON.parse(raw) as Record<string, CanvasEntry>
    // The DM's statblock boxes were kept on their own before Codex entries could go on the canvas too.
    const monsters = mode === 'dm' ? (JSON.parse(localStorage.getItem('gb-canvas-monsters') ?? '{}') as Record<string, BestiaryMonster>) : {}
    return Object.fromEntries(Object.values(monsters).map((monster) => [`monster:${monster.index}`, { kind: 'monster', monster } as CanvasEntry]))
  } catch {
    return {}
  }
}

function get(mode: CanvasMode): Record<string, CanvasEntry> {
  return (cache[mode] ??= load(mode))
}

function set(mode: CanvasMode, next: Record<string, CanvasEntry>): void {
  cache[mode] = next
  try {
    localStorage.setItem(storageKey(mode), JSON.stringify(next))
  } catch {
    /* best-effort persistence only */
  }
  listeners.forEach((l) => l())
}

export function putEntry(mode: CanvasMode, entry: CanvasEntry): void {
  set(mode, { ...get(mode), [entryNodeId(entry)]: entry })
}

export function dropEntry(mode: CanvasMode, nodeId: string): void {
  const { [nodeId]: _gone, ...rest } = get(mode)
  set(mode, rest)
}

export function useCanvasEntries(mode: CanvasMode): Record<string, CanvasEntry> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => get(mode)
  )
}
