import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import selfsigned from 'selfsigned'
import { fingerprintFromPem } from './certEncoding'

export interface HostCertificate {
  cert: string
  key: string
  /** sha256 hex digest of the DER-encoded cert — what a joining client pins on first connect. */
  fingerprint: string
}

/**
 * Loads this host's TLS certificate, generating a self-signed one on first
 * run. The same cert is reused across restarts so a client's pinned
 * fingerprint (trust-on-first-connect) keeps matching.
 */
export function getOrCreateHostCertificate(userDataDir: string): HostCertificate {
  const dir = join(userDataDir, 'host-tls')
  const certPath = join(dir, 'cert.pem')
  const keyPath = join(dir, 'key.pem')

  if (existsSync(certPath) && existsSync(keyPath)) {
    const cert = readFileSync(certPath, 'utf-8')
    const key = readFileSync(keyPath, 'utf-8')
    return { cert, key, fingerprint: fingerprintFromPem(cert) }
  }

  mkdirSync(dir, { recursive: true })
  const pems = selfsigned.generate([{ name: 'commonName', value: 'notegoblin-host' }], {
    days: 3650,
    keySize: 2048,
    algorithm: 'sha256'
  })
  writeFileSync(certPath, pems.cert, { mode: 0o600 })
  writeFileSync(keyPath, pems.private, { mode: 0o600 })
  return { cert: pems.cert, key: pems.private, fingerprint: fingerprintFromPem(pems.cert) }
}
