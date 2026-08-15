import tls from 'tls'
import { fingerprintFromDer, pemFromDer } from './certEncoding'

export interface ProbedCertificate {
  fingerprint: string
  certPem: string
}

/** Opens a raw TLS connection to inspect whatever cert the host presents — deliberately unverified, since this IS the discovery step trust-on-first-connect relies on. */
export function probeHostCertificate(
  host: string,
  port: number,
  timeoutMs = 5000
): Promise<ProbedCertificate> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, rejectUnauthorized: false, timeout: timeoutMs }, () => {
      const cert = socket.getPeerCertificate(true)
      socket.end()
      if (!cert || !cert.raw) {
        reject(new Error('That host did not present a certificate.'))
        return
      }
      resolve({ fingerprint: fingerprintFromDer(cert.raw), certPem: pemFromDer(cert.raw) })
    })
    socket.on('timeout', () => {
      socket.destroy()
      reject(new Error('Timed out reaching that address.'))
    })
    socket.on('error', reject)
  })
}
