// Contract between the preload bridge and the renderer.
// Grows as features (campaigns, characters, etc.) land in later build steps.

import type { CharacterSheetData } from './dnd5e'

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

export interface HostAddressOption {
  address: string
  kind: 'tailscale' | 'lan' | 'other'
  inviteCode: string
}

export type HostingStatus =
  | { hosting: false }
  | {
      hosting: true
      fingerprint: string
      addresses: HostAddressOption[]
      /** Display name of whichever local identity actually started hosting — hosting is process-wide, so a different (e.g. switched-to test) identity can be looking at this without being the one who turned it on. */
      startedBy: string
      /** True only for the identity that started it — controls whether Stop Hosting is even offered, since stopping someone else's hosting from a different identity would be surprising/destructive. */
      isOwner: boolean
    }

export type HostingStartResult =
  | { ok: true; fingerprint: string; addresses: HostAddressOption[] }
  | { ok: false; error: string }

export type ProbeResult =
  | { ok: true; fingerprint: string; status: 'new' | 'match' | 'mismatch'; previousFingerprint?: string }
  | { ok: false; error: string }

export type JoinResult = { ok: true; address: string; fingerprint: string } | { ok: false; error: string }

/** Decoding a pasted invite code before connecting — lets the UI show what it found without committing to a probe/join yet. */
export type DecodeInviteResult =
  | { ok: true; address: string; fingerprint: string; label?: string }
  | { ok: false; error: string }

export interface KnownHostSummary {
  address: string
  label: string
  certFingerprint: string
  lastConnectedAt: string | null
}

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
  visibility: 'dm' | 'shared'
  folderId: string | null
  createdAt: string
  updatedAt: string
}

/** Folders share notes' 'dm'/'shared' visibility split — a folder's own visibility (not its contents') gates who sees it, so Shared Notes and DM Only are two independent trees. */
export interface Folder {
  id: string
  campaignId: string
  authorUserId: string
  authorDisplayName: string
  name: string
  parentFolderId: string | null
  visibility: 'dm' | 'shared'
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
  address: string
  campaignId: string
  players: PresencePlayer[]
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
  }
  hosting: {
    start: () => Promise<HostingStartResult>
    stop: () => Promise<void>
    status: () => Promise<HostingStatus>
    /** The loopback address (127.0.0.1:port) this app uses to talk to its own hosted server — not shown to players, just used internally to drive the DM's own campaign views through the same API a joining player uses. */
    selfAddress: () => Promise<string | null>
  }
  connections: {
    probe: (address: string) => Promise<ProbeResult>
    join: (address: string, label?: string) => Promise<JoinResult>
    list: () => Promise<KnownHostSummary[]>
    forget: (address: string) => Promise<void>
    decodeInvite: (code: string) => Promise<DecodeInviteResult>
  }
  // Every method here takes an optional trailing `address`: omit it to work
  // directly against the DM's own campaign data (no network/hosting
  // required), or pass a connected host's address to go over the network —
  // used identically for the DM reaching their own running server and for a
  // player reaching someone else's.
  campaigns: {
    list: (address?: string) => Promise<ApiResult<Campaign[]>>
    create: (name: string, address?: string) => Promise<ApiResult<Campaign>>
    join: (campaignId: string, address?: string) => Promise<ApiResult<Campaign>>
    /** Whatever campaign the DM currently has open — null if they haven't opened one. */
    getActive: (address?: string) => Promise<ApiResult<Campaign | null>>
    /** DM-only — sets which campaign connecting players auto-join. */
    setActive: (campaignId: string, address?: string) => Promise<ApiResult<Campaign>>
    /** The player-side one-step join: auto-adds you to the DM's active campaign, no picking from a list. */
    joinActive: (address?: string) => Promise<ApiResult<Campaign>>
  }
  notes: {
    list: (campaignId: string, address?: string) => Promise<ApiResult<Note[]>>
    create: (
      campaignId: string,
      input: { title: string; bodyMarkdown: string; visibility: 'dm' | 'shared'; folderId?: string | null },
      address?: string
    ) => Promise<ApiResult<Note>>
    update: (
      campaignId: string,
      noteId: string,
      input: { title?: string; bodyMarkdown?: string; folderId?: string | null; visibility?: 'dm' | 'shared' },
      address?: string
    ) => Promise<ApiResult<Note>>
    remove: (campaignId: string, noteId: string, address?: string) => Promise<ApiResult<void>>
  }
  folders: {
    list: (campaignId: string, address?: string) => Promise<ApiResult<Folder[]>>
    create: (
      campaignId: string,
      input: { name: string; visibility: 'dm' | 'shared'; parentFolderId?: string | null },
      address?: string
    ) => Promise<ApiResult<Folder>>
    update: (
      campaignId: string,
      folderId: string,
      input: { name?: string; parentFolderId?: string | null; visibility?: 'dm' | 'shared' },
      address?: string
    ) => Promise<ApiResult<Folder>>
    remove: (campaignId: string, folderId: string, address?: string) => Promise<ApiResult<void>>
  }
  // Characters live entirely on your own device, owned by your local
  // identity — campaign-independent, no address/network involved.
  characters: {
    list: () => Promise<ApiResult<CharacterSheet[]>>
    create: (name: string, sheet: CharacterSheetData) => Promise<ApiResult<CharacterSheet>>
    update: (
      id: string,
      input: Partial<CharacterSheetData> & { name?: string }
    ) => Promise<ApiResult<CharacterSheet>>
    remove: (id: string) => Promise<ApiResult<void>>
  }
  // Live "who's here" for a campaign, over the same WebSocket connection
  // used for future real-time features (initiative, chat). Only meaningful
  // for a host address you're actively connected to.
  presence: {
    subscribe: (address: string, campaignId: string) => Promise<void>
    selectCharacter: (address: string, characterName: string | null) => Promise<void>
    onUpdate: (callback: (update: PresenceUpdate) => void) => () => void
  }
  files: {
    /** Opens a native file picker and reads the chosen image back as a data: URI — see registerIpc.ts for why images are embedded rather than stored separately. */
    pickImage: () => Promise<ApiResult<{ dataUrl: string; fileName: string }>>
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
