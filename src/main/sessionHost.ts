import { app, type BrowserWindow } from 'electron'
import WebSocket from 'ws'
import { v4 as uuid } from 'uuid'
import { getHostDb } from '@server/db/hostDb'
import { UserRepo } from '@server/repositories/userRepo'
import * as campaignService from '@server/services/campaignService'
import type { ServiceResult } from '@server/services/campaignService'
import { RELAY_URL, relaySessionPath } from '@server/relay/relayConfig'
import type {
  RequestFrame,
  ResponseFrame,
  PresenceFrame,
  CampaignChangedFrame,
  ActiveCampaignChangedFrame,
  InitiativeFrame,
  DiceRollFrame,
  MessageFrame,
  ForceRollFrame,
  SceneChangedFrame,
  MusicChangedFrame,
  MusicTrackChunkFrame,
  MusicVolumeChangedFrame,
  AmbientLevelChangedFrame,
  SfxPlayedFrame
} from '@server/relay/sessionProtocol'
import { announceHostingStatus } from './relaySocket'
import type { CharacterSheet, ForceRollRequest, Message } from '@shared/ipc'
import { sanitizeForPlayer, type InitiativeState } from '@shared/encounter'
import type { DiceRollLogEntry } from '@shared/dice'
import type { LiveSceneState } from '@shared/sessionDeck'

/**
 * DM side of a hosted session — like-for-like replacement of hostServer.ts's
 * Express+WS transport, but tunneled through the relay's session room
 * instead of a local HTTPS server. campaignService itself is untouched:
 * every inbound player request just gets dispatched to the same functions
 * registerIpc.ts already calls for the DM's own local (non-networked) work.
 */

interface PlayerConn {
  userId: string
  username: string
  campaignId: string | null
  characterName: string | null
  /** Kept live via 'characters.sync' — whichever character this player currently has selected, pushed straight to dmWindow (never broadcast to other players; this is a DM-only view). */
  character: CharacterSheet | null
}

let socket: WebSocket | null = null
let currentSessionId: string | null = null
const players = new Map<string, PlayerConn>()
let dmWindow: BrowserWindow | null = null
let dmSubscribedCampaignId: string | null = null
/** Purely runtime, never persisted — if the DM closes the app mid-presentation, the presentation just stops; the deck's actual content is still safely in session_decks. */
let liveScene: { campaignId: string; deckId: string; sceneIndex: number } | null = null

function wsUrl(sessionId: string): string {
  return RELAY_URL.replace(/^http/, 'ws') + relaySessionPath(sessionId)
}

export function getHostedSessionId(): string | null {
  return currentSessionId
}

export function startSessionHost(
  relayToken: string,
  relayUsername: string,
  window: BrowserWindow
): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  if (socket && socket.readyState === WebSocket.OPEN && currentSessionId) {
    return Promise.resolve({ ok: true, sessionId: currentSessionId })
  }

  const sessionId = uuid()
  dmWindow = window

  return new Promise((resolve) => {
    const ws = new WebSocket(
      `${wsUrl(sessionId)}?token=${encodeURIComponent(relayToken)}&role=dm&username=${encodeURIComponent(relayUsername)}`
    )
    let settled = false

    // As in sessionClient.ts: the WS handshake completing doesn't mean the
    // relay accepted us — wait for its explicit {type:'session-ready'} ack
    // (sent only after the ownership check passes) before declaring success.
    ws.on('open', () => {
      socket = ws
      currentSessionId = sessionId
    })
    ws.on('message', (raw) => {
      if (!settled) {
        let message: unknown
        try {
          message = JSON.parse(raw.toString())
        } catch {
          return
        }
        if (typeof message === 'object' && message !== null && (message as { type?: unknown }).type === 'session-ready') {
          settled = true
          announceHostingStatus(sessionId)
          resolve({ ok: true, sessionId })
        }
        return
      }
      handleFrame(raw)
    })
    ws.on('close', () => {
      if (socket === ws) {
        socket = null
        currentSessionId = null
        players.clear()
        dmSubscribedCampaignId = null
        liveScene = null
        announceHostingStatus(null)
      }
      if (!settled) {
        settled = true
        resolve({ ok: false, error: 'Could not reach the relay to start hosting.' })
      }
    })
    ws.on('error', () => {
      if (!settled) {
        settled = true
        resolve({ ok: false, error: 'Could not reach the relay to start hosting.' })
      }
    })
  })
}

export function stopSessionHost(): void {
  if (socket) {
    try {
      socket.close()
    } catch {
      /* already closing/closed */
    }
  }
  socket = null
  currentSessionId = null
  players.clear()
  dmSubscribedCampaignId = null
  liveScene = null
  announceHostingStatus(null)
}

export async function inviteToSession(
  relayToken: string,
  friendUserId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!currentSessionId) return { ok: false, error: 'Not hosting.' }
  try {
    const res = await fetch(`${RELAY_URL}${relaySessionPath(currentSessionId)}/invite`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${relayToken}` },
      body: JSON.stringify({ userId: friendUserId })
    })
    if (!res.ok) return { ok: false, error: 'Could not invite that friend.' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Relay unavailable.' }
  }
}

/** The renderer's own view of "who's connected to campaign X" for the DM's own table — no network round-trip needed, since sessionHost already tracks this in-process. */
export function subscribeDmPresence(campaignId: string | null, window: BrowserWindow): void {
  dmWindow = window
  dmSubscribedCampaignId = campaignId
  if (campaignId) {
    broadcastPresence(campaignId)
    // Catch up on any character already synced before this window/tab existed
    // (e.g. the DM reopened the right panel) — pushes are otherwise only sent
    // at the moment a player selects/edits, so a late subscriber would
    // otherwise see nothing until the player's next change.
    for (const p of players.values()) {
      if (p.campaignId === campaignId && p.character) {
        window.webContents.send('ws:player-character', { userId: p.userId, character: p.character })
      }
    }
  }
}

function sendToRelay(to: string | 'all', payload: unknown): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ to, payload }))
  }
}

function broadcastPresence(campaignId: string): void {
  const inCampaign = [...players.values()].filter((p) => p.campaignId === campaignId)
  const playerList = inCampaign.map((p) => ({
    userId: p.userId,
    displayName: p.username,
    characterName: p.characterName
  }))
  const frame: PresenceFrame = { type: 'presence', campaignId, players: playerList }
  for (const p of inCampaign) sendToRelay(p.userId, frame)
  if (dmSubscribedCampaignId === campaignId && dmWindow) {
    dmWindow.webContents.send('ws:presence', { sessionId: currentSessionId, campaignId, players: playerList })
  }
}

/** Called after any notes/folders mutation — whether it came in from a player's request or from the DM's own local IPC call while hosting — so every other open window on this campaign knows to refetch. */
export function broadcastCampaignChanged(campaignId: string): void {
  const frame: CampaignChangedFrame = { type: 'campaign-changed', campaignId }
  for (const p of players.values()) {
    if (p.campaignId === campaignId) sendToRelay(p.userId, frame)
  }
  if (dmWindow) {
    dmWindow.webContents.send('ws:campaign-changed', { sessionId: currentSessionId, campaignId })
  }
}

/** Called after the DM switches their active campaign, so every connected player picks it up live instead of relying on the manual "Sync" button. */
export function broadcastActiveCampaignChanged(): void {
  const frame: ActiveCampaignChangedFrame = { type: 'active-campaign-changed' }
  for (const p of players.values()) sendToRelay(p.userId, frame)
}

/**
 * Pushes the DM's initiative tracker state to every connected player —
 * sanitized per-recipient (see shared/encounter.ts's sanitizeForPlayer), so
 * each player's copy is computed fresh rather than one shared payload; a
 * monster's real name/exact HP/AC/position never leaves this process.
 */
export function broadcastInitiative(state: InitiativeState): void {
  for (const p of players.values()) {
    const frame: InitiativeFrame = { type: 'initiative', state: sanitizeForPlayer(state, p.userId) }
    sendToRelay(p.userId, frame)
  }
}

/**
 * Fans a dice roll out to every connected player — `roll` is already
 * redacted at the source if it was a private roll (see
 * shared/dice.ts's redactRollForBroadcast), so this never needs
 * per-recipient sanitizing the way broadcastInitiative does. `excludeUserId`
 * skips the roller themselves when relaying a player's own roll back out
 * (see the 'dice.roll' dispatch case below) — they already have their own
 * true copy locally and don't need it echoed back.
 */
export function broadcastDiceRoll(roll: DiceRollLogEntry, excludeUserId?: string): void {
  const frame: DiceRollFrame = { type: 'dice-roll', roll }
  for (const p of players.values()) {
    if (p.userId !== excludeUserId) sendToRelay(p.userId, frame)
  }
}

/** Pushes the DM's Goblin Bard pick to every connected player, table-wide (not scoped to a campaign — music is a "whole session" thing, unlike scene decks). `trackId: null` means "stop." */
export function broadcastMusic(trackId: string | null, fadeMs: number): void {
  const frame: MusicChangedFrame = { type: 'music-changed', trackId, fadeMs }
  for (const p of players.values()) sendToRelay(p.userId, frame)
}

// Kept safely under the relay's Durable-Object WebSocket 1 MiB message cap
// even after the JSON envelope's own overhead — see MusicTrackChunkFrame's
// doc comment.
const MUSIC_CHUNK_BASE64_CHARS = 500_000

/** Sends a DM-local custom track's actual audio to every connected player, split into MusicTrackChunkFrame pieces — call this immediately before broadcastMusic() for that same trackId (see MusicTrackChunkFrame's doc comment on why order matters here). */
export function broadcastMusicTrackData(trackId: string, title: string, mimeType: string, dataBase64: string): void {
  const total = Math.max(1, Math.ceil(dataBase64.length / MUSIC_CHUNK_BASE64_CHARS))
  for (let index = 0; index < total; index++) {
    const chunkBase64 = dataBase64.slice(index * MUSIC_CHUNK_BASE64_CHARS, (index + 1) * MUSIC_CHUNK_BASE64_CHARS)
    const frame: MusicTrackChunkFrame = { type: 'music-track-chunk', trackId, title, mimeType, index, total, chunkBase64 }
    for (const p of players.values()) sendToRelay(p.userId, frame)
  }
}

/** Pushes a Goblin Bard volume change to every connected player, table-wide — same "whole session" scope as broadcastMusic. */
export function broadcastMusicVolume(volume: number): void {
  const frame: MusicVolumeChangedFrame = { type: 'music-volume-changed', volume }
  for (const p of players.values()) sendToRelay(p.userId, frame)
}

/** Pushes one Ambient layer's level change to every connected player, table-wide — same "whole session" scope as broadcastMusic. */
export function broadcastAmbientLevel(groupId: string, layerId: string, level: number, fadeMs: number): void {
  const frame: AmbientLevelChangedFrame = { type: 'ambient-level-changed', groupId, layerId, level, fadeMs }
  for (const p of players.values()) sendToRelay(p.userId, frame)
}

/** Pushes a Sound Board one-shot cue to every connected player, table-wide — fire-and-forget, no state to track since a one-shot has nothing to "resume" for a late joiner the way music/ambient do. `excludeUserId` skips the player who triggered it via the 'sfxBoard.play' request below (see its doc comment) — they already played it locally and don't need it echoed back. */
export function broadcastSfxPlayed(sfxId: string, excludeUserId?: string): void {
  const frame: SfxPlayedFrame = { type: 'sfx-played', sfxId }
  for (const p of players.values()) {
    if (p.userId !== excludeUserId) sendToRelay(p.userId, frame)
  }
}

function broadcastSceneChangedFor(campaignId: string, deckId: string | null, sceneIndex: number): void {
  const frame: SceneChangedFrame = { type: 'scene-changed', campaignId, deckId, sceneIndex }
  for (const p of players.values()) {
    if (p.campaignId === campaignId) sendToRelay(p.userId, frame)
  }
  if (dmSubscribedCampaignId === campaignId && dmWindow) {
    dmWindow.webContents.send('ws:scene-changed', { sessionId: currentSessionId, campaignId, deckId, sceneIndex })
  }
}

/** DM-only, called locally (never over the relay — presenting is the DM's own action on their own machine) — starts a live presentation of `deckId` at its first scene and pushes it to every connected player in that campaign. */
export function startPresentingDeck(campaignId: string, deckId: string): void {
  liveScene = { campaignId, deckId, sceneIndex: 0 }
  broadcastSceneChangedFor(campaignId, deckId, 0)
}

/** DM-only — moves the live cursor to `sceneIndex` within whatever deck is currently being presented. A no-op if nothing is currently live (e.g. a stray click after the DM already stopped presenting). */
export function setLiveScene(sceneIndex: number): void {
  if (!liveScene) return
  liveScene = { ...liveScene, sceneIndex }
  broadcastSceneChangedFor(liveScene.campaignId, liveScene.deckId, sceneIndex)
}

/** DM-only — ends the live presentation; every connected player's "DM has moved on" cue clears since there's no longer a live scene to be behind on. */
export function stopPresentingDeck(): void {
  if (!liveScene) return
  const { campaignId } = liveScene
  liveScene = null
  broadcastSceneChangedFor(campaignId, null, -1)
}

/** What a given campaign's live cursor currently is — `{ deckId: null, sceneIndex: -1 }` if nobody's presenting. Used both to answer a player's `sessionDecks.getLive` request (e.g. opening the Sessions tab mid-presentation) and by the DM's own renderer to know whether "Present" or "Stop Presenting" should show. */
export function getLiveSceneState(campaignId: string): LiveSceneState {
  if (liveScene && liveScene.campaignId === campaignId) return { deckId: liveScene.deckId, sceneIndex: liveScene.sceneIndex }
  return { deckId: null, sceneIndex: -1 }
}

/** Pushes a "roll this" prompt to one specific connected player — a no-op if they're not currently connected (the DM's own UI only offers this for players it can see in ConnectedPlayersList, so that shouldn't normally happen). */
export function pushForceRoll(targetUserId: string, request: ForceRollRequest): void {
  if (!players.has(targetUserId)) return
  const frame: ForceRollFrame = { type: 'force-roll', request }
  sendToRelay(targetUserId, frame)
}

/**
 * Fans a new message out to whoever else needs it — every connected player
 * in the campaign for 'party', or just the other side of the thread for
 * 'whisper' (whichever of sender/recipient is actually a connected player;
 * the DM is never in `players`, so this naturally targets the right one
 * regardless of which side originated the message). Always also pushes to
 * the DM's own subscribed window rather than assuming the DM already has a
 * copy — they might not be the one who sent it, and if they are, the
 * renderer dedupes by `message.id` the same way DiceTray's shared log does.
 */
export function broadcastMessage(campaignId: string, message: Message): void {
  const frame: MessageFrame = { type: 'message', message }
  if (message.channel === 'party') {
    for (const p of players.values()) {
      if (p.campaignId === campaignId) sendToRelay(p.userId, frame)
    }
  } else {
    const playerSide = players.has(message.senderUserId)
      ? message.senderUserId
      : message.recipientUserId && players.has(message.recipientUserId)
        ? message.recipientUserId
        : null
    if (playerSide) sendToRelay(playerSide, frame)
  }
  if (dmSubscribedCampaignId === campaignId && dmWindow) {
    dmWindow.webContents.send('ws:message', { sessionId: currentSessionId, message })
  }
}

function handleFrame(raw: WebSocket.RawData): void {
  let message: unknown
  try {
    message = JSON.parse(raw.toString())
  } catch {
    return
  }
  if (typeof message !== 'object' || message === null) return
  const msg = message as {
    from?: unknown
    fromUsername?: unknown
    payload?: unknown
    type?: unknown
    userId?: unknown
  }

  if (msg.type === 'player-disconnected' && typeof msg.userId === 'string') {
    const p = players.get(msg.userId)
    players.delete(msg.userId)
    if (p?.campaignId) broadcastPresence(p.campaignId)
    if (dmWindow) dmWindow.webContents.send('ws:player-character', { userId: msg.userId, character: null })
    return
  }
  if (msg.type === 'player-connected') return // learned about them on their first request instead

  if (typeof msg.from !== 'string' || typeof msg.payload !== 'object' || msg.payload === null) return
  const frame = msg.payload as RequestFrame
  if (typeof frame.reqId !== 'string' || typeof frame.kind !== 'string') return

  const fromUserId = msg.from
  const fromUsername = typeof msg.fromUsername === 'string' ? msg.fromUsername : 'Unknown'
  if (!players.has(fromUserId)) {
    players.set(fromUserId, {
      userId: fromUserId,
      username: fromUsername,
      campaignId: null,
      characterName: null,
      character: null
    })
  }

  dispatch(fromUserId, fromUsername, frame)
    .then((response) => sendToRelay(fromUserId, response))
    .catch((err) => {
      // Without this, any unexpected throw here (e.g. a DB constraint error)
      // just never sends a response — the requester silently sits until
      // sendRequest's 15s timeout, surfacing as an unhelpful "The DM is not
      // responding." Send a real error back instead.
      console.error('sessionHost dispatch failed', frame.kind, err)
      sendToRelay(fromUserId, { reqId: frame.reqId, ok: false, error: 'Something went wrong on the DM\'s end.' })
    })
}

function fromService<T>(reqId: string, result: ServiceResult<T>): ResponseFrame {
  return result.ok ? { reqId, ok: true, data: result.data } : { reqId, ok: false, error: result.error }
}

async function dispatch(userId: string, username: string, frame: RequestFrame): Promise<ResponseFrame> {
  const db = getHostDb(app.getPath('userData'))
  new UserRepo(db).ensureWithId(userId, username)

  const p = (frame.payload ?? {}) as Record<string, unknown>
  const str = (key: string): string => (typeof p[key] === 'string' ? (p[key] as string) : '')
  const input = (key: string): Record<string, unknown> =>
    typeof p[key] === 'object' && p[key] !== null ? (p[key] as Record<string, unknown>) : {}

  switch (frame.kind) {
    case 'campaigns.list':
      return fromService(frame.reqId, campaignService.listCampaigns(db, userId))
    case 'campaigns.create':
      return fromService(frame.reqId, campaignService.createCampaign(db, userId, str('name')))
    case 'campaigns.join':
      return fromService(frame.reqId, campaignService.joinCampaign(db, str('campaignId'), userId))
    case 'campaigns.getActive':
      return fromService(frame.reqId, campaignService.getActiveCampaign(db, userId))
    case 'campaigns.setActive':
      return fromService(frame.reqId, campaignService.setActiveCampaign(db, str('campaignId'), userId))
    case 'campaigns.joinActive':
      return fromService(frame.reqId, campaignService.joinActiveCampaign(db, userId))
    case 'notes.list':
      return fromService(frame.reqId, campaignService.listNotes(db, str('campaignId'), userId))
    case 'notes.create': {
      const campaignId = str('campaignId')
      // campaignService validates every field's type at runtime (title/bodyMarkdown/visibility
      // are all typed `unknown` there for exactly this reason) — this cast just satisfies the
      // TS object-shape check for an object we're passing straight through from the wire.
      const result = campaignService.createNote(db, campaignId, userId, input('input') as never)
      if (result.ok) broadcastCampaignChanged(campaignId)
      return fromService(frame.reqId, result)
    }
    case 'notes.update': {
      const campaignId = str('campaignId')
      const result = campaignService.updateNote(db, campaignId, str('noteId'), userId, input('input'))
      if (result.ok) broadcastCampaignChanged(campaignId)
      return fromService(frame.reqId, result)
    }
    case 'notes.remove': {
      const campaignId = str('campaignId')
      const result = campaignService.deleteNote(db, campaignId, str('noteId'), userId)
      if (result.ok) broadcastCampaignChanged(campaignId)
      return result.ok ? { reqId: frame.reqId, ok: true, data: undefined } : { reqId: frame.reqId, ok: false, error: result.error }
    }
    case 'calendar.get':
      return fromService(frame.reqId, campaignService.getCalendar(db, str('campaignId'), userId))
    case 'calendar.save': {
      const campaignId = str('campaignId')
      const result = campaignService.saveCalendar(db, campaignId, userId, input('config'))
      if (result.ok) broadcastCampaignChanged(campaignId)
      return fromService(frame.reqId, result)
    }
    case 'calendar.remove': {
      const campaignId = str('campaignId')
      const result = campaignService.deleteCalendar(db, campaignId, userId)
      if (result.ok) broadcastCampaignChanged(campaignId)
      return result.ok ? { reqId: frame.reqId, ok: true, data: undefined } : { reqId: frame.reqId, ok: false, error: result.error }
    }
    case 'folders.list':
      return fromService(frame.reqId, campaignService.listFolders(db, str('campaignId'), userId))
    case 'folders.create': {
      const campaignId = str('campaignId')
      const result = campaignService.createFolder(db, campaignId, userId, input('input') as never)
      if (result.ok) broadcastCampaignChanged(campaignId)
      return fromService(frame.reqId, result)
    }
    case 'folders.update': {
      const campaignId = str('campaignId')
      const result = campaignService.updateFolder(db, campaignId, str('folderId'), userId, input('input'))
      if (result.ok) broadcastCampaignChanged(campaignId)
      return fromService(frame.reqId, result)
    }
    case 'folders.remove': {
      const campaignId = str('campaignId')
      const result = campaignService.deleteFolder(db, campaignId, str('folderId'), userId)
      if (result.ok) broadcastCampaignChanged(campaignId)
      return result.ok ? { reqId: frame.reqId, ok: true, data: undefined } : { reqId: frame.reqId, ok: false, error: result.error }
    }
    case 'presence.subscribe': {
      const player = players.get(userId)
      if (player) {
        const previous = player.campaignId
        const nextCampaignId = str('campaignId') || null
        player.campaignId = nextCampaignId
        if (previous) broadcastPresence(previous)
        if (nextCampaignId) broadcastPresence(nextCampaignId)
      }
      return { reqId: frame.reqId, ok: true, data: undefined }
    }
    case 'presence.selectCharacter': {
      const player = players.get(userId)
      if (player) {
        player.characterName = str('characterName') || null
        if (player.campaignId) broadcastPresence(player.campaignId)
      }
      return { reqId: frame.reqId, ok: true, data: undefined }
    }
    case 'characters.sync': {
      const player = players.get(userId)
      if (player) {
        const character = (p.character ?? null) as CharacterSheet | null
        player.character = character
        if (dmWindow) dmWindow.webContents.send('ws:player-character', { userId, character })
      }
      return { reqId: frame.reqId, ok: true, data: undefined }
    }
    // A snapshot, not a live subscription — a player who wants to check a
    // party member's sheet fetches it fresh each time (PartySidebar re-fetches
    // on selection), rather than the DM's continuous ws:player-character push
    // (which would mean broadcasting every player's sheet to everyone on
    // every edit, not just to the DM). The host already keeps every synced
    // player's character live in `players` (see 'characters.sync' above) —
    // this just reads it back out for whoever asks.
    case 'characters.getPlayerCharacter': {
      const target = players.get(str('userId'))
      return { reqId: frame.reqId, ok: true, data: target?.character ?? null }
    }
    // A player setting their own initiative roll — forwarded straight to the
    // DM's own renderer (which owns the actual tracker state, see
    // InitiativeTracker.tsx) so it can update that combatant and rebroadcast,
    // same shape as characters.sync above.
    case 'initiative.setMine': {
      const initiative = typeof p.initiative === 'number' ? p.initiative : null
      if (dmWindow) dmWindow.webContents.send('ws:player-initiative', { userId, initiative })
      return { reqId: frame.reqId, ok: true, data: undefined }
    }
    // A player's roll — pushed to the DM's own renderer so it shows up in
    // their log too, then fanned out to every OTHER connected player (the
    // roller already has their own true copy locally, see DiceTray.tsx, so
    // they're excluded from the relay to avoid a duplicate entry). `roll` is
    // already redacted at the source if it was private (shared/dice.ts) —
    // this never sees or forwards the real numbers of a private roll.
    case 'dice.roll': {
      const roll = p.roll as DiceRollLogEntry | undefined
      if (roll && typeof roll.id === 'string') {
        if (dmWindow) dmWindow.webContents.send('ws:dice-roll', roll)
        broadcastDiceRoll(roll, userId)
      }
      return { reqId: frame.reqId, ok: true, data: undefined }
    }
    // A player triggering a Sound Board cue (the toolbar itself is DM-only,
    // but a note's inline `` `oneshot: ...` `` button, or a character sheet
    // ability that plays one — see CombatTab.tsx — isn't) has no direct
    // relay connection of its own, unlike the DM triggering one straight
    // through sessionHost.ts's own broadcastSfxPlayed — so it comes in as a
    // request instead, same shape as 'dice.roll' above: sent to the DM's own
    // window (which never sees its own local plays otherwise) and fanned out
    // to every OTHER connected player, excluding whoever triggered it (they
    // already played it locally).
    case 'sfxBoard.play': {
      const sfxId = p.sfxId as string | undefined
      if (typeof sfxId === 'string') {
        if (dmWindow) dmWindow.webContents.send('ws:sfx-played', sfxId)
        broadcastSfxPlayed(sfxId, userId)
      }
      return { reqId: frame.reqId, ok: true, data: undefined }
    }
    case 'sessionDecks.list':
      return fromService(frame.reqId, campaignService.listSessionDecks(db, str('campaignId'), userId))
    case 'sessionDecks.create': {
      const campaignId = str('campaignId')
      const result = campaignService.createSessionDeck(db, campaignId, userId, str('title'))
      if (result.ok) broadcastCampaignChanged(campaignId)
      return fromService(frame.reqId, result)
    }
    case 'sessionDecks.update': {
      const campaignId = str('campaignId')
      const result = campaignService.updateSessionDeck(db, campaignId, str('deckId'), userId, input('input'))
      if (result.ok) broadcastCampaignChanged(campaignId)
      return fromService(frame.reqId, result)
    }
    case 'sessionDecks.remove': {
      const campaignId = str('campaignId')
      const result = campaignService.deleteSessionDeck(db, campaignId, str('deckId'), userId)
      if (result.ok) broadcastCampaignChanged(campaignId)
      return result.ok ? { reqId: frame.reqId, ok: true, data: undefined } : { reqId: frame.reqId, ok: false, error: result.error }
    }
    case 'sessionDecks.addScene': {
      const campaignId = str('campaignId')
      const result = campaignService.addSceneToDeck(db, campaignId, str('deckId'), userId, str('title'))
      if (result.ok) broadcastCampaignChanged(campaignId)
      return fromService(frame.reqId, result)
    }
    case 'sessionDecks.removeScene': {
      const campaignId = str('campaignId')
      const result = campaignService.removeSceneFromDeck(db, campaignId, str('deckId'), userId, str('noteId'))
      if (result.ok) broadcastCampaignChanged(campaignId)
      return result.ok ? { reqId: frame.reqId, ok: true, data: undefined } : { reqId: frame.reqId, ok: false, error: result.error }
    }
    case 'sessionDecks.getLive':
      return { reqId: frame.reqId, ok: true, data: getLiveSceneState(str('campaignId')) }
    case 'messages.list':
      return fromService(frame.reqId, campaignService.listMessages(db, str('campaignId'), userId))
    case 'messages.send': {
      const campaignId = str('campaignId')
      const result = campaignService.sendMessage(db, campaignId, userId, input('input') as never)
      if (result.ok) broadcastMessage(campaignId, result.data)
      return fromService(frame.reqId, result)
    }
    default:
      return { reqId: frame.reqId, ok: false, error: 'Unknown request kind.' }
  }
}
