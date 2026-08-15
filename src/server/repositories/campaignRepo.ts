import type { Database as DatabaseType } from 'better-sqlite3'
import { v4 as uuid } from 'uuid'

export type CampaignRole = 'dm' | 'player'

export interface CampaignRow {
  id: string
  name: string
  dm_user_id: string
  created_at: string
}

export class CampaignRepo {
  constructor(private db: DatabaseType) {}

  list(): CampaignRow[] {
    return this.db
      .prepare('SELECT * FROM campaigns ORDER BY created_at DESC')
      .all() as CampaignRow[]
  }

  findById(id: string): CampaignRow | undefined {
    return this.db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id) as
      | CampaignRow
      | undefined
  }

  create(name: string, dmUserId: string): CampaignRow {
    const id = uuid()
    this.db
      .prepare('INSERT INTO campaigns (id, name, dm_user_id) VALUES (?, ?, ?)')
      .run(id, name, dmUserId)
    this.addMember(id, dmUserId, 'dm')
    return this.findById(id)!
  }

  addMember(campaignId: string, userId: string, role: CampaignRole): void {
    this.db
      .prepare(
        'INSERT OR IGNORE INTO campaign_members (campaign_id, user_id, role) VALUES (?, ?, ?)'
      )
      .run(campaignId, userId, role)
  }

  getRole(campaignId: string, userId: string): CampaignRole | null {
    const row = this.db
      .prepare('SELECT role FROM campaign_members WHERE campaign_id = ? AND user_id = ?')
      .get(campaignId, userId) as { role: CampaignRole } | undefined
    return row?.role ?? null
  }
}
