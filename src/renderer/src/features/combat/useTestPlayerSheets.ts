import { useEffect, useMemo, useState } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import { testUserId } from '@shared/battleMap'
import { useBattleLibrary } from './encounterStore'

/**
 * The sheets the DM's test players play, by their user id (see
 * battleMap.ts's testUserId): the DM's own characters, read when the test
 * players change. Merged with the connected players' sheets, a test player
 * then works like a real one in the fight — hit points, AC, darkvision,
 * actions and spells.
 */
export function useTestPlayerSheets(enabled: boolean): Map<string, CharacterSheet> {
  const library = useBattleLibrary()
  const tests = enabled ? (library.testPlayers ?? []) : []
  const key = tests.map((t) => `${t.id}:${t.characterId ?? ''}`).join(',')
  const [characters, setCharacters] = useState<CharacterSheet[]>([])

  useEffect(() => {
    if (!tests.some((t) => t.characterId)) return
    let cancelled = false
    void window.goblin.characters.list().then((result) => {
      if (!cancelled && result.ok) setCharacters(result.data)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return useMemo(() => {
    const sheets = new Map<string, CharacterSheet>()
    for (const t of tests) {
      const sheet = t.characterId ? characters.find((c) => c.id === t.characterId) : undefined
      if (sheet) sheets.set(testUserId(t.id), { ...sheet, name: t.name || sheet.name })
    }
    return sheets
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, characters])
}
