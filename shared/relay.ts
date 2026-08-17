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

/** Generic enough to grow a 'message' kind later for DM/private messaging without reshaping this store — see relay/src/directory.ts. */
export interface RelayNotification {
  id: string
  kind: 'friend-request' | 'friend-accepted' | 'session-invite'
  fromUserId: string
  fromUsername: string
  sessionId?: string
  createdAt: string
  read: boolean
}
