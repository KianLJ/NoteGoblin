import type { BrowserWindow } from 'electron'
import * as relayClient from '@server/relay/relayClient'
import { setRelaySession, setRelayStatus } from './relayState'
import { connectPresence, disconnectPresence } from './relaySocket'

/**
 * Transparently keeps the relay account in sync with whichever local device
 * identity is current — same "single combined login" pattern
 * authenticateWithHost.ts uses for joining other hosts: try login, register
 * on first use. Fire-and-forget: a relay outage must never block local
 * identity login, so callers don't await this.
 */
export async function syncRelayAccount(displayName: string, password: string, window: BrowserWindow): Promise<void> {
  const username = displayName.trim()
  if (username.length < 3 || password.length < 8) {
    // Relay accounts have stricter minimums than local identities always
    // guarantee — friends/presence just stay unavailable for this identity.
    disconnectPresence()
    setRelaySession(null)
    window.webContents.send('relay:friends-changed')
    return
  }

  setRelayStatus('connecting')
  const login = await relayClient.login(username, password)
  if (login.ok) {
    setRelaySession({ userId: login.data.userId, username: login.data.username, token: login.data.token })
    connectPresence(login.data.token, window)
    return
  }

  const register = await relayClient.register(username, password)
  if (register.ok) {
    setRelaySession({ userId: register.data.userId, username: register.data.username, token: register.data.token })
    connectPresence(register.data.token, window)
    return
  }

  // Relay unreachable, or this username is taken by a different password
  // elsewhere on the relay (e.g. someone else already has this display
  // name) — friends/presence just stay unavailable, local identity is unaffected.
  disconnectPresence()
  setRelaySession(null)
  window.webContents.send('relay:friends-changed')
}

/**
 * Called specifically when the local password changes — logs in under the
 * OLD password (still valid on the relay) to get an authenticated token,
 * then uses that to update the relay account's password directly, rather
 * than syncRelayAccount's generic login-then-register — which would fail
 * both ways here: login with the new password doesn't match yet, and
 * register fails since the username's already taken by this same account.
 * Falls back to a normal sync if the old password didn't match on the relay
 * either (e.g. it was already out of sync for some other reason).
 */
export async function changeRelayPassword(
  displayName: string,
  oldPassword: string,
  newPassword: string,
  window: BrowserWindow
): Promise<void> {
  const username = displayName.trim()
  if (username.length < 3 || newPassword.length < 8) {
    return syncRelayAccount(displayName, newPassword, window)
  }

  setRelayStatus('connecting')
  const login = await relayClient.login(username, oldPassword)
  if (!login.ok) {
    return syncRelayAccount(displayName, newPassword, window)
  }

  const changed = await relayClient.changePassword(login.data.token, newPassword)
  if (!changed.ok) {
    return syncRelayAccount(displayName, newPassword, window)
  }

  // The token itself only signs userId, not the password — still valid
  // after the change, no need to re-authenticate.
  setRelaySession({ userId: login.data.userId, username: login.data.username, token: login.data.token })
  connectPresence(login.data.token, window)
}

export function clearRelaySession(): void {
  disconnectPresence()
  setRelaySession(null)
}
