import { useEffect, useState } from 'react'

/**
 * The classic layout setting (Settings → Appearance): the DM and player
 * screens as they were before the canvas — notes tree on the left, tabs in
 * the header, tools in a tabbed right sidebar. Per device, like the theme.
 */
const KEY = 'gb-classic-layout'
const listeners = new Set<(on: boolean) => void>()

export function getClassicLayout(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setClassicLayout(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* best-effort only — still switches for this run */
  }
  listeners.forEach((l) => l(on))
}

export function useClassicLayout(): boolean {
  const [on, setOn] = useState(getClassicLayout)
  useEffect(() => {
    listeners.add(setOn)
    return () => {
      listeners.delete(setOn)
    }
  }, [])
  return on
}
