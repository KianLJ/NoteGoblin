import WebSocket from 'ws'
import type { BrowserWindow } from 'electron'
import { RELAY_URL, RELAY_PRESENCE_PATH } from '@server/relay/relayConfig'
import { markFriendOnline, markFriendOffline, setFriendHosting, setOnlineFriends, setRelayStatus } from './relayState'

/** One persistent WS connection to the relay's presence room for the current relay session — mirrors wsClient.ts's reconnect-on-demand pattern, but for a single always-on connection rather than one per host address. */
let socket: WebSocket | null = null
let currentToken: string | null = null
let pendingHostingSessionId: string | null = null

// A dropped connection (NAT/router idle timeout, wifi blip, laptop sleep —
// all completely normal over a real internet connection, unlike the
// localhost testing this was originally built against) used to just leave
// the client silently "unavailable" forever, since nothing ever called
// connectPresence() again on its own. Friend requests/notifications would
// then only arrive whenever something else happened to reconnect (e.g. an
// app restart) — which is exactly the "significant delay" bug this fixes.
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempt = 0
let intentionalDisconnect = false
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

const HEARTBEAT_INTERVAL_MS = 25_000
const MAX_RECONNECT_DELAY_MS = 30_000

function wsUrl(): string {
  return RELAY_URL.replace(/^http/, 'ws') + RELAY_PRESENCE_PATH
}

function clearReconnectTimer(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

/** Idle WebSocket ping — mostly to stop NATs/routers on the client's end from silently killing the connection for looking inactive, and to surface a dead connection faster than waiting on a TCP-level timeout. */
function startHeartbeat(ws: WebSocket): void {
  stopHeartbeat()
  heartbeatTimer = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.ping()
  }, HEARTBEAT_INTERVAL_MS)
}

function scheduleReconnect(window: BrowserWindow): void {
  if (reconnectTimer || intentionalDisconnect || !currentToken) return
  const delay = Math.min(1000 * 2 ** reconnectAttempt, MAX_RECONNECT_DELAY_MS)
  reconnectAttempt += 1
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (currentToken && !intentionalDisconnect) connectPresence(currentToken, window)
  }, delay)
}

/** Tears down the current socket without touching reconnect state — used both by a deliberate disconnectPresence() and internally by connectPresence() when replacing a stale socket, which should NOT count as "intentional" (that would block the very reconnect it's about to start). */
function teardownSocket(): void {
  if (socket) {
    // Closing a socket that's still CONNECTING makes `ws` emit an 'error'
    // event ("WebSocket was closed before the connection was established").
    // With no listener left after removeAllListeners(), Node treats that as
    // an uncaught exception and crashes the whole main process — so a
    // swallow-everything listener has to go back on before removing the
    // real ones, not after.
    socket.removeAllListeners()
    socket.on('error', () => {})
    try {
      socket.close()
    } catch {
      /* already closing/closed */
    }
  }
  socket = null
  stopHeartbeat()
}

export function connectPresence(token: string, window: BrowserWindow): void {
  if (
    socket &&
    currentToken === token &&
    (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
  ) {
    return
  }
  teardownSocket()
  clearReconnectTimer()
  intentionalDisconnect = false
  currentToken = token
  setRelayStatus('connecting')

  const ws = new WebSocket(`${wsUrl()}?token=${encodeURIComponent(token)}`)
  socket = ws

  ws.on('open', () => {
    if (socket !== ws) return
    reconnectAttempt = 0
    setRelayStatus('connected')
    startHeartbeat(ws)
    // Re-announce hosting status across a reconnect (e.g. relay blipped mid-session).
    if (pendingHostingSessionId !== null) {
      ws.send(JSON.stringify({ type: 'set-hosting', sessionId: pendingHostingSessionId }))
    }
  })

  ws.on('message', (raw) => {
    let message: unknown
    try {
      message = JSON.parse(raw.toString())
    } catch {
      return
    }
    if (typeof message !== 'object' || message === null) return
    const msg = message as { type?: unknown; userId?: unknown; sessionId?: unknown; friends?: unknown; message?: unknown }

    if (msg.type === 'online-friends' && Array.isArray(msg.friends)) {
      setOnlineFriends(
        msg.friends.filter(
          (f): f is { userId: string; hostingSessionId: string | null } =>
            typeof f === 'object' && f !== null && typeof (f as { userId?: unknown }).userId === 'string'
        )
      )
      window.webContents.send('relay:friends-changed')
    } else if (msg.type === 'friend-online' && typeof msg.userId === 'string') {
      markFriendOnline(msg.userId)
      window.webContents.send('relay:friends-changed')
    } else if (msg.type === 'friend-offline' && typeof msg.userId === 'string') {
      markFriendOffline(msg.userId)
      window.webContents.send('relay:friends-changed')
    } else if (msg.type === 'friend-hosting' && typeof msg.userId === 'string') {
      setFriendHosting(msg.userId, typeof msg.sessionId === 'string' ? msg.sessionId : null)
      window.webContents.send('relay:friends-changed')
    } else if (msg.type === 'notification') {
      // A friend-request notification also means the recipient's incoming
      // requests list just changed — re-fetching both is cheap and avoids a
      // second push-event type just for that.
      window.webContents.send('relay:notifications-changed')
      window.webContents.send('relay:friends-changed')
    } else if (msg.type === 'friend-graph-changed') {
      // Someone removed or declined us — no bell notification warranted, just
      // a nudge to re-fetch so our own friends list stops disagreeing with theirs.
      window.webContents.send('relay:friends-changed')
    } else if (msg.type === 'message' && typeof msg.message === 'object' && msg.message !== null) {
      // The actual message content, not just a "something changed" nudge —
      // pushed live so ChatPanel.tsx can append it without a refetch,
      // matching the campaign-chat 'ws:message' push's shape/purpose.
      window.webContents.send('relay:message', msg.message)
    }
  })

  ws.on('close', () => {
    if (socket === ws) {
      socket = null
      stopHeartbeat()
      setRelayStatus('unavailable')
      window.webContents.send('relay:friends-changed')
      scheduleReconnect(window)
    }
  })
  ws.on('error', () => {
    // Dropped/unreachable relay — the 'close' handler (which always follows)
    // is what schedules the reconnect; nothing else to do here.
  })
}

export function disconnectPresence(): void {
  intentionalDisconnect = true
  clearReconnectTimer()
  reconnectAttempt = 0
  teardownSocket()
  currentToken = null
  setRelayStatus('unavailable')
}

/** Ask the relay which of a set of userIds are currently online, for cases (e.g. right after accepting a friend request) where a fresh push hasn't arrived yet. */
export function queryOnline(userIds: string[]): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'query-online', userIds }))
  }
}

/** Tells friends whether we're currently hosting a session (and which one), so FriendSummary.hostingSessionId stays live for them without polling. */
export function announceHostingStatus(sessionId: string | null): void {
  pendingHostingSessionId = sessionId
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'set-hosting', sessionId }))
  }
}
