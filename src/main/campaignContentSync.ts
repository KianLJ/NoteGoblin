import type { BrowserWindow } from 'electron'
import type { Database as DatabaseType } from 'better-sqlite3'
import * as relayClient from '@server/relay/relayClient'
import { getRelaySession } from './relayState'
import * as campaignService from '@server/services/campaignService'
import type { NoteRow } from '@server/repositories/noteRepo'
import type { FolderRow } from '@server/repositories/folderRepo'

// Debounced per campaign, same shape as theme.ts's schedulePrefsPush — a
// burst of note/folder edits collapses into one push instead of one per
// keystroke-adjacent save.
const pushTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function schedulePushCampaign(db: DatabaseType, campaignId: string, userId: string): void {
  const existing = pushTimers.get(campaignId)
  if (existing) clearTimeout(existing)
  pushTimers.set(
    campaignId,
    setTimeout(() => {
      pushTimers.delete(campaignId)
      void pushCampaignIfNewer(db, campaignId, userId)
    }, 1000)
  )
}

/** Fire-and-forget, soft-fails with no relay session. Never pushes before this campaign has ever had `touchCampaignContentVersion` called for it (a campaign with no content_version yet has nothing meaningful to compare or sync) and never pushes over a remote copy that's already at least as new. */
export async function pushCampaignIfNewer(db: DatabaseType, campaignId: string, userId: string): Promise<void> {
  const session = getRelaySession()
  if (!session) return

  const exported = campaignService.exportCampaignSnapshot(db, campaignId, userId)
  if (!exported.ok) return
  const localVersion = exported.data.campaignJson.contentVersion
  if (!localVersion) return

  const remote = await relayClient.getCampaignSnapshot(session.token, campaignId)
  if (remote.ok && remote.data.updatedAt >= localVersion) return

  await relayClient.setCampaignSnapshot(session.token, campaignId, {
    name: exported.data.campaignJson.name,
    updatedAt: localVersion,
    campaignJson: exported.data.campaignJson,
    notes: exported.data.notes,
    folders: exported.data.folders
  })
}

function isNoteRow(value: unknown): value is NoteRow {
  return !!value && typeof value === 'object' && typeof (value as NoteRow).id === 'string' && typeof (value as NoteRow).updated_at === 'string'
}

function isFolderRow(value: unknown): value is FolderRow {
  return !!value && typeof value === 'object' && typeof (value as FolderRow).id === 'string' && typeof (value as FolderRow).updated_at === 'string'
}

/**
 * Fire-and-forget, soft-fails with no relay session or no remote snapshot
 * yet. Only replaces local content if the remote copy is strictly newer
 * than what's already here — an already-up-to-date (or ahead) local copy is
 * left untouched, the same timestamp-gated safety this stage was scoped
 * around from the start (see the plan's context on the theme-prefs bug).
 */
export async function pullCampaignIfNewer(
  db: DatabaseType,
  campaignId: string,
  userId: string,
  window: BrowserWindow
): Promise<void> {
  const session = getRelaySession()
  if (!session) return

  const remote = await relayClient.getCampaignSnapshot(session.token, campaignId)
  if (!remote.ok) return

  const exported = campaignService.exportCampaignSnapshot(db, campaignId, userId)
  const localVersion = (exported.ok && exported.data.campaignJson.contentVersion) || ''
  if (remote.data.updatedAt <= localVersion) return

  const notes = remote.data.notes.filter(isNoteRow)
  const folders = remote.data.folders.filter(isFolderRow)
  const result = campaignService.importCampaignSnapshot(db, campaignId, userId, {
    notes,
    folders,
    contentVersion: remote.data.updatedAt
  })
  if (result.ok && !window.isDestroyed()) {
    window.webContents.send('ws:campaign-changed', { sessionId: '', campaignId })
  }
}

function extractCreatedAt(campaignJson: unknown): string {
  if (campaignJson && typeof campaignJson === 'object' && typeof (campaignJson as { createdAt?: unknown }).createdAt === 'string') {
    return (campaignJson as { createdAt: string }).createdAt
  }
  return new Date().toISOString()
}

/**
 * Finds campaigns synced to the relay under this account that this device
 * has never seen before, creates a local shell for each (same id, so it's
 * recognized as the same campaign going forward — see
 * createCampaignShellWithId), and pulls its full content in immediately.
 * Called whenever the campaign list is opened (see registerIpc.ts's
 * `campaigns:list`) — awaited there, so a freshly-discovered campaign is
 * already present by the time the list is returned, no extra event/refetch
 * plumbing needed. Fire-and-forget-safe on its own (soft-fails with no
 * relay session), but callers that want the discovered campaign to show up
 * in the very next response should await it.
 */
export async function discoverAndSyncCampaigns(db: DatabaseType, userId: string, window: BrowserWindow): Promise<void> {
  const session = getRelaySession()
  if (!session) return

  const remoteList = await relayClient.listCampaignSnapshots(session.token)
  if (!remoteList.ok) return

  for (const summary of remoteList.data) {
    const existing = campaignService.exportCampaignSnapshot(db, summary.campaignId, userId)
    // ok → already known locally, nothing to discover. status 403 → a row
    // with this id already exists locally under a different DM, which
    // shouldn't happen for our own account's synced campaigns — skip
    // defensively rather than risk colliding with someone else's data.
    if (existing.ok || (!existing.ok && existing.status === 403)) continue

    const remote = await relayClient.getCampaignSnapshot(session.token, summary.campaignId)
    if (!remote.ok) continue

    const created = campaignService.createCampaignShellWithId(
      db,
      summary.campaignId,
      remote.data.name,
      userId,
      extractCreatedAt(remote.data.campaignJson)
    )
    const notes = remote.data.notes.filter(isNoteRow)
    const folders = remote.data.folders.filter(isFolderRow)
    const imported = campaignService.importCampaignSnapshot(db, created.id, userId, {
      notes,
      folders,
      contentVersion: remote.data.updatedAt
    })
    if (imported.ok && !window.isDestroyed()) {
      window.webContents.send('ws:campaign-changed', { sessionId: '', campaignId: created.id })
    }
  }
}
