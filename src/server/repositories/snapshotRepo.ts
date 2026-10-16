import type { Database as DatabaseType } from 'better-sqlite3'
import type { Campaign, Folder, Note } from '@shared/ipc'
import type { SessionDeck } from '@shared/sessionDeck'
import type { ContentPack } from '@shared/content/schema'
import { readStoredPack } from '@shared/content/packFiles'

export interface CachedCampaignRow {
  identity_id: string
  campaign_id: string
  campaign_json: string
  notes_json: string
  folders_json: string
  session_decks_json: string
  packs_json: string
  synced_at: string
}

export interface CampaignSnapshot {
  campaign: Campaign
  notes: Note[]
  folders: Folder[]
  sessionDecks: SessionDeck[]
  packs: ContentPack[]
  syncedAt: string
}

function toSnapshot(row: CachedCampaignRow): CampaignSnapshot {
  return {
    campaign: JSON.parse(row.campaign_json) as Campaign,
    notes: JSON.parse(row.notes_json) as Note[],
    folders: JSON.parse(row.folders_json) as Folder[],
    // '[]' default covers a row saved before session_decks_json existed.
    sessionDecks: JSON.parse(row.session_decks_json || '[]') as SessionDeck[],
    // '[]' default covers a row saved before packs_json existed; a pack that no longer parses is dropped.
    packs: (JSON.parse(row.packs_json || '[]') as unknown[]).flatMap((p) => {
      const pack = readStoredPack(JSON.stringify(p))
      return pack ? [pack] : []
    }),
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
  save(identityId: string, campaign: Campaign, notes: Note[], folders: Folder[], sessionDecks: SessionDeck[], packs: ContentPack[] = []): void {
    this.db
      .prepare(
        `INSERT INTO cached_campaigns (identity_id, campaign_id, campaign_json, notes_json, folders_json, session_decks_json, packs_json, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT (identity_id, campaign_id) DO UPDATE SET
           campaign_json = excluded.campaign_json,
           notes_json = excluded.notes_json,
           folders_json = excluded.folders_json,
           session_decks_json = excluded.session_decks_json,
           packs_json = excluded.packs_json,
           synced_at = excluded.synced_at`
      )
      .run(identityId, campaign.id, JSON.stringify(campaign), JSON.stringify(notes), JSON.stringify(folders), JSON.stringify(sessionDecks), JSON.stringify(packs))
  }

  /** Every pack any cached campaign uses — for resolving sheet ids into them (see registerIpc.ts's knownPacks). */
  allPacks(identityId: string): ContentPack[] {
    return this.list(identityId).flatMap((s) => s.packs)
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

  /** Forgets a cached campaign — just the local read-only copy, not anything on the DM's actual host. Rejoining the same campaign later (if the DM is hosting again) would re-cache it from scratch. */
  remove(identityId: string, campaignId: string): void {
    this.db.prepare('DELETE FROM cached_campaigns WHERE identity_id = ? AND campaign_id = ?').run(identityId, campaignId)
  }
}
