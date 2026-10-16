import { useMemo, useSyncExternalStore } from 'react'
import type { CharacterSheetData } from '@shared/dnd5e'
import { deriveSheet, getActivePacksKey, subscribeActivePacks, type DerivedSheet } from '@shared/content/sheet'

/**
 * Derived numbers for a sheet from the content engine (see
 * shared/content/sheet.ts), re-derived when the sheet or the active content
 * packs change. Pass the sheet as the tab currently sees it — e.g. the
 * saved character with the tab's unsaved draft fields merged on top — so
 * edits show up in the derived values immediately.
 */
export function useDerivedSheet(sheet: CharacterSheetData): DerivedSheet {
  const packsKey = useSyncExternalStore(subscribeActivePacks, getActivePacksKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => deriveSheet(sheet), [sheet, packsKey])
}
