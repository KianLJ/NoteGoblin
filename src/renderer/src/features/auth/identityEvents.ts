import type { Identity } from '@shared/ipc'

/**
 * Tiny pub-sub so the account switcher (buried in AccountSettingsButton,
 * several components below AppShell) can tell App.tsx "the active identity
 * changed" without threading a callback down through AppShell ->
 * CampaignWorkspace/PlayerWorkspaceBody -> footer -> here. App.tsx swapping
 * its identity state (and re-keying AppShell by identity.id) is what
 * actually resets all the per-identity workspace/campaign/connection state.
 */
type Listener = (identity: Identity) => void
const listeners = new Set<Listener>()

export function onIdentitySwitched(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function emitIdentitySwitched(identity: Identity): void {
  listeners.forEach((listener) => listener(identity))
}
