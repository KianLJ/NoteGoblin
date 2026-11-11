import type { Env } from './env'
import { verifyToken } from './lib/token'

/**
 * A DM's own music and sound effects, kept for their account in R2 so every device they sign in on has them
 * (the app's main/audioSync.ts). Handled here in the Worker, not a Durable Object, so audio streams straight
 * to and from the bucket. Each account has its own folder:
 *
 *   GET  /audio/library          the account's library list (which songs, in which moods, their names)
 *   PUT  /audio/library          replaces it
 *   GET  /audio/file/<id>        one song or sound
 *   PUT  /audio/file/<id>        stores one
 *   DELETE /audio/file/<id>      removes one
 */

const MAX_FILE_BYTES = 60 * 1024 * 1024
const MAX_ACCOUNT_BYTES = 2 * 1024 * 1024 * 1024
const MAX_LIBRARY_BYTES = 1024 * 1024
const ID = /^[A-Za-z0-9-]{1,64}$/

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
}

function secret(env: Env): string {
  return typeof env.RELAY_SECRET === 'string' && env.RELAY_SECRET.length > 0 ? env.RELAY_SECRET : 'dev-insecure-secret-do-not-deploy-with-this'
}

/** Everything this account has stored, in bytes. */
async function usage(bucket: R2Bucket, userId: string): Promise<number> {
  let total = 0
  let cursor: string | undefined
  do {
    const page = await bucket.list({ prefix: `${userId}/`, cursor })
    for (const o of page.objects) total += o.size
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  return total
}

/**
 * Where a built-in file is kept in the bucket: its path as base64url — no characters that any tool would
 * escape (the names have spaces, ampersands and apostrophes). scripts/upload-library.mjs names them the same way.
 */
export function libraryKey(path: string): string {
  const bytes = new TextEncoder().encode(path)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return `library/${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
}

/**
 * The app's built-in music, ambience and Sound Board audio (no longer in the installer — see the app's
 * scripts/audio-manifest.mjs): public, read-only, at /library/<folder>/<file>.mp3. Cached at the edge, so a
 * file most of the table plays is read from the bucket once, not once per player. Range requests stream.
 */
export async function handleLibrary(req: Request, env: Env, ctx: ExecutionContext): Promise<Response | null> {
  const url = new URL(req.url)
  if (!url.pathname.startsWith('/library/')) return null
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 })
  if (!env.AUDIO) return new Response('Not set up', { status: 503 })
  const path = decodeURIComponent(url.pathname.slice('/library/'.length))
  const parts = path.split('/')
  if (!/^(music|ambient|soundboard)\//.test(path) || !path.toLowerCase().endsWith('.mp3') || parts.some((p) => !p || p === '.' || p === '..')) return new Response('Not found', { status: 404 })

  const range = req.headers.get('range')
  const cache = caches.default
  const cacheKey = new Request(url.toString(), { method: 'GET' })
  if (!range) {
    const hit = await cache.match(cacheKey)
    if (hit) return hit
  }
  const obj = await env.AUDIO.get(libraryKey(path), range ? { range: req.headers } : undefined)
  if (!obj) return new Response('Not found', { status: 404 })
  const headers = new Headers({ 'content-type': 'audio/mpeg', 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=31536000, immutable', etag: obj.httpEtag })
  if (range && obj.range && 'offset' in obj.range) {
    const offset = obj.range.offset ?? 0
    const length = obj.range.length ?? obj.size - offset
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${obj.size}`)
    headers.set('content-length', String(length))
    return new Response(obj.body, { status: 206, headers })
  }
  headers.set('content-length', String(obj.size))
  const res = new Response(req.method === 'HEAD' ? null : obj.body, { headers })
  if (req.method === 'GET') ctx.waitUntil(cache.put(cacheKey, res.clone()))
  return res
}

/** Null when it isn't an /audio/ request, so the caller routes it on as before. */
export async function handleAudio(req: Request, env: Env): Promise<Response | null> {
  const url = new URL(req.url)
  if (!url.pathname.startsWith('/audio/')) return null
  if (!env.AUDIO) return json({ error: 'Music syncing isn’t set up on this relay yet.' }, 503)

  const auth = req.headers.get('authorization')
  const payload = auth?.startsWith('Bearer ') ? await verifyToken(secret(env), auth.slice('Bearer '.length)) : null
  if (!payload) return json({ error: 'Unauthorized' }, 401)
  const bucket = env.AUDIO
  const userId = payload.userId
  const [, , what, id] = url.pathname.split('/')

  if (what === 'library') {
    const key = `${userId}/library.json`
    if (req.method === 'GET') {
      const obj = await bucket.get(key)
      return obj ? new Response(obj.body, { headers: { 'content-type': 'application/json' } }) : json({ error: 'No library yet' }, 404)
    }
    if (req.method === 'PUT') {
      const body = await req.text()
      if (body.length > MAX_LIBRARY_BYTES) return json({ error: 'That library list is too big.' }, 413)
      try {
        JSON.parse(body)
      } catch {
        return json({ error: 'That isn’t a library list.' }, 400)
      }
      await bucket.put(key, body, { httpMetadata: { contentType: 'application/json' } })
      return json({ ok: true })
    }
    return json({ error: 'Not found' }, 404)
  }

  if (what === 'file' && id && ID.test(id)) {
    const key = `${userId}/files/${id}`
    if (req.method === 'GET') {
      const obj = await bucket.get(key)
      if (!obj) return json({ error: 'Not found' }, 404)
      return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream' } })
    }
    if (req.method === 'PUT') {
      const size = Number(req.headers.get('content-length') ?? NaN)
      if (!Number.isFinite(size) || size <= 0) return json({ error: 'The file’s size is needed.' }, 411)
      if (size > MAX_FILE_BYTES) return json({ error: 'That file is too big to sync (60 MB at most).' }, 413)
      if ((await usage(bucket, userId)) + size > MAX_ACCOUNT_BYTES) return json({ error: 'Your synced music is full (2 GB).' }, 413)
      const contentType = req.headers.get('content-type') ?? 'application/octet-stream'
      if (!contentType.startsWith('audio/') && contentType !== 'application/octet-stream') return json({ error: 'Only audio can be synced.' }, 415)
      await bucket.put(key, req.body, { httpMetadata: { contentType } })
      return json({ ok: true })
    }
    if (req.method === 'DELETE') {
      await bucket.delete(key)
      return json({ ok: true })
    }
  }
  return json({ error: 'Not found' }, 404)
}
