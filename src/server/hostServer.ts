import express from 'express'
import { createServer as createHttpsServer, type Server as HttpsServer } from 'https'
import { WebSocketServer, type WebSocket } from 'ws'
import type { Database as DatabaseType } from 'better-sqlite3'
import { UserRepo } from './repositories/userRepo'
import * as campaignService from './services/campaignService'
import { signToken, verifyToken } from './auth/token'
import { requireAuth, type AuthedRequest } from './auth/requireAuth'
import type { ServiceResult } from './services/campaignService'
import type { Response } from 'express'

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

function send<T>(res: Response, result: ServiceResult<T>, dataKey: string): void {
  if (result.ok) {
    res.json({ [dataKey]: result.data })
  } else {
    res.status(result.status).json({ error: result.error })
  }
}

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

  const auth = requireAuth(opts.sessionSecret)

  // --- Campaigns & notes ----------------------------------------------------
  // Thin HTTP wrappers — all the actual logic (visibility, membership,
  // author-only edits) lives in campaignService, shared with the DM's direct
  // in-process path used when hosting isn't running (see registerIpc.ts).
  app.get('/campaigns', auth, (req: AuthedRequest, res) => {
    send(res, campaignService.listCampaigns(opts.db, req.userId as string), 'campaigns')
  })

  app.post('/campaigns', auth, (req: AuthedRequest, res) => {
    send(res, campaignService.createCampaign(opts.db, req.userId as string, req.body?.name), 'campaign')
  })

  app.post('/campaigns/:id/join', auth, (req: AuthedRequest, res) => {
    send(res, campaignService.joinCampaign(opts.db, req.params.id, req.userId as string), 'campaign')
  })

  app.get('/campaigns/:id/notes', auth, (req: AuthedRequest, res) => {
    send(res, campaignService.listNotes(opts.db, req.params.id, req.userId as string), 'notes')
  })

  app.post('/campaigns/:id/notes', auth, (req: AuthedRequest, res) => {
    send(
      res,
      campaignService.createNote(opts.db, req.params.id, req.userId as string, req.body ?? {}),
      'note'
    )
  })

  app.patch('/campaigns/:id/notes/:noteId', auth, (req: AuthedRequest, res) => {
    send(
      res,
      campaignService.updateNote(
        opts.db,
        req.params.id,
        req.params.noteId,
        req.userId as string,
        req.body ?? {}
      ),
      'note'
    )
  })

  app.delete('/campaigns/:id/notes/:noteId', auth, (req: AuthedRequest, res) => {
    const result = campaignService.deleteNote(opts.db, req.params.id, req.params.noteId, req.userId as string)
    if (result.ok) {
      res.json({ ok: true })
    } else {
      res.status(result.status).json({ error: result.error })
    }
  })

  app.get('/campaigns/:id/folders', auth, (req: AuthedRequest, res) => {
    send(res, campaignService.listFolders(opts.db, req.params.id, req.userId as string), 'folders')
  })

  app.post('/campaigns/:id/folders', auth, (req: AuthedRequest, res) => {
    send(
      res,
      campaignService.createFolder(opts.db, req.params.id, req.userId as string, req.body ?? {}),
      'folder'
    )
  })

  app.patch('/campaigns/:id/folders/:folderId', auth, (req: AuthedRequest, res) => {
    send(
      res,
      campaignService.updateFolder(
        opts.db,
        req.params.id,
        req.params.folderId,
        req.userId as string,
        req.body ?? {}
      ),
      'folder'
    )
  })

  app.delete('/campaigns/:id/folders/:folderId', auth, (req: AuthedRequest, res) => {
    const result = campaignService.deleteFolder(
      opts.db,
      req.params.id,
      req.params.folderId,
      req.userId as string
    )
    if (result.ok) {
      res.json({ ok: true })
    } else {
      res.status(result.status).json({ error: result.error })
    }
  })

  const httpsServer: HttpsServer = createHttpsServer({ cert: opts.cert, key: opts.key }, app)
  const wss = new WebSocketServer({ server: httpsServer, path: '/ws' })

  // --- Presence -------------------------------------------------------------
  // Every open socket, tagged with whichever campaign it's currently
  // "subscribed" to (a client subscribes after opening a campaign) and
  // whichever character it last announced. Broadcast to everyone subscribed
  // to that campaign whenever any of that changes — this is the foundation
  // future live features (initiative tracker, chat) build on too.
  interface PresenceEntry {
    socket: WebSocket
    userId: string
    displayName: string
    campaignId: string | null
    characterName: string | null
  }
  const connections = new Set<PresenceEntry>()

  function broadcastPresence(campaignId: string): void {
    const players = [...connections]
      .filter((c) => c.campaignId === campaignId)
      .map((c) => ({ userId: c.userId, displayName: c.displayName, characterName: c.characterName }))
    const payload = JSON.stringify({ type: 'presence', campaignId, players })
    for (const c of connections) {
      if (c.campaignId === campaignId && c.socket.readyState === c.socket.OPEN) {
        c.socket.send(payload)
      }
    }
  }

  wss.on('connection', (socket: WebSocket, request) => {
    const url = new URL(request.url ?? '', 'https://notegoblin.local')
    const token = url.searchParams.get('token') ?? ''
    const payload = verifyToken(opts.sessionSecret, token)
    if (!payload) {
      socket.close(4001, 'Unauthorized')
      return
    }

    const account = userRepo.findById(payload.userId)
    const entry: PresenceEntry = {
      socket,
      userId: payload.userId,
      displayName: account?.display_name ?? 'Unknown',
      campaignId: null,
      characterName: null
    }
    connections.add(entry)

    socket.on('message', (raw) => {
      let message: unknown
      try {
        message = JSON.parse(raw.toString())
      } catch {
        return
      }
      if (typeof message !== 'object' || message === null) return
      const msg = message as { type?: unknown; campaignId?: unknown; characterName?: unknown }

      if (msg.type === 'subscribe' && typeof msg.campaignId === 'string') {
        const previousCampaignId = entry.campaignId
        entry.campaignId = msg.campaignId
        if (previousCampaignId) broadcastPresence(previousCampaignId)
        broadcastPresence(entry.campaignId)
      } else if (msg.type === 'select-character') {
        entry.characterName = typeof msg.characterName === 'string' ? msg.characterName : null
        if (entry.campaignId) broadcastPresence(entry.campaignId)
      }
    })

    socket.on('close', () => {
      connections.delete(entry)
      if (entry.campaignId) broadcastPresence(entry.campaignId)
    })

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
            // wss.close() alone only stops accepting new upgrades — it does
            // NOT close already-open client sockets, and httpsServer.close()
            // waits for every connection (including those) to end before its
            // callback fires. Without terminating them explicitly, stopping
            // the server while any player is still connected hangs forever.
            for (const client of wss.clients) {
              client.terminate()
            }
            wss.close(() => {
              httpsServer.close(() => res())
            })
          })
      })
    })
  })
}
