import { useEffect, useState } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import { deriveSheet } from '@shared/content/sheet'
import { crewTier, type CrewMember } from '@shared/vehicles'
import type { AbilityId } from '@shared/content/schema'

/** A player character at a vehicle's station: their modifier (Dexterity for firing its weapons) plus their proficiency bonus. */
export function gunnerBonusFromSheet(sheet: CharacterSheet, ability: AbilityId = 'dex'): number {
  const { derived } = deriveSheet(sheet)
  return derived.abilities[ability].mod + derived.proficiencyBonus
}

/** Who's firing and with what, for a label: "Vale (Veteran)", "Elowen". */
export function crewLabel(m: CrewMember): string {
  const tier = crewTier(m)
  return tier ? `${m.name} (${tier.name})` : m.name
}

/**
 * A player's own character, fetched from the session (for rolling with their
 * own numbers from the Vehicles tab); refetched when `refresh` changes.
 */
export function useOwnSheet(sessionId: string | null, userId: string | null, refresh: unknown): CharacterSheet | null {
  const [sheet, setSheet] = useState<CharacterSheet | null>(null)
  useEffect(() => {
    if (!sessionId || !userId) return setSheet(null)
    let cancelled = false
    void window.goblin.characters.getPlayerCharacter(userId).then((result) => {
      if (!cancelled && result.ok) setSheet(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [sessionId, userId, refresh])
  return sheet
}
