import { useSyncExternalStore } from 'react'
import { emptyInitiativeState, type InitiativeState } from '@shared/encounter'
import { emptyBattleMap, type BattleMap } from '@shared/battleMap'

/**
 * The DM's live encounter — the initiative order and the battle map — held
 * outside any one component so the initiative tracker (right panel) and the
 * Combat tab edit the same fight. In memory for this run of the app, like the
 * tracker always was.
 */
let encounter: InitiativeState = emptyInitiativeState()
let battleMap: BattleMap = emptyBattleMap()
const listeners = new Set<() => void>()
const notify = (): void => listeners.forEach((l) => l())
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

type Update<T> = T | ((prev: T) => T)

export function setEncounter(update: Update<InitiativeState>): void {
  const next = typeof update === 'function' ? update(encounter) : update
  if (next === encounter) return
  encounter = next
  notify()
}

// Undo and redo for the map: every finished change (a token moved, a shape placed or resized, fog painted) is one step.
const MAX_UNDO = 100
let past: BattleMap[] = []
let future: BattleMap[] = []

/**
 * Changes the map. `record: false` for changes the DM didn't make by hand
 * (new tokens placed automatically), which shouldn't be undone on their own.
 */
export function setBattleMap(update: Update<BattleMap>, opts: { record?: boolean } = {}): void {
  const next = typeof update === 'function' ? update(battleMap) : update
  if (next === battleMap) return
  if (opts.record !== false) {
    past = [...past.slice(-(MAX_UNDO - 1)), battleMap]
    future = []
  }
  battleMap = next
  notify()
}

export function undoBattleMap(): boolean {
  const prev = past[past.length - 1]
  if (!prev) return false
  past = past.slice(0, -1)
  future = [battleMap, ...future]
  battleMap = prev
  notify()
  return true
}

export function redoBattleMap(): boolean {
  const next = future[0]
  if (!next) return false
  future = future.slice(1)
  past = [...past, battleMap]
  battleMap = next
  notify()
  return true
}

export const canUndoBattleMap = (): boolean => past.length > 0
export const canRedoBattleMap = (): boolean => future.length > 0

/** The encounter and its setter — a drop-in for useState<InitiativeState>. */
export function useEncounter(): [InitiativeState, typeof setEncounter] {
  return [useSyncExternalStore(subscribe, () => encounter), setEncounter]
}

export function useBattleMap(): [BattleMap, typeof setBattleMap] {
  return [useSyncExternalStore(subscribe, () => battleMap), setBattleMap]
}
