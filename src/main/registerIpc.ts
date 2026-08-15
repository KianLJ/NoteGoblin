import { app, ipcMain, type BrowserWindow } from 'electron'
import { getLocalDb } from '@server/db/localDb'
import { getHostDb } from '@server/db/hostDb'
import { IdentityRepo } from '@server/repositories/identityRepo'
import { UserRepo } from '@server/repositories/userRepo'
import { KnownHostRepo } from '@server/repositories/knownHostRepo'
import { getOrCreateHostCertificate } from '@server/tls/certStore'
import { getOrCreateSessionSecret } from '@server/auth/sessionSecret'
import { signToken } from '@server/auth/token'
import { startHostServer, DEFAULT_HOST_PORT, type HostServerHandle } from '@server/hostServer'
import { probeAddress, authenticateWithHost } from '@server/net/connectToHost'
import { friendlyConnectionError } from '@server/net/friendlyConnectionError'
import { getLocalAddresses } from '@server/net/localAddresses'
import { encodeInviteCode, decodeInviteCode } from '@server/net/inviteCode'
import * as campaignClient from '@server/net/campaignClient'
import * as campaignService from '@server/services/campaignService'
import { CharacterRepo, type CharacterRow } from '@server/repositories/characterRepo'
import { subscribeToCampaign, announceSelectedCharacter } from './wsClient'
import {
  hasRememberedCredentials,
  loadRememberedCredentials,
  saveRememberedCredentials,
  clearRememberedCredentials
} from './rememberedCredentials'
import {
  getCurrentIdentity,
  setCurrentIdentity,
  getHostServerHandle,
  setHostServerHandle,
  getActiveConnection,
  setActiveConnection,
  type ActiveConnection
} from './appState'
import type {
  Identity,
  LoginResult,
  HostingStartResult,
  HostingStatus,
  HostAddressOption,
  ProbeResult,
  JoinResult,
  KnownHostSummary,
  DecodeInviteResult,
  ApiResult,
  Campaign,
  Note,
  Folder,
  CharacterSheet
} from '@shared/ipc'

/** Every network-reachable (non-loopback) address this machine has, each with an invite code baked for it. Loopback is left out — it's only useful to the host's own process, never to a joining player. */
function buildAddressOptions(handle: HostServerHandle): HostAddressOption[] {
  return getLocalAddresses().map(({ ip, kind }) => {
    const address = `${ip}:${handle.port}`
    return { address, kind, inviteCode: encodeInviteCode(address, handle.fingerprint) }
  })
}

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  const userDataDir = app.getPath('userData')
  const localDb = getLocalDb(userDataDir)
  const identityRepo = new IdentityRepo(localDb)
  const knownHostRepo = new KnownHostRepo(localDb)

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
      return { ok: true, identity }
    }
  )

  ipcMain.handle('identity:get-current', (): Identity | null => {
    const identity = getCurrentIdentity()
    return identity ? { id: identity.id, displayName: identity.displayName } : null
  })

  ipcMain.handle(
    'identity:update-display-name',
    (_event, newDisplayName: string): LoginResult => {
      const identity = getCurrentIdentity()
      if (!identity) return { ok: false, error: 'Log in first.' }
      const trimmed = newDisplayName.trim()
      if (trimmed.length < 2) return { ok: false, error: 'Pick a display name with at least 2 characters.' }
      try {
        identityRepo.rename(identity.id, trimmed)
        setCurrentIdentity({ ...identity, displayName: trimmed })
        // Keep any saved "remember me" credentials pointing at the new name.
        if (hasRememberedCredentials(userDataDir)) {
          saveRememberedCredentials(userDataDir, trimmed, identity.password)
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
      if (hasRememberedCredentials(userDataDir)) {
        saveRememberedCredentials(userDataDir, identity.displayName, newPassword)
      }
      return { ok: true, identity: { id: identity.id, displayName: identity.displayName } }
    }
  )

  ipcMain.handle('identity:has-remembered', () => hasRememberedCredentials(userDataDir))

  ipcMain.handle('identity:auto-login', async (): Promise<LoginResult> => {
    const stored = loadRememberedCredentials(userDataDir)
    if (!stored) return { ok: false, error: 'No saved login.' }
    const identity = await identityRepo.verify(stored.displayName, stored.password)
    if (!identity) return { ok: false, error: 'Saved login no longer works — please log in again.' }
    setCurrentIdentity({
      ...identity,
      passwordHash: identityRepo.findByDisplayName(identity.displayName)!.password_hash,
      password: stored.password
    })
    return { ok: true, identity }
  })

  ipcMain.handle(
    'identity:remember',
    (_event, remember: boolean): { ok: true } | { ok: false; error: string } => {
      const identity = getCurrentIdentity()
      if (!remember) {
        clearRememberedCredentials(userDataDir)
        return { ok: true }
      }
      if (!identity) return { ok: false, error: 'Log in first.' }
      try {
        saveRememberedCredentials(userDataDir, identity.displayName, identity.password)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Could not save login.' }
      }
    }
  )

  // --- Hosting ----------------------------------------------------------
  ipcMain.handle('hosting:start', async (): Promise<HostingStartResult> => {
    const identity = getCurrentIdentity()
    if (!identity) return { ok: false, error: 'Log in first.' }

    const existing = getHostServerHandle()
    if (existing) {
      return { ok: true, fingerprint: existing.fingerprint, addresses: buildAddressOptions(existing) }
    }

    const hostDb = getHostDb(userDataDir)
    const cert = getOrCreateHostCertificate(userDataDir)
    const sessionSecret = getOrCreateSessionSecret(userDataDir)

    let handle
    try {
      handle = await startHostServer({
        db: hostDb,
        cert: cert.cert,
        key: cert.key,
        fingerprint: cert.fingerprint,
        sessionSecret
      })
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code
      const error =
        code === 'EADDRINUSE'
          ? `Port ${DEFAULT_HOST_PORT} is already in use — close whatever else is using it (or another NoteGoblin instance) and try again.`
          : err instanceof Error
            ? err.message
            : 'Could not start hosting.'
      return { ok: false, error }
    }
    setHostServerHandle(handle)

    const hostUserRepo = new UserRepo(hostDb)
    const hostUser = hostUserRepo.ensureWithHash(identity.displayName, identity.passwordHash)
    const token = signToken(sessionSecret, hostUser.id)
    setActiveConnection({
      address: `127.0.0.1:${handle.port}`,
      token,
      userId: hostUser.id,
      certPem: cert.cert
    })

    return { ok: true, fingerprint: handle.fingerprint, addresses: buildAddressOptions(handle) }
  })

  ipcMain.handle('hosting:stop', async (): Promise<void> => {
    const handle = getHostServerHandle()
    if (!handle) return
    await handle.close()
    setHostServerHandle(null)
  })

  ipcMain.handle('hosting:status', (): HostingStatus => {
    const handle = getHostServerHandle()
    if (!handle) return { hosting: false }
    return { hosting: true, fingerprint: handle.fingerprint, addresses: buildAddressOptions(handle) }
  })

  ipcMain.handle('hosting:self-address', (): string | null => {
    const handle = getHostServerHandle()
    return handle ? `127.0.0.1:${handle.port}` : null
  })

  // --- Joining other hosts ----------------------------------------------
  ipcMain.handle('connections:probe', async (_event, address: string): Promise<ProbeResult> => {
    try {
      const probed = await probeAddress(address)
      const known = knownHostRepo.findByAddress(address)
      if (!known) return { ok: true, fingerprint: probed.fingerprint, status: 'new' }
      if (known.certFingerprint === probed.fingerprint) {
        return { ok: true, fingerprint: probed.fingerprint, status: 'match' }
      }
      return {
        ok: true,
        fingerprint: probed.fingerprint,
        status: 'mismatch',
        previousFingerprint: known.certFingerprint
      }
    } catch (err) {
      return { ok: false, error: friendlyConnectionError(err) }
    }
  })

  ipcMain.handle(
    'connections:join',
    async (_event, address: string, label?: string): Promise<JoinResult> => {
      const identity = getCurrentIdentity()
      if (!identity) return { ok: false, error: 'Log in first.' }

      try {
        const probed = await probeAddress(address)
        const auth = await authenticateWithHost(
          address,
          probed.certPem,
          identity.displayName,
          identity.password
        )
        if (!auth.ok) return { ok: false, error: auth.error }

        const existingLabel = knownHostRepo.findByAddress(address)?.label
        // A raw IP:port is meaningless to remember by — default to whichever
        // DM's table this is instead. Only computed the first time a host is
        // seen; an existing (auto- or user-set) label always wins after that.
        let defaultLabel = address
        if (!label?.trim() && !existingLabel) {
          const campaignsResult = await campaignClient.listCampaigns(address, probed.certPem, auth.token)
          const dmName = campaignsResult.ok ? campaignsResult.data.campaigns[0]?.dmDisplayName : undefined
          if (dmName) defaultLabel = `${dmName}'s Table`
        }
        knownHostRepo.upsert({
          address,
          label: label?.trim() || existingLabel || defaultLabel,
          certFingerprint: probed.fingerprint,
          certPem: probed.certPem
        })
        setActiveConnection({
          address,
          token: auth.token,
          userId: auth.userId,
          certPem: probed.certPem
        })

        return { ok: true, address, fingerprint: probed.fingerprint }
      } catch (err) {
        return { ok: false, error: friendlyConnectionError(err) }
      }
    }
  )

  ipcMain.handle('connections:list', (): KnownHostSummary[] => {
    return knownHostRepo.list().map((host) => ({
      address: host.address,
      label: host.label,
      certFingerprint: host.certFingerprint,
      lastConnectedAt: host.lastConnectedAt
    }))
  })

  ipcMain.handle('connections:forget', (_event, address: string): void => {
    knownHostRepo.remove(address)
  })

  ipcMain.handle('connections:decode-invite', (_event, code: string): DecodeInviteResult => {
    const decoded = decodeInviteCode(code)
    if (!decoded) return { ok: false, error: "That doesn't look like a valid invite code." }
    return { ok: true, ...decoded }
  })

  // --- Campaigns & notes --------------------------------------------------
  // Two ways to reach the same data: pass an `address` to go over the network
  // (a player reaching some host, or the DM reaching their own server while
  // it happens to be running), or omit it to work directly against the DM's
  // own host database in-process — no network, no hosting required, so
  // solo campaign prep doesn't depend on anyone being connected.
  function requireConnection(address: string): ActiveConnection | { error: string } {
    const connection = getActiveConnection(address)
    return connection ?? { error: 'Not connected to that host.' }
  }

  /** The DM's own host-side account, ensured (not necessarily hosting) from their local identity's existing password hash — no plaintext needed, no server required. */
  function ensureMyHostUser(): { db: ReturnType<typeof getHostDb>; userId: string } | { error: string } {
    const identity = getCurrentIdentity()
    if (!identity) return { error: 'Log in first.' }
    const db = getHostDb(userDataDir)
    const hostUser = new UserRepo(db).ensureWithHash(identity.displayName, identity.passwordHash)
    return { db, userId: hostUser.id }
  }

  ipcMain.handle(
    'campaigns:list',
    async (_event, address?: string): Promise<ApiResult<Campaign[]>> => {
      if (!address) {
        const me = ensureMyHostUser()
        if ('error' in me) return { ok: false, error: me.error }
        const result = campaignService.listCampaigns(me.db, me.userId)
        return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error }
      }
      const conn = requireConnection(address)
      if ('error' in conn) return { ok: false, error: conn.error }
      const result = await campaignClient.listCampaigns(address, conn.certPem, conn.token)
      if (!result.ok) return { ok: false, error: result.error }
      return { ok: true, data: result.data.campaigns }
    }
  )

  ipcMain.handle(
    'campaigns:create',
    async (_event, name: string, address?: string): Promise<ApiResult<Campaign>> => {
      if (!address) {
        const me = ensureMyHostUser()
        if ('error' in me) return { ok: false, error: me.error }
        const result = campaignService.createCampaign(me.db, me.userId, name)
        return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error }
      }
      const conn = requireConnection(address)
      if ('error' in conn) return { ok: false, error: conn.error }
      const result = await campaignClient.createCampaign(address, conn.certPem, conn.token, name)
      if (!result.ok) return { ok: false, error: result.error }
      return { ok: true, data: result.data.campaign }
    }
  )

  ipcMain.handle(
    'campaigns:join',
    async (_event, campaignId: string, address?: string): Promise<ApiResult<Campaign>> => {
      if (!address) {
        const me = ensureMyHostUser()
        if ('error' in me) return { ok: false, error: me.error }
        const result = campaignService.joinCampaign(me.db, campaignId, me.userId)
        return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error }
      }
      const conn = requireConnection(address)
      if ('error' in conn) return { ok: false, error: conn.error }
      const result = await campaignClient.joinCampaign(address, conn.certPem, conn.token, campaignId)
      if (!result.ok) return { ok: false, error: result.error }
      return { ok: true, data: result.data.campaign }
    }
  )

  ipcMain.handle(
    'notes:list',
    async (_event, campaignId: string, address?: string): Promise<ApiResult<Note[]>> => {
      if (!address) {
        const me = ensureMyHostUser()
        if ('error' in me) return { ok: false, error: me.error }
        const result = campaignService.listNotes(me.db, campaignId, me.userId)
        return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error }
      }
      const conn = requireConnection(address)
      if ('error' in conn) return { ok: false, error: conn.error }
      const result = await campaignClient.listNotes(address, conn.certPem, conn.token, campaignId)
      if (!result.ok) return { ok: false, error: result.error }
      return { ok: true, data: result.data.notes }
    }
  )

  ipcMain.handle(
    'notes:create',
    async (
      _event,
      campaignId: string,
      input: { title: string; bodyMarkdown: string; visibility: 'dm' | 'shared'; folderId?: string | null },
      address?: string
    ): Promise<ApiResult<Note>> => {
      if (!address) {
        const me = ensureMyHostUser()
        if ('error' in me) return { ok: false, error: me.error }
        const result = campaignService.createNote(me.db, campaignId, me.userId, input)
        return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error }
      }
      const conn = requireConnection(address)
      if ('error' in conn) return { ok: false, error: conn.error }
      const result = await campaignClient.createNote(
        address,
        conn.certPem,
        conn.token,
        campaignId,
        input
      )
      if (!result.ok) return { ok: false, error: result.error }
      return { ok: true, data: result.data.note }
    }
  )

  ipcMain.handle(
    'notes:update',
    async (
      _event,
      campaignId: string,
      noteId: string,
      input: { title?: string; bodyMarkdown?: string; folderId?: string | null; visibility?: 'dm' | 'shared' },
      address?: string
    ): Promise<ApiResult<Note>> => {
      if (!address) {
        const me = ensureMyHostUser()
        if ('error' in me) return { ok: false, error: me.error }
        const result = campaignService.updateNote(me.db, campaignId, noteId, me.userId, input)
        return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error }
      }
      const conn = requireConnection(address)
      if ('error' in conn) return { ok: false, error: conn.error }
      const result = await campaignClient.updateNote(
        address,
        conn.certPem,
        conn.token,
        campaignId,
        noteId,
        input
      )
      if (!result.ok) return { ok: false, error: result.error }
      return { ok: true, data: result.data.note }
    }
  )

  ipcMain.handle(
    'notes:remove',
    async (_event, campaignId: string, noteId: string, address?: string): Promise<ApiResult<void>> => {
      if (!address) {
        const me = ensureMyHostUser()
        if ('error' in me) return { ok: false, error: me.error }
        const result = campaignService.deleteNote(me.db, campaignId, noteId, me.userId)
        return result.ok ? { ok: true, data: undefined } : { ok: false, error: result.error }
      }
      const conn = requireConnection(address)
      if ('error' in conn) return { ok: false, error: conn.error }
      const result = await campaignClient.deleteNote(address, conn.certPem, conn.token, campaignId, noteId)
      if (!result.ok) return { ok: false, error: result.error }
      return { ok: true, data: undefined }
    }
  )

  ipcMain.handle(
    'folders:list',
    async (_event, campaignId: string, address?: string): Promise<ApiResult<Folder[]>> => {
      if (!address) {
        const me = ensureMyHostUser()
        if ('error' in me) return { ok: false, error: me.error }
        const result = campaignService.listFolders(me.db, campaignId, me.userId)
        return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error }
      }
      const conn = requireConnection(address)
      if ('error' in conn) return { ok: false, error: conn.error }
      const result = await campaignClient.listFolders(address, conn.certPem, conn.token, campaignId)
      if (!result.ok) return { ok: false, error: result.error }
      return { ok: true, data: result.data.folders }
    }
  )

  ipcMain.handle(
    'folders:create',
    async (
      _event,
      campaignId: string,
      input: { name: string; visibility: 'dm' | 'shared'; parentFolderId?: string | null },
      address?: string
    ): Promise<ApiResult<Folder>> => {
      if (!address) {
        const me = ensureMyHostUser()
        if ('error' in me) return { ok: false, error: me.error }
        const result = campaignService.createFolder(me.db, campaignId, me.userId, input)
        return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error }
      }
      const conn = requireConnection(address)
      if ('error' in conn) return { ok: false, error: conn.error }
      const result = await campaignClient.createFolder(
        address,
        conn.certPem,
        conn.token,
        campaignId,
        input
      )
      if (!result.ok) return { ok: false, error: result.error }
      return { ok: true, data: result.data.folder }
    }
  )

  ipcMain.handle(
    'folders:update',
    async (
      _event,
      campaignId: string,
      folderId: string,
      input: { name?: string; parentFolderId?: string | null; visibility?: 'dm' | 'shared' },
      address?: string
    ): Promise<ApiResult<Folder>> => {
      if (!address) {
        const me = ensureMyHostUser()
        if ('error' in me) return { ok: false, error: me.error }
        const result = campaignService.updateFolder(me.db, campaignId, folderId, me.userId, input)
        return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error }
      }
      const conn = requireConnection(address)
      if ('error' in conn) return { ok: false, error: conn.error }
      const result = await campaignClient.updateFolder(
        address,
        conn.certPem,
        conn.token,
        campaignId,
        folderId,
        input
      )
      if (!result.ok) return { ok: false, error: result.error }
      return { ok: true, data: result.data.folder }
    }
  )

  ipcMain.handle(
    'folders:remove',
    async (_event, campaignId: string, folderId: string, address?: string): Promise<ApiResult<void>> => {
      if (!address) {
        const me = ensureMyHostUser()
        if ('error' in me) return { ok: false, error: me.error }
        const result = campaignService.deleteFolder(me.db, campaignId, folderId, me.userId)
        return result.ok ? { ok: true, data: undefined } : { ok: false, error: result.error }
      }
      const conn = requireConnection(address)
      if ('error' in conn) return { ok: false, error: conn.error }
      const result = await campaignClient.deleteFolder(address, conn.certPem, conn.token, campaignId, folderId)
      if (!result.ok) return { ok: false, error: result.error }
      return { ok: true, data: undefined }
    }
  )

  // --- Characters -----------------------------------------------------
  // Entirely local — owned by the local identity, never routed over the
  // network, so no address/host concept applies here at all.
  const characterRepo = new CharacterRepo(localDb)

  function toCharacterSheet(row: CharacterRow): CharacterSheet {
    const sheet = JSON.parse(row.sheet_json || '{}') as { notes?: string }
    return {
      id: row.id,
      name: row.name,
      notes: sheet.notes ?? '',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  ipcMain.handle('characters:list', (): ApiResult<CharacterSheet[]> => {
    const identity = getCurrentIdentity()
    if (!identity) return { ok: false, error: 'Log in first.' }
    return { ok: true, data: characterRepo.listByOwner(identity.id).map(toCharacterSheet) }
  })

  ipcMain.handle('characters:create', (_event, name: string): ApiResult<CharacterSheet> => {
    const identity = getCurrentIdentity()
    if (!identity) return { ok: false, error: 'Log in first.' }
    if (name.trim().length < 1) return { ok: false, error: 'Give your character a name.' }
    return { ok: true, data: toCharacterSheet(characterRepo.create(identity.id, name.trim())) }
  })

  ipcMain.handle(
    'characters:update',
    (_event, id: string, input: { name?: string; notes?: string }): ApiResult<CharacterSheet> => {
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

  // --- Presence ---------------------------------------------------------
  ipcMain.handle('presence:subscribe', (_event, address: string, campaignId: string): void => {
    subscribeToCampaign(address, campaignId, mainWindow)
  })

  ipcMain.handle(
    'presence:select-character',
    (_event, address: string, characterName: string | null): void => {
      announceSelectedCharacter(address, characterName)
    }
  )
}
