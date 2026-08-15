import { safeStorage } from 'electron'
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'

/**
 * Opt-in "remember me" — supports multiple remembered local identities (so
 * you can create a handful of throwaway test accounts and switch between
 * them without retyping a password each time), not just one. Each
 * password is encrypted at rest via Electron's safeStorage (OS-level —
 * DPAPI on Windows), never written as plaintext. Strictly local-machine
 * convenience: nothing here is sent anywhere, and it only unlocks this
 * device's own identities.
 */

export interface RememberedEntry {
  id: string
  displayName: string
}

interface StoredMeta {
  entries: RememberedEntry[]
  /** Which remembered identity to auto-login as on next launch — whichever was switched to (or remembered) most recently. */
  lastActiveId: string | null
}

function authDir(userDataDir: string): string {
  return join(userDataDir, 'auth')
}
function metaPath(userDataDir: string): string {
  return join(authDir(userDataDir), 'remembered.json')
}
function secretPath(userDataDir: string): string {
  return join(authDir(userDataDir), 'remembered.bin')
}

function readMeta(userDataDir: string): StoredMeta {
  try {
    const raw = JSON.parse(readFileSync(metaPath(userDataDir), 'utf-8')) as StoredMeta
    return { entries: raw.entries ?? [], lastActiveId: raw.lastActiveId ?? null }
  } catch {
    return { entries: [], lastActiveId: null }
  }
}

function writeMeta(userDataDir: string, meta: StoredMeta): void {
  mkdirSync(authDir(userDataDir), { recursive: true })
  writeFileSync(metaPath(userDataDir), JSON.stringify(meta), { mode: 0o600 })
}

function readSecrets(userDataDir: string): Record<string, string> {
  try {
    const decrypted = safeStorage.decryptString(readFileSync(secretPath(userDataDir)))
    return JSON.parse(decrypted) as Record<string, string>
  } catch {
    return {}
  }
}

function writeSecrets(userDataDir: string, secrets: Record<string, string>): void {
  mkdirSync(authDir(userDataDir), { recursive: true })
  writeFileSync(secretPath(userDataDir), safeStorage.encryptString(JSON.stringify(secrets)), { mode: 0o600 })
}

export function listRememberedIdentities(userDataDir: string): RememberedEntry[] {
  return readMeta(userDataDir).entries
}

export function isRemembered(userDataDir: string, id: string): boolean {
  return readMeta(userDataDir).entries.some((e) => e.id === id)
}

export function hasRememberedCredentials(userDataDir: string): boolean {
  return readMeta(userDataDir).entries.length > 0
}

export function rememberIdentity(userDataDir: string, id: string, displayName: string, password: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('This device cannot securely store a saved password.')
  }
  const meta = readMeta(userDataDir)
  const entries = meta.entries.filter((e) => e.id !== id)
  entries.push({ id, displayName })
  writeMeta(userDataDir, { entries, lastActiveId: id })

  const secrets = readSecrets(userDataDir)
  secrets[id] = password
  writeSecrets(userDataDir, secrets)
}

/** Marks an already-remembered identity as the one to auto-login as next launch — called on every switch, not just on first remembering. */
export function touchLastActive(userDataDir: string, id: string): void {
  const meta = readMeta(userDataDir)
  if (!meta.entries.some((e) => e.id === id)) return
  writeMeta(userDataDir, { ...meta, lastActiveId: id })
}

export function forgetIdentity(userDataDir: string, id: string): void {
  const meta = readMeta(userDataDir)
  const entries = meta.entries.filter((e) => e.id !== id)
  const lastActiveId = meta.lastActiveId === id ? (entries[0]?.id ?? null) : meta.lastActiveId
  writeMeta(userDataDir, { entries, lastActiveId })

  const secrets = readSecrets(userDataDir)
  delete secrets[id]
  writeSecrets(userDataDir, secrets)
}

export function loadRememberedPassword(userDataDir: string, id: string): string | null {
  if (!isRemembered(userDataDir, id)) return null
  try {
    return readSecrets(userDataDir)[id] ?? null
  } catch {
    return null
  }
}

/** For auto-login on app boot — the last-active remembered identity, or the first remembered one if that's unset. */
export function loadLastActiveCredentials(
  userDataDir: string
): { id: string; displayName: string; password: string } | null {
  const meta = readMeta(userDataDir)
  const target = meta.entries.find((e) => e.id === meta.lastActiveId) ?? meta.entries[0]
  if (!target) return null
  const password = loadRememberedPassword(userDataDir, target.id)
  if (password === null) return null
  return { id: target.id, displayName: target.displayName, password }
}

export function clearRememberedCredentials(userDataDir: string): void {
  try {
    unlinkSync(metaPath(userDataDir))
  } catch {
    /* not present — fine */
  }
  try {
    unlinkSync(secretPath(userDataDir))
  } catch {
    /* not present — fine */
  }
}
