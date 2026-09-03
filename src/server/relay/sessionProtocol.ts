import type { PlayerVisibleInitiativeState } from '@shared/encounter'
import type { DiceRollLogEntry } from '@shared/dice'
import type { ForceRollRequest, Message } from '@shared/ipc'

/**
 * Frame shapes carried opaquely by the relay's session room (relay/src/session.ts,
 * which never interprets `payload`) between sessionHost.ts (DM) and
 * sessionClient.ts (player). Every campaign/notes/folders IPC call becomes one
 * request/response pair multiplexed over the single session WebSocket, instead
 * of one HTTPS call each like the old campaignClient.ts.
 */

export type RequestKind =
  | 'campaigns.list'
  | 'campaigns.create'
  | 'campaigns.join'
  | 'campaigns.getActive'
  | 'campaigns.setActive'
  | 'campaigns.joinActive'
  | 'notes.list'
  | 'notes.create'
  | 'notes.update'
  | 'notes.remove'
  | 'calendar.get'
  | 'calendar.save'
  | 'calendar.remove'
  | 'folders.list'
  | 'folders.create'
  | 'folders.update'
  | 'folders.remove'
  | 'presence.subscribe'
  | 'presence.selectCharacter'
  | 'characters.sync'
  | 'characters.getPlayerCharacter'
  | 'initiative.setMine'
  | 'dice.roll'
  | 'sfxBoard.play'
  | 'messages.list'
  | 'messages.send'
  | 'sessionDecks.list'
  | 'sessionDecks.create'
  | 'sessionDecks.update'
  | 'sessionDecks.remove'
  | 'sessionDecks.addScene'
  | 'sessionDecks.removeScene'
  | 'sessionDecks.getLive'

export interface RequestFrame {
  reqId: string
  kind: RequestKind
  payload: unknown
}

export type ResponseFrame =
  | { reqId: string; ok: true; data: unknown }
  | { reqId: string; ok: false; error: string }

export interface PresenceFrame {
  type: 'presence'
  campaignId: string
  players: { userId: string; displayName: string; characterName: string | null }[]
}

/** Pushed after any notes/folders mutation lands, from whichever side made it, so the other side's note workspace knows to refetch — mirrors PresenceFrame's unsolicited-push shape. */
export interface CampaignChangedFrame {
  type: 'campaign-changed'
  campaignId: string
}

/** Pushed to every connected player when the DM switches their active campaign, so a player already connected picks it up live instead of needing the manual "Sync" button. */
export interface ActiveCampaignChangedFrame {
  type: 'active-campaign-changed'
}

/**
 * Pushed to each connected player whenever the DM's initiative tracker
 * changes — unlike PresenceFrame/CampaignChangedFrame this isn't identical
 * for every recipient: `state` is already sanitized per-viewer (see
 * shared/encounter.ts's sanitizeForPlayer) before sessionHost.ts sends it,
 * so a monster's real name/exact HP/position never leaves the DM's process.
 */
export interface InitiativeFrame {
  type: 'initiative'
  state: PlayerVisibleInitiativeState
}

/**
 * Pushed to every connected player (and, when relaying a player's own roll,
 * to the DM's own window too) whenever anyone at the table rolls dice. The
 * DM is the hub for this the same way it is for everything else — a
 * player's roll reaches other players by going player → DM (as a
 * 'dice.roll' request) → DM re-broadcasts this frame to everyone else, DM's
 * own roll broadcasts directly. `roll` may already be a redacted (private)
 * entry — see shared/dice.ts's redactRollForBroadcast, applied at the
 * roller's own end before it's ever sent, so this frame never carries a
 * private roll's real numbers regardless of who forwards it.
 */
export interface DiceRollFrame {
  type: 'dice-roll'
  roll: DiceRollLogEntry
}

/**
 * Pushed whenever a new party or whisper message lands — same DM-is-the-hub
 * shape as dice rolls: a player's message reaches its audience by going
 * player → DM (as a 'messages.send' request, persisted server-side) → DM
 * re-broadcasts this frame to whoever else needs it (every connected player
 * in the campaign for 'party', just the other side of the thread for
 * 'whisper' — see sessionHost.ts's broadcastMessage). The DM's own window
 * gets this pushed too rather than assuming it already has a copy, since
 * the DM might not be the one who sent it; the client dedupes by
 * `message.id` the same way DiceTray's shared log does.
 */
export interface MessageFrame {
  type: 'message'
  message: Message
}

/**
 * Pushed straight from the DM to one specific player — not a broadcast, and
 * unlike every other frame here it's a one-way command, not a state sync:
 * the target's client resolves the request against their own character
 * sheet and rolls locally (see sessionHost.ts's pushForceRoll and
 * ForceRollPrompt.tsx), then that roll reaches the table the same way any
 * other roll does — a normal 'dice.roll' request, no response frame needed
 * for the prompt itself.
 */
export interface ForceRollFrame {
  type: 'force-roll'
  request: ForceRollRequest
}

/**
 * Pushed to every connected player whenever the DM starts presenting a
 * session deck, advances/rewinds a scene, or stops presenting — `deckId:
 * null` means "not currently presenting" (stopped, or never started).
 * Purely a live cursor, not the deck content itself: a player already has
 * (or fetches on demand via sessionDecks.list) the deck's actual scenes,
 * this frame just says which one the DM is currently on.
 */
export interface SceneChangedFrame {
  type: 'scene-changed'
  campaignId: string
  deckId: string | null
  sceneIndex: number
}

/**
 * Pushed to every connected player when the DM picks a Goblin Bard mood (or
 * stops music entirely, `trackId: null`) — carries only a track id from the
 * bundled music library (see musicLibrary.ts), never audio data itself.
 * Every client already has the exact same file bundled with the app, so
 * this is just "which one," not a stream — each client loops/crossfades to
 * it locally at `fadeMs`, using the same fade duration so everyone's
 * transition feels the same length even though playback isn't
 * sample-synced. For a DM-local custom addition, sessionHost.ts sends the
 * actual audio first as one or more MusicTrackChunkFrames, then this frame
 * — see that frame's doc comment for why it's chunked instead of inlined
 * here.
 */
export interface MusicChangedFrame {
  type: 'music-changed'
  trackId: string | null
  fadeMs: number
}

/**
 * One piece of a DM-local custom track's actual audio (see
 * main/customMusic.ts), base64-encoded — bundled tracks never need this,
 * every client already has the file. Chunked rather than inlined in
 * MusicChangedFrame because the relay's Durable-Object WebSocket connection
 * (Cloudflare Workers) hard-caps a single message at 1 MiB; a real MP3's
 * base64 form routinely exceeds that in one piece. Sent as `total`
 * sequential frames sharing one `trackId`, immediately followed by the
 * corresponding MusicChangedFrame — the underlying WebSocket preserves
 * per-connection order, so sessionClient.ts can safely assume every chunk
 * for a track has arrived by the time that track's music-changed frame
 * does. Sent in full on every broadcast of that track (not just the first)
 * since the relay never stores anything and a player might join or
 * reconnect mid-session with no earlier copy to fall back on.
 */
export interface MusicTrackChunkFrame {
  type: 'music-track-chunk'
  trackId: string
  title: string
  mimeType: string
  index: number
  total: number
  chunkBase64: string
}

/** Pushed to every connected player whenever the DM adjusts the Goblin Bard volume slider — keeps everyone's playback level in sync the same way a mood pick does, rather than each client only ever reflecting its own locally-stored preference. */
export interface MusicVolumeChangedFrame {
  type: 'music-volume-changed'
  volume: number
}

/**
 * Pushed to every connected player whenever the DM raises/lowers one Ambient
 * layer's level (see MusicButton.tsx's level buttons) — same "just an id"
 * shape as MusicChangedFrame: every client already has the exact same file
 * bundled (see ambientLibrary.ts), so this carries which layer and how loud,
 * never audio data. `groupId` is included (rather than relying on whatever
 * mood a player's own client last saw) since a player's client has no other
 * way to know which mood is even active if they joined after the DM last
 * picked one.
 */
export interface AmbientLevelChangedFrame {
  type: 'ambient-level-changed'
  groupId: string
  layerId: string
  level: number
  fadeMs: number
}

/**
 * Pushed to every connected player when the DM triggers a one-shot Sound
 * Board cue (see sfxLibrary.ts/SoundBoardButton.tsx) — carries only the cue's
 * id, the same "every client already has the file bundled" shape as
 * MusicChangedFrame, since a Sound Board cue is never a DM-local custom
 * addition the way a music track can be.
 */
export interface SfxPlayedFrame {
  type: 'sfx-played'
  sfxId: string
}
