import { useMemo } from 'react'
import type { CharacterSheetData } from '@shared/dnd5e'
import { deriveSheet, type DerivedSheet } from '@shared/content/sheet'

/**
 * Derived numbers for a sheet from the content engine (see
 * shared/content/sheet.ts). Pass the sheet as the tab currently sees it —
 * e.g. the saved character with the tab's unsaved draft fields merged on
 * top — so edits show up in the derived values immediately.
 */
export function useDerivedSheet(sheet: CharacterSheetData): DerivedSheet {
  return useMemo(() => deriveSheet(sheet), [sheet])
}
