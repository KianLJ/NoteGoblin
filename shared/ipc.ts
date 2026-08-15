// Contract between the preload bridge and the renderer.
// Grows as features (campaigns, characters, etc.) land in later build steps.

export interface Identity {
  id: string
  displayName: string
}

export type LoginResult = { ok: true; identity: Identity } | { ok: false; error: string }

export interface HostAddressOption {
  address: string
  kind: 'tailscale' | 'lan' | 'other'
  inviteCode: string
}

export type HostingStatus =
  | { hosting: false }
  | { hosting: true; fingerprint: string; addresses: HostAddressOption[] }

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

export interface CharacterSheet {
  id: string
  name: string
  notes: string
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
    create: (name: string) => Promise<ApiResult<CharacterSheet>>
    update: (id: string, input: { name?: string; notes?: string }) => Promise<ApiResult<CharacterSheet>>
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
}
