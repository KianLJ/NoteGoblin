import { useEffect, useMemo, useState } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import { testUserId, type TestPlayer } from '@shared/battleMap'
import { emptyCharacterSheet } from '@shared/dnd5e'
import { deriveSheet } from '@shared/content/sheet'
import { useBattleLibrary } from './encounterStore'

/** A quick stand-in's bare sheet: its class, level and scores, at full hit points. */
export function quickSheet(t: TestPlayer, quick: NonNullable<TestPlayer['quick']>): CharacterSheet {
  const now = new Date(0).toISOString()
  const sheet: CharacterSheet = {
    ...emptyCharacterSheet(),
    id: `quick:${t.id}`,
    name: t.name,
    createdAt: now,
    updatedAt: now,
    classes: [{ className: quick.className, level: Math.max(1, Math.min(20, quick.level)), subclass: '' }],
    abilityScores: { ...quick.scores }
  }
  return { ...sheet, currentHp: deriveSheet(sheet).derived.maxHp }
}

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
  const key = JSON.stringify(tests.map((t) => [t.id, t.name, t.characterId, t.quick]))
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
      else if (t.quick) sheets.set(testUserId(t.id), quickSheet(t, t.quick))
    }
    return sheets
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, characters])
}
