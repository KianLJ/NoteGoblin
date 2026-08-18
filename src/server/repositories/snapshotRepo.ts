import type { Database as DatabaseType } from 'better-sqlite3'
import type { Campaign, Folder, Note } from '@shared/ipc'

export interface CachedCampaignRow {
  identity_id: string
  campaign_id: string
  campaign_json: string
  notes_json: string
  folders_json: string
  synced_at: string
}

export interface CampaignSnapshot {
  campaign: Campaign
  notes: Note[]
  folders: Folder[]
  syncedAt: string
}

function toSnapshot(row: CachedCampaignRow): CampaignSnapshot {
  return {
    campaign: JSON.parse(row.campaign_json) as Campaign,
    notes: JSON.parse(row.notes_json) as Note[],
    folders: JSON.parse(row.folders_json) as Folder[],
    syncedAt: row.synced_at
  }
}

/**
 * A read-only local cache of a joined campaign's notes/folders, scoped to
 * this identity — refreshed (see `save`) every time a player successfully
 * syncs while connected, so the campaign stays browsable (as of the last
 * sync) even once the DM stops hosting. Lives in local.sqlite3, not the
 * host db — this is "what I've cached from someone else's table," the same
 * category of data as CharacterRepo's characters.
 */
export class SnapshotRepo {
  constructor(private db: DatabaseType) {}

  /** Overwrites whatever was cached for this campaign before — a snapshot is always the latest known state, never a history. */
  save(identityId: string, campaign: Campaign, notes: Note[], folders: Folder[]): void {
    this.db
      .prepare(
        `INSERT INTO cached_campaigns (identity_id, campaign_id, campaign_json, notes_json, folders_json, synced_at)
         VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT (identity_id, campaign_id) DO UPDATE SET
           campaign_json = excluded.campaign_json,
           notes_json = excluded.notes_json,
           folders_json = excluded.folders_json,
           synced_at = excluded.synced_at`
      )
      .run(identityId, campaign.id, JSON.stringify(campaign), JSON.stringify(notes), JSON.stringify(folders))
  }

  list(identityId: string): CampaignSnapshot[] {
    const rows = this.db
      .prepare('SELECT * FROM cached_campaigns WHERE identity_id = ? ORDER BY synced_at DESC')
      .all(identityId) as CachedCampaignRow[]
    return rows.map(toSnapshot)
  }

  get(identityId: string, campaignId: string): CampaignSnapshot | undefined {
    const row = this.db
      .prepare('SELECT * FROM cached_campaigns WHERE identity_id = ? AND campaign_id = ?')
      .get(identityId, campaignId) as CachedCampaignRow | undefined
    return row ? toSnapshot(row) : undefined
  }
}
