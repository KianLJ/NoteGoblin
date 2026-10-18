import type { MouseEvent as ReactMouseEvent } from 'react'
import type { DiceGroup } from '@shared/dice'
import { performRoll } from './diceLogStore'

/**
 * Click handler for rendered HTML that may hold inline `dice: 1d10` roll
 * buttons (a statblock in the Bestiary, the encounter monster panel, a
 * Workshop preview): a click on one rolls it publicly through the shared dice
 * log, so it shows in the Dice Tray and reaches the table like a note's
 * inline roll does (see NoteEditor.tsx). Returns whether it rolled.
 */
export function rollInlineDice(e: ReactMouseEvent, sessionId: string | null): boolean {
  const button = (e.target as HTMLElement).closest<HTMLElement>('[data-dice-roll]')
  if (!button) return false
  e.preventDefault()
  let dice: { sides: DiceGroup['sides']; count: number; modifier: number }
  try {
    dice = JSON.parse(button.dataset.diceRoll ?? '')
  } catch {
    return false
  }
  void window.goblin.identity.getCurrent().then((identity) => {
    performRoll(sessionId, identity?.id ?? 'me', identity?.displayName ?? 'You', [{ sides: dice.sides, count: dice.count }], dice.modifier, false)
  })
  return true
}
