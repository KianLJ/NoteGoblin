import { useEffect, useRef, useState } from 'react'

/**
 * Keeps a conditionally-rendered element mounted for a short beat after
 * `open` goes false, so its CSS exit animation (see global.css's gb-pop-out)
 * actually gets to play instead of the element just vanishing the instant
 * React unmounts it. Mirrors gb-fade-in's mount-side timing — pass the same
 * boolean you'd otherwise gate `{open && <div/>}` on, then render with
 * `rendered && <div className={closing ? 'gb-pop-out' : 'gb-fade-in'}>`.
 *
 * Respects prefers-reduced-motion by skipping the delay entirely (nothing to
 * wait out once gb-pop-out itself is a no-op under that setting — see
 * global.css).
 */
export function useMountAnimation(open: boolean, exitMs = 110): { rendered: boolean; closing: boolean } {
  const [rendered, setRendered] = useState(open)
  const [closing, setClosing] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (open) {
      clearTimeout(timerRef.current)
      setClosing(false)
      setRendered(true)
      return
    }

    if (!rendered) return

    if (reducedMotion) {
      setRendered(false)
      return
    }

    setClosing(true)
    timerRef.current = setTimeout(() => {
      setRendered(false)
      setClosing(false)
    }, exitMs)
    return () => clearTimeout(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return { rendered, closing }
}
