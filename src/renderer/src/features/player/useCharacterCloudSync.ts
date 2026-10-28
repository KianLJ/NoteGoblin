import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import { buildCloudCharacter } from '@shared/cloudCharacter'
import { deriveSheet, getActivePacksKey, knownSpells, subscribeActivePacks, type DerivedSheet } from '@shared/content/sheet'
import { spellNumbers, type SpellNumbers } from '@shared/content/spellNumbers'
import { SRD_PACK_ID } from '@shared/content/srd'

/**
 * Every known spell's numbers (attack, save, damage/healing dice) at each
 * slot level it could be cast with — exactly what the desktop Spells tab
 * works out per card (see SpellsTab.tsx), precomputed because the viewer has
 * no rules engine to do it with.
 */
function spellsForViewer({ derived, registry }: DerivedSheet, sheet: CharacterSheet): Parameters<typeof buildCloudCharacter>[2] {
  const slotTotals: Record<number, number> = {}
  for (const pool of Object.values(derived.spellcasting.slots)) {
    for (const [level, count] of Object.entries(pool)) slotTotals[Number(level)] = (slotTotals[Number(level)] ?? 0) + count
  }
  const slotLevels = Object.keys(slotTotals)
    .map(Number)
    .filter((level) => slotTotals[level] > 0)
  const known = knownSpells(sheet.spells, { derived, registry })
  const numbersById: Record<string, Record<number, SpellNumbers>> = {}
  for (const spell of known) {
    const def = spell.compendiumId
      ? registry.get('spells', `${SRD_PACK_ID}:${spell.compendiumId}`)?.def
      : spell.packSpellId
        ? registry.get('spells', spell.packSpellId)?.def
        : undefined
    if (!def) continue
    const castLevels = spell.level > 0 ? slotLevels.filter((level) => level >= spell.level) : [spell.level]
    numbersById[spell.id] = Object.fromEntries(castLevels.map((level) => [level, spellNumbers(derived, def, level)]))
  }
  return { knownSpells: known, spellNumbers: numbersById }
}

/**
 * Uploads each of your character sheets to your relay account for the
 * read-only web viewer whenever it changes — derived here rather than in
 * the main process because only the renderer has the right content packs
 * active (see usePacks.ts), and a homebrew class or item derives wrong
 * without them. Re-sends when the active packs change too, since that can
 * change every derived number without the sheet itself changing.
 *
 * Main debounces, queues until a relay session exists, and handles
 * deletions (see characterCloudSync.ts), so this only has to notice changes.
 */
export function useCharacterCloudSync(characters: CharacterSheet[] | null): void {
  const packsKey = useSyncExternalStore(subscribeActivePacks, getActivePacksKey)
  const sent = useRef(new Map<string, string>())

  useEffect(() => {
    if (!characters) return
    for (const character of characters) {
      const key = `${character.updatedAt}|${packsKey}`
      if (sent.current.get(character.id) === key) continue
      sent.current.set(character.id, key)
      try {
        const derivedSheet = deriveSheet(character)
        void window.goblin.characters.pushCloud(buildCloudCharacter(character, derivedSheet.derived, spellsForViewer(derivedSheet, character)))
      } catch (err) {
        // A sheet the engine can't derive just doesn't reach the viewer — never worth breaking the app shell over.
        console.warn(`[NoteGoblin] Skipped web viewer upload for "${character.name}":`, err)
      }
    }
  }, [characters, packsKey])
}
