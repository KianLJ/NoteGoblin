import type { FriendRequest, RelayNotification } from '@shared/relay'
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
