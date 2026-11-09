import { useLayoutEffect, useRef, useState } from 'react'

/**
 * Some tools have to keep running while their box is closed: Music follows
 * the calendar's weather and its mood's ambience, and the player's turn order
 * only learns about a fight from live pushes. Each gets a stable element that the app renders the tool into
 * once (with a portal) and never unmounts. Opening the box just moves that
 * element into it, and closing the box moves it out again, so the tool keeps
 * its state either way.
 */
export function useKeepAliveHost(): HTMLDivElement {
  const [host] = useState(() => {
    const el = document.createElement('div')
    el.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0'
    return el
  })
  return host
}

/** The spot inside a canvas box where a kept-alive tool shows up. */
export function KeepAliveOutlet({ host }: { host: HTMLElement }): JSX.Element {
  const slot = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = slot.current!
    el.appendChild(host)
    return () => {
      if (host.parentNode === el) el.removeChild(host)
    }
  }, [host])
  return <div ref={slot} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }} />
}
