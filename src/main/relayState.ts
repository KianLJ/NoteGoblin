import type { RelayStatus } from '@shared/relay'

/**
 * In-memory relay connection state, mirrors appState.ts's pattern. Nothing
 * here is persisted — the relay session is re-established from the current
 * local identity's credentials on every launch (see relaySync.ts).
 */

export interface RelaySession {
  userId: string
  username: string
  token: string
}

let currentSession: RelaySession | null = null
let status: RelayStatus = 'unavailable'
/** Online friends and, if they're currently hosting, which session id. */
const onlineFriends = new Map<string, string | null>()

export function getRelaySession(): RelaySession | null {
  return currentSession
}

export function setRelaySession(session: RelaySession | null): void {
  currentSession = session
  onlineFriends.clear()
}

export function getRelayStatus(): RelayStatus {
  return status
}

export function setRelayStatus(next: RelayStatus): void {
  status = next
}

export function isFriendOnline(userId: string): boolean {
  return onlineFriends.has(userId)
}

export function getFriendHostingSessionId(userId: string): string | undefined {
  return onlineFriends.get(userId) ?? undefined
}

export function markFriendOnline(userId: string, hostingSessionId: string | null = null): void {
  onlineFriends.set(userId, hostingSessionId)
}

export function markFriendOffline(userId: string): void {
  onlineFriends.delete(userId)
}

export function setFriendHosting(userId: string, sessionId: string | null): void {
  if (onlineFriends.has(userId)) onlineFriends.set(userId, sessionId)
}

export function setOnlineFriends(friends: { userId: string; hostingSessionId: string | null }[]): void {
  onlineFriends.clear()
  for (const f of friends) onlineFriends.set(f.userId, f.hostingSessionId)
}
