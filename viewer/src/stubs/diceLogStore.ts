import { buildCheckRollEntry, buildRollEntry, isCritFace, type AdvantageMode, type DiceGroup, type DiceRollLogEntry } from '@shared/dice'
import { playSfx } from '@renderer/features/audio/soundEffects'

/**
 * Stand-in for src/renderer/src/features/dice/diceLogStore.ts in the viewer
 * build — rolls exactly the same way (same entry builders, same roll and
 * natural 1/20 sounds), just without a shared log or a session to broadcast
 * to. The roll popup (RollAnimationOverlay.tsx, used as-is) only needs
 * performRoll/performCheckRoll from it.
 */

/** Same as the desktop's: the d20 that counted landing on a crit face or a 1 — on advantage/disadvantage only the kept die counts. */
function d20Extreme(entry: DiceRollLogEntry): 'natural20' | 'natural1' | null {
  if (!entry.groups) return null
  for (const group of entry.groups) {
    if (group.sides !== 20) continue
    const kept =
      entry.advantage && entry.advantage !== 'normal' && group.results.length === 2
        ? entry.advantage === 'disadvantage'
          ? Math.min(...group.results)
          : Math.max(...group.results)
        : null
    if (kept !== null) {
      if (isCritFace(kept, entry)) return 'natural20'
      if (kept === 1) return 'natural1'
      continue
    }
    if (group.results.some((r) => isCritFace(r, entry))) return 'natural20'
    if (group.results.includes(1)) return 'natural1'
  }
  return null
}

export function performRoll(
  _sessionId: string | null,
  rollerId: string,
  rollerName: string,
  groups: DiceGroup[],
  modifier: number,
  isPrivate: boolean,
  silent?: boolean
): DiceRollLogEntry {
  const entry = buildRollEntry(rollerId, rollerName, groups, modifier, isPrivate)
  if (!silent) playSfx(d20Extreme(entry) ?? 'diceRoll')
  return entry
}

export function performCheckRoll(
  _sessionId: string | null,
  rollerId: string,
  rollerName: string,
  modifier: number,
  advantage: AdvantageMode,
  isPrivate: boolean,
  label?: string,
  dc?: number | null,
  presetResults?: number[],
  silent?: boolean,
  critOn?: number
): DiceRollLogEntry {
  const entry = buildCheckRollEntry(rollerId, rollerName, modifier, advantage, isPrivate, label, dc, presetResults, critOn)
  if (!silent) playSfx(d20Extreme(entry) ?? 'diceRoll')
  return entry
}
