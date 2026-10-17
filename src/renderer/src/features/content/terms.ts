import { useMemo } from 'react'
import { ABILITIES, type Ability } from '@shared/dnd5e'
import { termsFor, type Terms } from '@shared/content/terms'
import { useActivePackRegistry } from './pickerContent'

/**
 * The active packs' renames (terminology), for labels — `t('spellSlots',
 * 'Spell Slots')` shows "Technique Slots" when a pack renames it, and the
 * fallback otherwise. Also the six abilities under their (possibly renamed)
 * names. Mechanics never change; only what the UI calls things.
 */
export function useTerms(): Terms & { abilities: Array<{ id: Ability; label: string }> } {
  const { registry } = useActivePackRegistry()
  return useMemo(() => {
    const terms = termsFor(registry.terminology)
    return { ...terms, abilities: ABILITIES.map((a) => ({ id: a.id, label: terms.ability(a.id, a.label) })) }
  }, [registry])
}
