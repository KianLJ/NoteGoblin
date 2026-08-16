import { Server, getServerByName } from 'partyserver'
import type { Env } from './env'
import { hashPassword, verifyPassword } from './lib/hash'
import { signToken, verifyToken } from './lib/token'

/**
 * The account registry and friend graph for the whole relay, as a single
 * singleton room (fixed id "global-directory"). One Durable Object holding
 * every account is a deliberate small-scale tradeoff — fine for a friend
 * group, not internet-scale. Presence (online/offline) is NOT tracked here;
 * see presence.ts, which fetches this room's friend list to know who to
 * notify.
 */

interface StoredAccount {
  id: string
  username: string
  passwordHash: string
}

interface FriendRequests {
  incoming: string[] // userIds who sent *this* user a request
  outgoing: string[] // userIds *this* user has requested
}

type NotificationKind = 'friend-request' | 'friend-accepted' | 'session-invite'

/** Generic enough to grow a 'message' kind later for DM/private messaging without reshaping this store. */
interface Notification {
  id: string
  kind: NotificationKind
  fromUserId: string
  fromUsername: string
  sessionId?: string
  createdAt: string
  read: boolean
}

const MAX_NOTIFICATIONS_PER_USER = 50

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
}

function badRequest(message: string): Response {
  return json({ error: message }, 400)
}

function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase()
}

export class Directory extends Server<Env> {
  private secret(): string {
    const secret = this.env.RELAY_SECRET
    if (typeof secret === 'string' && secret.length > 0) return secret
    // Dev-only fallback so `wrangler dev` works without extra setup; production
    // deploys must set a real secret via `npx wrangler secret put RELAY_SECRET`.
    return 'dev-insecure-secret-do-not-deploy-with-this'
  }

  private async authenticate(req: Request): Promise<StoredAccount | null> {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return null
    const token = authHeader.slice('Bearer '.length)
    const payload = await verifyToken(this.secret(), token)
    if (!payload) return null
    return (await this.ctx.storage.get<StoredAccount>(`user:${payload.userId}`)) ?? null
  }

  async onRequest(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const segments = url.pathname.split('/').filter(Boolean)
    const action = segments[segments.length - 1]

    if (req.method === 'POST' && action === 'register') return this.handleRegister(req)
    if (req.method === 'POST' && action === 'login') return this.handleLogin(req)
    if (req.method === 'GET' && action === 'me') return this.handleMe(req)
    if (req.method === 'GET' && action === 'friends') return this.handleListFriends(req)
    if (req.method === 'POST' && action === 'request') return this.handleSendRequest(req)
    if (req.method === 'POST' && action === 'accept') return this.handleRespondRequest(req, true)
    if (req.method === 'POST' && action === 'decline') return this.handleRespondRequest(req, false)
    if (req.method === 'POST' && action === 'remove') return this.handleRemoveFriend(req)
    if (req.method === 'GET' && segments[segments.length - 2] === 'friend-ids') return this.handleInternalFriendIds(action)
    if (req.method === 'GET' && action === 'notifications') return this.handleListNotifications(req)
    if (req.method === 'POST' && action === 'read' && segments[segments.length - 2] === 'notifications') {
      return this.handleMarkNotificationRead(req)
    }
    if (req.method === 'POST' && action === 'notify') return this.handleInternalNotify(req)

    return json({ error: 'Not found' }, 404)
  }

  /** Called by presence.ts via cross-party fetch to resolve who to notify on connect/disconnect. Deliberately unauthenticated (presence.ts has no user token to attach) — this only leaks a list of opaque userIds to someone who already knows another opaque userId, not usernames or any other account data, so the exposure is minor at friend-group scale. */
  private async handleInternalFriendIds(userId: string): Promise<Response> {
    const friendIds = (await this.ctx.storage.get<string[]>(`friends:${userId}`)) ?? []
    return json(friendIds)
  }

  private async handleRegister(req: Request): Promise<Response> {
    const body = (await req.json().catch(() => null)) as { username?: string; password?: string } | null
    if (!body?.username || !body.password) return badRequest('username and password are required')
    const username = normalizeUsername(body.username)
    if (username.length < 3) return badRequest('username must be at least 3 characters')
    if (body.password.length < 8) return badRequest('password must be at least 8 characters')

    const existingId = await this.ctx.storage.get<string>(`username:${username}`)
    if (existingId) return badRequest('username is already taken')

    const id = crypto.randomUUID()
    const passwordHash = await hashPassword(body.password)
    const account: StoredAccount = { id, username, passwordHash }
    await this.ctx.storage.put(`user:${id}`, account)
    await this.ctx.storage.put(`username:${username}`, id)
    await this.ctx.storage.put(`friends:${id}`, [] as string[])
    await this.ctx.storage.put(`friendReq:${id}`, { incoming: [], outgoing: [] } as FriendRequests)

    const token = await signToken(this.secret(), id)
    return json({ userId: id, username, token })
  }

  private async handleLogin(req: Request): Promise<Response> {
    const body = (await req.json().catch(() => null)) as { username?: string; password?: string } | null
    if (!body?.username || !body.password) return badRequest('username and password are required')
    const username = normalizeUsername(body.username)

    const id = await this.ctx.storage.get<string>(`username:${username}`)
    if (!id) return json({ error: 'Invalid username or password' }, 401)
    const account = await this.ctx.storage.get<StoredAccount>(`user:${id}`)
    if (!account) return json({ error: 'Invalid username or password' }, 401)

    const valid = await verifyPassword(body.password, account.passwordHash)
    if (!valid) return json({ error: 'Invalid username or password' }, 401)

    const token = await signToken(this.secret(), id)
    return json({ userId: id, username: account.username, token })
  }

  private async handleMe(req: Request): Promise<Response> {
    const account = await this.authenticate(req)
    if (!account) return json({ error: 'Unauthorized' }, 401)
    return json({ userId: account.id, username: account.username })
  }

  private async handleListFriends(req: Request): Promise<Response> {
    const account = await this.authenticate(req)
    if (!account) return json({ error: 'Unauthorized' }, 401)

    const friendIds = (await this.ctx.storage.get<string[]>(`friends:${account.id}`)) ?? []
    const friends = await Promise.all(
      friendIds.map(async (id) => {
        const friend = await this.ctx.storage.get<StoredAccount>(`user:${id}`)
        return friend ? { userId: friend.id, username: friend.username } : null
      })
    )

    const requests = (await this.ctx.storage.get<FriendRequests>(`friendReq:${account.id}`)) ?? {
      incoming: [],
      outgoing: []
    }
    const incoming = await Promise.all(
      requests.incoming.map(async (id) => {
        const requester = await this.ctx.storage.get<StoredAccount>(`user:${id}`)
        return requester ? { userId: requester.id, username: requester.username } : null
      })
    )

    return json({
      friends: friends.filter((f): f is { userId: string; username: string } => f !== null),
      incomingRequests: incoming.filter((f): f is { userId: string; username: string } => f !== null)
    })
  }

  private async handleSendRequest(req: Request): Promise<Response> {
    const account = await this.authenticate(req)
    if (!account) return json({ error: 'Unauthorized' }, 401)

    const body = (await req.json().catch(() => null)) as { username?: string } | null
    if (!body?.username) return badRequest('username is required')
    const targetUsername = normalizeUsername(body.username)
    if (targetUsername === account.username) return badRequest("You can't friend yourself")

    const targetId = await this.ctx.storage.get<string>(`username:${targetUsername}`)
    if (!targetId) return badRequest('No account with that username')

    const existingFriends = (await this.ctx.storage.get<string[]>(`friends:${account.id}`)) ?? []
    if (existingFriends.includes(targetId)) return badRequest('Already friends')

    const myRequests: FriendRequests = (await this.ctx.storage.get(`friendReq:${account.id}`)) ?? {
      incoming: [],
      outgoing: []
    }
    const theirRequests: FriendRequests = (await this.ctx.storage.get(`friendReq:${targetId}`)) ?? {
      incoming: [],
      outgoing: []
    }

    if (myRequests.outgoing.includes(targetId)) return badRequest('Request already sent')

    // If they already sent us a request, accept it instead of creating a mirror request —
    // the client needs to know this happened (status: 'accepted') rather than assuming a
    // request is still pending, since no separate accept step is coming.
    if (myRequests.incoming.includes(targetId)) {
      const response = await this.acceptFriendship(account.id, targetId, 'accepted')
      await this.pushNotification(targetId, 'friend-accepted', account.id)
      return response
    }

    myRequests.outgoing.push(targetId)
    theirRequests.incoming.push(account.id)
    await this.ctx.storage.put(`friendReq:${account.id}`, myRequests)
    await this.ctx.storage.put(`friendReq:${targetId}`, theirRequests)
    await this.pushNotification(targetId, 'friend-request', account.id)

    return json({ ok: true, status: 'requested' })
  }

  private async handleRespondRequest(req: Request, accept: boolean): Promise<Response> {
    const account = await this.authenticate(req)
    if (!account) return json({ error: 'Unauthorized' }, 401)

    const body = (await req.json().catch(() => null)) as { userId?: string } | null
    if (!body?.userId) return badRequest('userId is required')

    const myRequests: FriendRequests = (await this.ctx.storage.get(`friendReq:${account.id}`)) ?? {
      incoming: [],
      outgoing: []
    }
    if (!myRequests.incoming.includes(body.userId)) return badRequest('No such pending request')

    myRequests.incoming = myRequests.incoming.filter((id) => id !== body.userId)
    await this.ctx.storage.put(`friendReq:${account.id}`, myRequests)

    const theirRequests: FriendRequests = (await this.ctx.storage.get(`friendReq:${body.userId}`)) ?? {
      incoming: [],
      outgoing: []
    }
    theirRequests.outgoing = theirRequests.outgoing.filter((id) => id !== account.id)
    await this.ctx.storage.put(`friendReq:${body.userId}`, theirRequests)

    if (accept) {
      const response = await this.acceptFriendship(account.id, body.userId, 'accepted')
      await this.pushNotification(body.userId, 'friend-accepted', account.id)
      return response
    }
    await this.pushFriendGraphChanged(body.userId)
    return json({ ok: true, status: 'declined' })
  }

  private async acceptFriendship(aId: string, bId: string, status: 'accepted'): Promise<Response> {
    const aFriends = (await this.ctx.storage.get<string[]>(`friends:${aId}`)) ?? []
    const bFriends = (await this.ctx.storage.get<string[]>(`friends:${bId}`)) ?? []
    if (!aFriends.includes(bId)) aFriends.push(bId)
    if (!bFriends.includes(aId)) bFriends.push(aId)
    await this.ctx.storage.put(`friends:${aId}`, aFriends)
    await this.ctx.storage.put(`friends:${bId}`, bFriends)
    return json({ ok: true, status })
  }

  private async handleRemoveFriend(req: Request): Promise<Response> {
    const account = await this.authenticate(req)
    if (!account) return json({ error: 'Unauthorized' }, 401)

    const body = (await req.json().catch(() => null)) as { userId?: string } | null
    if (!body?.userId) return badRequest('userId is required')

    const myFriends = ((await this.ctx.storage.get<string[]>(`friends:${account.id}`)) ?? []).filter(
      (id) => id !== body.userId
    )
    const theirFriends = ((await this.ctx.storage.get<string[]>(`friends:${body.userId}`)) ?? []).filter(
      (id) => id !== account.id
    )
    await this.ctx.storage.put(`friends:${account.id}`, myFriends)
    await this.ctx.storage.put(`friends:${body.userId}`, theirFriends)
    // The remover's own client refreshes itself locally after this call resolves —
    // only the other side needs a push, or their friends list silently disagrees
    // with reality until something else happens to trigger a refetch.
    await this.pushFriendGraphChanged(body.userId)

    return json({ ok: true })
  }

  private async handleListNotifications(req: Request): Promise<Response> {
    const account = await this.authenticate(req)
    if (!account) return json({ error: 'Unauthorized' }, 401)
    const notifications = (await this.ctx.storage.get<Notification[]>(`notifications:${account.id}`)) ?? []
    return json(notifications)
  }

  private async handleMarkNotificationRead(req: Request): Promise<Response> {
    const account = await this.authenticate(req)
    if (!account) return json({ error: 'Unauthorized' }, 401)
    const body = (await req.json().catch(() => null)) as { id?: string } | null
    if (!body?.id) return badRequest('id is required')

    const notifications = (await this.ctx.storage.get<Notification[]>(`notifications:${account.id}`)) ?? []
    const next = notifications.map((n) => (n.id === body.id ? { ...n, read: true } : n))
    await this.ctx.storage.put(`notifications:${account.id}`, next)
    return json({ ok: true })
  }

  /** Called by other rooms (e.g. session.ts on invite) that want to notify a user but don't own account data themselves — deliberately unauthenticated, same trust model as handleInternalFriendIds. */
  private async handleInternalNotify(req: Request): Promise<Response> {
    const body = (await req.json().catch(() => null)) as
      | { userId?: string; kind?: string; fromUserId?: string; sessionId?: string }
      | null
    if (!body?.userId || !body.fromUserId) return badRequest('userId and fromUserId are required')
    if (body.kind !== 'friend-request' && body.kind !== 'session-invite') return badRequest('invalid kind')

    await this.pushNotification(body.userId, body.kind, body.fromUserId, body.sessionId)
    return json({ ok: true })
  }

  /** Stores the notification (capped, most-recent-first) and forwards it live over the presence socket if the target is currently online — offline users just see it next time they fetch the list. */
  private async pushNotification(
    userId: string,
    kind: NotificationKind,
    fromUserId: string,
    sessionId?: string
  ): Promise<void> {
    const fromAccount = await this.ctx.storage.get<StoredAccount>(`user:${fromUserId}`)
    const notification: Notification = {
      id: crypto.randomUUID(),
      kind,
      fromUserId,
      fromUsername: fromAccount?.username ?? 'Unknown',
      sessionId,
      createdAt: new Date().toISOString(),
      read: false
    }

    const existing = (await this.ctx.storage.get<Notification[]>(`notifications:${userId}`)) ?? []
    await this.ctx.storage.put(`notifications:${userId}`, [notification, ...existing].slice(0, MAX_NOTIFICATIONS_PER_USER))

    await this.pushLive(userId, { type: 'notification', notification })
  }

  /** For friend-graph changes that don't warrant a persisted/bell notification (someone removed or declined you) — just nudges the other side's client to re-fetch its friends list if they're online. Silently a no-op if they're not. */
  private async pushFriendGraphChanged(userId: string): Promise<void> {
    await this.pushLive(userId, { type: 'friend-graph-changed' })
  }

  /** Forwards an arbitrary payload to a user's live presence connection(s), if any are open — offline users just miss it, which is fine for anything also covered by a stored fetch (notifications) or that's purely a "go re-fetch" nudge (friend-graph-changed). */
  private async pushLive(userId: string, payload: unknown): Promise<void> {
    try {
      const presence = await getServerByName(this.env.Presence, 'lobby')
      const res = await presence.fetch('https://internal/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, payload })
      })
      if (!res.ok) console.error('pushLive: presence push failed', res.status, await res.text().catch(() => ''))
    } catch (err) {
      console.error('pushLive: presence push threw', err)
    }
  }
}
