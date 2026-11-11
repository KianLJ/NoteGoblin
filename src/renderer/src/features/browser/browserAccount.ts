import { useSyncExternalStore } from 'react'

/**
 * Who's signed in, for the Browser boxes: each account browses in its own session (shared/browser.ts's
 * browserPartition). AppShell sets it; every Browser box — the dock's and any more on the canvas — reads it.
 */
let current: string | null = null
const listeners = new Set<() => void>()

export function setBrowserAccount(accountId: string | null): void {
  if (accountId === current) return
  current = accountId
  listeners.forEach((l) => l())
}

export function useBrowserAccount(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current
  )
}

/** Asks the canvas a Browser box is on for another Browser box beside it (Canvas.tsx listens), opening `url` if given. */
export const NEW_BROWSER_WINDOW_EVENT = 'gb-new-browser-window'

/** Pages a new Browser box opens on, by its id, until it takes them. */
const firstPages = new Map<string, string>()

export function setFirstPage(windowId: string, url: string): void {
  firstPages.set(windowId, url)
}

export function takeFirstPage(windowId: string): string | undefined {
  const url = firstPages.get(windowId)
  firstPages.delete(windowId)
  return url
}

export function requestBrowserWindow(from: HTMLElement, url?: string): void {
  from.dispatchEvent(new CustomEvent(NEW_BROWSER_WINDOW_EVENT, { bubbles: true, detail: { url } }))
}
