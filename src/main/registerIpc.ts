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
import {
  getCurrentIdentity,
  setCurrentIdentity,
  getHostServerHandle,
  setHostServerHandle,
  setActiveConnection
} from './appState'
import type {
  LoginResult,
  HostingStartResult,
  HostingStatus,
  HostAddressOption,
  ProbeResult,
  JoinResult,
  KnownHostSummary,
  DecodeInviteResult
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
}
