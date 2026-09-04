// Contract between the preload bridge and the renderer.
// Grows as features (campaigns, characters, etc.) land in later build steps.

import type { Ability, CharacterSheetData, SkillName } from './dnd5e'
import type { AdminAccountSummary, FriendRequest, FriendSummary, RelayMessage, RelayNotification, RelayStatus, WhisperThread } from './relay'
import type { InitiativeState, PlayerVisibleInitiativeState } from './encounter'
import type { DiceRollLogEntry } from './dice'
import type { CalendarConfig } from './calendar'
import type { SessionDeck, SessionScene, LiveSceneState } from './sessionDeck'

/**
 * A DM's "make this player roll" prompt — sent as a targeted push (see
 * sessionHost.ts's pushForceRoll), not a broadcast, and not itself a
 * dice roll: the player's client resolves `mode`/`ability`/`skill` against
 * their own character sheet (abilityModifier/savingThrowBonus/skillBonus,
 * shared/dnd5e.ts) to find the modifier and rolls locally, the same
 * performCheckRoll path any other check goes through — the DM never sees or
 * sets the numeric bonus, only what's being rolled and the target DC.
 */
export interface ForceRollRequest {
  id: string
  mode: 'ability-check' | 'saving-throw' | 'skill-check' | 'flat'
  ability?: Ability
  skill?: SkillName
  dc: number | null
  label: string
  fromDisplayName: string
}

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
  /** Author-only display preference — pinned notes show in their own section above the regular hierarchy (see NoteTreeSection.tsx). */
  pinned: boolean
  /** Set only when this note is actually a session-deck scene (see shared/sessionDeck.ts) — hidden from the normal note sidebar tree; its `::`-prefixed DM-only lines are already stripped out of bodyMarkdown here for anyone but the DM. */
  sceneDeckId: string | null
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

export interface Message {
  id: string
  campaignId: string
  channel: 'party' | 'whisper'
  senderUserId: string
  senderDisplayName: string
  /** Only set for a 'whisper' — the other side of the DM<->one-player thread. Null for 'party'. */
  recipientUserId: string | null
  body: string
  createdAt: string
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

export interface MessageUpdate {
  sessionId: string | null
  message: Message
}

/** DM-side push — a connected player just set their own initiative roll (see InitiativeTracker.tsx). */
export interface PlayerInitiativeUpdate {
  userId: string
  initiative: number | null
}

/** Pushed to every connected participant whenever the DM's live session-deck cursor changes — `deckId: null` means nobody's presenting right now. */
export interface SceneChangedUpdate {
  sessionId: string | null
  campaignId: string
  deckId: string | null
  sceneIndex: number
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
  /** Optional — absent on a snapshot saved before session decks existed; callers should default to []. */
  sessionDecks?: SessionDeck[]
  syncedAt: string
}

/** Fired whenever any participant (DM or a fellow player) mutates notes/folders in a campaign — listeners just re-fetch rather than diffing a pushed payload. */
export interface CampaignChangeEvent {
  sessionId: string
  campaignId: string
}

export interface CampaignCalendar {
  id: string
  campaignId: string
  config: CalendarConfig
  createdAt: string
  updatedAt: string
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
        /** Author-only display preference. */
        pinned?: boolean
      },
      sessionId?: string
    ) => Promise<ApiResult<Note>>
    remove: (campaignId: string, noteId: string, sessionId?: string) => Promise<ApiResult<void>>
  }
  // One calendar per campaign, DM-editable/player-read-only — every campaign
  // member can `get` it (null until the DM has created one); `save` replaces
  // the whole config and is rejected server-side for anyone but the DM.
  // Reuses campaigns.onChanged (not a dedicated event) to tell other windows
  // to re-fetch after a save, same as notes/folders.
  calendar: {
    get: (campaignId: string, sessionId?: string) => Promise<ApiResult<CampaignCalendar | null>>
    save: (campaignId: string, config: CalendarConfig, sessionId?: string) => Promise<ApiResult<CampaignCalendar>>
    /** DM-only — irreversible, the client is expected to confirm with the user first. */
    remove: (campaignId: string, sessionId?: string) => Promise<ApiResult<void>>
  }
  // DM-authored, scene-by-scene session decks (see shared/sessionDeck.ts) —
  // list/create/update/remove work exactly like notes (DM-write, member-
  // read, players get every scene's DM-only asides already stripped
  // server-side). present/setScene/stopPresenting are DM-only, local-only
  // (there's no relay path — only the host can ever be presenting their own
  // deck) live-broadcast controls, pushed to every connected player via
  // onSceneChanged the same way initiative.broadcast/onUpdate works.
  sessionDecks: {
    list: (campaignId: string, sessionId?: string) => Promise<ApiResult<SessionDeck[]>>
    create: (campaignId: string, title: string, sessionId?: string) => Promise<ApiResult<SessionDeck>>
    update: (
      campaignId: string,
      deckId: string,
      input: { title?: string; scenes?: SessionScene[] },
      sessionId?: string
    ) => Promise<ApiResult<SessionDeck>>
    remove: (campaignId: string, deckId: string, sessionId?: string) => Promise<ApiResult<void>>
    /** Creates a real Note (marked as this deck's scene) and appends it to the deck's ordering — open the returned note's id as a tab to edit it, exactly like any other note. */
    addScene: (campaignId: string, deckId: string, title: string, sessionId?: string) => Promise<ApiResult<Note>>
    /** Removes the scene from the deck's ordering AND deletes the underlying note. */
    removeScene: (campaignId: string, deckId: string, noteId: string, sessionId?: string) => Promise<ApiResult<void>>
    /** What campaignId's live cursor currently is — `{ deckId: null, sceneIndex: -1 }` if nobody's presenting. Called once on opening the Sessions tab to catch up; onSceneChanged covers everything live after that. */
    getLive: (campaignId: string, sessionId?: string) => Promise<ApiResult<LiveSceneState>>
    /** DM-only — starts presenting `deckId` from its first scene. */
    present: (campaignId: string, deckId: string) => Promise<void>
    /** DM-only — moves the live cursor within whatever's currently being presented. */
    setScene: (sceneIndex: number) => Promise<void>
    /** DM-only — ends the live presentation. */
    stopPresenting: () => Promise<void>
    /** Fires for every connected participant (DM included) whenever the live cursor changes — filter on `update.campaignId` before applying. */
    onSceneChanged: (callback: (update: SceneChangedUpdate) => void) => () => void
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
  // Campaign chat — a 'party' message reaches everyone at the table (DM
  // included), a 'whisper' is always the DM<->one-player thread (see
  // campaignService.ts's sendMessage for how the recipient is resolved/
  // enforced server-side regardless of what the caller passes). Not
  // persisted client-side beyond `list`'s snapshot — onMessage is the live
  // top-up for whatever arrives after that, same "fetch once, then push"
  // shape as campaigns.onChanged.
  messages: {
    list: (campaignId: string, sessionId?: string) => Promise<ApiResult<Message[]>>
    send: (
      campaignId: string,
      input: { channel: 'party' | 'whisper'; recipientUserId?: string; body: string },
      sessionId?: string
    ) => Promise<ApiResult<Message>>
    /** Fires whenever a new message you're allowed to see lands — from anyone, DM or player, in either channel you're a party to. Only meaningful while hosting or joined to a session. */
    onMessage: (callback: (message: Message) => void) => () => void
  }
  // Player-side, entirely local — a read-only cache of a joined campaign's
  // notes/folders as of the last time you were actually connected, so it
  // stays browsable when the DM isn't currently hosting. Written through
  // automatically by usePlayerWorkspace whenever a live sync succeeds; never
  // touched on the DM's own side (they always have their own data locally).
  snapshots: {
    list: () => Promise<ApiResult<CampaignSnapshot[]>>
    get: (campaignId: string) => Promise<ApiResult<CampaignSnapshot | null>>
    save: (campaign: Campaign, notes: Note[], folders: Folder[], sessionDecks: SessionDeck[]) => Promise<void>
    /** Forgets a cached campaign — just the local read-only copy, not anything on the DM's actual host. */
    remove: (campaignId: string) => Promise<ApiResult<void>>
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
    /** Player-only — sets your own initiative on the DM's tracker. */
    setMine: (initiative: number | null) => Promise<void>
    /** DM-only — fires when a connected player sets their own initiative. */
    onPlayerSet: (callback: (update: PlayerInitiativeUpdate) => void) => () => void
  }
  // Shared dice tray — both the DM and every connected player can roll, and
  // everyone sees the same log. There's no "canonical" server-side state to
  // fetch on join (unlike Initiative); each side just keeps its own local
  // array of entries it's seen since it started watching, appending its own
  // rolls immediately (optimistic — no round trip needed to see your own
  // result) and everyone else's as they arrive over `onRoll`. A no-op call
  // to `broadcast` while neither hosting nor joined (fully offline) is fine
  // — the tray still works locally either way. `sessionId` is required (not
  // optional like most other calls here) purely to disambiguate "hosting
  // this session" from "not networked at all," the same reason
  // characters.syncSelected takes one.
  dice: {
    /** Sends an already-rolled entry to the rest of the table — pass the redacted copy (see shared/dice.ts's redactRollForBroadcast) if it was a private roll; your own local log should keep the true, unredacted copy instead of whatever this sends. */
    broadcast: (sessionId: string, roll: DiceRollLogEntry) => Promise<void>
    /** Fires whenever anyone else at the table rolls — DM receives every player's roll (relayed via the DM, who also re-broadcasts it to the rest of the table); a player receives the DM's rolls and every other player's. */
    onRoll: (callback: (roll: DiceRollLogEntry) => void) => () => void
    /** DM-only — pushes a "roll this" prompt to one specific connected player. A no-op if that player isn't currently connected to this session. */
    forceRoll: (sessionId: string, targetUserId: string, request: ForceRollRequest) => Promise<void>
    /** Player-only — fires when the DM targets you with a forced roll. */
    onForceRoll: (callback: (request: ForceRollRequest) => void) => () => void
  }
  // Goblin Bard — the DM picks a mood, every connected client crossfades to
  // the same track id from its own bundled copy of the music library (see
  // src/renderer/src/data/musicLibrary.ts); no audio ever crosses the wire,
  // just which track and how long to fade. DM-only broadcast, no relay path
  // for a player to initiate (see sessionHost.ts's broadcastMusic).
  music: {
    /** `trackId: null` stops music entirely. A no-op unless actually hosting. */
    broadcast: (trackId: string | null, fadeMs: number) => Promise<void>
    /** Fires for every connected player (never the DM's own broadcast, which they already applied locally when they picked it) whenever the DM changes or stops the music. `customTrack` is present when `trackId` is one of the DM's own local additions — its actual audio, reassembled from however many MusicTrackChunkFrames it took to arrive (see sessionProtocol.ts). */
    onChange: (
      callback: (update: { trackId: string | null; fadeMs: number; customTrack?: { title: string; mimeType: string; dataBase64: string } }) => void
    ) => () => void
    /** DM-only, fire-and-forget — keeps every connected player's playback level in sync with the slider, not just their own locally-stored preference. A no-op unless actually hosting. */
    broadcastVolume: (volume: number) => Promise<void>
    /** Fires for every connected player whenever the DM adjusts the volume slider. */
    onVolumeChange: (callback: (volume: number) => void) => () => void
    /**
     * A DM's own local additions to a mood — a file picked off their own
     * disk, played the same way a bundled track is (crossfade, loop,
     * broadcast). Stored in userData, not the vault/campaign, since it's a
     * per-machine music library, not campaign content. Broadcasting one of
     * these to connected players sends the actual audio too (chunked over
     * the relay — see sessionProtocol.ts's MusicTrackChunkFrame), not just
     * the id, since a player's client has no other way to resolve a file
     * that only exists on the DM's own disk.
     */
    listCustom: () => Promise<Record<string, { id: string; title: string }[]>>
    /** Opens a native file picker scoped to audio files; returns the added track, or null if cancelled. */
    addCustomTrack: (groupId: string) => Promise<{ id: string; title: string } | null>
    removeCustomTrack: (groupId: string, trackId: string) => Promise<void>
  }
  // Ambient layers (see ambientLibrary.ts/ambientEngine.ts) — bundled loops
  // synced the same "just an id" way music is, except keyed by both a mood
  // and a specific layer within it, and carrying a level instead of a
  // play/pause boolean. DM-only broadcast, no relay path for a player to
  // initiate (see sessionHost.ts's broadcastAmbientLevel).
  ambient: {
    /** A no-op unless actually hosting. */
    broadcast: (groupId: string, layerId: string, level: number, fadeMs: number) => Promise<void>
    /** Fires for every connected player whenever the DM raises/lowers one Ambient layer. */
    onChange: (callback: (update: { groupId: string; layerId: string; level: number; fadeMs: number }) => void) => () => void
  }
  // Sound Board — the DM triggers a one-shot cue, every connected client
  // plays the same bundled file from its own copy (see sfxLibrary.ts); no
  // audio ever crosses the wire, just which cue. DM-only broadcast, no relay
  // path for a player to initiate.
  sfxBoard: {
    /** A no-op unless actually hosting. */
    broadcast: (sfxId: string) => Promise<void>
    /** Fires for every connected player (never the DM's own trigger, which they already played locally) whenever the DM fires a cue. */
    onPlay: (callback: (sfxId: string) => void) => () => void
  }
  // A DM's own per-Codex-entity sound override (see main/customEntitySfx.ts's
  // doc comment) — local-only, no broadcast path, unlike the rest of the
  // Sound Board surface above.
  sfxEntity: {
    listCustom: () => Promise<Record<string, { title: string }>>
    /** Opens a native file picker scoped to audio files; returns the added override, or null if cancelled. */
    setCustom: (entityKey: string) => Promise<{ title: string } | null>
    removeCustom: (entityKey: string) => Promise<void>
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
    // Private messages, persisted relay-side (not campaign-scoped SQLite —
    // see messages.* above for that) so history survives regardless of
    // which campaign, or none, is currently open. 'friend' reaches any
    // relay friend, campaign-independent; 'whisper' is a DM<->one-player
    // thread tagged with a campaign, and can span every campaign the two
    // accounts have ever shared — see relay/src/directory.ts.
    messages: {
      send: (input: {
        toUserId: string
        kind: 'friend' | 'whisper'
        campaignId?: string
        campaignName?: string
        body: string
      }) => Promise<ApiResult<RelayMessage>>
      list: (withUserId: string, kind: 'friend' | 'whisper') => Promise<ApiResult<RelayMessage[]>>
      /** Every account you've ever whispered with, tagged with the most recent thread's campaign — the "which account" picker for the Whispers tab. */
      whisperThreads: () => Promise<ApiResult<WhisperThread[]>>
      /** Fires with the message itself (not just a "changed" nudge) whenever one arrives for you, friend or whisper alike — append directly rather than re-fetching. */
      onMessage: (callback: (message: RelayMessage) => void) => () => void
      /** Marks every unread 'message' notification from one sender/kind as read — call when opening (or while actively viewing) that thread, so the tab/thread unread counters clear. */
      markRead: (fromUserId: string, kind: 'friend' | 'whisper') => Promise<ApiResult<void>>
    }
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
  // Discord Rich Presence — cosmetic, best-effort (see main/discordPresence.ts).
  // AppShell.tsx calls this whenever the DM/player + active-campaign state
  // changes; it's a no-op if Discord isn't running or no Client ID is
  // configured, so nothing here needs to check for that first.
  discord: {
    /** null clears the presence line entirely. */
    setActivity: (details: string | null) => Promise<void>
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
