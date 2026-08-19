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

type NotificationKind = 'friend-request' | 'friend-accepted' | 'session-invite' | 'message'

interface Notification {
  id: string
  kind: NotificationKind
  fromUserId: string
  fromUsername: string
  sessionId?: string
  /** Only for kind === 'message' — which conversation kind this is, so the client can route "open this thread" correctly, and so a burst of messages from the same sender/kind collapses into one bumped notification (see pushNotification's dedup) instead of spamming the list. */
  messageKind?: MessageKind
  createdAt: string
  read: boolean
}

const MAX_NOTIFICATIONS_PER_USER = 50

/**
 * 'friend' — either side of any relay friendship, anytime, campaign-
 * independent. 'whisper' — the DM<->one-player thread for a specific
 * campaign; campaignId/campaignName are always set (tagging which campaign
 * it came from, since a whisper history can span every campaign two
 * accounts have ever shared) and there's no friendship requirement, since a
 * DM and player don't need to be relay friends to whisper.
 */
type MessageKind = 'friend' | 'whisper'

interface StoredMessage {
  id: string
  kind: MessageKind
  senderUserId: string
  senderUsername: string
  recipientUserId: string
  campaignId?: string
  campaignName?: string
  body: string
  createdAt: string
}

// Chronological (oldest first), unlike Notification's most-recent-first —
// conversation history reads naturally top-to-bottom. Capped per pair the
// same "silently drop the oldest" way notifications are, just with far more
// headroom since this is meant to hold real history, not a transient feed.
const MAX_MESSAGES_PER_PAIR = 1000
const MAX_MESSAGE_BODY_LENGTH = 4000

/** Same conversation regardless of who's "a" or "b" — sorting the two ids gives every message between this pair one shared storage key. */
function pairKey(a: string, b: string): string {
  return [a, b].sort().join(':')
}

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

  /** Admin access rides on the caller's own normal signed session token (same as every other authenticated endpoint) — just gated to one specific relay username, set via `wrangler secret put ADMIN_USERNAME`. Never leave ADMIN_USERNAME unset in production or this always fails closed. */
  private async isAdmin(req: Request): Promise<boolean> {
    const adminUsername = this.env.ADMIN_USERNAME
    if (!adminUsername) return false
    const account = await this.authenticate(req)
    return account?.username === normalizeUsername(adminUsername)
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

    // Admin routes first and specifically — 'remove' and 'accounts' as bare
    // last-segment checks below are broad enough to otherwise swallow
    // /admin/accounts/remove and /admin/accounts too.
    if (req.method === 'GET' && action === 'accounts' && segments[segments.length - 2] === 'admin') {
      return this.handleAdminListAccounts(req)
    }
    if (
      req.method === 'POST' &&
      action === 'remove' &&
      segments[segments.length - 2] === 'accounts' &&
      segments[segments.length - 3] === 'admin'
    ) {
      return this.handleAdminRemoveAccount(req)
    }
    if (
      req.method === 'POST' &&
      action === 'update' &&
      segments[segments.length - 2] === 'accounts' &&
      segments[segments.length - 3] === 'admin'
    ) {
      return this.handleAdminUpdateAccount(req)
    }

    if (req.method === 'POST' && action === 'register') return this.handleRegister(req)
    if (req.method === 'POST' && action === 'login') return this.handleLogin(req)
    if (req.method === 'GET' && action === 'me') return this.handleMe(req)
    if (req.method === 'POST' && action === 'change-password') return this.handleChangePassword(req)
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
    if (req.method === 'POST' && action === 'send' && segments[segments.length - 2] === 'messages') {
      return this.handleSendMessage(req)
    }
    if (req.method === 'GET' && action === 'list' && segments[segments.length - 2] === 'messages') {
      return this.handleListMessages(req)
    }
    if (req.method === 'GET' && action === 'whisper-threads') return this.handleListWhisperThreads(req)
    if (req.method === 'POST' && action === 'mark-read' && segments[segments.length - 2] === 'messages') {
      return this.handleMarkMessagesRead(req)
    }

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

  /** Keeps the relay account's password in step with the local device identity's — without this, changing your local password silently strands the relay account on the old one (next sync tries login-with-new-password, fails, then register-with-new-password, fails too since the username's already taken — a dead end with no way back in short of an admin clearing the account). */
  private async handleChangePassword(req: Request): Promise<Response> {
    const account = await this.authenticate(req)
    if (!account) return json({ error: 'Unauthorized' }, 401)
    const body = (await req.json().catch(() => null)) as { newPassword?: string } | null
    if (!body?.newPassword || body.newPassword.length < 8) {
      return badRequest('newPassword must be at least 8 characters')
    }
    const passwordHash = await hashPassword(body.newPassword)
    await this.ctx.storage.put(`user:${account.id}`, { ...account, passwordHash })
    return json({ ok: true })
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

  /** Every account on the relay, for the admin screen — no passwordHash, just enough to identify and act on a row (username, friend count, pending request counts). */
  private async handleAdminListAccounts(req: Request): Promise<Response> {
    if (!(await this.isAdmin(req))) return json({ error: 'Unauthorized' }, 401)

    const accounts = await this.ctx.storage.list<StoredAccount>({ prefix: 'user:' })
    const rows = await Promise.all(
      [...accounts.values()].map(async (account) => {
        const friends = (await this.ctx.storage.get<string[]>(`friends:${account.id}`)) ?? []
        const requests = (await this.ctx.storage.get<FriendRequests>(`friendReq:${account.id}`)) ?? {
          incoming: [],
          outgoing: []
        }
        return {
          userId: account.id,
          username: account.username,
          friendCount: friends.length,
          incomingRequestCount: requests.incoming.length,
          outgoingRequestCount: requests.outgoing.length
        }
      })
    )
    rows.sort((a, b) => a.username.localeCompare(b.username))
    return json(rows)
  }

  /** Deletes an account entirely and cleans up every reference to it — the other side of each friendship, both directions of any pending request, and its own notifications/friend graph. Irreversible; there's no confirmation step here, the client is expected to have already gotten one from the admin. */
  private async handleAdminRemoveAccount(req: Request): Promise<Response> {
    if (!(await this.isAdmin(req))) return json({ error: 'Unauthorized' }, 401)
    const body = (await req.json().catch(() => null)) as { userId?: string } | null
    if (!body?.userId) return badRequest('userId is required')

    const account = await this.ctx.storage.get<StoredAccount>(`user:${body.userId}`)
    if (!account) return badRequest('No such account')

    const friends = (await this.ctx.storage.get<string[]>(`friends:${account.id}`)) ?? []
    for (const friendId of friends) {
      const theirFriends = (await this.ctx.storage.get<string[]>(`friends:${friendId}`)) ?? []
      await this.ctx.storage.put(
        `friends:${friendId}`,
        theirFriends.filter((id) => id !== account.id)
      )
    }

    const requests = (await this.ctx.storage.get<FriendRequests>(`friendReq:${account.id}`)) ?? {
      incoming: [],
      outgoing: []
    }
    for (const otherId of [...requests.incoming, ...requests.outgoing]) {
      const theirRequests = (await this.ctx.storage.get<FriendRequests>(`friendReq:${otherId}`)) ?? {
        incoming: [],
        outgoing: []
      }
      await this.ctx.storage.put(`friendReq:${otherId}`, {
        incoming: theirRequests.incoming.filter((id) => id !== account.id),
        outgoing: theirRequests.outgoing.filter((id) => id !== account.id)
      })
    }

    await this.ctx.storage.delete([
      `user:${account.id}`,
      `username:${account.username}`,
      `friends:${account.id}`,
      `friendReq:${account.id}`,
      `notifications:${account.id}`,
      `whisperPeers:${account.id}`
    ])

    return json({ ok: true })
  }

  /** Renames an account and/or resets its password on the admin's say-so — never reads or returns the password itself, only ever hashes a new one going in. Renaming updates the `username:*` reverse-lookup key (used by login/register to find an account by name) so the account stays reachable under its new name; the old key is freed for reuse. */
  private async handleAdminUpdateAccount(req: Request): Promise<Response> {
    if (!(await this.isAdmin(req))) return json({ error: 'Unauthorized' }, 401)
    const body = (await req.json().catch(() => null)) as
      | { userId?: string; username?: string; newPassword?: string }
      | null
    if (!body?.userId) return badRequest('userId is required')

    const account = await this.ctx.storage.get<StoredAccount>(`user:${body.userId}`)
    if (!account) return badRequest('No such account')

    let username = account.username
    if (typeof body.username === 'string' && body.username.trim().length > 0) {
      const nextUsername = normalizeUsername(body.username)
      if (nextUsername.length < 3) return badRequest('username must be at least 3 characters')
      if (nextUsername !== account.username) {
        const existingId = await this.ctx.storage.get<string>(`username:${nextUsername}`)
        if (existingId && existingId !== account.id) return badRequest('username is already taken')
      }
      username = nextUsername
    }

    let passwordHash = account.passwordHash
    if (typeof body.newPassword === 'string' && body.newPassword.length > 0) {
      if (body.newPassword.length < 8) return badRequest('password must be at least 8 characters')
      passwordHash = await hashPassword(body.newPassword)
    }

    const updated: StoredAccount = { ...account, username, passwordHash }
    await this.ctx.storage.put(`user:${account.id}`, updated)
    if (username !== account.username) {
      await this.ctx.storage.delete(`username:${account.username}`)
      await this.ctx.storage.put(`username:${username}`, account.id)
    }

    return json({ ok: true, username })
  }

  /** Friend DMs require an actual friendship; a whisper only requires naming a campaign (campaignId/campaignName), since a DM and player don't need to be relay friends to whisper — campaign membership itself is verified locally by the DM's own campaignService, not here. */
  private async handleSendMessage(req: Request): Promise<Response> {
    const account = await this.authenticate(req)
    if (!account) return json({ error: 'Unauthorized' }, 401)

    const body = (await req.json().catch(() => null)) as
      | { toUserId?: string; kind?: string; campaignId?: string; campaignName?: string; body?: string }
      | null
    if (!body?.toUserId || !body.body?.trim()) return badRequest('toUserId and body are required')
    if (body.kind !== 'friend' && body.kind !== 'whisper') return badRequest('invalid kind')
    if (body.body.length > MAX_MESSAGE_BODY_LENGTH) return badRequest('That message is too long.')
    if (body.toUserId === account.id) return badRequest("You can't message yourself")
    if (body.kind === 'whisper' && (!body.campaignId || !body.campaignName)) {
      return badRequest('campaignId and campaignName are required for a whisper')
    }

    const target = await this.ctx.storage.get<StoredAccount>(`user:${body.toUserId}`)
    if (!target) return badRequest('No such account')

    if (body.kind === 'friend') {
      const myFriends = (await this.ctx.storage.get<string[]>(`friends:${account.id}`)) ?? []
      if (!myFriends.includes(body.toUserId)) return badRequest('You can only message a friend this way')
    }

    const message: StoredMessage = {
      id: crypto.randomUUID(),
      kind: body.kind,
      senderUserId: account.id,
      senderUsername: account.username,
      recipientUserId: body.toUserId,
      campaignId: body.campaignId,
      campaignName: body.campaignName,
      body: body.body.trim(),
      createdAt: new Date().toISOString()
    }

    const key = `messages:${pairKey(account.id, body.toUserId)}`
    const existing = (await this.ctx.storage.get<StoredMessage[]>(key)) ?? []
    await this.ctx.storage.put(key, [...existing, message].slice(-MAX_MESSAGES_PER_PAIR))

    if (body.kind === 'whisper') {
      await this.addWhisperPeer(account.id, body.toUserId)
      await this.addWhisperPeer(body.toUserId, account.id)
    }

    await this.pushLive(body.toUserId, { type: 'message', message })
    await this.pushNotification(body.toUserId, 'message', account.id, undefined, body.kind)

    return json(message)
  }

  /** Marks every unread 'message' notification from one sender/kind as read in one call — used when the recipient opens (or is actively viewing) that thread, rather than requiring the client to fetch the list and mark each id individually. */
  private async handleMarkMessagesRead(req: Request): Promise<Response> {
    const account = await this.authenticate(req)
    if (!account) return json({ error: 'Unauthorized' }, 401)
    const body = (await req.json().catch(() => null)) as { fromUserId?: string; kind?: string } | null
    if (!body?.fromUserId || (body.kind !== 'friend' && body.kind !== 'whisper')) {
      return badRequest('fromUserId and a valid kind are required')
    }

    const notifications = (await this.ctx.storage.get<Notification[]>(`notifications:${account.id}`)) ?? []
    const next = notifications.map((n) =>
      n.kind === 'message' && n.fromUserId === body.fromUserId && n.messageKind === body.kind ? { ...n, read: true } : n
    )
    await this.ctx.storage.put(`notifications:${account.id}`, next)
    return json({ ok: true })
  }

  private async addWhisperPeer(userId: string, peerId: string): Promise<void> {
    const key = `whisperPeers:${userId}`
    const existing = (await this.ctx.storage.get<string[]>(key)) ?? []
    if (!existing.includes(peerId)) await this.ctx.storage.put(key, [...existing, peerId])
  }

  private async handleListMessages(req: Request): Promise<Response> {
    const account = await this.authenticate(req)
    if (!account) return json({ error: 'Unauthorized' }, 401)

    const url = new URL(req.url)
    const withUserId = url.searchParams.get('withUserId')
    const kind = url.searchParams.get('kind')
    if (!withUserId || (kind !== 'friend' && kind !== 'whisper')) {
      return badRequest('withUserId and a valid kind are required')
    }

    const all = (await this.ctx.storage.get<StoredMessage[]>(`messages:${pairKey(account.id, withUserId)}`)) ?? []
    return json(all.filter((m) => m.kind === kind))
  }

  /**
   * One row per account you've ever whispered with (any campaign), tagged
   * with whichever campaign the *most recent* whisper in that thread came
   * from — a thread can legitimately span several campaigns over time, but
   * the summary list only needs "what to show right now," not the full
   * history (handleListMessages covers that once a thread's opened).
   */
  private async handleListWhisperThreads(req: Request): Promise<Response> {
    const account = await this.authenticate(req)
    if (!account) return json({ error: 'Unauthorized' }, 401)

    const peerIds = (await this.ctx.storage.get<string[]>(`whisperPeers:${account.id}`)) ?? []
    const threads = await Promise.all(
      peerIds.map(async (peerId) => {
        const peer = await this.ctx.storage.get<StoredAccount>(`user:${peerId}`)
        if (!peer) return null
        const all = (await this.ctx.storage.get<StoredMessage[]>(`messages:${pairKey(account.id, peerId)}`)) ?? []
        const whispers = all.filter((m) => m.kind === 'whisper')
        const last = whispers[whispers.length - 1]
        if (!last) return null
        return {
          userId: peer.id,
          username: peer.username,
          lastMessageBody: last.body,
          lastCampaignId: last.campaignId ?? null,
          lastCampaignName: last.campaignName ?? null,
          lastAt: last.createdAt
        }
      })
    )
    const valid = threads.filter((t): t is NonNullable<typeof t> => t !== null)
    valid.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
    return json(valid)
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
    sessionId?: string,
    messageKind?: MessageKind
  ): Promise<void> {
    const fromAccount = await this.ctx.storage.get<StoredAccount>(`user:${fromUserId}`)
    const notification: Notification = {
      id: crypto.randomUUID(),
      kind,
      fromUserId,
      fromUsername: fromAccount?.username ?? 'Unknown',
      sessionId,
      messageKind,
      createdAt: new Date().toISOString(),
      read: false
    }

    let existing = (await this.ctx.storage.get<Notification[]>(`notifications:${userId}`)) ?? []
    // A burst of messages from the same person/thread bumps one notification
    // to the top instead of piling up a fresh entry per message — otherwise
    // an active conversation would flood the list (and the 50-item cap)
    // almost immediately.
    if (kind === 'message') {
      existing = existing.filter((n) => !(n.kind === 'message' && n.fromUserId === fromUserId && n.messageKind === messageKind))
    }
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
