import { useEffect, useState } from 'react'
import type { AdvantageMode, DiceGroup } from '@shared/dice'
import { queuePendingCheck, queuePendingDamage } from './rollAnimationStore'

/**
 * The hook every character sheet roll button uses — resolves "who am I" once
 * (same pattern as DiceTray.tsx), then exposes rollCheck/rollDamage. Neither
 * actually rolls anything itself: clicking a sheet button only queues a
 * *pending* roll (see rollAnimationStore.ts) — the popup's own die then
 * needs its own click before performCheckRoll/performRoll ever runs, so a
 * misclick on the sheet never burns a real roll.
 *
 * `characterName` is what actually shows up as the roll's "who rolled this"
 * everywhere (the log, the dramatic reveal, the dice-tab toast) — pass the
 * character the roll is coming from (every caller here always has one in
 * scope, being a sheet button or a forced roll) so the table sees "Aria
 * rolled a Stealth check," not the account's display name. Falls back to
 * the account's own display name if the character has no name yet.
 */
export function useSheetRoller(
  sessionId: string | null,
  characterName?: string
): {
  myId: string
  myName: string
  rollCheck: (label: string, modifier: number, options?: { advantage?: AdvantageMode; dc?: number | null }) => void
  rollDamage: (groups: DiceGroup[], modifier: number, label?: string) => void
} {
  const [myId, setMyId] = useState('me')
  const [myName, setMyName] = useState('You')

  useEffect(() => {
    window.goblin.identity.getCurrent().then((identity) => {
      if (identity) {
        setMyId(identity.id)
        setMyName(identity.displayName)
      }
    })
  }, [])

  const rollerName = characterName || myName

  function rollCheck(label: string, modifier: number, options?: { advantage?: AdvantageMode; dc?: number | null }): void {
    queuePendingCheck({
      label,
      modifier,
      advantage: options?.advantage ?? 'normal',
      dc: options?.dc ?? null,
      sessionId,
      rollerId: myId,
      rollerName
    })
  }

  function rollDamage(groups: DiceGroup[], modifier: number, label = 'Damage'): void {
    queuePendingDamage({ label, groups, modifier, sessionId, rollerId: myId, rollerName })
  }

  return { myId, myName, rollCheck, rollDamage }
}
