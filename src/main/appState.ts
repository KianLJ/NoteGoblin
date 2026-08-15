import type { HostServerHandle } from '@server/hostServer'

/**
 * In-memory, per-run state for the main process. Nothing here is persisted —
 * it exists only while the app is open, rebuilt from disk (local db, host
 * db, TLS cert) on next launch.
 */

export interface CurrentIdentity {
  id: string
  displayName: string
  passwordHash: string
  /** Kept only in memory for this run, to transparently authenticate against hosts the player joins. Never written to disk. */
  password: string
}

export interface ActiveConnection {
  address: string
  token: string
  userId: string
  certPem: string
}

let currentIdentity: CurrentIdentity | null = null
let hostServerHandle: HostServerHandle | null = null
/** Which local identity actually started hosting — hosting itself is process-wide (any identity can view it once switched to), but only the identity that started it should see "Stop Hosting" or be described as the host, since it isn't really *their* table otherwise. */
let hostOwnerIdentityId: string | null = null
const activeConnections = new Map<string, ActiveConnection>()

export function getCurrentIdentity(): CurrentIdentity | null {
  return currentIdentity
}

export function setCurrentIdentity(identity: CurrentIdentity | null): void {
  currentIdentity = identity
}

export function getHostServerHandle(): HostServerHandle | null {
  return hostServerHandle
}

export function setHostServerHandle(handle: HostServerHandle | null): void {
  hostServerHandle = handle
  if (!handle) hostOwnerIdentityId = null
}

export function getHostOwnerIdentityId(): string | null {
  return hostOwnerIdentityId
}

export function setHostOwnerIdentityId(id: string | null): void {
  hostOwnerIdentityId = id
}

export function getActiveConnection(address: string): ActiveConnection | undefined {
  return activeConnections.get(address)
}

export function setActiveConnection(connection: ActiveConnection): void {
  activeConnections.set(connection.address, connection)
}

/** Called on identity switch — active connections hold another identity's auth token/userId, and must never leak into whichever identity is now current. Hosting itself (hostServerHandle) is left running; it serves whoever connects to it regardless of which identity is currently being browsed as in this window. */
export function clearActiveConnections(): void {
  activeConnections.clear()
}
