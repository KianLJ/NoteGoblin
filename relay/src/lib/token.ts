/**
 * Signed-token scheme for relay session auth — same `body.signature` shape as
 * src/server/auth/token.ts on the Electron side, ported to Web Crypto because
 * Cloudflare Workers has no Node `crypto` module (no native/nodejs_compat dependency).
 */
export interface SessionPayload {
  userId: string
  issuedAt: number
}

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000 // 30 days — a friend group's session, not a bank's

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (const byte of arr) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify'
  ])
}

export async function signToken(secret: string, userId: string): Promise<string> {
  const payload: SessionPayload = { userId, issuedAt: Date.now() }
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  const key = await importHmacKey(secret)
  const signatureBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return `${body}.${toBase64Url(signatureBytes)}`
}

export async function verifyToken(secret: string, token: string): Promise<SessionPayload | null> {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, signature] = parts

  const key = await importHmacKey(secret)
  const valid = await crypto.subtle.verify('HMAC', key, fromBase64Url(signature), new TextEncoder().encode(body))
  if (!valid) return null

  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SessionPayload
    if (Date.now() - payload.issuedAt > SESSION_LIFETIME_MS) return null
    return payload
  } catch {
    return null
  }
}
