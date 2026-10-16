import { useMemo, useSyncExternalStore } from 'react'
import { buildPickerContent, type PickerContent } from '@shared/content/pickerContent'
import { getActivePacksKey, subscribeActivePacks } from '@shared/content/sheet'

/** The class / species / background / subclass picker lists for the active packs (see shared/content/pickerContent.ts), kept current as packs change. */
export function usePickerContent(): PickerContent {
  const key = useSyncExternalStore(subscribeActivePacks, getActivePacksKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(buildPickerContent, [key])
}
