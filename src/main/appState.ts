/**
 * In-memory, per-run state for the main process. Nothing here is persisted —
 * it exists only while the app is open, rebuilt from disk (local db, host
 * db) on next launch.
 */

export interface CurrentIdentity {
  id: string
  displayName: string
  passwordHash: string
  /** Kept only in memory for this run, to transparently authenticate against the relay (see relaySync.ts). Never written to disk. */
  password: string
}

/** The session this window is currently hosting, if any — sessionHost.ts owns the actual relay connection; this just tracks ownership. */
export interface HostedSession {
  sessionId: string
  ownerIdentityId: string
}

/** The session this window has joined as a player, if any — sessionClient.ts owns the actual relay connection; this just tracks which one. */
export interface JoinedSession {
  sessionId: string
}

let currentIdentity: CurrentIdentity | null = null
let hostedSession: HostedSession | null = null
let joinedSession: JoinedSession | null = null

export function getCurrentIdentity(): CurrentIdentity | null {
  return currentIdentity
}

export function setCurrentIdentity(identity: CurrentIdentity | null): void {
  currentIdentity = identity
}

export function getHostedSession(): HostedSession | null {
  return hostedSession
}

export function setHostedSession(session: HostedSession | null): void {
  hostedSession = session
}

export function getJoinedSession(): JoinedSession | null {
  return joinedSession
}

export function setJoinedSession(session: JoinedSession | null): void {
  joinedSession = session
}

/** Called on identity switch — a joined session was authenticated as the previous identity's relay account, and must never be treated as still-joined under whichever identity is now current. Hosting itself (sessionHost) is left running; it serves whoever the relay routes to it regardless of which identity is currently being browsed as in this window. */
export function clearJoinedSession(): void {
  joinedSession = null
}
