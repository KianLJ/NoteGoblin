import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'

/** A per-host secret used to sign session tokens. Generated once, persisted alongside the TLS cert. */
export function getOrCreateSessionSecret(userDataDir: string): Buffer {
  const dir = join(userDataDir, 'host-tls')
  const path = join(dir, 'session-secret.bin')

  if (existsSync(path)) {
    return readFileSync(path)
  }

  mkdirSync(dir, { recursive: true })
  const secret = randomBytes(32)
  writeFileSync(path, secret, { mode: 0o600 })
  return secret
}
