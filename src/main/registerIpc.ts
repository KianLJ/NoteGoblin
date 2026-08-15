import { app, ipcMain } from 'electron'
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
import { getLocalAddresses } from '@server/net/localAddresses'
import { encodeInviteCode, decodeInviteCode } from '@server/net/inviteCode'
import * as campaignClient from '@server/net/campaignClient'
import * as campaignService from '@server/services/campaignService'
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
  Note
} from '@shared/ipc'

/** Every network-reachable (non-loopback) address this machine has, each with an invite code baked for it. Loopback is left out — it's only useful to the host's own process, never to a joining player. */
function buildAddressOptions(handle: HostServerHandle): HostAddressOption[] {
  return getLocalAddresses().map(({ ip, kind }) => {
    const address = `${ip}:${handle.port}`
    return { address, kind, inviteCode: encodeInviteCode(address, handle.fingerprint) }
  })
}

export function registerIpcHandlers(): void {
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
      return { ok: false, error: err instanceof Error ? err.message : 'Could not reach that address.' }
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
        knownHostRepo.upsert({
          address,
          label: label?.trim() || existingLabel || address,
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
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not connect to that host.'
        }
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
      input: { title: string; bodyMarkdown: string; visibility: 'dm' | 'shared' },
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
      input: { title?: string; bodyMarkdown?: string },
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
}
