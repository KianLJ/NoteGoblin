import { useMemo, useSyncExternalStore } from 'react'
import { buildPickerContent, type PickerContent } from '@shared/content/pickerContent'
import { getActivePacks, getActivePacksKey, subscribeActivePacks } from '@shared/content/sheet'
import { registryForPacks } from '@shared/content/migrate'
import type { Registry } from '@shared/content/registry'
import type { ContentPack } from '@shared/content/schema'
import { srdPack } from '@shared/content/srd'

/** The class / species / background / subclass picker lists for the active packs (see shared/content/pickerContent.ts), kept current as packs change. */
export function usePickerContent(): PickerContent {
  const key = useSyncExternalStore(subscribeActivePacks, getActivePacksKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(buildPickerContent, [key])
}

/** The active packs and a registry over them plus the SRD, kept current as packs change — for browsing pack content (the Codex). */
export function useActivePackRegistry(): { packs: ContentPack[]; registry: Registry } {
  const key = useSyncExternalStore(subscribeActivePacks, getActivePacksKey)
  return useMemo(() => {
    const packs = getActivePacks()
    return { packs, registry: registryForPacks([srdPack(), ...packs]) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}
