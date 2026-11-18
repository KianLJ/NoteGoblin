// Web Push from the relay (RFC 8030), so the phone viewer can get notifications
// with the app closed: VAPID sign-in to the push service (RFC 8292) and the
// payload encrypted for the one browser it's for (RFC 8291, aes128gcm). Pure
// WebCrypto, so it runs on Workers and in tests alike.

/** A browser's push subscription, as `PushSubscription.toJSON()` gives it. */
export interface PushTarget {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** What the viewer's service worker shows (viewer/public/sw.js). */
export interface PushMessage {
  title: string
  body: string
  /** Same tag, same notification: a newer one replaces it. */
  tag?: string
  /** Where tapping it opens. */
  url?: string
}

/** The relay's VAPID keys: the public one raw (base64url), the private one as a JWK. */
export interface VapidKeys {
  publicKey: string
  privateJwk: JsonWebKey
}

const enc = new TextEncoder()
/** Text as bytes, typed the way both Workers' and the DOM's crypto types accept. */
const utf8 = (text: string): Uint8Array<ArrayBuffer> => new Uint8Array(enc.encode(text))

export function b64url(bytes: ArrayBuffer | Uint8Array<ArrayBuffer>): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (const b of u) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

const concat = (...parts: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, bytes: number): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8))
}

/** Push services this relay will send to; anything else is refused, so a subscription can't aim the relay at any URL. */
const PUSH_HOSTS = ['.googleapis.com', '.push.services.mozilla.com', '.push.apple.com', '.notify.windows.com']

/** A subscription from the wire, checked: an https endpoint at a known push service, and well-formed keys. */
export function readPushTarget(raw: unknown): PushTarget | null {
  const o = raw as Partial<PushTarget> | null
  if (!o || typeof o.endpoint !== 'string' || o.endpoint.length > 1024 || typeof o.keys?.p256dh !== 'string' || typeof o.keys?.auth !== 'string') return null
  let url: URL
  try {
    url = new URL(o.endpoint)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || !PUSH_HOSTS.some((h) => `.${url.hostname}`.endsWith(h))) return null
  try {
    if (fromB64url(o.keys.p256dh).length !== 65 || fromB64url(o.keys.auth).length !== 16) return null
  } catch {
    return null
  }
  return { endpoint: o.endpoint, keys: { p256dh: o.keys.p256dh, auth: o.keys.auth } }
}

/** The payload encrypted for one subscription (RFC 8291): a single aes128gcm record, header included. */
export async function encryptPayload(target: PushTarget, payload: Uint8Array<ArrayBuffer>, salt = crypto.getRandomValues(new Uint8Array(16))): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublic = fromB64url(target.keys.p256dh)
  const authSecret = fromB64url(target.keys.auth)
  const local = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', local.publicKey)) as ArrayBuffer)
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  // The standard field is `public`; Workers' types call it `$public`, but the runtime reads `public` (as Node does).
  const ecdh = { name: 'ECDH', public: uaKey } as unknown as Parameters<typeof crypto.subtle.deriveBits>[0]
  const shared = new Uint8Array(await crypto.subtle.deriveBits(ecdh, local.privateKey, 256))
  const ikm = await hkdf(authSecret, shared, concat(utf8('WebPush: info\0'), uaPublic, asPublic), 32)
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  // One record, so it ends with the last-record delimiter and no padding.
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))))
  const header = new Uint8Array(21)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096)
  header[20] = asPublic.length
  return concat(header, asPublic, sealed)
}

/** The VAPID header for a push service: a short-lived ES256 token signed with the relay's key. */
export async function vapidAuth(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()): Promise<string> {
  const head = b64url(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64url(utf8(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })))
  const key = await crypto.subtle.importKey('jwk', keys.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  // WebCrypto's ECDSA signature is already r||s, which is what a JWT wants.
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(`${head}.${claims}`))
  return `vapid t=${head}.${claims}.${b64url(sig)}, k=${keys.publicKey}`
}

/**
 * Sends one notification to one subscription. 'gone' means the browser dropped it (unsubscribed, or the app was
 * removed), so it should be forgotten; 'failed' is anything else, worth keeping and trying next time.
 */
export async function sendPush(target: PushTarget, message: PushMessage, keys: VapidKeys, subject: string): Promise<'sent' | 'gone' | 'failed'> {
  try {
    const body = await encryptPayload(target, utf8(JSON.stringify(message)))
    const res = await fetch(target.endpoint, {
      method: 'POST',
      headers: {
        authorization: await vapidAuth(target.endpoint, keys, subject),
        'content-encoding': 'aes128gcm',
        'content-type': 'application/octet-stream',
        ttl: String(24 * 3600),
        urgency: 'normal',
        ...(message.tag ? { topic: message.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) } : {})
      },
      body
    })
    if (res.status === 404 || res.status === 410) return 'gone'
    return res.ok ? 'sent' : 'failed'
  } catch {
    return 'failed'
  }
}

/**
 * What a phone shows for one of the relay's notifications: who and what, never a message's words (they go through
 * the browser maker's push service, encrypted, but there's no need). The relay doesn't know the phone's time zone, so
 * booked times say "tap to see when" rather than a time that might be wrong.
 */
export function notificationPush(n: { kind: string; fromUsername: string; messageKind?: string; planId?: string; planTitle?: string }): PushMessage {
  const who = n.fromUsername
  const plan = `“${n.planTitle ?? 'a session'}”`
  const url = '/viewer/'
  switch (n.kind) {
    case 'friend-request':
      return { title: 'Friend request', body: `${who} wants to be your friend.`, tag: `friend-${who}`, url }
    case 'friend-accepted':
      return { title: 'New friend', body: `${who} accepted your friend request.`, tag: `friend-${who}`, url }
    case 'session-invite':
      return { title: 'Come and play', body: `${who} invited you to their session.`, tag: `invite-${who}`, url }
    case 'message':
      return { title: who, body: n.messageKind === 'whisper' ? 'Whispered you.' : 'Sent you a message.', tag: `msg-${who}`, url }
    case 'plan-invite':
      return { title: 'Session planner', body: `${who} is planning ${plan}: when can you play?`, tag: `plan-${n.planId}`, url }
    case 'plan-times':
      return { title: 'Session planner', body: `${who} added a time to ${plan}: does it suit you?`, tag: `plan-${n.planId}`, url }
    case 'plan-booked':
      return { title: 'Session booked', body: `${plan} is pencilled in. Tap to see when.`, tag: `plan-${n.planId}`, url }
    case 'plan-cancelled':
      return { title: 'Session called off', body: `${who} called off ${plan}.`, tag: `plan-${n.planId}`, url }
    default:
      return { title: 'NoteGoblin', body: `Something new from ${who}.`, url }
  }
}
