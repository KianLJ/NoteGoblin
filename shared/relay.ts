// Types shared between the Electron app and the relay project (relay/) for
// the friends menu — accounts, friend graph, and online presence. The relay
// itself is a separate deployable (see relay/), these types just describe
// the wire shapes both sides agree on.

export interface RelayAccount {
  userId: string
  username: string
}

export interface FriendSummary {
  userId: string
  username: string
  online: boolean
  /** Set once Milestone 2 lands — the session id a friend is currently hosting, if any. */
  hostingSessionId?: string
}

export interface FriendRequest {
  userId: string
  username: string
}

export type RelayStatus = 'connected' | 'connecting' | 'unavailable'

/** One row in the admin account-management screen — see relay/src/directory.ts's /admin/accounts. */
export interface AdminAccountSummary {
  userId: string
  username: string
  friendCount: number
  incomingRequestCount: number
  outgoingRequestCount: number
}

export interface RelayNotification {
  id: string
  kind: 'friend-request' | 'friend-accepted' | 'session-invite' | 'message'
  fromUserId: string
  fromUsername: string
  sessionId?: string
  /** Only set for kind === 'message' — which conversation kind this is, for routing "open this thread" and for the Messages panel's unread tab/thread counters (see ChatPanel.tsx). */
  messageKind?: 'friend' | 'whisper'
  createdAt: string
  read: boolean
}

/**
 * A relay-persisted private message — 'friend' reaches any relay friend,
 * anytime, campaign-independent; 'whisper' is a DM<->one-player thread for
 * one specific campaign (campaignId/campaignName always set), and can span
 * every campaign two accounts have ever shared — see relay/src/directory.ts.
 */
export interface RelayMessage {
  id: string
  kind: 'friend' | 'whisper'
  senderUserId: string
  senderUsername: string
  recipientUserId: string
  campaignId?: string
  campaignName?: string
  body: string
  createdAt: string
}

/** One row per account you've ever whispered with, tagged with whichever campaign the most recent whisper in that thread came from — see relay/src/directory.ts's /whisper-threads. */
export interface WhisperThread {
  userId: string
  username: string
  lastMessageBody: string
  lastCampaignId: string | null
  lastCampaignName: string | null
  lastAt: string
}
