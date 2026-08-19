import { v4 as uuid } from 'uuid'
import WebSocket from 'ws'
import type { BrowserWindow } from 'electron'
import { RELAY_URL, relaySessionPath } from '@server/relay/relayConfig'
import type {
  CampaignChangedFrame,
  DiceRollFrame,
  InitiativeFrame,
  MessageFrame,
  PresenceFrame,
  RequestFrame,
  RequestKind,
  ResponseFrame
} from '@server/relay/sessionProtocol'
import type { ApiResult } from '@shared/ipc'

/**
 * Player side of a joined session — opens one WS to the relay's session
 * room and multiplexes every campaigns/notes/folders IPC call over it as a
 * request/response pair, replacing what one-HTTPS-call-per-campaignClient.ts-
 * function used to do.
 */

const REQUEST_TIMEOUT_MS = 15_000

let socket: WebSocket | null = null
let currentSessionId: string | null = null
let clientWindow: BrowserWindow | null = null
const pending = new Map<string, { resolve: (response: ResponseFrame) => void; timer: NodeJS.Timeout }>()

function wsUrl(sessionId: string): string {
  return RELAY_URL.replace(/^http/, 'ws') + relaySessionPath(sessionId)
}

export function getJoinedSessionId(): string | null {
  return currentSessionId
}

export function joinSession(
  sessionId: string,
  relayToken: string,
  relayUsername: string,
  window: BrowserWindow
): Promise<{ ok: true } | { ok: false; error: string }> {
  leaveSession()
  clientWindow = window

  return new Promise((resolve) => {
    const ws = new WebSocket(
      `${wsUrl(sessionId)}?token=${encodeURIComponent(relayToken)}&role=player&username=${encodeURIComponent(relayUsername)}`
    )
    let settled = false

    // The WS handshake completing (and this 'open' handler firing) does NOT
    // mean the relay accepted us as a session participant — an invite check
    // happens after the handshake, so a rejected join still briefly "opens"
    // before the relay closes it. Wait for the relay's explicit
    // {type:'session-ready'} ack (sent only once authorized) before treating
    // the join as successful.
    ws.on('open', () => {
      socket = ws
      currentSessionId = sessionId
    })
    ws.on('message', (raw) => {
      if (!settled) {
        let message: unknown
        try {
          message = JSON.parse(raw.toString())
        } catch {
          return
        }
        if (typeof message === 'object' && message !== null && (message as { type?: unknown }).type === 'session-ready') {
          settled = true
          resolve({ ok: true })
        }
        return
      }
      handleFrame(raw)
    })
    ws.on('close', (code) => {
      const wasActive = settled && socket === ws
      if (socket === ws) {
        socket = null
        currentSessionId = null
        failAllPending('Disconnected from the DM.')
      }
      if (!settled) {
        settled = true
        resolve({
          ok: false,
          error: code === 4003 ? "You haven't been invited to this session." : 'Could not join that session.'
        })
      } else if (wasActive) {
        // A drop after a successful join is not something a pending request
        // will surface — push it so the renderer can leave the session view
        // instead of sitting on a campaign it's no longer actually connected to.
        window.webContents.send('session:disconnected', {
          reason: code === 4002 ? 'dm-left' : 'connection-lost'
        })
      }
    })
    ws.on('error', () => {
      if (!settled) {
        settled = true
        resolve({ ok: false, error: 'Could not reach the relay.' })
      }
    })
  })
}

export function leaveSession(): void {
  if (socket) {
    try {
      socket.close()
    } catch {
      /* already closing/closed */
    }
  }
  socket = null
  currentSessionId = null
  failAllPending('Left the session.')
}

function failAllPending(error: string): void {
  for (const [reqId, entry] of pending) {
    clearTimeout(entry.timer)
    entry.resolve({ reqId, ok: false, error })
  }
  pending.clear()
}

export function sendRequest<T>(kind: RequestKind, payload: unknown): Promise<ApiResult<T>> {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return Promise.resolve({ ok: false, error: 'Not connected to a session.' })
  }
  const reqId = uuid()
  const frame: RequestFrame = { reqId, kind, payload }
  const ws = socket

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(reqId)
      resolve({ ok: false, error: 'The DM is not responding.' })
    }, REQUEST_TIMEOUT_MS)

    pending.set(reqId, {
      resolve: (response) => {
        clearTimeout(timer)
        if (response.ok) resolve({ ok: true, data: response.data as T })
        else resolve({ ok: false, error: response.error })
      },
      timer
    })

    ws.send(JSON.stringify({ to: 'dm', payload: frame }))
  })
}

function handleFrame(raw: WebSocket.RawData): void {
  let message: unknown
  try {
    message = JSON.parse(raw.toString())
  } catch {
    return
  }
  if (typeof message !== 'object' || message === null) return
  const outer = message as { payload?: unknown }
  if (typeof outer.payload !== 'object' || outer.payload === null) return
  const payload = outer.payload as { reqId?: unknown; type?: unknown }

  if (typeof payload.reqId === 'string') {
    const entry = pending.get(payload.reqId)
    if (entry) {
      pending.delete(payload.reqId)
      entry.resolve(payload as ResponseFrame)
    }
    return
  }

  if (payload.type === 'presence' && clientWindow) {
    const frame = payload as PresenceFrame
    clientWindow.webContents.send('ws:presence', {
      sessionId: currentSessionId,
      campaignId: frame.campaignId,
      players: frame.players
    })
  }

  if (payload.type === 'campaign-changed' && clientWindow) {
    const frame = payload as CampaignChangedFrame
    clientWindow.webContents.send('ws:campaign-changed', {
      sessionId: currentSessionId,
      campaignId: frame.campaignId
    })
  }

  if (payload.type === 'active-campaign-changed' && clientWindow) {
    clientWindow.webContents.send('ws:active-campaign-changed', { sessionId: currentSessionId })
  }

  if (payload.type === 'initiative' && clientWindow) {
    const frame = payload as InitiativeFrame
    clientWindow.webContents.send('ws:initiative', { sessionId: currentSessionId, state: frame.state })
  }

  if (payload.type === 'dice-roll' && clientWindow) {
    const frame = payload as DiceRollFrame
    clientWindow.webContents.send('ws:dice-roll', frame.roll)
  }

  if (payload.type === 'message' && clientWindow) {
    const frame = payload as MessageFrame
    clientWindow.webContents.send('ws:message', { sessionId: currentSessionId, message: frame.message })
  }
}
