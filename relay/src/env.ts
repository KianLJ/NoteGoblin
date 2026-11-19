import type { Directory } from './directory'
import type { Presence } from './presence'
import type { Session } from './session'

export interface Env {
  Directory: DurableObjectNamespace<Directory>
  Presence: DurableObjectNamespace<Presence>
  Session: DurableObjectNamespace<Session>
  /** Set via `wrangler secret put RELAY_SECRET` in production; falls back to an insecure dev-only value under `wrangler dev`. */
  RELAY_SECRET?: string
  /** The R2 bucket for each account's own music and sounds (audio.ts) — unset until `notegoblin-audio` is created and bound in wrangler.jsonc. */
  AUDIO?: R2Bucket
  /** Set via `wrangler secret put ADMIN_USERNAME` — the one relay username allowed to call the /admin/* account-management endpoints, unset under `wrangler dev`. */
  ADMIN_USERNAME?: string
  /** Web Push (lib/webPush.ts): the relay's VAPID public key, raw P-256 in base64url. Set with `wrangler secret put VAPID_PUBLIC_KEY`; push is off without it. */
  VAPID_PUBLIC_KEY?: string
  /** The matching private key as a JWK (JSON). Set with `wrangler secret put VAPID_PRIVATE_JWK`. */
  VAPID_PRIVATE_JWK?: string
  /** The built web app (wrangler.jsonc's assets, at /app/). */
  ASSETS: Fetcher
}
