import { useCallback, useEffect, useState } from 'react'
import { SignedOutError } from './api'

/**
 * Last good response per key, kept for the life of the page — going back
 * from a note to its campaign (or reopening a character) renders instantly
 * from here while a fresh copy loads underneath.
 */
const cache = new Map<string, unknown>()

export const SIGNED_OUT_EVENT = 'ng-signed-out'

export function clearCache(): void {
  cache.clear()
}

export function useLoad<T>(key: string, load: () => Promise<T>): { data: T | undefined; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | undefined>(() => cache.get(key) as T | undefined)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let live = true
    setData(cache.get(key) as T | undefined)
    setError(null)
    load().then(
      (result) => {
        cache.set(key, result)
        if (live) setData(result)
      },
      (err: unknown) => {
        if (err instanceof SignedOutError) {
          window.dispatchEvent(new Event(SIGNED_OUT_EVENT))
          return
        }
        if (live) setError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    )
    return () => {
      live = false
    }
    // `load` is a fresh closure every render; `key` is what identifies the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { data, error, reload }
}
