import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import { buildCloudCharacter } from '@shared/cloudCharacter'
import { deriveSheet, getActivePacksKey, subscribeActivePacks } from '@shared/content/sheet'

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
        void window.goblin.characters.pushCloud(buildCloudCharacter(character, deriveSheet(character).derived))
      } catch (err) {
        // A sheet the engine can't derive just doesn't reach the viewer — never worth breaking the app shell over.
        console.warn(`[NoteGoblin] Skipped web viewer upload for "${character.name}":`, err)
      }
    }
  }, [characters, packsKey])
}
