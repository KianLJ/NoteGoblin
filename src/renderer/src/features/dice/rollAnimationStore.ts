import type { AdvantageMode, DiceGroup, DiceRollLogEntry } from '@shared/dice'

/**
 * A tiny queue for the dramatic full-screen roll popup (RollAnimationOverlay.tsx)
 * — module-level like diceLogStore.ts, for the same reason: the trigger site
 * (a character sheet button, an incoming forced-roll prompt) and the overlay
 * that displays it (mounted once, high up in AppShell.tsx) are two unrelated
 * component trees. Deliberately NOT wired into every Dice Tray roll — that
 * would fire on every pooled multi-die roll too, which is a quieter, more
 * frequent action that already has its own log; this is reserved for the
 * "this one roll matters" moments (a sheet check/save/attack, a DM's forced
 * roll) the request asked for a Baldur's Gate 3-style beat on.
 *
 * Two shapes can be queued: a *pending* roll (a sheet button was clicked —
 * the popup shows the die sitting still, waiting for a second click on it
 * before it actually rolls) and an already-*rolled* entry (ForceRollPrompt's
 * own "Roll" button already was the deliberate confirmation, so that one
 * skips straight to the tumble). See RollAnimationOverlay.tsx for how each
 * phase renders.
 */

export interface PendingCheckRoll {
  kind: 'pending-check'
  id: string
  label: string
  modifier: number
  advantage: AdvantageMode
  dc: number | null
  sessionId: string | null
  rollerId: string
  rollerName: string
}

export interface PendingDamageRoll {
  kind: 'pending-damage'
  id: string
  label: string
  groups: DiceGroup[]
  modifier: number
  sessionId: string | null
  rollerId: string
  rollerName: string
}

export interface RolledAnimation {
  kind: 'rolled'
  entry: DiceRollLogEntry
}

export type QueuedRoll = PendingCheckRoll | PendingDamageRoll | RolledAnimation

let queue: QueuedRoll[] = []
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

export function queuePendingCheck(spec: Omit<PendingCheckRoll, 'kind' | 'id'>): void {
  queue = [...queue, { kind: 'pending-check', id: crypto.randomUUID(), ...spec }]
  notify()
}

export function queuePendingDamage(spec: Omit<PendingDamageRoll, 'kind' | 'id'>): void {
  queue = [...queue, { kind: 'pending-damage', id: crypto.randomUUID(), ...spec }]
  notify()
}

/** Queues an already-rolled entry — skips the pending "click to roll" step, for a trigger that already had its own explicit confirmation (ForceRollPrompt's "Roll" button). */
export function queueRollAnimation(entry: DiceRollLogEntry): void {
  queue = [...queue, { kind: 'rolled', entry }]
  notify()
}

export function getRollAnimationQueue(): QueuedRoll[] {
  return queue
}

/** Called once the currently-showing pending roll's die is clicked — swaps it in place for the now-rolled entry, without disturbing anything queued behind it. */
export function resolvePendingRoll(entry: DiceRollLogEntry): void {
  if (queue.length === 0) return
  queue = [{ kind: 'rolled', entry }, ...queue.slice(1)]
  notify()
}

/** Pops the currently-showing animation once it's finished/dismissed, revealing whatever's next. */
export function dequeueRollAnimation(): void {
  queue = queue.slice(1)
  notify()
}

export function subscribeRollAnimation(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
