import type { PlayerVisibleInitiativeState } from '@shared/encounter'
import type { DiceRollLogEntry } from '@shared/dice'
import type { Message } from '@shared/ipc'

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
  | 'messages.list'
  | 'messages.send'

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
