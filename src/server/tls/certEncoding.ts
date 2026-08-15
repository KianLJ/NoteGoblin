import { createHash } from 'crypto'

export function pemFromDer(der: Buffer): string {
  const base64 = der.toString('base64')
  const lines = base64.match(/.{1,64}/g) ?? []
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`
}

export function derFromPem(pem: string): Buffer {
  return Buffer.from(
    pem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s+/g, ''),
    'base64'
  )
}

export function fingerprintFromPem(pem: string): string {
  return createHash('sha256').update(derFromPem(pem)).digest('hex')
}

export function fingerprintFromDer(der: Buffer): string {
  return createHash('sha256').update(der).digest('hex')
}
