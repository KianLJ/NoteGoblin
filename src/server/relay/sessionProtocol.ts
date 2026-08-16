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
