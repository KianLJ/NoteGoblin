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
}

export function getActiveConnection(address: string): ActiveConnection | undefined {
  return activeConnections.get(address)
}

export function setActiveConnection(connection: ActiveConnection): void {
  activeConnections.set(connection.address, connection)
}
