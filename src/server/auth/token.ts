import { createHmac, timingSafeEqual } from 'crypto'

export interface SessionPayload {
  userId: string
  issuedAt: number
}

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000 // 30 days — a friend group's session, not a bank's

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

/** Minimal signed-token scheme (HMAC-SHA256 over a JSON payload) — avoids pulling in a JWT dependency for this small a need. */
export function signToken(secret: Buffer, userId: string): string {
  const payload: SessionPayload = { userId, issuedAt: Date.now() }
  const body = base64url(JSON.stringify(payload))
  const signature = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${signature}`
}

export function verifyToken(secret: Buffer, token: string): SessionPayload | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, signature] = parts

  const expected = createHmac('sha256', secret).update(body).digest('base64url')
  const sigBuf = Buffer.from(signature)
  const expectedBuf = Buffer.from(expected)
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as SessionPayload
    if (Date.now() - payload.issuedAt > SESSION_LIFETIME_MS) return null
    return payload
  } catch {
    return null
  }
}
