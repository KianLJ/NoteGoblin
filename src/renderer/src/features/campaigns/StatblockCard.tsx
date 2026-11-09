import { useMemo, type MouseEvent } from 'react'
import { diceGroups } from '@shared/dice'
import type { StatblockRoll } from '@shared/statblockRolls'
import { renderStatblockHtml, type StatblockData } from '../../statblock'
import { rollInlineDice } from '../dice/inlineDice'
import { useSheetRoller } from '../dice/useSheetRoller'

/**
 * A monster's statblock the DM can roll from: its ability checks, saves,
 * skills, initiative, attacks and damage are buttons (see
 * shared/statblockRolls.ts) that roll as the monster through the same roll
 * popup a character sheet uses, and its `dice:` inline rolls still roll into
 * the dice log. Every roll stays on the DM's side — never sent to the table,
 * so the players don't see the monster's numbers.
 */
export function StatblockCard({ monster }: { monster: StatblockData & { name?: string } }): JSX.Element {
  // No session: these rolls are the DM's alone.
  const { rollCheck, rollDamage } = useSheetRoller(null, monster.name || 'Monster')
  const html = useMemo(() => renderStatblockHtml(monster, false, true), [monster])

  function onClick(e: MouseEvent<HTMLDivElement>): void {
    const button = (e.target as HTMLElement).closest<HTMLElement>('[data-statblock-roll]')
    if (!button) {
      rollInlineDice(e, null)
      return
    }
    e.preventDefault()
    let roll: StatblockRoll
    try {
      roll = JSON.parse(button.dataset.statblockRoll ?? '')
    } catch {
      return
    }
    if (roll.kind === 'check') {
      rollCheck(roll.label, roll.modifier, roll.critOn ? { critOn: roll.critOn } : undefined)
      return
    }
    const parsed = diceGroups(roll.expr)
    if (parsed) rollDamage(parsed.groups, parsed.modifier, roll.label)
  }

  return <div className="gb-markdown gb-canvas-statblock" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
}
