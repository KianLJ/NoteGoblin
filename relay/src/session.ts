import { Server, getServerByName, type Connection, type ConnectionContext } from 'partyserver'
import type { Env } from './env'
import { verifyToken } from './lib/token'

/**
 * One Durable Object per active hosting session (room id = a uuid the DM
 * generates on "start hosting"). This is a dumb tunnel — it never interprets
 * `payload`, just routes frames between the DM's connection and each
 * player's, and enforces that only DM-invited relay userIds can join.
 * All campaign/notes business logic lives in the DM's own Electron process
 * (see src/main/sessionHost.ts), untouched by this room.
 */

interface ConnState {
  userId: string
  username: string
  role: 'dm' | 'player'
}

interface SessionData {
  dmUserId: string
  allowedPlayerIds: string[]
}

function send(connection: Connection, payload: unknown): void {
  connection.send(JSON.stringify(payload))
}

export class Session extends Server<Env> {
  private secret(): string {
    const secret = this.env.RELAY_SECRET
    if (typeof secret === 'string' && secret.length > 0) return secret
    return 'dev-insecure-secret-do-not-deploy-with-this'
  }

  private async getSessionData(): Promise<SessionData | null> {
    return (await this.ctx.storage.get<SessionData>('session')) ?? null
  }

  async getConnectionTags(_connection: Connection, ctx: ConnectionContext): Promise<string[]> {
    const url = new URL(ctx.request.url)
    const payload = await verifyToken(this.secret(), url.searchParams.get('token') ?? '')
    if (!payload) return []
    const role = url.searchParams.get('role') === 'dm' ? 'dm' : 'player'
    return [`user:${payload.userId}`, `role:${role}`]
  }

  /**
   * Claims DM ownership of this session id the first time anyone calls it
   * (whether that's the DM's own "start hosting" or their first invite —
   * whichever happens first), and adds a friend's relay userId to the
   * allow-list. Authenticated purely by relay token; no separate session
   * secret needed since the relay already vouches for the caller's identity.
   */
  async onRequest(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const action = url.pathname.split('/').filter(Boolean).pop()

    if (req.method === 'POST' && action === 'invite') {
      const authHeader = req.headers.get('authorization')
      if (!authHeader?.startsWith('Bearer ')) return new Response('Unauthorized', { status: 401 })
      const payload = await verifyToken(this.secret(), authHeader.slice('Bearer '.length))
      if (!payload) return new Response('Unauthorized', { status: 401 })

      const body = (await req.json().catch(() => null)) as { userId?: string } | null
      if (!body?.userId) return new Response('userId is required', { status: 400 })

      let data = await this.getSessionData()
      if (!data) {
        data = { dmUserId: payload.userId, allowedPlayerIds: [] }
      } else if (data.dmUserId !== payload.userId) {
        return new Response('Only the session owner can invite players', { status: 403 })
      }
      if (!data.allowedPlayerIds.includes(body.userId)) data.allowedPlayerIds.push(body.userId)
      await this.ctx.storage.put('session', data)

      const sessionId = url.pathname.split('/').filter(Boolean).slice(-2, -1)[0]
      const directory = await getServerByName(this.env.Directory, 'global-directory')
      try {
        const notifyRes = await directory.fetch('https://internal/notify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            userId: body.userId,
            kind: 'session-invite',
            fromUserId: payload.userId,
            sessionId
          })
        })
        if (!notifyRes.ok) {
          console.error('session invite: notify failed', notifyRes.status, await notifyRes.text().catch(() => ''))
        }
      } catch (err) {
        // Invite still succeeded — the invitee just won't get a live/stored notification for it.
        console.error('session invite: notify threw', err)
      }

      return new Response(JSON.stringify({ ok: true }))
    }

    if (req.method === 'POST' && action === 'close') {
      const authHeader = req.headers.get('authorization')
      if (!authHeader?.startsWith('Bearer ')) return new Response('Unauthorized', { status: 401 })
      const payload = await verifyToken(this.secret(), authHeader.slice('Bearer '.length))
      const data = await this.getSessionData()
      if (!payload || !data || data.dmUserId !== payload.userId) {
        return new Response('Unauthorized', { status: 401 })
      }
      for (const conn of this.getConnections()) conn.close(4000, 'Session closed')
      await this.ctx.storage.deleteAll()
      return new Response(JSON.stringify({ ok: true }))
    }

    return new Response('Not found', { status: 404 })
  }

  async onConnect(connection: Connection<ConnState>, ctx: ConnectionContext): Promise<void> {
    const url = new URL(ctx.request.url)
    const payload = await verifyToken(this.secret(), url.searchParams.get('token') ?? '')
    if (!payload) {
      connection.close(4001, 'Invalid or expired token')
      return
    }
    const role = url.searchParams.get('role') === 'dm' ? 'dm' : 'player'
    const username = url.searchParams.get('username') ?? 'Unknown'

    let data = await this.getSessionData()
    if (role === 'dm') {
      if (!data) {
        data = { dmUserId: payload.userId, allowedPlayerIds: [] }
        await this.ctx.storage.put('session', data)
      } else if (data.dmUserId !== payload.userId) {
        connection.close(4003, 'A different session already owns this id')
        return
      }
    } else {
      if (!data || data.dmUserId === payload.userId || !data.allowedPlayerIds.includes(payload.userId)) {
        connection.close(4003, 'Not invited to this session')
        return
      }
    }

    connection.setState({ userId: payload.userId, username, role } satisfies ConnState)

    // The WebSocket handshake itself always completes (and fires the client's
    // `open` event) before this handler runs — connection.close() above still
    // reaches the client, but only after `open` already fired, so a client
    // can't tell "rejected" from "accepted" just from seeing `open`. This
    // explicit ack lets sessionHost.ts/sessionClient.ts wait for real
    // authorization instead of racing the raw socket-open event.
    send(connection, { type: 'session-ready' })

    if (role === 'player') {
      for (const dmConn of this.getConnections<ConnState>('role:dm')) {
        send(dmConn, { type: 'player-connected', userId: payload.userId, username })
      }
    }
  }

  onMessage(connection: Connection<ConnState>, message: string | ArrayBuffer | ArrayBufferView): void {
    if (typeof message !== 'string' || !connection.state) return
    let parsed: unknown
    try {
      parsed = JSON.parse(message)
    } catch {
      return
    }
    if (typeof parsed !== 'object' || parsed === null) return
    const frame = parsed as { to?: unknown; payload?: unknown }

    if (connection.state.role === 'player') {
      // Players only ever address the DM — the relay doesn't interpret
      // `payload`, it's opaque business-logic content from sessionClient.ts.
      for (const dmConn of this.getConnections<ConnState>('role:dm')) {
        send(dmConn, { from: connection.state.userId, fromUsername: connection.state.username, payload: frame.payload })
      }
      return
    }

    // DM sender: `to` is a specific player userId, or 'all' to broadcast.
    if (frame.to === 'all') {
      for (const conn of this.getConnections<ConnState>('role:player')) {
        send(conn, { payload: frame.payload })
      }
    } else if (typeof frame.to === 'string') {
      for (const conn of this.getConnections<ConnState>(`user:${frame.to}`)) {
        if (conn.state?.role === 'player') send(conn, { payload: frame.payload })
      }
    }
  }

  onClose(connection: Connection<ConnState>): void {
    if (connection.state?.role === 'player') {
      for (const dmConn of this.getConnections<ConnState>('role:dm')) {
        send(dmConn, { type: 'player-disconnected', userId: connection.state.userId })
      }
      return
    }

    // DM disconnected (app closed, network dropped, etc.) — the session is
    // unusable without them, so disconnect every connected player too,
    // rather than leaving their sockets open forwarding requests into a void
    // that will never respond. Code 4002 lets sessionClient.ts distinguish
    // this from an ordinary drop and show a clear "DM disconnected" message.
    if (connection.state?.role === 'dm') {
      for (const playerConn of this.getConnections<ConnState>('role:player')) {
        playerConn.close(4002, 'DM disconnected')
      }
    }
  }
}
