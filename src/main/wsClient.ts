import WebSocket from 'ws'
import type { BrowserWindow } from 'electron'
import { getActiveConnection } from './appState'

interface WsEntry {
  socket: WebSocket
  campaignId: string | null
}

/** One persistent WS connection per host address, reused across subscribe/select-character calls. */
const sockets = new Map<string, WsEntry>()

function isLive(socket: WebSocket): boolean {
  return socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING
}

function connect(address: string, window: BrowserWindow): WsEntry {
  const existing = sockets.get(address)
  if (existing && isLive(existing.socket)) return existing

  const connection = getActiveConnection(address)
  if (!connection) throw new Error('Not connected to that host.')

  const [host, portStr] = address.split(':')
  const socket = new WebSocket(`wss://${host}:${portStr}/ws?token=${encodeURIComponent(connection.token)}`, {
    ca: connection.certPem,
    // Same reasoning as pinnedHttpClient: we pin the exact certificate, which
    // is a stronger check than hostname matching, and self-signed certs
    // generated before we know a player's LAN/Tailscale IP can't list every
    // possible hostname in advance anyway.
    checkServerIdentity: () => true
  })

  const entry: WsEntry = { socket, campaignId: null }
  sockets.set(address, entry)

  socket.on('message', (raw) => {
    let message: unknown
    try {
      message = JSON.parse(raw.toString())
    } catch {
      return
    }
    if (typeof message !== 'object' || message === null) return
    const msg = message as { type?: unknown; campaignId?: unknown; players?: unknown }
    if (msg.type === 'presence' && typeof msg.campaignId === 'string') {
      window.webContents.send('ws:presence', {
        address,
        campaignId: msg.campaignId,
        players: msg.players
      })
    }
  })

  socket.on('close', () => {
    if (sockets.get(address) === entry) sockets.delete(address)
  })
  socket.on('error', () => {
    // A dropped/unreachable connection just means presence stops updating —
    // subscribe() will reconnect on the next call. Nothing to surface here.
  })

  return entry
}

function sendWhenOpen(socket: WebSocket, payload: unknown): void {
  const body = JSON.stringify(payload)
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(body)
  } else {
    socket.once('open', () => socket.send(body))
  }
}

export function subscribeToCampaign(address: string, campaignId: string, window: BrowserWindow): void {
  const entry = connect(address, window)
  entry.campaignId = campaignId
  sendWhenOpen(entry.socket, { type: 'subscribe', campaignId })
}

export function announceSelectedCharacter(address: string, characterName: string | null): void {
  const entry = sockets.get(address)
  if (!entry) return
  sendWhenOpen(entry.socket, { type: 'select-character', characterName })
}
