import { useMemo, useSyncExternalStore } from 'react'
import { buildPickerContent, type PickerContent } from '@shared/content/pickerContent'
import { getActivePacks, getActivePacksKey, subscribeActivePacks } from '@shared/content/sheet'
import { registryForPacks } from '@shared/content/migrate'
import type { Registry } from '@shared/content/registry'
import type { ContentPack } from '@shared/content/schema'
import { srdPack } from '@shared/content/srd'
import { packKey } from '@shared/content/packKey'

/**
 * The class / species / background / subclass picker lists (see
 * shared/content/pickerContent.ts) for the active packs, or for `packs` (a
 * character's own), kept current as packs change.
 */
export function usePickerContent(packs?: ContentPack[]): PickerContent {
  const key = useSyncExternalStore(subscribeActivePacks, getActivePacksKey)
  const packsKey = packs?.map(packKey).join(',')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => buildPickerContent(packs), [key, packsKey])
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
