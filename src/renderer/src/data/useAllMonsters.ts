import { useEffect, useMemo, useState } from 'react'
import { subscribeActivePacks } from '@shared/content/sheet'
import { loadAllMonsters, subscribeLibraryMonsters, type PackMonster } from './packMonsters'

/** Every creature (device-saved, pack and SRD), re-read when packs change. `refresh` re-reads after a local change. */
export function useAllMonsters(): { monsters: PackMonster[]; refresh: () => void } {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const bump = (): void => setVersion((v) => v + 1)
    const offActive = subscribeActivePacks(bump)
    const offLibrary = subscribeLibraryMonsters(bump)
    return () => {
      offActive()
      offLibrary()
    }
  }, [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const monsters = useMemo(() => loadAllMonsters(), [version])
  return { monsters, refresh: () => setVersion((v) => v + 1) }
}
