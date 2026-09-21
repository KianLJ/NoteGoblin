import { useRef } from 'react'

/**
 * Remembers the last truthy value passed in, returning it even once the
 * live value goes null/false/undefined — used to keep rendering a Modal's
 * content (which usually destructures fields off the gating value, e.g. a
 * `pendingDelete: { message: string } | null`) during the modal's own
 * closing animation, after the real value has already gone null but before
 * the modal has actually finished unmounting (see useMountAnimation and
 * Modal's `open` prop).
 */
export function useLastTruthy<T>(value: T | null | undefined | false): T | null {
  const ref = useRef<T | null>(value || null)
  if (value) ref.current = value
  return ref.current
}
