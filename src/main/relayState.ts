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

const sessionStartedListeners = new Set<(session: RelaySession) => void>()

/** Fires each time a relay session is established (login, register, password change, or a relay-recognized login on a new device) — for work that has to wait for a token, like flushing uploads queued while offline. */
export function onRelaySessionStarted(listener: (session: RelaySession) => void): () => void {
  sessionStartedListeners.add(listener)
  return () => sessionStartedListeners.delete(listener)
}

export function setRelaySession(session: RelaySession | null): void {
  currentSession = session
  onlineFriends.clear()
  if (session) for (const listener of sessionStartedListeners) listener(session)
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
