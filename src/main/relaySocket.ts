import WebSocket from 'ws'
import type { BrowserWindow } from 'electron'
import { RELAY_URL, RELAY_PRESENCE_PATH } from '@server/relay/relayConfig'
import { markFriendOnline, markFriendOffline, setFriendHosting, setOnlineFriends, setRelayStatus } from './relayState'

/** One persistent WS connection to the relay's presence room for the current relay session — mirrors wsClient.ts's reconnect-on-demand pattern, but for a single always-on connection rather than one per host address. */
let socket: WebSocket | null = null
let currentToken: string | null = null
let pendingHostingSessionId: string | null = null

function wsUrl(): string {
  return RELAY_URL.replace(/^http/, 'ws') + RELAY_PRESENCE_PATH
}

export function connectPresence(token: string, window: BrowserWindow): void {
  if (
    socket &&
    currentToken === token &&
    (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
  ) {
    return
  }
  disconnectPresence()
  currentToken = token
  setRelayStatus('connecting')

  const ws = new WebSocket(`${wsUrl()}?token=${encodeURIComponent(token)}`)
  socket = ws

  ws.on('open', () => {
    if (socket !== ws) return
    setRelayStatus('connected')
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
    const msg = message as { type?: unknown; userId?: unknown; sessionId?: unknown; friends?: unknown }

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
    }
  })

  ws.on('close', () => {
    if (socket === ws) {
      socket = null
      setRelayStatus('unavailable')
      window.webContents.send('relay:friends-changed')
    }
  })
  ws.on('error', () => {
    // Dropped/unreachable relay — friends just stop updating until connectPresence() is called again (e.g. next identity check-in).
  })
}

export function disconnectPresence(): void {
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
