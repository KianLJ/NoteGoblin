/** Where the deployed relay (relay/) lives — defaults to production; set NOTEGOBLIN_RELAY_URL=http://127.0.0.1:8787 to point at `npm run relay:dev` instead. */
export const RELAY_URL = process.env.NOTEGOBLIN_RELAY_URL ?? 'https://relay.notegoblin.uk'

export const RELAY_DIRECTORY_PATH = '/parties/directory/global-directory'
export const RELAY_PRESENCE_PATH = '/parties/presence/lobby'

export function relaySessionPath(sessionId: string): string {
  return `/parties/session/${sessionId}`
}
