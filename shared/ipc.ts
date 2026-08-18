// Contract between the preload bridge and the renderer.
// Grows as features (campaigns, characters, etc.) land in later build steps.

import type { CharacterSheetData } from './dnd5e'
import type { AdminAccountSummary, FriendRequest, FriendSummary, RelayNotification, RelayStatus } from './relay'
import type { InitiativeState, PlayerVisibleInitiativeState } from './encounter'

export interface Identity {
  id: string
  displayName: string
}

/** One local test account, as shown in the account switcher. */
export interface IdentitySummary {
  id: string
  displayName: string
  /** Password saved (via safeStorage) so switching to it doesn't need re-entering it. */
  remembered: boolean
  /** This is the identity currently active in this window. */
  current: boolean
}

export type LoginResult = { ok: true; identity: Identity } | { ok: false; error: string }

export type SessionStatus =
  | { hosting: false }
  | {
      hosting: true
      sessionId: string
      /** Display name of whichever local identity actually started hosting — hosting is process-wide, so a different (e.g. switched-to test) identity can be looking at this without being the one who turned it on. */
      startedBy: string
      /** True only for the identity that started it — controls whether Stop Hosting is even offered, since stopping someone else's hosting from a different identity would be surprising/destructive. */
      isOwner: boolean
    }

export type SessionStartResult = { ok: true; sessionId: string } | { ok: false; error: string }

export interface Campaign {
  id: string
  name: string
  dmUserId: string
  dmDisplayName: string
  createdAt: string
  myRole: 'dm' | 'player' | null
}

export interface Note {
  id: string
  campaignId: string
  authorUserId: string
  authorDisplayName: string
  title: string
  bodyMarkdown: string
  visibility: 'dm' | 'shared' | 'private'
  folderId: string | null
  /** userIds (besides the author) granted edit access to title/bodyMarkdown — set by the author only, see campaignService.updateNote. */
  editorUserIds: string[]
  createdAt: string
  updatedAt: string
}

/** Folders share notes' 'dm'/'shared'/'private' visibility split — a folder's own visibility (not its contents') gates who sees it, so Party Notes, Private Notes, and DM Only are three independent trees. */
export interface Folder {
  id: string
  campaignId: string
  authorUserId: string
  authorDisplayName: string
  name: string
  parentFolderId: string | null
  visibility: 'dm' | 'shared' | 'private'
  createdAt: string
  updatedAt: string
}

export interface CharacterSheet extends CharacterSheetData {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface PresencePlayer {
  userId: string
  displayName: string
  characterName: string | null
}

export interface PresenceUpdate {
  sessionId: string
  campaignId: string
  players: PresencePlayer[]
}

export interface InitiativeUpdate {
  sessionId: string
  state: PlayerVisibleInitiativeState
}

export interface PlayerCharacterUpdate {
  userId: string
  /** null means they deselected, or (a plain disconnect) just dropped — either way, nothing to show for them anymore. */
  character: CharacterSheet | null
}

/** A read-only local cache of a joined campaign, as of the last successful sync while connected — lets it stay browsable once the DM stops hosting. */
export interface CampaignSnapshot {
  campaign: Campaign
  notes: Note[]
  folders: Folder[]
  syncedAt: string
}

/** Fired whenever any participant (DM or a fellow player) mutates notes/folders in a campaign — listeners just re-fetch rather than diffing a pushed payload. */
export interface CampaignChangeEvent {
  sessionId: string
  campaignId: string
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string }

export interface AppApi {
  getAppVersion: () => Promise<string>
  identity: {
    hasAny: () => Promise<boolean>
    create: (displayName: string, password: string) => Promise<LoginResult>
    login: (displayName: string, password: string) => Promise<LoginResult>
    getCurrent: () => Promise<Identity | null>
    updateDisplayName: (newDisplayName: string) => Promise<LoginResult>
    changePassword: (currentPassword: string, newPassword: string) => Promise<LoginResult>
    /** Opt-in "remember me" — encrypted at rest via Electron's safeStorage (OS-level, e.g. DPAPI on Windows). */
    hasRemembered: () => Promise<boolean>
    autoLogin: () => Promise<LoginResult>
    remember: (remember: boolean) => Promise<{ ok: true } | { ok: false; error: string }>
    /** Every local identity on this install — lets you create a handful of throwaway test accounts and switch between them, e.g. to exercise the join flow against your own hosted campaign without a second device. */
    list: () => Promise<IdentitySummary[]>
    /** `password` is only needed if that identity isn't already remembered. */
    switch: (id: string, password: string | undefined, remember: boolean) => Promise<LoginResult>
    /** Forgets a saved password without deleting the account itself. */
    forgetSaved: (id: string) => Promise<void>
    /** Ends the current session (stops hosting/leaves a joined session, disconnects the relay, forgets any remembered password for this identity) and returns to the login screen. */
    signOut: () => Promise<void>
  }
  // Sessions replace the old LAN/Tailscale hosting+invite-code flow entirely
  // — connecting is now: start hosting, invite a friend (from the friends
  // menu), they join by session id. No addresses, no certificates.
  sessions: {
    start: () => Promise<SessionStartResult>
    stop: () => Promise<void>
    status: () => Promise<SessionStatus>
    /** DM-only — adds a friend (by their relay userId) to this session's allow-list. */
    invite: (friendUserId: string) => Promise<ApiResult<void>>
    join: (sessionId: string) => Promise<ApiResult<void>>
    leave: () => Promise<void>
    /** Fires when a joined session drops unexpectedly (DM closed the app, network dropped) — never for a manual `leave()` call. */
    onDisconnected: (callback: (reason: 'dm-left' | 'connection-lost') => void) => () => void
  }
  // Every method here takes an optional trailing `sessionId`: omit it to work
  // directly against the DM's own campaign data (no network/hosting
  // required), or pass a joined session's id to go over the relay — used
  // identically for the DM reaching their own campaign and for a player
  // reaching the DM's.
  campaigns: {
    list: (sessionId?: string) => Promise<ApiResult<Campaign[]>>
    create: (name: string, sessionId?: string) => Promise<ApiResult<Campaign>>
    /** DM-only, always local (no sessionId) — you can only rename your own campaign. */
    rename: (campaignId: string, name: string) => Promise<ApiResult<Campaign>>
    /** DM-only, always local — irreversible, deletes every note/folder/character/message/initiative entry in it. The client is expected to confirm with the user first. */
    delete: (campaignId: string) => Promise<ApiResult<void>>
    join: (campaignId: string, sessionId?: string) => Promise<ApiResult<Campaign>>
    /** Whatever campaign the DM currently has open — null if they haven't opened one. */
    getActive: (sessionId?: string) => Promise<ApiResult<Campaign | null>>
    /** DM-only — sets which campaign connecting players auto-join. */
    setActive: (campaignId: string, sessionId?: string) => Promise<ApiResult<Campaign>>
    /** The player-side one-step join: auto-adds you to the DM's active campaign, no picking from a list. */
    joinActive: (sessionId?: string) => Promise<ApiResult<Campaign>>
    /** Fires when another connected participant changes notes/folders in this campaign — re-fetch on receipt. Only meaningful while hosting or joined to a session. */
    onChanged: (callback: (event: CampaignChangeEvent) => void) => () => void
    /** Fires (player side only) when the DM switches their active campaign — call getActive/joinActive again on receipt. */
    onActiveChanged: (callback: () => void) => () => void
  }
  notes: {
    list: (campaignId: string, sessionId?: string) => Promise<ApiResult<Note[]>>
    create: (
      campaignId: string,
      input: { title: string; bodyMarkdown: string; visibility: 'dm' | 'shared' | 'private'; folderId?: string | null },
      sessionId?: string
    ) => Promise<ApiResult<Note>>
    update: (
      campaignId: string,
      noteId: string,
      input: {
        title?: string
        bodyMarkdown?: string
        folderId?: string | null
        visibility?: 'dm' | 'shared' | 'private'
        /** Author-only — replaces the full grant list. */
        editorUserIds?: string[]
      },
      sessionId?: string
    ) => Promise<ApiResult<Note>>
    remove: (campaignId: string, noteId: string, sessionId?: string) => Promise<ApiResult<void>>
  }
  folders: {
    list: (campaignId: string, sessionId?: string) => Promise<ApiResult<Folder[]>>
    create: (
      campaignId: string,
      input: { name: string; visibility: 'dm' | 'shared' | 'private'; parentFolderId?: string | null },
      sessionId?: string
    ) => Promise<ApiResult<Folder>>
    update: (
      campaignId: string,
      folderId: string,
      input: { name?: string; parentFolderId?: string | null; visibility?: 'dm' | 'shared' | 'private' },
      sessionId?: string
    ) => Promise<ApiResult<Folder>>
    remove: (campaignId: string, folderId: string, sessionId?: string) => Promise<ApiResult<void>>
  }
  // Player-side, entirely local — a read-only cache of a joined campaign's
  // notes/folders as of the last time you were actually connected, so it
  // stays browsable when the DM isn't currently hosting. Written through
  // automatically by usePlayerWorkspace whenever a live sync succeeds; never
  // touched on the DM's own side (they always have their own data locally).
  snapshots: {
    list: () => Promise<ApiResult<CampaignSnapshot[]>>
    get: (campaignId: string) => Promise<ApiResult<CampaignSnapshot | null>>
    save: (campaign: Campaign, notes: Note[], folders: Folder[]) => Promise<void>
  }
  // Characters live entirely on your own device, owned by your local
  // identity — campaign-independent, no session/network involved.
  characters: {
    list: () => Promise<ApiResult<CharacterSheet[]>>
    create: (name: string, sheet: CharacterSheetData) => Promise<ApiResult<CharacterSheet>>
    update: (
      id: string,
      input: Partial<CharacterSheetData> & { name?: string }
    ) => Promise<ApiResult<CharacterSheet>>
    remove: (id: string) => Promise<ApiResult<void>>
    /** Player-side: pushes your currently-selected character (or null) to the DM you're connected to — call whenever it changes, selection or edits alike. No-op while hosting (nothing to sync to yourself) or not in a joined session. */
    syncSelected: (sessionId: string, character: CharacterSheet | null) => Promise<void>
    /** Player-side: a one-off fetch of another connected party member's currently-selected character, for PartySidebar's "view sheet" action — a snapshot at the moment you ask, not a live subscription (see sessionHost.ts's 'characters.getPlayerCharacter' case for why). null if they don't have one selected, aren't connected, or you're not in a joined session. */
    getPlayerCharacter: (userId: string) => Promise<ApiResult<CharacterSheet | null>>
    /** DM-side: fires whenever a connected player's synced character changes — selection, an edit, or them disconnecting (character: null). Only meaningful while hosting. */
    onPlayerCharacterChanged: (callback: (update: PlayerCharacterUpdate) => void) => () => void
  }
  // Live "who's here" for a campaign. Only meaningful once you're hosting or
  // have joined a session — sessionId identifies which one.
  presence: {
    subscribe: (sessionId: string, campaignId: string) => Promise<void>
    selectCharacter: (sessionId: string, characterName: string | null) => Promise<void>
    onUpdate: (callback: (update: PresenceUpdate) => void) => () => void
  }
  // DM-only push of the initiative tracker's live state to every connected
  // player — see shared/encounter.ts for the InitiativeState/
  // PlayerVisibleInitiativeState shapes and sessionHost.ts's
  // broadcastInitiative for the per-recipient sanitizing. A no-op while not
  // hosting; the tracker still works locally either way.
  initiative: {
    broadcast: (state: InitiativeState) => Promise<void>
    onUpdate: (callback: (update: InitiativeUpdate) => void) => () => void
  }
  // Friends/presence, backed by the relay (see relay/) rather than local
  // storage. The relay account itself is transparent — it's the same
  // credentials as identity.*, synced automatically on login/switch — so
  // there's no separate relay login/register call here.
  relay: {
    status: () => Promise<RelayStatus>
    /** Your own relay account id — null if not connected. This is the id notes/folders you author over a joined session get stamped with (see sessionHost.ts's dispatch()), distinct from your local identity id and (for a DM) your local host-db user id. */
    myUserId: () => Promise<string | null>
    friends: {
      list: () => Promise<ApiResult<FriendSummary[]>>
      listRequests: () => Promise<ApiResult<FriendRequest[]>>
      /** status: 'requested' for a normal pending request, or 'accepted' if this merged with a request already waiting from them. */
      sendRequest: (username: string) => Promise<ApiResult<{ status: 'requested' | 'accepted' }>>
      accept: (userId: string) => Promise<ApiResult<void>>
      decline: (userId: string) => Promise<ApiResult<void>>
      remove: (userId: string) => Promise<ApiResult<void>>
    }
    /** Fires whenever presence or the friend graph might have changed — listeners just re-fetch friends.list()/listRequests() rather than trying to diff a pushed payload. */
    onFriendsChanged: (callback: () => void) => () => void
    // Persistent, generic notifications (friend requests, session invites, and
    // eventually DM messages) — stored relay-side so they survive being
    // offline, and pushed live over the same presence socket when online.
    notifications: {
      list: () => Promise<ApiResult<RelayNotification[]>>
      markRead: (id: string) => Promise<ApiResult<void>>
    }
    /** Fires whenever a new notification arrives — listeners re-fetch notifications.list() rather than trying to diff a pushed payload, same convention as onFriendsChanged. */
    onNotificationsChanged: (callback: () => void) => () => void
    // Relay account management — uses your own relay session under the
    // hood, same as everything else here; the relay itself only allows this
    // for one specific admin username (see Directory.isAdmin), so this is a
    // normal 401 for anyone else, not something gated client-side.
    admin: {
      listAccounts: () => Promise<ApiResult<AdminAccountSummary[]>>
      removeAccount: (userId: string) => Promise<ApiResult<void>>
      /** Renames an account and/or resets its password — never reads or returns the current password, only ever sets a new one. Omit whichever field isn't changing. */
      updateAccount: (
        userId: string,
        input: { username?: string; newPassword?: string }
      ) => Promise<ApiResult<{ username: string }>>
    }
  }
  files: {
    /** Opens a native file picker and reads the chosen image back as a data: URI — see registerIpc.ts for why images are embedded rather than stored separately. */
    pickImage: () => Promise<ApiResult<{ dataUrl: string; fileName: string }>>
    /** The folder your campaigns/notes are stored in as real files, if you've opted in — null means everything's still in the internal SQLite database. */
    getVaultPath: () => Promise<string | null>
    /** Opens a native folder picker, then copies every existing SQLite campaign into the chosen folder as files (safe to re-run; nothing already-migrated is duplicated, nothing in SQLite is deleted). From then on, campaigns/notes/folders read and write through the files instead. */
    chooseVaultFolder: () => Promise<
      ApiResult<{ vaultPath: string; migrated: { campaigns: number; notes: number; folders: number } }>
    >
  }
  /** The window is frame:false with a fully custom titlebar (see main/index.ts) — these replace the native minimize/maximize/close buttons. */
  windowControls: {
    minimize: () => Promise<void>
    toggleMaximize: () => Promise<void>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
    onMaximizedChange: (callback: (maximized: boolean) => void) => () => void
  }
}
