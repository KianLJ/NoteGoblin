import { useEffect, useRef } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import { withCombatantHp } from '@shared/encounter'
import { deriveSheet } from '@shared/content/sheet'
import { isTestUser } from '@shared/battleMap'
import { getEncounter, setEncounter, useEncounter } from './encounterStore'

/**
 * Keeps the party's combatants and their character sheets in step (mounted
 * by the app shell in DM mode). From the sheets: max HP, AC and darkvision
 * always, and current HP whenever the player's own sheet changes it (they
 * drank a potion, or typed it in). Back to the sheets, while hosting: the DM
 * damaging or healing a player in the fight sends the new hit points to
 * that player's sheet.
 */
export function useCombatSheetSync(playerCharacters: Map<string, CharacterSheet>, hosting: boolean): void {
  const [encounter] = useEncounter()
  // The sheet's hit points last seen, and the last sent to it, per player.
  const sheetHp = useRef(new Map<string, number>())
  const sentHp = useRef(new Map<string, number>())

  // Sheets into the fight (worked out from the store's current state, not inside an updater, so the record above changes once).
  useEffect(() => {
    let state = getEncounter()
    for (const c of state.combatants) {
      if (c.kind !== 'player' || !c.userId) continue
      const sheet = playerCharacters.get(c.userId)
      if (!sheet) continue
      const { derived } = deriveSheet(sheet)
      const darkvision = derived.senses.darkvision?.range ?? 0
      if (derived.maxHp !== c.maxHp || derived.armorClass !== c.ac || (c.darkvision ?? 0) !== darkvision) {
        state = { ...state, combatants: state.combatants.map((x) => (x.id === c.id ? { ...x, maxHp: derived.maxHp, ac: derived.armorClass, darkvision } : x)) }
      }
      if (sheetHp.current.get(c.userId) !== sheet.currentHp) {
        sheetHp.current.set(c.userId, sheet.currentHp)
        sentHp.current.set(c.userId, sheet.currentHp)
        if (c.currentHp !== sheet.currentHp) state = withCombatantHp(state, c.id, sheet.currentHp)
      }
    }
    if (state !== getEncounter()) setEncounter(state)
  }, [playerCharacters, encounter.combatants.length])

  // The fight back into the sheets: a change the DM made (not one that just came from the sheet).
  useEffect(() => {
    if (!hosting) return
    for (const c of encounter.combatants) {
      // A test player's sheet is the DM's own character: the fight doesn't write to it.
      if (c.kind !== 'player' || !c.userId || isTestUser(c.userId)) continue
      const sheet = playerCharacters.get(c.userId)
      if (!sheet || c.currentHp === sheet.currentHp || c.currentHp === sentHp.current.get(c.userId)) continue
      sentHp.current.set(c.userId, c.currentHp)
      void window.goblin.characters.setPlayerHp(c.userId, { currentHp: c.currentHp })
    }
  }, [encounter.combatants, playerCharacters, hosting])
}
