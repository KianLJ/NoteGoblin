import { useEffect, useState } from 'react'

/** Hash routes, so every view is a real URL the phone's back gesture and home-screen shortcut both understand, with no server-side routing needed. */
export type Route =
  | { view: 'home' }
  | { view: 'campaign'; campaignId: string }
  | { view: 'note'; campaignId: string; noteId: string }
  | { view: 'character'; characterId: string }

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  if (parts[0] === 'c' && parts[1] && parts[2] === 'n' && parts[3]) return { view: 'note', campaignId: parts[1], noteId: parts[3] }
  if (parts[0] === 'c' && parts[1]) return { view: 'campaign', campaignId: parts[1] }
  if (parts[0] === 'ch' && parts[1]) return { view: 'character', characterId: parts[1] }
  return { view: 'home' }
}

export function href(route: Route): string {
  switch (route.view) {
    case 'home':
      return '#/'
    case 'campaign':
      return `#/c/${encodeURIComponent(route.campaignId)}`
    case 'note':
      return `#/c/${encodeURIComponent(route.campaignId)}/n/${encodeURIComponent(route.noteId)}`
    case 'character':
      return `#/ch/${encodeURIComponent(route.characterId)}`
  }
}

export function parentOf(route: Route): Route | null {
  if (route.view === 'note') return { view: 'campaign', campaignId: route.campaignId }
  if (route.view === 'home') return null
  return { view: 'home' }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))
  useEffect(() => {
    const onChange = (): void => {
      setRoute(parseRoute(window.location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
