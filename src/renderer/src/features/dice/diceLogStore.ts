import { buildCheckRollEntry, buildRollEntry, redactRollForBroadcast, type AdvantageMode, type DiceGroup, type DiceRollLogEntry } from '@shared/dice'
import { playSfx } from '../audio/soundEffects'

/**
 * The one shared roll log, outside React — a module-level singleton rather
 * than state owned by DiceTray.tsx, because a roll can now originate from
 * two completely different component trees: the Dice Tray's own Roll
 * button, and an inline `` `dice: ...` `` click inside a note (see
 * NoteEditor.tsx/MarkdownLiveEditor.tsx). Both need to land in the exact
 * same log, live-updating whichever DiceTray instance(s) happen to be
 * mounted, without one owning the other. Same "ephemeral, not persisted"
 * scope as the log itself — this resets on app restart, nothing here is
 * saved to disk.
 */

let log: DiceRollLogEntry[] = []
const listeners = new Set<() => void>()
let listening = false

function notify(): void {
  for (const listener of listeners) listener()
}

export function getDiceLog(): DiceRollLogEntry[] {
  return log
}

export function subscribeDiceLog(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The d20 that actually counted toward the total in `entry.groups` landing on 1 or 20 — null for a redacted private-roll broadcast (groups: null), so a bystander never learns another player's private nat 1/20 from the sound alone. On an advantage/disadvantage roll (two results in one group) this only looks at whichever of the two was kept, not either die — otherwise a disadvantage roll that dropped a natural 20 in favor of a low kept result still played the crit chime for a roll that, mechanically, wasn't one. */
function d20Extreme(entry: DiceRollLogEntry): 'natural20' | 'natural1' | null {
  if (!entry.groups) return null
  for (const group of entry.groups) {
    if (group.sides !== 20) continue
    const kept = entry.advantage && entry.advantage !== 'normal' && group.results.length === 2
      ? entry.advantage === 'disadvantage'
        ? Math.min(...group.results)
        : Math.max(...group.results)
      : null
    if (kept !== null) {
      if (kept === 20) return 'natural20'
      if (kept === 1) return 'natural1'
      continue
    }
    if (group.results.includes(20)) return 'natural20'
    if (group.results.includes(1)) return 'natural1'
  }
  return null
}

function appendToLog(entry: DiceRollLogEntry, silent = false): void {
  if (log.some((e) => e.id === entry.id)) return
  log = [entry, ...log]
  if (!silent) playSfx(d20Extreme(entry) ?? 'diceRoll')
  notify()
}

/** Wires the one process-wide "someone else rolled" listener into this store — idempotent, safe to call from every mount point (DiceTray, NoteEditor) that might be the first one up. */
export function ensureDiceLogListening(): void {
  if (listening) return
  listening = true
  window.goblin.dice.onRoll((roll) => appendToLog(roll))
}

/**
 * Rolls, appends the true (unredacted) copy to the shared local log, and —
 * if connected to a session — broadcasts a possibly-redacted copy to the
 * rest of the table. The one path both the Dice Tray's Roll button and an
 * inline note roll go through, so both end up in the same log the same way.
 */
export function performRoll(
  sessionId: string | null,
  rollerId: string,
  rollerName: string,
  groups: DiceGroup[],
  modifier: number,
  isPrivate: boolean,
  /** Skips the log's own roll sound — for RollAnimationOverlay.tsx's pending-damage flow, which plays its own confirmation sound timed to the reveal animation instead of the instant the roll actually resolves. */
  silent?: boolean
): DiceRollLogEntry {
  const entry = buildRollEntry(rollerId, rollerName, groups, modifier, isPrivate)
  appendToLog(entry, silent)
  if (sessionId) void window.goblin.dice.broadcast(sessionId, redactRollForBroadcast(entry))
  return entry
}

/**
 * Same shape as performRoll, but for a labeled d20 check/save/attack roll
 * (character sheet buttons, a DM's forced roll) instead of the Dice Tray's
 * pooled-dice model — see buildCheckRollEntry for why advantage needs its
 * own path. Still lands in the exact same shared log/broadcast as every
 * other roll.
 */
export function performCheckRoll(
  sessionId: string | null,
  rollerId: string,
  rollerName: string,
  modifier: number,
  advantage: AdvantageMode,
  isPrivate: boolean,
  label?: string,
  dc?: number | null,
  presetResults?: number[],
  /** Skips the log's own roll sound — for RollAnimationOverlay.tsx's manual advantage/disadvantage flow, which already played a cue for each individual die click and would otherwise double up with a third sound the instant both are in. */
  silent?: boolean
): DiceRollLogEntry {
  const entry = buildCheckRollEntry(rollerId, rollerName, modifier, advantage, isPrivate, label, dc, presetResults)
  appendToLog(entry, silent)
  if (sessionId) void window.goblin.dice.broadcast(sessionId, redactRollForBroadcast(entry))
  return entry
}
