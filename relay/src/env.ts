import type { Directory } from './directory'
import type { Presence } from './presence'
import type { Session } from './session'

export interface Env {
  Directory: DurableObjectNamespace<Directory>
  Presence: DurableObjectNamespace<Presence>
  Session: DurableObjectNamespace<Session>
  /** Set via `wrangler secret put RELAY_SECRET` in production; falls back to an insecure dev-only value under `wrangler dev`. */
  RELAY_SECRET?: string
  /** Set via `wrangler secret put ADMIN_USERNAME` — the one relay username allowed to call the /admin/* account-management endpoints, unset under `wrangler dev`. */
  ADMIN_USERNAME?: string
}
