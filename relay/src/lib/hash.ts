/**
 * Password hashing for relay accounts via Web Crypto PBKDF2-SHA256.
 *
 * hash-wasm's argon2id (matching the native `argon2` used by the Electron
 * app's local accounts) was tried first, but Cloudflare Workers hard-blocks
 * dynamic `WebAssembly.compile`/`instantiate` at runtime ("Wasm code
 * generation disallowed by embedder") — there's no config flag around this,
 * it's a platform security restriction on ahead-of-time-only Wasm. PBKDF2 via
 * Web Crypto has no such restriction. This only guards relay/friends
 * accounts, not local device data (which still uses argon2 natively).
 */

// Cloudflare Workers' production edge caps Web Crypto PBKDF2 at 100,000
// iterations (confirmed via a live deploy — `wrangler dev` doesn't enforce
// this locally, so it only surfaces once actually deployed). That's the
// max allowed here, below OWASP's 600k+ recommendation, but still an
// accepted PBKDF2-HMAC-SHA256 floor and — same as the argon2/PBKDF2 tradeoff
// noted above — only guards relay/friends accounts, not local device data.
const ITERATIONS = 100_000

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

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits'
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: toArrayBuffer(salt), iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  )
  return new Uint8Array(bits)
}

/** Self-describing format so future iteration-count changes don't break existing hashes. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const derived = await deriveBits(password, salt, ITERATIONS)
  return `pbkdf2$${ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(derived)}`
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = Number(parts[1])
  if (!Number.isFinite(iterations) || iterations <= 0) return false
  const salt = fromBase64Url(parts[2])
  const expected = fromBase64Url(parts[3])

  const derived = await deriveBits(password, salt, iterations)
  if (derived.length !== expected.length) return false
  // Constant-time compare — Web Crypto has no timingSafeEqual, so do it by hand.
  let diff = 0
  for (let i = 0; i < derived.length; i++) diff |= derived[i] ^ expected[i]
  return diff === 0
}
