import { describe, expect, it } from 'vitest'
import { b64url, encryptPayload, fromB64url, notificationPush, readPushTarget, readTimeZone, tablePush, timeIn, vapidAuth } from '../relay/src/lib/webPush'

const enc = new TextEncoder()

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: string | Uint8Array<ArrayBuffer>, bytes: number): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: typeof info === 'string' ? enc.encode(info) : info }, key, bytes * 8))
}

/** A browser's side: its keys, as a subscription carries them, and decrypting what arrives (RFC 8291). */
async function browser() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const uaPublic = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer)
  const auth = crypto.getRandomValues(new Uint8Array(16))
  const target = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: b64url(uaPublic), auth: b64url(auth) } }
  async function decrypt(body: Uint8Array<ArrayBuffer>): Promise<string> {
    const salt = body.slice(0, 16)
    const idlen = body[20]
    const asPublic = body.slice(21, 21 + idlen)
    const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
    const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, pair.privateKey, 256))
    const info = new Uint8Array([...enc.encode('WebPush: info\0'), ...uaPublic, ...asPublic])
    const ikm = await hkdf(auth, shared, info, 32)
    const cek = await hkdf(salt, ikm, 'Content-Encoding: aes128gcm\0', 16)
    const nonce = await hkdf(salt, ikm, 'Content-Encoding: nonce\0', 12)
    const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, body.slice(21 + idlen)))
    // The last record ends with a 2.
    expect(plain[plain.length - 1]).toBe(2)
    return new TextDecoder().decode(plain.slice(0, -1))
  }
  return { target, decrypt }
}

describe('web push from the relay', () => {
  it('encrypts a payload only the subscribed browser can read', async () => {
    const { target, decrypt } = await browser()
    const body = await encryptPayload(target, enc.encode('{"title":"Hi"}'))
    expect(new DataView(body.buffer).getUint32(16)).toBe(4096)
    expect(await decrypt(body)).toBe('{"title":"Hi"}')
  })

  it('signs a VAPID token the push service can check', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
    const keys = { publicKey: b64url((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer), privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey) }
    const header = await vapidAuth('https://fcm.googleapis.com/fcm/send/abc', keys, 'https://relay.notegoblin.uk', Date.parse('2026-11-18T12:00:00Z'))
    const [, token, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!
    expect(k).toBe(keys.publicKey)
    const [h, c, sig] = token.split('.')
    expect(JSON.parse(new TextDecoder().decode(fromB64url(c)))).toEqual({ aud: 'https://fcm.googleapis.com', exp: Date.parse('2026-11-18T12:00:00Z') / 1000 + 12 * 3600, sub: 'https://relay.notegoblin.uk' })
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, fromB64url(sig), enc.encode(`${h}.${c}`))).toBe(true)
  })

  it('only takes subscriptions at real push services', () => {
    const keys = { p256dh: b64url(new Uint8Array(65)), auth: b64url(new Uint8Array(16)) }
    expect(readPushTarget({ endpoint: 'https://web.push.apple.com/abc', keys })).not.toBeNull()
    expect(readPushTarget({ endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/x', keys })).not.toBeNull()
    expect(readPushTarget({ endpoint: 'https://evil.example/hook', keys })).toBeNull()
    expect(readPushTarget({ endpoint: 'https://fcm.googleapis.com.evil.example/x', keys })).toBeNull()
    expect(readPushTarget({ endpoint: 'http://fcm.googleapis.com/x', keys })).toBeNull()
    expect(readPushTarget({ endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'short', auth: keys.auth } })).toBeNull()
  })

  it('sums each one up: the message, the time in the phone’s own zone, the quest', () => {
    expect(notificationPush({ kind: 'message', fromUsername: 'Sam', preview: '  see you   at 7?  ' })).toMatchObject({ title: 'Sam', body: 'see you at 7?' })
    expect(notificationPush({ kind: 'message', fromUsername: 'Sam', messageKind: 'whisper', preview: 'x'.repeat(300) }).body).toHaveLength(160)
    expect(notificationPush({ kind: 'message', fromUsername: 'Sam' })).toMatchObject({ body: 'Sent you a message.' })
    // 19:00 UTC on Friday 20 November is 19:00 in London and 14:00 in New York.
    const at = '2026-11-20T19:00:00Z'
    expect(notificationPush({ kind: 'plan-times', fromUsername: 'Sam', planId: 'p1', planTitle: 'Session 13', at }, 'Europe/London')).toMatchObject({ body: 'Sam suggested Fri 20 Nov, 19:00. Does it suit you?', tag: 'plan-p1' })
    expect(timeIn(at, 'America/New_York')).toBe('Fri 20 Nov, 14:00')
    expect(timeIn(at)).toBe('Fri 20 Nov, 19:00 UTC')
    expect(notificationPush({ kind: 'plan-booked', fromUsername: 'Sam', planTitle: 'Session 13', at }, 'Europe/London').body).toBe('“Session 13” is pencilled in for Fri 20 Nov, 19:00.')
    expect(readTimeZone('Europe/London')).toBe('Europe/London')
    expect(readTimeZone('Mars/Olympus')).toBeUndefined()
    expect(tablePush({ kind: 'party', fromUsername: 'Sam', campaignId: 'c1', campaignName: 'Ashes', text: 'Roll for it' })).toMatchObject({ title: 'Ashes', body: 'Sam: Roll for it', tag: 'party-c1' })
    expect(tablePush({ kind: 'quest', fromUsername: 'Kian', campaignName: 'Ashes', title: 'The Drowned Bell', text: 'from the Harbourmaster: Find it' })).toMatchObject({ title: 'Ashes: new quest', body: 'The Drowned Bell · from the Harbourmaster: Find it' })
    expect(tablePush({ kind: 'reward', fromUsername: 'Kian', campaignName: 'Ashes', title: 'The Drowned Bell', text: '25 gp, 100 XP each' }).body).toBe('The Drowned Bell: 25 gp, 100 XP each')
  })
})
