import express from 'express'
import { createServer as createHttpsServer, type Server as HttpsServer } from 'https'
import { WebSocketServer, type WebSocket } from 'ws'
import type { Database as DatabaseType } from 'better-sqlite3'
import { UserRepo } from './repositories/userRepo'
import { signToken, verifyToken } from './auth/token'
import { requireAuth, type AuthedRequest } from './auth/requireAuth'

/**
 * A DM's saved address (and every player's "known host" entry pointing at
 * it) has to stay valid across app/hosting restarts, so real hosting always
 * binds here rather than to an OS-assigned ephemeral port. Tests still pass
 * `port: 0` explicitly to avoid colliding with a real running instance.
 */
export const DEFAULT_HOST_PORT = 47331

export interface HostServerOptions {
  db: DatabaseType
  cert: string
  key: string
  fingerprint: string
  sessionSecret: Buffer
  port?: number
}

export interface HostServerHandle {
  port: number
  fingerprint: string
  close: () => Promise<void>
}

const MIN_PASSWORD_LENGTH = 8

export function startHostServer(opts: HostServerOptions): Promise<HostServerHandle> {
  const app = express()
  app.use(express.json())

  const userRepo = new UserRepo(opts.db)

  app.get('/health', (_req, res) => {
    res.json({ ok: true, name: 'NoteGoblin host' })
  })

  app.post('/auth/register', async (req, res) => {
    const { displayName, password } = req.body ?? {}
    if (
      typeof displayName !== 'string' ||
      displayName.trim().length < 2 ||
      typeof password !== 'string' ||
      password.length < MIN_PASSWORD_LENGTH
    ) {
      res.status(400).json({ error: 'Invalid display name or password.' })
      return
    }
    try {
      const user = await userRepo.create(displayName.trim(), password)
      res.json({ user, token: signToken(opts.sessionSecret, user.id) })
    } catch (err) {
      res.status(409).json({ error: err instanceof Error ? err.message : 'Could not register.' })
    }
  })

  app.post('/auth/login', async (req, res) => {
    const { displayName, password } = req.body ?? {}
    if (typeof displayName !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Invalid display name or password.' })
      return
    }
    const user = await userRepo.verify(displayName.trim(), password)
    if (!user) {
      res.status(401).json({ error: 'Incorrect display name or password.' })
      return
    }
    res.json({ user, token: signToken(opts.sessionSecret, user.id) })
  })

  app.get('/auth/me', requireAuth(opts.sessionSecret), (req: AuthedRequest, res) => {
    const account = userRepo.findById(req.userId as string)
    if (!account) {
      res.status(404).json({ error: 'Unknown user.' })
      return
    }
    res.json({ user: { id: account.id, displayName: account.display_name } })
  })

  const httpsServer: HttpsServer = createHttpsServer({ cert: opts.cert, key: opts.key }, app)
  const wss = new WebSocketServer({ server: httpsServer, path: '/ws' })

  wss.on('connection', (socket: WebSocket, request) => {
    const url = new URL(request.url ?? '', 'https://notegoblin.local')
    const token = url.searchParams.get('token') ?? ''
    const payload = verifyToken(opts.sessionSecret, token)
    if (!payload) {
      socket.close(4001, 'Unauthorized')
      return
    }
    // Presence, initiative broadcast, and chat channel wiring land with the
    // campaigns/initiative/chat build steps — this just proves the
    // authenticated upgrade path works end to end.
    socket.send(JSON.stringify({ type: 'connected', userId: payload.userId }))
  })

  return new Promise((resolve, reject) => {
    httpsServer.once('error', reject)
    httpsServer.listen(opts.port ?? DEFAULT_HOST_PORT, () => {
      const address = httpsServer.address()
      const port =
        typeof address === 'object' && address ? address.port : (opts.port ?? DEFAULT_HOST_PORT)
      resolve({
        port,
        fingerprint: opts.fingerprint,
        close: () =>
          new Promise((res) => {
            wss.close(() => {
              httpsServer.close(() => res())
            })
          })
      })
    })
  })
}
