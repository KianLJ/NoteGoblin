import { Server, getServerByName, type Connection, type ConnectionContext } from 'partyserver'
import type { Env } from './env'
import { verifyToken } from './lib/token'

/**
 * Single shared room every logged-in client holds one WebSocket connection
 * to. Tracks who's online (and, once they start hosting, which session id)
 * and pushes updates only to that user's friends (resolved via a cross-DO
 * fetch to directory.ts — this room never stores account/friend data itself).
 */

interface ConnState {
  userId: string
  hostingSessionId: string | null
}

function send(connection: Connection, payload: unknown): void {
  connection.send(JSON.stringify(payload))
}

export class Presence extends Server<Env> {
  private secret(): string {
    const secret = this.env.RELAY_SECRET
    if (typeof secret === 'string' && secret.length > 0) return secret
    return 'dev-insecure-secret-do-not-deploy-with-this'
  }

  /** Called by directory.ts to forward a just-created notification to a specific user's live connection(s), if any are open — deliberately unauthenticated cross-DO call, mirroring directory.ts's own internal endpoints. */
  async onRequest(req: Request): Promise<Response> {
    const url = new URL(req.url)
    if (req.method !== 'POST' || url.pathname.split('/').filter(Boolean).pop() !== 'push') {
      return new Response('Not found', { status: 404 })
    }
    const body = (await req.json().catch(() => null)) as { userId?: string; payload?: unknown } | null
    if (!body?.userId || body.payload === undefined) return new Response('userId and payload are required', { status: 400 })

    for (const conn of this.getConnections<ConnState>(`user:${body.userId}`)) send(conn, body.payload)
    return new Response(JSON.stringify({ ok: true }))
  }

  async getConnectionTags(_connection: Connection, ctx: ConnectionContext): Promise<string[]> {
    const token = new URL(ctx.request.url).searchParams.get('token') ?? ''
    const payload = await verifyToken(this.secret(), token)
    return payload ? [`user:${payload.userId}`] : []
  }

  async onConnect(connection: Connection<ConnState>, ctx: ConnectionContext): Promise<void> {
    const token = new URL(ctx.request.url).searchParams.get('token') ?? ''
    const payload = await verifyToken(this.secret(), token)
    if (!payload) {
      connection.close(4001, 'Invalid or expired token')
      return
    }
    const userId = payload.userId
    connection.setState({ userId, hostingSessionId: null } satisfies ConnState)

    const alreadyOnlineElsewhere = this.isUserOnline(userId, connection.id)
    const friendIds = await this.fetchFriendIds(userId)
    send(connection, { type: 'online-friends', friends: this.snapshotOnlineFriends(friendIds) })

    // Only announce "came online" the first time this user opens a connection
    // (they may have multiple windows/devices open at once).
    if (!alreadyOnlineElsewhere) this.notifyFriends(friendIds, { type: 'friend-online', userId })
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
    const msg = parsed as { type?: unknown; userIds?: unknown; sessionId?: unknown }

    if (msg.type === 'query-online' && Array.isArray(msg.userIds)) {
      const ids = msg.userIds.filter((id): id is string => typeof id === 'string')
      send(connection, { type: 'online-friends', friends: this.snapshotOnlineFriends(ids) })
      return
    }

    if (msg.type === 'set-hosting') {
      const sessionId = typeof msg.sessionId === 'string' ? msg.sessionId : null
      connection.setState({ ...connection.state, hostingSessionId: sessionId })
      this.fetchFriendIds(connection.state.userId).then((friendIds) => {
        this.notifyFriends(friendIds, { type: 'friend-hosting', userId: connection.state!.userId, sessionId })
      })
    }
  }

  async onClose(connection: Connection<ConnState>, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    const userId = connection.state?.userId
    if (!userId) return
    if (!this.isUserOnline(userId)) {
      const friendIds = await this.fetchFriendIds(userId)
      this.notifyFriends(friendIds, { type: 'friend-offline', userId })
    }
  }

  private isUserOnline(userId: string, excludingConnectionId?: string): boolean {
    for (const conn of this.getConnections<ConnState>(`user:${userId}`)) {
      if (conn.id !== excludingConnectionId) return true
    }
    return false
  }

  /** One row per online friend, with whichever hostingSessionId their most recent connection reports. */
  private snapshotOnlineFriends(friendIds: string[]): { userId: string; hostingSessionId: string | null }[] {
    const result: { userId: string; hostingSessionId: string | null }[] = []
    for (const friendId of friendIds) {
      let hostingSessionId: string | null = null
      let online = false
      for (const conn of this.getConnections<ConnState>(`user:${friendId}`)) {
        online = true
        if (conn.state?.hostingSessionId) hostingSessionId = conn.state.hostingSessionId
      }
      if (online) result.push({ userId: friendId, hostingSessionId })
    }
    return result
  }

  private notifyFriends(friendIds: string[], payload: unknown): void {
    for (const friendId of friendIds) {
      for (const conn of this.getConnections<ConnState>(`user:${friendId}`)) {
        send(conn, payload)
      }
    }
  }

  private async fetchFriendIds(userId: string): Promise<string[]> {
    const directory = await getServerByName(this.env.Directory, 'global-directory')
    const res = await directory.fetch(`https://internal/friend-ids/${userId}`)
    if (!res.ok) return []
    return (await res.json()) as string[]
  }
}
