// The web app's relay address: the relay serves the app itself (at /app/), so it's wherever the page came from.
// Under `npm run web:dev` the dev server proxies /parties to the real relay (see web/vite.config.ts).
export const RELAY_URL = window.location.origin

export const RELAY_DIRECTORY_PATH = '/parties/directory/global-directory'
export const RELAY_PRESENCE_PATH = '/parties/presence/lobby'

export function relaySessionPath(sessionId: string): string {
  return `/parties/session/${sessionId}`
}
