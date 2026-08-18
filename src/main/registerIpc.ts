import { app, dialog, ipcMain, type BrowserWindow } from 'electron'
import { existsSync, watch, type FSWatcher } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { getLocalDb } from '@server/db/localDb'
import { getHostDb } from '@server/db/hostDb'
import { getVaultPath, setVaultPath, initVaultConfig } from '@server/files/vaultConfig'
import { migrateSqliteCampaignsToVault } from '@server/files/migration'
import { campaignIdForVaultPath } from '@server/files/vaultStore'
import { IdentityRepo } from '@server/repositories/identityRepo'
import { UserRepo } from '@server/repositories/userRepo'
import * as campaignService from '@server/services/campaignService'
import type { ServiceResult } from '@server/services/campaignService'
import { CharacterRepo, type CharacterRow } from '@server/repositories/characterRepo'
import { SnapshotRepo, type CampaignSnapshot } from '@server/repositories/snapshotRepo'
import { emptyCharacterSheet, type CharacterSheetData } from '@shared/dnd5e'
import { syncRelayAccount, changeRelayPassword, clearRelaySession } from './relaySync'
import * as relayClient from '@server/relay/relayClient'
import { getRelaySession, getRelayStatus, isFriendOnline, getFriendHostingSessionId } from './relayState'
import { queryOnline } from './relaySocket'
import {
  startSessionHost,
  stopSessionHost,
  inviteToSession,
  subscribeDmPresence,
  broadcastCampaignChanged,
  broadcastActiveCampaignChanged,
  broadcastInitiative
} from './sessionHost'
import type { InitiativeState } from '@shared/encounter'
import { joinSession, leaveSession, sendRequest as sendSessionRequest } from './sessionClient'
import {
  hasRememberedCredentials,
  loadLastActiveCredentials,
  loadRememberedPassword,
  rememberIdentity,
  touchLastActive,
  forgetIdentity as forgetRememberedIdentity,
  isRemembered
} from './rememberedCredentials'
import {
  getCurrentIdentity,
  setCurrentIdentity,
  getHostedSession,
  setHostedSession,
  getJoinedSession,
  setJoinedSession,
  clearJoinedSession
} from './appState'
import type {
  Identity,
  LoginResult,
  SessionStartResult,
  SessionStatus,
  ApiResult,
  Campaign,
  Note,
  Folder,
  CharacterSheet
} from '@shared/ipc'
import type { AdminAccountSummary, FriendRequest, FriendSummary, RelayNotification } from '@shared/relay'

// --- Vault file watcher ------------------------------------------------
// In vault mode, notes/folders are real files — someone can add, rename, or
// delete them from outside the app entirely (Explorer, Obsidian, git, a
// sync tool). Without this, the sidebar would only ever reflect the app's
// own writes, going stale the moment anything else touched the folder.
// Reuses the exact same 'ws:campaign-changed' refetch signal notes/folders
// mutations already send after an in-app edit (see broadcastCampaignChanged
// in sessionHost.ts) — the renderer doesn't care which caused it.
let vaultWatcher: FSWatcher | null = null

function startVaultWatcher(mainWindow: BrowserWindow): void {
  vaultWatcher?.close()
  vaultWatcher = null
  const root = getVaultPath()
  if (!root || !existsSync(root)) return
  const pendingCampaignIds = new Set<string>()
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  try {
    vaultWatcher = watch(root, { recursive: true }, (_event, filename) => {
      if (!filename) return
      const campaignId = campaignIdForVaultPath(join(root, filename))
      if (!campaignId) return
      pendingCampaignIds.add(campaignId)
      if (debounceTimer) clearTimeout(debounceTimer)
      // A single save can fire several raw fs events (write, then rename,
      // then a metadata touch) — coalesce them into one refetch per burst
      // instead of hammering the renderer.
      debounceTimer = setTimeout(() => {
        for (const campaignId of pendingCampaignIds) {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('ws:campaign-changed', { sessionId: '', campaignId })
          }
          if (getHostedSession()) broadcastCampaignChanged(campaignId)
        }
        pendingCampaignIds.clear()
      }, 400)
    })
  } catch {
    // Recursive fs.watch isn't supported on every platform/filesystem —
    // the vault still works fine, external edits just won't live-refresh
    // until the campaign is reopened or the app restarts.
  }
}

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  const userDataDir = app.getPath('userData')
  const localDb = getLocalDb(userDataDir)
  const identityRepo = new IdentityRepo(localDb)
  initVaultConfig(userDataDir)
  startVaultWatcher(mainWindow)

  ipcMain.handle('app:get-version', () => app.getVersion())

  // --- Identity -------------------------------------------------------
  ipcMain.handle('identity:has-any', () => identityRepo.hasAny())

  ipcMain.handle(
    'identity:create',
    async (_event, displayName: string, password: string): Promise<LoginResult> => {
      try {
        const identity = await identityRepo.create(displayName.trim(), password)
        setCurrentIdentity({
          ...identity,
          passwordHash: identityRepo.findByDisplayName(identity.displayName)!.password_hash,
          password
        })
        void syncRelayAccount(identity.displayName, password, mainWindow)
        return { ok: true, identity }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not create identity.'
        }
      }
    }
  )

  ipcMain.handle(
    'identity:login',
    async (_event, displayName: string, password: string): Promise<LoginResult> => {
      const identity = await identityRepo.verify(displayName.trim(), password)
      if (!identity) return { ok: false, error: 'That display name and password don’t match.' }
      setCurrentIdentity({
        ...identity,
        passwordHash: identityRepo.findByDisplayName(identity.displayName)!.password_hash,
        password
      })
      void syncRelayAccount(identity.displayName, password, mainWindow)
      return { ok: true, identity }
    }
  )

  ipcMain.handle('identity:get-current', (): Identity | null => {
    const identity = getCurrentIdentity()
    return identity ? { id: identity.id, displayName: identity.displayName } : null
  })

  ipcMain.handle('identity:sign-out', (): void => {
    const identity = getCurrentIdentity()
    stopSessionHost()
    leaveSession()
    clearJoinedSession()
    clearRelaySession()
    setCurrentIdentity(null)
    // "Remember me" existing on this identity would otherwise just silently
    // auto-log back in on next launch, defeating the point of signing out.
    if (identity) forgetRememberedIdentity(userDataDir, identity.id)
  })

  ipcMain.handle(
    'identity:update-display-name',
    (_event, newDisplayName: string): LoginResult => {
      const identity = getCurrentIdentity()
      if (!identity) return { ok: false, error: 'Log in first.' }
      const trimmed = newDisplayName.trim()
      if (trimmed.length < 3) return { ok: false, error: 'Pick a display name with at least 3 characters.' }
      try {
        identityRepo.rename(identity.id, trimmed)
        setCurrentIdentity({ ...identity, displayName: trimmed })
        // Deliberately not re-syncing the relay account here — the relay
        // session established under the old display name stays active
        // (friends/presence keep working under that username) rather than
        // registering a second, orphaned relay account under the new name.
        // Keep any saved "remember me" credentials pointing at the new name.
        if (isRemembered(userDataDir, identity.id)) {
          rememberIdentity(userDataDir, identity.id, trimmed, identity.password)
        }
        return { ok: true, identity: { id: identity.id, displayName: trimmed } }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Could not rename.' }
      }
    }
  )

  ipcMain.handle(
    'identity:change-password',
    async (_event, currentPassword: string, newPassword: string): Promise<LoginResult> => {
      const identity = getCurrentIdentity()
      if (!identity) return { ok: false, error: 'Log in first.' }
      const verified = await identityRepo.verify(identity.displayName, currentPassword)
      if (!verified) return { ok: false, error: 'Current password is incorrect.' }
      if (newPassword.length < 8) {
        return { ok: false, error: 'New password should be at least 8 characters.' }
      }
      await identityRepo.setPassword(identity.id, newPassword)
      const passwordHash = identityRepo.findByDisplayName(identity.displayName)!.password_hash
      setCurrentIdentity({ ...identity, passwordHash, password: newPassword })
      void changeRelayPassword(identity.displayName, currentPassword, newPassword, mainWindow)
      if (isRemembered(userDataDir, identity.id)) {
        rememberIdentity(userDataDir, identity.id, identity.displayName, newPassword)
      }
      return { ok: true, identity: { id: identity.id, displayName: identity.displayName } }
    }
  )

  ipcMain.handle('identity:has-remembered', () => hasRememberedCredentials(userDataDir))

  ipcMain.handle('identity:auto-login', async (): Promise<LoginResult> => {
    const stored = loadLastActiveCredentials(userDataDir)
    if (!stored) return { ok: false, error: 'No saved login.' }
    const identity = await identityRepo.verify(stored.displayName, stored.password)
    if (!identity) return { ok: false, error: 'Saved login no longer works — please log in again.' }
    setCurrentIdentity({
      ...identity,
      passwordHash: identityRepo.findByDisplayName(identity.displayName)!.password_hash,
      password: stored.password
    })
    void syncRelayAccount(identity.displayName, stored.password, mainWindow)
    return { ok: true, identity }
  })

  ipcMain.handle(
    'identity:remember',
    (_event, remember: boolean): { ok: true } | { ok: false; error: string } => {
      const identity = getCurrentIdentity()
      if (!identity) return { ok: false, error: 'Log in first.' }
      if (!remember) {
        forgetRememberedIdentity(userDataDir, identity.id)
        return { ok: true }
      }
      try {
        rememberIdentity(userDataDir, identity.id, identity.displayName, identity.password)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Could not save login.' }
      }
    }
  )

  // Local test accounts — the schema/repo already support any number of
  // identity rows (one per display name); this just exposes listing and
  // switching between them. Handy for exercising the join flow without a
  // second device: host as one identity, switch to another, join your own
  // hosted campaign over the real network path.
  ipcMain.handle(
    'identity:list',
    (): { id: string; displayName: string; remembered: boolean; current: boolean }[] => {
      const current = getCurrentIdentity()
      return identityRepo.list().map((account) => ({
        ...account,
        remembered: isRemembered(userDataDir, account.id),
        current: account.id === current?.id
      }))
    }
  )

  ipcMain.handle(
    'identity:switch',
    async (
      _event,
      id: string,
      password: string | undefined,
      remember: boolean
    ): Promise<LoginResult> => {
      const row = identityRepo.findById(id)
      if (!row) return { ok: false, error: 'That account no longer exists.' }

      const resolvedPassword = password ?? loadRememberedPassword(userDataDir, id) ?? undefined
      if (resolvedPassword === undefined) return { ok: false, error: 'Password required.' }

      const identity = await identityRepo.verify(row.display_name, resolvedPassword)
      if (!identity) return { ok: false, error: 'Incorrect password.' }

      setCurrentIdentity({ ...identity, passwordHash: row.password_hash, password: resolvedPassword })
      void syncRelayAccount(identity.displayName, resolvedPassword, mainWindow)
      // Switching identities makes a joined session's relay auth belong to
      // the wrong account — never let it leak across the switch. Hosting
      // itself (if running) is untouched; it isn't tied to "who's currently
      // browsing" in this window.
      clearJoinedSession()

      if (remember) rememberIdentity(userDataDir, identity.id, identity.displayName, resolvedPassword)
      else if (isRemembered(userDataDir, identity.id)) touchLastActive(userDataDir, identity.id)

      return { ok: true, identity }
    }
  )

  ipcMain.handle(
    'identity:forget-saved',
    (_event, id: string): void => {
      forgetRememberedIdentity(userDataDir, id)
    }
  )

  // --- Sessions -----------------------------------------------------------
  // Replaces LAN/Tailscale hosting entirely: starting a session opens one WS
  // to the relay's session room (sessionHost.ts); inviting a friend adds
  // their relay userId to that session's allow-list; joining is just
  // connecting to a session id you were invited to (sessionClient.ts).
  ipcMain.handle('sessions:start', async (): Promise<SessionStartResult> => {
    const identity = getCurrentIdentity()
    if (!identity) return { ok: false, error: 'Log in first.' }
    const relaySession = getRelaySession()
    if (!relaySession) return { ok: false, error: 'Not connected to the relay yet — try again in a moment.' }

    const existing = getHostedSession()
    if (existing) return { ok: true, sessionId: existing.sessionId }

    const started = await startSessionHost(relaySession.token, relaySession.username, mainWindow)
    if (!started.ok) return started
    setHostedSession({ sessionId: started.sessionId, ownerIdentityId: identity.id })
    return { ok: true, sessionId: started.sessionId }
  })

  ipcMain.handle('sessions:stop', async (): Promise<void> => {
    const hosted = getHostedSession()
    if (!hosted) return
    // Only the identity that started hosting can stop it — otherwise
    // switching to a test identity to try the join flow could accidentally
    // shut down the actual DM's table out from under them.
    const identity = getCurrentIdentity()
    if (identity?.id !== hosted.ownerIdentityId) return
    stopSessionHost()
    setHostedSession(null)
  })

  ipcMain.handle('sessions:status', (): SessionStatus => {
    const hosted = getHostedSession()
    if (!hosted) return { hosting: false }
    const owner = identityRepo.findById(hosted.ownerIdentityId)
    const identity = getCurrentIdentity()
    return {
      hosting: true,
      sessionId: hosted.sessionId,
      startedBy: owner?.display_name ?? 'someone else',
      isOwner: !!identity && identity.id === hosted.ownerIdentityId
    }
  })

  ipcMain.handle('sessions:invite', async (_event, friendUserId: string): Promise<ApiResult<void>> => {
    const hosted = getHostedSession()
    if (!hosted) return { ok: false, error: 'Not hosting.' }
    const relaySession = getRelaySession()
    if (!relaySession) return { ok: false, error: 'Not connected to the relay.' }
    const result = await inviteToSession(relaySession.token, friendUserId)
    return result.ok ? { ok: true, data: undefined } : result
  })

  ipcMain.handle('sessions:join', async (_event, sessionId: string): Promise<ApiResult<void>> => {
    const relaySession = getRelaySession()
    if (!relaySession) return { ok: false, error: 'Not connected to the relay.' }
    const result = await joinSession(sessionId, relaySession.token, relaySession.username, mainWindow)
    if (!result.ok) return result
    setJoinedSession({ sessionId })
    return { ok: true, data: undefined }
  })

  ipcMain.handle('sessions:leave', async (): Promise<void> => {
    leaveSession()
    setJoinedSession(null)
  })

  // --- Campaigns & notes --------------------------------------------------
  // Two ways to reach the same data: pass a `sessionId` to go over the relay
  // (a player reaching the DM they've joined, or the DM reaching their own
  // hosted session), or omit it to work directly against the DM's own host
  // database in-process — no network, no hosting required, so solo campaign
  // prep doesn't depend on anyone being connected.
  function requireJoinedSession(sessionId: string): { ok: false; error: string } | undefined {
    const joined = getJoinedSession()
    if (!joined || joined.sessionId !== sessionId) return { ok: false, error: 'Not connected to that session.' }
    return undefined
  }

  /** The DM's own host-side account, ensured (not necessarily hosting) from their local identity's existing password hash — no plaintext needed, no server required. */
  function ensureMyHostUser(): { db: ReturnType<typeof getHostDb>; userId: string } | { error: string } {
    const identity = getCurrentIdentity()
    if (!identity) return { error: 'Log in first.' }
    const db = getHostDb(userDataDir)
    const hostUser = new UserRepo(db).ensureWithHash(identity.displayName, identity.passwordHash)
    return { db, userId: hostUser.id }
  }

  /**
   * Runs a campaignService call on the DM's own local (non-relay) path and
   * converts both ServiceResult failures AND thrown exceptions into an
   * ApiResult. Without this, a throw from a vault-mode repo (e.g. the vault
   * folder was moved/unmounted) crashes straight out of the IPC handler as a
   * rejected promise instead of a visible error message — the same failure
   * reaches the player-facing path fine because sessionHost's dispatch()
   * already has an equivalent catch.
   */
  function runService<T>(fn: () => ServiceResult<T>): ApiResult<T> {
    try {
      const result = fn()
      return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' }
    }
  }

  ipcMain.handle(
    'campaigns:list',
    async (_event, sessionId?: string): Promise<ApiResult<Campaign[]>> => {
      if (!sessionId) {
        const me = ensureMyHostUser()
        if ('error' in me) return { ok: false, error: me.error }
        const result = campaignService.listCampaigns(me.db, me.userId)
        return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error }
      }
      const err = requireJoinedSession(sessionId)
      if (err) return err
      return sendSessionRequest<Campaign[]>('campaigns.list', {})
    }
  )

  ipcMain.handle(
    'campaigns:create',
    async (_event, name: string, sessionId?: string): Promise<ApiResult<Campaign>> => {
      if (!sessionId) {
        const me = ensureMyHostUser()
        if ('error' in me) return { ok: false, error: me.error }
        return runService(() => campaignService.createCampaign(me.db, me.userId, name))
      }
      const err = requireJoinedSession(sessionId)
      if (err) return err
      return sendSessionRequest<Campaign>('campaigns.create', { name })
    }
  )

  // DM-only, always local — you can only rename/delete your own campaign,
  // which always lives in your own host db, so there's no session-relay
  // path to mirror here (unlike list/create/join, which a joined player also
  // calls against the DM's campaign over the relay).
  ipcMain.handle('campaigns:rename', async (_event, campaignId: string, name: string): Promise<ApiResult<Campaign>> => {
    const me = ensureMyHostUser()
    if ('error' in me) return { ok: false, error: me.error }
    return runService(() => campaignService.renameCampaign(me.db, campaignId, me.userId, name))
  })

  ipcMain.handle('campaigns:delete', async (_event, campaignId: string): Promise<ApiResult<void>> => {
    const me = ensureMyHostUser()
    if ('error' in me) return { ok: false, error: me.error }
    return runService(() => campaignService.deleteCampaign(me.db, campaignId, me.userId))
  })

  ipcMain.handle(
    'campaigns:join',
    async (_event, campaignId: string, sessionId?: string): Promise<ApiResult<Campaign>> => {
      if (!sessionId) {
        const me = ensureMyHostUser()
        if ('error' in me) return { ok: false, error: me.error }
        const result = campaignService.joinCampaign(me.db, campaignId, me.userId)
        return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error }
      }
      const err = requireJoinedSession(sessionId)
      if (err) return err
      return sendSessionRequest<Campaign>('campaigns.join', { campaignId })
    }
  )

  ipcMain.handle(
    'campaigns:get-active',
    async (_event, sessionId?: string): Promise<ApiResult<Campaign | null>> => {
      if (!sessionId) {
        const me = ensureMyHostUser()
        if ('error' in me) return { ok: false, error: me.error }
        const result = campaignService.getActiveCampaign(me.db, me.userId)
        return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error }
      }
      const err = requireJoinedSession(sessionId)
      if (err) return err
      return sendSessionRequest<Campaign | null>('campaigns.getActive', {})
    }
  )

  ipcMain.handle(
    'campaigns:set-active',
    async (_event, campaignId: string, sessionId?: string): Promise<ApiResult<Campaign>> => {
      if (!sessionId) {
        const me = ensureMyHostUser()
        if ('error' in me) return { ok: false, error: me.error }
        try {
          const result = campaignService.setActiveCampaign(me.db, campaignId, me.userId)
          if (result.ok && getHostedSession()) broadcastActiveCampaignChanged()
          return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error }
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' }
        }
      }
      const err = requireJoinedSession(sessionId)
      if (err) return err
      return sendSessionRequest<Campaign>('campaigns.setActive', { campaignId })
    }
  )

  ipcMain.handle(
    'campaigns:join-active',
    async (_event, sessionId?: string): Promise<ApiResult<Campaign>> => {
      if (!sessionId) {
        const me = ensureMyHostUser()
        if ('error' in me) return { ok: false, error: me.error }
        const result = campaignService.joinActiveCampaign(me.db, me.userId)
        return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error }
      }
      const err = requireJoinedSession(sessionId)
      if (err) return err
      return sendSessionRequest<Campaign>('campaigns.joinActive', {})
    }
  )

  ipcMain.handle(
    'notes:list',
    async (_event, campaignId: string, sessionId?: string): Promise<ApiResult<Note[]>> => {
      if (!sessionId) {
        const me = ensureMyHostUser()
        if ('error' in me) return { ok: false, error: me.error }
        const result = campaignService.listNotes(me.db, campaignId, me.userId)
        return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error }
      }
      const err = requireJoinedSession(sessionId)
      if (err) return err
      return sendSessionRequest<Note[]>('notes.list', { campaignId })
    }
  )

  ipcMain.handle(
    'notes:create',
    async (
      _event,
      campaignId: string,
      input: { title: string; bodyMarkdown: string; visibility: 'dm' | 'shared' | 'private'; folderId?: string | null },
      sessionId?: string
    ): Promise<ApiResult<Note>> => {
      if (!sessionId) {
        const me = ensureMyHostUser()
        if ('error' in me) return { ok: false, error: me.error }
        try {
          const result = campaignService.createNote(me.db, campaignId, me.userId, input)
          if (result.ok && getHostedSession()) broadcastCampaignChanged(campaignId)
          return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error }
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' }
        }
      }
      const err = requireJoinedSession(sessionId)
      if (err) return err
      return sendSessionRequest<Note>('notes.create', { campaignId, input })
    }
  )

  ipcMain.handle(
    'notes:update',
    async (
      _event,
      campaignId: string,
      noteId: string,
      input: { title?: string; bodyMarkdown?: string; folderId?: string | null; visibility?: 'dm' | 'shared' | 'private' },
      sessionId?: string
    ): Promise<ApiResult<Note>> => {
      if (!sessionId) {
        const me = ensureMyHostUser()
        if ('error' in me) return { ok: false, error: me.error }
        try {
          const result = campaignService.updateNote(me.db, campaignId, noteId, me.userId, input)
          if (result.ok && getHostedSession()) broadcastCampaignChanged(campaignId)
          return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error }
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' }
        }
      }
      const err = requireJoinedSession(sessionId)
      if (err) return err
      return sendSessionRequest<Note>('notes.update', { campaignId, noteId, input })
    }
  )

  ipcMain.handle(
    'notes:remove',
    async (_event, campaignId: string, noteId: string, sessionId?: string): Promise<ApiResult<void>> => {
      if (!sessionId) {
        const me = ensureMyHostUser()
        if ('error' in me) return { ok: false, error: me.error }
        try {
          const result = campaignService.deleteNote(me.db, campaignId, noteId, me.userId)
          if (result.ok && getHostedSession()) broadcastCampaignChanged(campaignId)
          return result.ok ? { ok: true, data: undefined } : { ok: false, error: result.error }
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' }
        }
      }
      const err = requireJoinedSession(sessionId)
      if (err) return err
      return sendSessionRequest<void>('notes.remove', { campaignId, noteId })
    }
  )

  ipcMain.handle(
    'folders:list',
    async (_event, campaignId: string, sessionId?: string): Promise<ApiResult<Folder[]>> => {
      if (!sessionId) {
        const me = ensureMyHostUser()
        if ('error' in me) return { ok: false, error: me.error }
        return runService(() => campaignService.listFolders(me.db, campaignId, me.userId))
      }
      const err = requireJoinedSession(sessionId)
      if (err) return err
      return sendSessionRequest<Folder[]>('folders.list', { campaignId })
    }
  )

  ipcMain.handle(
    'folders:create',
    async (
      _event,
      campaignId: string,
      input: { name: string; visibility: 'dm' | 'shared' | 'private'; parentFolderId?: string | null },
      sessionId?: string
    ): Promise<ApiResult<Folder>> => {
      if (!sessionId) {
        const me = ensureMyHostUser()
        if ('error' in me) return { ok: false, error: me.error }
        try {
          const result = campaignService.createFolder(me.db, campaignId, me.userId, input)
          if (result.ok && getHostedSession()) broadcastCampaignChanged(campaignId)
          return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error }
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' }
        }
      }
      const err = requireJoinedSession(sessionId)
      if (err) return err
      return sendSessionRequest<Folder>('folders.create', { campaignId, input })
    }
  )

  ipcMain.handle(
    'folders:update',
    async (
      _event,
      campaignId: string,
      folderId: string,
      input: { name?: string; parentFolderId?: string | null; visibility?: 'dm' | 'shared' | 'private' },
      sessionId?: string
    ): Promise<ApiResult<Folder>> => {
      if (!sessionId) {
        const me = ensureMyHostUser()
        if ('error' in me) return { ok: false, error: me.error }
        try {
          const result = campaignService.updateFolder(me.db, campaignId, folderId, me.userId, input)
          if (result.ok && getHostedSession()) broadcastCampaignChanged(campaignId)
          return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error }
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' }
        }
      }
      const err = requireJoinedSession(sessionId)
      if (err) return err
      return sendSessionRequest<Folder>('folders.update', { campaignId, folderId, input })
    }
  )

  ipcMain.handle(
    'folders:remove',
    async (_event, campaignId: string, folderId: string, sessionId?: string): Promise<ApiResult<void>> => {
      if (!sessionId) {
        const me = ensureMyHostUser()
        if ('error' in me) return { ok: false, error: me.error }
        try {
          const result = campaignService.deleteFolder(me.db, campaignId, folderId, me.userId)
          if (result.ok && getHostedSession()) broadcastCampaignChanged(campaignId)
          return result.ok ? { ok: true, data: undefined } : { ok: false, error: result.error }
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' }
        }
      }
      const err = requireJoinedSession(sessionId)
      if (err) return err
      return sendSessionRequest<void>('folders.remove', { campaignId, folderId })
    }
  )

  // --- Characters -----------------------------------------------------
  // Entirely local — owned by the local identity, never routed over the
  // network, so no address/host concept applies here at all.
  const characterRepo = new CharacterRepo(localDb)

  function toCharacterSheet(row: CharacterRow): CharacterSheet {
    const sheet = { ...emptyCharacterSheet(), ...JSON.parse(row.sheet_json || '{}') }
    return {
      ...sheet,
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  ipcMain.handle('characters:list', (): ApiResult<CharacterSheet[]> => {
    const identity = getCurrentIdentity()
    if (!identity) return { ok: false, error: 'Log in first.' }
    return { ok: true, data: characterRepo.listByOwner(identity.id).map(toCharacterSheet) }
  })

  ipcMain.handle(
    'characters:create',
    (_event, name: string, sheet: CharacterSheetData): ApiResult<CharacterSheet> => {
      const identity = getCurrentIdentity()
      if (!identity) return { ok: false, error: 'Log in first.' }
      if (name.trim().length < 1) return { ok: false, error: 'Give your character a name.' }
      return {
        ok: true,
        data: toCharacterSheet(characterRepo.create(identity.id, name.trim(), sheet))
      }
    }
  )

  ipcMain.handle(
    'characters:update',
    (
      _event,
      id: string,
      input: Partial<CharacterSheetData> & { name?: string }
    ): ApiResult<CharacterSheet> => {
      const identity = getCurrentIdentity()
      if (!identity) return { ok: false, error: 'Log in first.' }
      const updated = characterRepo.update(id, identity.id, input)
      if (!updated) return { ok: false, error: 'Character not found.' }
      return { ok: true, data: toCharacterSheet(updated) }
    }
  )

  ipcMain.handle('characters:remove', (_event, id: string): ApiResult<void> => {
    const identity = getCurrentIdentity()
    if (!identity) return { ok: false, error: 'Log in first.' }
    const removed = characterRepo.remove(id, identity.id)
    if (!removed) return { ok: false, error: 'Character not found.' }
    return { ok: true, data: undefined }
  })

  ipcMain.handle(
    'characters:sync-selected',
    (_event, sessionId: string, character: CharacterSheet | null): void => {
      if (getHostedSession()?.sessionId === sessionId) return // nothing to sync to yourself
      void sendSessionRequest('characters.sync', { character })
    }
  )

  /** A player fetching another connected party member's currently-selected character — a one-off snapshot (see the matching case in sessionHost.ts for why it's not a live subscription), used by PartySidebar's "view sheet" action. */
  ipcMain.handle(
    'characters:get-player-character',
    async (_event, userId: string): Promise<ApiResult<CharacterSheet | null>> => {
      return sendSessionRequest<CharacterSheet | null>('characters.getPlayerCharacter', { userId })
    }
  )

  // --- Offline campaign snapshots ---------------------------------------
  // A read-only local cache of a joined campaign's notes/folders, written
  // through every time the player successfully syncs while connected (see
  // usePlayerWorkspace.ts) — lets the campaign stay browsable when the DM
  // isn't currently hosting.
  const snapshotRepo = new SnapshotRepo(localDb)

  ipcMain.handle('snapshots:list', (): ApiResult<CampaignSnapshot[]> => {
    const identity = getCurrentIdentity()
    if (!identity) return { ok: false, error: 'Log in first.' }
    return { ok: true, data: snapshotRepo.list(identity.id) }
  })

  ipcMain.handle('snapshots:get', (_event, campaignId: string): ApiResult<CampaignSnapshot | null> => {
    const identity = getCurrentIdentity()
    if (!identity) return { ok: false, error: 'Log in first.' }
    return { ok: true, data: snapshotRepo.get(identity.id, campaignId) ?? null }
  })

  ipcMain.handle(
    'snapshots:save',
    (_event, campaign: Campaign, notes: Note[], folders: Folder[]): void => {
      const identity = getCurrentIdentity()
      if (!identity) return
      snapshotRepo.save(identity.id, campaign, notes, folders)
    }
  )

  // --- Presence ---------------------------------------------------------
  // sessionId tells us which of the two roles this call is: the DM viewing
  // their own hosted session (handled entirely in-process, no network) or a
  // player who joined someone else's (forwarded over the relay socket).
  ipcMain.handle('presence:subscribe', (_event, sessionId: string, campaignId: string): void => {
    if (getHostedSession()?.sessionId === sessionId) {
      subscribeDmPresence(campaignId, mainWindow)
    } else {
      void sendSessionRequest('presence.subscribe', { campaignId })
    }
  })

  ipcMain.handle(
    'presence:select-character',
    (_event, sessionId: string, characterName: string | null): void => {
      if (getHostedSession()?.sessionId === sessionId) {
        // The DM doesn't announce a "selected character" for their own view —
        // presence.subscribe already drives what ConnectedPlayersList shows.
        return
      }
      void sendSessionRequest('presence.selectCharacter', { characterName })
    }
  )

  // --- Initiative tracker -------------------------------------------------
  // DM-only, fire-and-forget — the tracker's canonical state lives in the
  // DM's renderer (InitiativeTracker.tsx), this just pushes it out to every
  // connected player whenever it changes. A no-op while not hosting (a
  // solo DM still uses the tracker locally without an audience).
  ipcMain.handle('initiative:broadcast', (_event, state: InitiativeState): void => {
    if (getHostedSession()) broadcastInitiative(state)
  })

  // Player-only — a joined player rolling/entering their own initiative,
  // forwarded to the DM's renderer (see sessionHost.ts's 'initiative.setMine'
  // case) rather than back through this same player's own IPC, since the DM
  // is the one who actually owns the tracker's combatant list.
  ipcMain.handle('initiative:set-mine', (_event, initiative: number | null): void => {
    void sendSessionRequest('initiative.setMine', { initiative })
  })

  // --- Relay / Friends -----------------------------------------------------
  // The relay account is the same identity/password as identity.* (synced
  // transparently in syncRelayAccount, see the identity handlers above) — no
  // separate relay login/register surface here, just friend graph + presence.
  ipcMain.handle('relay:status', () => getRelayStatus())

  ipcMain.handle('relay:my-user-id', () => getRelaySession()?.userId ?? null)

  ipcMain.handle('relay:friends:list', async (): Promise<ApiResult<FriendSummary[]>> => {
    const session = getRelaySession()
    if (!session) return { ok: false, error: 'Not connected to the relay.' }
    const result = await relayClient.getFriends(session.token)
    if (!result.ok) return result
    return {
      ok: true,
      data: result.data.friends.map((friend) => ({
        ...friend,
        online: isFriendOnline(friend.userId),
        hostingSessionId: getFriendHostingSessionId(friend.userId)
      }))
    }
  })

  ipcMain.handle('relay:friends:list-requests', async (): Promise<ApiResult<FriendRequest[]>> => {
    const session = getRelaySession()
    if (!session) return { ok: false, error: 'Not connected to the relay.' }
    const result = await relayClient.getFriends(session.token)
    if (!result.ok) return result
    return { ok: true, data: result.data.incomingRequests }
  })

  ipcMain.handle(
    'relay:friends:send-request',
    async (_event, username: string): Promise<ApiResult<{ status: 'requested' | 'accepted' }>> => {
      const session = getRelaySession()
      if (!session) return { ok: false, error: 'Not connected to the relay.' }
      const result = await relayClient.sendFriendRequest(session.token, username)
      if (!result.ok) return result
      return { ok: true, data: { status: result.data.status } }
    }
  )

  ipcMain.handle('relay:friends:accept', async (_event, userId: string): Promise<ApiResult<void>> => {
    const session = getRelaySession()
    if (!session) return { ok: false, error: 'Not connected to the relay.' }
    const result = await relayClient.respondToRequest(session.token, userId, true)
    if (!result.ok) return result
    queryOnline([userId])
    return { ok: true, data: undefined }
  })

  ipcMain.handle('relay:friends:decline', async (_event, userId: string): Promise<ApiResult<void>> => {
    const session = getRelaySession()
    if (!session) return { ok: false, error: 'Not connected to the relay.' }
    const result = await relayClient.respondToRequest(session.token, userId, false)
    if (!result.ok) return result
    return { ok: true, data: undefined }
  })

  ipcMain.handle('relay:friends:remove', async (_event, userId: string): Promise<ApiResult<void>> => {
    const session = getRelaySession()
    if (!session) return { ok: false, error: 'Not connected to the relay.' }
    const result = await relayClient.removeFriend(session.token, userId)
    if (!result.ok) return result
    return { ok: true, data: undefined }
  })

  ipcMain.handle('relay:notifications:list', async (): Promise<ApiResult<RelayNotification[]>> => {
    const session = getRelaySession()
    if (!session) return { ok: false, error: 'Not connected to the relay.' }
    return relayClient.getNotifications(session.token)
  })

  ipcMain.handle('relay:notifications:mark-read', async (_event, id: string): Promise<ApiResult<void>> => {
    const session = getRelaySession()
    if (!session) return { ok: false, error: 'Not connected to the relay.' }
    const result = await relayClient.markNotificationRead(session.token, id)
    if (!result.ok) return result
    return { ok: true, data: undefined }
  })

  ipcMain.handle('relay:admin:list-accounts', async (): Promise<ApiResult<AdminAccountSummary[]>> => {
    const session = getRelaySession()
    if (!session) return { ok: false, error: 'Not connected to the relay.' }
    return relayClient.adminListAccounts(session.token)
  })

  ipcMain.handle('relay:admin:remove-account', async (_event, userId: string): Promise<ApiResult<void>> => {
    const session = getRelaySession()
    if (!session) return { ok: false, error: 'Not connected to the relay.' }
    const result = await relayClient.adminRemoveAccount(session.token, userId)
    if (!result.ok) return result
    return { ok: true, data: undefined }
  })

  ipcMain.handle(
    'relay:admin:update-account',
    async (
      _event,
      userId: string,
      input: { username?: string; newPassword?: string }
    ): Promise<ApiResult<{ username: string }>> => {
      const session = getRelaySession()
      if (!session) return { ok: false, error: 'Not connected to the relay.' }
      const result = await relayClient.adminUpdateAccount(session.token, userId, input)
      if (!result.ok) return result
      return { ok: true, data: { username: result.data.username } }
    }
  )

  // --- Files --------------------------------------------------------------
  // Images are embedded as base64 data URIs directly in a note's markdown
  // rather than stored/served separately — notes already sync to remote
  // players as plain text via the existing notes API, so a data URI just
  // works there for free, with no new storage layer or endpoint needed.
  // Caps out at a few MB so one image doesn't blow up a note's row size.
  const MAX_IMAGE_BYTES = 8 * 1024 * 1024
  const IMAGE_MIME_BY_EXT: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml'
  }

  ipcMain.handle(
    'files:pick-image',
    async (): Promise<ApiResult<{ dataUrl: string; fileName: string }>> => {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Insert image',
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: Object.keys(IMAGE_MIME_BY_EXT) }]
      })
      // A native dialog attached to a frameless/custom-titlebar window can
      // leave -webkit-app-region drag hit-testing stuck broken on Windows
      // once it closes, until the window is explicitly refocused.
      mainWindow.focus()
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, error: 'Cancelled.' }
      }
      const filePath = result.filePaths[0]
      const mime = IMAGE_MIME_BY_EXT[extname(filePath).slice(1).toLowerCase()]
      if (!mime) return { ok: false, error: 'Unsupported image type.' }
      try {
        const buffer = await readFile(filePath)
        if (buffer.byteLength > MAX_IMAGE_BYTES) {
          return { ok: false, error: 'That image is too large (max 8 MB) — try a smaller file.' }
        }
        const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`
        return { ok: true, data: { dataUrl, fileName: basename(filePath) } }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Could not read that file.' }
      }
    }
  )

  ipcMain.handle('files:get-vault-path', (): string | null => getVaultPath())

  // Opting into local file storage: pick a folder, then copy every existing
  // SQLite campaign into it as files (see migration.ts). Safe to run more
  // than once — already-migrated campaigns are skipped — and never deletes
  // the SQLite data, so choosing a different folder later doesn't lose
  // anything that was only ever in the old one.
  ipcMain.handle(
    'files:choose-vault-folder',
    async (): Promise<ApiResult<{ vaultPath: string; migrated: { campaigns: number; notes: number; folders: number } }>> => {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Choose a folder for your notes',
        properties: ['openDirectory', 'createDirectory']
      })
      mainWindow.focus()
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, error: 'Cancelled.' }
      }
      const vaultPath = result.filePaths[0]
      setVaultPath(vaultPath)
      startVaultWatcher(mainWindow)
      try {
        const migrated = migrateSqliteCampaignsToVault(getHostDb(userDataDir))
        return { ok: true, data: { vaultPath, migrated } }
      } catch (err) {
        // The folder is still set even if migration hit an error partway —
        // whatever did copy over is real, safely-skippable-on-retry data,
        // not a reason to silently fall back to SQLite mode.
        return { ok: false, error: err instanceof Error ? err.message : 'Could not migrate your existing campaigns.' }
      }
    }
  )

  // --- Window controls ----------------------------------------------------
  // Hand-rolled minimize/maximize/close since the window is frame:false —
  // see the comment in main/index.ts for why (native titleBarOverlay's drag
  // hit-testing was unreliable).
  ipcMain.handle('window:minimize', () => {
    mainWindow.minimize()
  })
  ipcMain.handle('window:toggle-maximize', () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.handle('window:close', () => {
    mainWindow.close()
  })
  ipcMain.handle('window:is-maximized', () => mainWindow.isMaximized())
  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized-changed', true))
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized-changed', false))
}
