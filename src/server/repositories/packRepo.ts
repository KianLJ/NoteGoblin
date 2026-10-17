import type { Database as DatabaseType } from 'better-sqlite3'
import type { ContentPack } from '@shared/content/schema'
import { readStoredPack } from '@shared/content/packFiles'

export interface StoredPack {
  pack: ContentPack
  createdAt: string
  updatedAt: string
}

interface LibraryRow {
  identity_id: string
  pack_id: string
  name: string
  version: string
  pack_json: string
  created_at: string
  updated_at: string
}

/** One identity's personal content-pack library, in local.sqlite3 (see the content_packs table). */
export class PackLibraryRepo {
  constructor(private db: DatabaseType) {}

  list(identityId: string): StoredPack[] {
    const rows = this.db.prepare('SELECT * FROM content_packs WHERE identity_id = ? ORDER BY name COLLATE NOCASE').all(identityId) as LibraryRow[]
    return rows.flatMap((r) => {
      const pack = readStoredPack(r.pack_json)
      return pack ? [{ pack, createdAt: r.created_at, updatedAt: r.updated_at }] : []
    })
  }

  get(identityId: string, packId: string): ContentPack | null {
    const row = this.db.prepare('SELECT * FROM content_packs WHERE identity_id = ? AND pack_id = ?').get(identityId, packId) as LibraryRow | undefined
    return row ? readStoredPack(row.pack_json) : null
  }

  /** Adds a pack, or replaces the one with the same id (an update). The pack must already be validated. */
  save(identityId: string, pack: ContentPack): void {
    this.db
      .prepare(
        `INSERT INTO content_packs (identity_id, pack_id, name, version, pack_json) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (identity_id, pack_id) DO UPDATE SET
           name = excluded.name,
           version = excluded.version,
           pack_json = excluded.pack_json,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
      )
      .run(identityId, pack.id, pack.name, pack.version, JSON.stringify(pack))
  }

  remove(identityId: string, packId: string): void {
    this.db.prepare('DELETE FROM content_packs WHERE identity_id = ? AND pack_id = ?').run(identityId, packId)
  }
}

interface CampaignPackRow {
  campaign_id: string
  pack_id: string
  name: string
  version: string
  pack_json: string
  position: number
  enabled_at: string
  updated_at: string
}

export interface EnabledPack {
  pack: ContentPack
  enabledAt: string
  updatedAt: string
}

/** The packs a DM has enabled for a campaign, in host.sqlite3 (see the campaign_packs table) — in enable (load) order. */
export class CampaignPackRepo {
  constructor(private db: DatabaseType) {}

  list(campaignId: string): EnabledPack[] {
    const rows = this.db.prepare('SELECT * FROM campaign_packs WHERE campaign_id = ? ORDER BY position, enabled_at').all(campaignId) as CampaignPackRow[]
    return rows.flatMap((r) => {
      const pack = readStoredPack(r.pack_json)
      return pack ? [{ pack, enabledAt: r.enabled_at, updatedAt: r.updated_at }] : []
    })
  }

  /** Enables a pack, or replaces the enabled copy with a new version (keeping its position). The pack must already be validated. */
  upsert(campaignId: string, pack: ContentPack): void {
    const existing = this.db.prepare('SELECT position FROM campaign_packs WHERE campaign_id = ? AND pack_id = ?').get(campaignId, pack.id) as { position: number } | undefined
    if (existing) {
      this.db
        .prepare(
          `UPDATE campaign_packs SET name = ?, version = ?, pack_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE campaign_id = ? AND pack_id = ?`
        )
        .run(pack.name, pack.version, JSON.stringify(pack), campaignId, pack.id)
      return
    }
    const { next } = this.db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM campaign_packs WHERE campaign_id = ?').get(campaignId) as { next: number }
    this.db
      .prepare('INSERT INTO campaign_packs (campaign_id, pack_id, name, version, pack_json, position) VALUES (?, ?, ?, ?, ?, ?)')
      .run(campaignId, pack.id, pack.name, pack.version, JSON.stringify(pack), next)
  }

  remove(campaignId: string, packId: string): void {
    this.db.prepare('DELETE FROM campaign_packs WHERE campaign_id = ? AND pack_id = ?').run(campaignId, packId)
  }

  /** Moves a pack one place earlier (-1) or later (+1) in load order; positions are rewritten 0..n-1. Unknown ids and moves past either end do nothing. */
  move(campaignId: string, packId: string, delta: -1 | 1): void {
    const ids = (this.db.prepare('SELECT pack_id FROM campaign_packs WHERE campaign_id = ? ORDER BY position, enabled_at').all(campaignId) as Array<{ pack_id: string }>).map((r) => r.pack_id)
    const i = ids.indexOf(packId)
    const j = i + delta
    if (i < 0 || j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    const update = this.db.prepare('UPDATE campaign_packs SET position = ? WHERE campaign_id = ? AND pack_id = ?')
    this.db.transaction(() => ids.forEach((id, position) => update.run(position, campaignId, id)))()
  }

  removeAll(campaignId: string): void {
    this.db.prepare('DELETE FROM campaign_packs WHERE campaign_id = ?').run(campaignId)
  }
}
