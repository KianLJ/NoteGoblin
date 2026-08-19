import type { AdminAccountSummary, FriendRequest, RelayMessage, RelayNotification, WhisperThread } from '@shared/relay'
import { RELAY_URL, RELAY_DIRECTORY_PATH } from './relayConfig'

/** {userId, username} only — the directory doesn't know who's online, that's presence.ts's job. Callers merge in online status separately (see registerIpc.ts). */
export type DirectoryFriend = FriendRequest

type ClientResult<T> = { ok: true; data: T } | { ok: false; error: string }

async function call<T>(
  path: string,
  method: 'GET' | 'POST',
  token?: string,
  body?: unknown
): Promise<ClientResult<T>> {
  try {
    const res = await fetch(`${RELAY_URL}${RELAY_DIRECTORY_PATH}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    })
    const parsed = (await res.json().catch(() => null)) as (T & { error?: string }) | null
    if (!res.ok) return { ok: false, error: parsed?.error ?? `Relay request failed (${res.status}).` }
    return { ok: true, data: parsed as T }
  } catch {
    return { ok: false, error: 'Relay unavailable.' }
  }
}

export interface RelayAuthResponse {
  userId: string
  username: string
  token: string
}

export function register(username: string, password: string): Promise<ClientResult<RelayAuthResponse>> {
  return call('/register', 'POST', undefined, { username, password })
}

export function login(username: string, password: string): Promise<ClientResult<RelayAuthResponse>> {
  return call('/login', 'POST', undefined, { username, password })
}

export function changePassword(token: string, newPassword: string): Promise<ClientResult<{ ok: true }>> {
  return call('/change-password', 'POST', token, { newPassword })
}

export function getFriends(
  token: string
): Promise<ClientResult<{ friends: DirectoryFriend[]; incomingRequests: FriendRequest[] }>> {
  return call('/friends', 'GET', token)
}

/** status is 'requested' for a normal pending request, or 'accepted' if the other person had already sent you one — the server merges those instead of creating a duplicate, so the caller needs to know which happened to give accurate feedback. */
export function sendFriendRequest(
  token: string,
  username: string
): Promise<ClientResult<{ ok: true; status: 'requested' | 'accepted' }>> {
  return call('/request', 'POST', token, { username })
}

export function respondToRequest(
  token: string,
  userId: string,
  accept: boolean
): Promise<ClientResult<{ ok: true }>> {
  return call(accept ? '/accept' : '/decline', 'POST', token, { userId })
}

export function removeFriend(token: string, userId: string): Promise<ClientResult<{ ok: true }>> {
  return call('/remove', 'POST', token, { userId })
}

export function getNotifications(token: string): Promise<ClientResult<RelayNotification[]>> {
  return call('/notifications', 'GET', token)
}

export function markNotificationRead(token: string, id: string): Promise<ClientResult<{ ok: true }>> {
  return call('/notifications/read', 'POST', token, { id })
}

/** Same bearer token as every other authenticated call — the relay gates these to one specific username (ADMIN_USERNAME) server-side, see Directory.isAdmin. A non-admin token gets a normal 401. */
export function adminListAccounts(token: string): Promise<ClientResult<AdminAccountSummary[]>> {
  return call('/admin/accounts', 'GET', token)
}

export function adminRemoveAccount(token: string, userId: string): Promise<ClientResult<{ ok: true }>> {
  return call('/admin/accounts/remove', 'POST', token, { userId })
}

/** Renames an account and/or resets its password — never sends or receives the actual password value beyond `newPassword` going in one direction; the relay hashes it, this call's response never carries a password or its hash back. */
export function adminUpdateAccount(
  token: string,
  userId: string,
  input: { username?: string; newPassword?: string }
): Promise<ClientResult<{ ok: true; username: string }>> {
  return call('/admin/accounts/update', 'POST', token, { userId, ...input })
}

/** `kind: 'whisper'` requires campaignId/campaignName (see Directory.handleSendMessage) — a 'friend' message ignores both. */
export function sendMessage(
  token: string,
  input: { toUserId: string; kind: 'friend' | 'whisper'; campaignId?: string; campaignName?: string; body: string }
): Promise<ClientResult<RelayMessage>> {
  return call('/messages/send', 'POST', token, input)
}

export function listMessages(
  token: string,
  withUserId: string,
  kind: 'friend' | 'whisper'
): Promise<ClientResult<RelayMessage[]>> {
  return call(`/messages/list?withUserId=${encodeURIComponent(withUserId)}&kind=${kind}`, 'GET', token)
}

export function listWhisperThreads(token: string): Promise<ClientResult<WhisperThread[]>> {
  return call('/whisper-threads', 'GET', token)
}

/** Marks every unread 'message' notification from one sender/kind as read in one call — used when the recipient opens (or is actively viewing) that thread. */
export function markMessagesRead(
  token: string,
  fromUserId: string,
  kind: 'friend' | 'whisper'
): Promise<ClientResult<{ ok: true }>> {
  return call('/messages/mark-read', 'POST', token, { fromUserId, kind })
}
