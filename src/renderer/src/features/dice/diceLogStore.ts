import { buildRollEntry, redactRollForBroadcast, type DiceGroup, type DiceRollLogEntry } from '@shared/dice'

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

function appendToLog(entry: DiceRollLogEntry): void {
  if (log.some((e) => e.id === entry.id)) return
  log = [entry, ...log]
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
  isPrivate: boolean
): DiceRollLogEntry {
  const entry = buildRollEntry(rollerId, rollerName, groups, modifier, isPrivate)
  appendToLog(entry)
  if (sessionId) void window.goblin.dice.broadcast(sessionId, redactRollForBroadcast(entry))
  return entry
}
