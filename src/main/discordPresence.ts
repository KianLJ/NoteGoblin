import { Client } from '@xhayper/discord-rpc'

/**
 * Discord Rich Presence — shows "DMing <campaign>" or "Playing in <campaign>"
 * on the user's Discord profile while NoteGoblin is open (see AppShell.tsx
 * for what decides that text and when it changes).
 *
 * The Client ID below is the "NoteGoblin" application registered at
 * https://discord.com/developers/applications — not a secret (it's public,
 * embedded in every RPC-enabled client the same way a bundle id is).
 * Everything downstream is still best-effort regardless: if Discord's
 * desktop client isn't running, `connect()` just retries later and the app
 * works completely normally either way — Rich Presence is cosmetic and
 * never something to depend on.
 */
const CLIENT_ID = '1539412858557960352'

const RECONNECT_DELAY_MS = 15_000

let client: Client | null = null
let ready = false
let reconnectTimer: NodeJS.Timeout | null = null
let activityStartedAt: Date | null = null
/** Whatever setDiscordActivity was last called with — applied once a pending connection actually becomes ready. */
let pendingDetails: string | null = null

function connect(): void {
  if (client || !CLIENT_ID) return

  const next = new Client({ clientId: CLIENT_ID })
  client = next

  next.on('ready', () => {
    ready = true
    if (pendingDetails) applyActivity(pendingDetails)
  })

  // Discord was closed, or its RPC socket dropped for some other reason —
  // clear out the dead client and try again later rather than leaving this
  // permanently stuck in a disconnected state for the rest of the run.
  next.on('disconnected', () => {
    ready = false
    if (client === next) client = null
    scheduleReconnect()
  })

  next.connect().catch(() => {
    // The overwhelmingly common case: Discord's desktop client (not the web
    // app, which has no local RPC socket) simply isn't running right now.
    // Not an error worth surfacing — just retry later.
    if (client === next) client = null
    scheduleReconnect()
  })
}

function scheduleReconnect(): void {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, RECONNECT_DELAY_MS)
}

function applyActivity(details: string): void {
  if (!client || !ready) return
  // Keeps counting up from whenever a presence line first appeared this run
  // (not reset on every text change) — an elapsed "for 45 minutes" reads as
  // "time in NoteGoblin," not "time since the campaign name last changed."
  if (!activityStartedAt) activityStartedAt = new Date()
  void client.user
    ?.setActivity({
      details,
      startTimestamp: activityStartedAt,
      largeImageKey: 'notegoblin',
      largeImageText: 'NoteGoblin'
    })
    .catch(() => {
      /* best-effort — Discord may have closed between the ready check above and this call */
    })
}

/**
 * Sets (details) or clears (null) the Rich Presence line. Safe to call
 * anytime, including before Discord/the RPC connection is up — the latest
 * call just becomes what gets applied once (if ever) a connection is ready.
 */
export function setDiscordActivity(details: string | null): void {
  pendingDetails = details
  if (details === null) {
    activityStartedAt = null
    if (client && ready) void client.user?.clearActivity().catch(() => {})
    return
  }
  if (!client) connect()
  else applyActivity(details)
}
