// Web Push from the relay (RFC 8030), so the phone viewer can get notifications
// with the app closed: VAPID sign-in to the push service (RFC 8292) and the
// payload encrypted for the one browser it's for (RFC 8291, aes128gcm). Pure
// WebCrypto, so it runs on Workers and in tests alike.

/** The header rooms send to each other's internal endpoints, carrying RELAY_SECRET: they're reachable from outside too, so it's what tells a room's call apart from anyone's. */
export const INTERNAL_HEADER = 'x-relay-internal'

/** A browser's push subscription, as `PushSubscription.toJSON()` gives it. */
export interface PushTarget {
  endpoint: string
  keys: { p256dh: string; auth: string }
  /** The phone's time zone ('Europe/London'), so times in what it shows are its own. */
  tz?: string
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
export function readPushTarget(raw: unknown, tz?: unknown): PushTarget | null {
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
  const zone = readTimeZone(tz)
  return { endpoint: o.endpoint, keys: { p256dh: o.keys.p256dh, auth: o.keys.auth }, ...(zone ? { tz: zone } : {}) }
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
  const host = new URL(target.endpoint).hostname
  try {
    const body = await encryptPayload(target, utf8(JSON.stringify(message)))
    const res = await fetch(target.endpoint, {
      method: 'POST',
      headers: {
        authorization: await vapidAuth(target.endpoint, keys, subject),
        'content-encoding': 'aes128gcm',
        'content-type': 'application/octet-stream',
        ttl: String(24 * 3600),
        // High: every push shows a notification, and Android holds back anything less while the phone sleeps.
        // No Topic header: Apple refuses ours (400 BadWebPushTopic), and the notification's own tag already replaces
        // an older one on the phone.
        urgency: 'high'
      },
      body
    })
    if (res.ok) return 'sent'
    // What the push service said, for `wrangler tail`: its host, status and reason (Apple's is a short JSON), never the payload.
    console.warn('push refused', host, res.status, (await res.text().catch(() => '')).slice(0, 200))
    return res.status === 404 || res.status === 410 ? 'gone' : 'failed'
  } catch (err) {
    console.warn('push failed', host, err instanceof Error ? err.message : String(err))
    return 'failed'
  }
}

const clip = (text: string | undefined, max = 160): string | undefined => {
  const t = text?.replace(/\s+/g, ' ').trim()
  return t ? (t.length > max ? `${t.slice(0, max - 1)}…` : t) : undefined
}

/** A time as the phone's own clock shows it ("Fri 20 Nov, 19:00"), or in UTC, saying so, if the phone never said its zone. */
export function timeIn(iso: string, tz?: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const shown = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: tz ?? 'UTC' }).format(d)
  return tz ? shown : `${shown} UTC`
}

/** A time zone from the wire, if the platform knows it. */
export function readTimeZone(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw || raw.length > 64) return undefined
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: raw })
    return raw
  } catch {
    return undefined
  }
}

/**
 * What a phone shows for one of the relay's notifications: who, what, and a summary (a message's opening words, the
 * time a session's asked or booked for, in the phone's own time zone). The payload is encrypted for that phone alone,
 * so the push service in between can't read it.
 */
export function notificationPush(
  n: { kind: string; fromUsername: string; messageKind?: string; planId?: string; planTitle?: string; at?: string; preview?: string },
  tz?: string
): PushMessage {
  const who = n.fromUsername
  const plan = `“${n.planTitle ?? 'a session'}”`
  const when = n.at ? timeIn(n.at, tz) : ''
  const url = '/viewer/'
  switch (n.kind) {
    case 'friend-request':
      return { title: 'Friend request', body: `${who} wants to be your friend.`, tag: `friend-${who}`, url }
    case 'friend-accepted':
      return { title: 'New friend', body: `${who} accepted your friend request.`, tag: `friend-${who}`, url }
    case 'session-invite':
      return { title: 'Come and play', body: `${who} invited you to their session.`, tag: `invite-${who}`, url }
    case 'message':
      return { title: n.messageKind === 'whisper' ? `${who} (whisper)` : who, body: clip(n.preview) ?? (n.messageKind === 'whisper' ? 'Whispered you.' : 'Sent you a message.'), tag: `msg-${who}`, url }
    case 'plan-invite':
      return { title: `Session planner: ${n.planTitle ?? 'a session'}`, body: `${who} wants to know when you can play.${when ? ` First time: ${when}.` : ''}`, tag: `plan-${n.planId}`, url }
    case 'plan-times':
      return { title: `Session planner: ${n.planTitle ?? 'a session'}`, body: `${who} suggested ${when || 'a new time'}. Does it suit you?`, tag: `plan-${n.planId}`, url }
    case 'plan-booked':
      return { title: 'Session booked', body: `${plan} is pencilled in${when ? ` for ${when}` : ''}.`, tag: `plan-${n.planId}`, url }
    case 'plan-cancelled':
      return { title: 'Session called off', body: `${who} called off ${plan}${when ? ` (${when})` : ''}.`, tag: `plan-${n.planId}`, url }
    default:
      return { title: 'NoteGoblin', body: `Something new from ${who}.`, url }
  }
}

/** What happens at a campaign's table that's worth a push: its chat, and the DM's quests, rewards and handouts. */
export type TableKind = 'party' | 'whisper' | 'quest' | 'quest-done' | 'quest-failed' | 'reward' | 'handout'
export const TABLE_KINDS: TableKind[] = ['party', 'whisper', 'quest', 'quest-done', 'quest-failed', 'reward', 'handout']

/**
 * A table event, as the DM's app describes it (session.ts checks who it reaches): the campaign as the title, and who
 * did what with a summary, such as the chat line, the quest and who gave it, or the reward.
 */
export function tablePush(m: { kind: TableKind; fromUsername: string; campaignId?: string; campaignName?: string; title?: string; text?: string }): PushMessage {
  const where = m.campaignName || 'Your campaign'
  const url = '/viewer/'
  const title = clip(m.title, 80)
  const text = clip(m.text)
  switch (m.kind) {
    case 'party':
      return { title: where, body: text ? `${m.fromUsername}: ${text}` : `${m.fromUsername} said something in party chat.`, tag: `party-${m.campaignId ?? where}`, url }
    case 'whisper':
      return { title: `${m.fromUsername} (whisper)`, body: text ?? `Whispered you in ${where}.`, tag: `whisper-${m.fromUsername}`, url }
    case 'quest':
      return { title: `${where}: new quest`, body: [title, text].filter(Boolean).join(' · ') || 'A new quest.', tag: `quest-${m.campaignId}-${title}`, url }
    case 'quest-done':
      return { title: `${where}: quest done`, body: title ? `${title} is done.` : 'A quest is done.', tag: `quest-${m.campaignId}-${title}`, url }
    case 'quest-failed':
      return { title: `${where}: quest failed`, body: title ? `${title} failed.` : 'A quest failed.', tag: `quest-${m.campaignId}-${title}`, url }
    case 'reward':
      return { title: `${where}: reward`, body: [title, text].filter(Boolean).join(': ') || 'You got a reward.', url }
    case 'handout':
      return { title: `${where}: handout`, body: `${m.fromUsername} showed you ${title ? `“${title}”` : 'a handout'}.`, url }
  }
}
