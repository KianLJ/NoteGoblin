import { safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'

/**
 * Opt-in "remember me" for the local identity. The password is encrypted at
 * rest via Electron's safeStorage (OS-level — DPAPI on Windows), never
 * written as plaintext. This is strictly local-machine convenience: nothing
 * here is sent anywhere, and it only unlocks this device's own identity.
 */

interface StoredMeta {
  displayName: string
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

export function hasRememberedCredentials(userDataDir: string): boolean {
  return existsSync(metaPath(userDataDir)) && existsSync(secretPath(userDataDir))
}

export function saveRememberedCredentials(
  userDataDir: string,
  displayName: string,
  password: string
): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('This device cannot securely store a saved password.')
  }
  mkdirSync(authDir(userDataDir), { recursive: true })
  const meta: StoredMeta = { displayName }
  writeFileSync(metaPath(userDataDir), JSON.stringify(meta), { mode: 0o600 })
  writeFileSync(secretPath(userDataDir), safeStorage.encryptString(password), { mode: 0o600 })
}

export function loadRememberedCredentials(
  userDataDir: string
): { displayName: string; password: string } | null {
  if (!hasRememberedCredentials(userDataDir)) return null
  try {
    const meta = JSON.parse(readFileSync(metaPath(userDataDir), 'utf-8')) as StoredMeta
    const password = safeStorage.decryptString(readFileSync(secretPath(userDataDir)))
    return { displayName: meta.displayName, password }
  } catch {
    return null
  }
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
