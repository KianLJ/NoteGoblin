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
 */
export function useSheetRoller(sessionId: string | null): {
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

  function rollCheck(label: string, modifier: number, options?: { advantage?: AdvantageMode; dc?: number | null }): void {
    queuePendingCheck({
      label,
      modifier,
      advantage: options?.advantage ?? 'normal',
      dc: options?.dc ?? null,
      sessionId,
      rollerId: myId,
      rollerName: myName
    })
  }

  function rollDamage(groups: DiceGroup[], modifier: number, label = 'Damage'): void {
    queuePendingDamage({ label, groups, modifier, sessionId, rollerId: myId, rollerName: myName })
  }

  return { myId, myName, rollCheck, rollDamage }
}
