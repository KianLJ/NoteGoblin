import { useSyncExternalStore } from 'react'

/** A phone-sized window (narrower than a small tablet): the workspace shows one box at a time (see Canvas.tsx). */
const QUERY = '(max-width: 700px)'

function subscribe(onChange: () => void): () => void {
  const m = window.matchMedia(QUERY)
  m.addEventListener('change', onChange)
  return () => m.removeEventListener('change', onChange)
}

export function usePhoneLayout(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches)
}
