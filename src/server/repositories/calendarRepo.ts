import type { Database as DatabaseType } from 'better-sqlite3'
import { v4 as uuid } from 'uuid'

export interface CalendarRow {
  id: string
  campaign_id: string
  config_json: string
  created_at: string
  updated_at: string
}

/** One row per campaign (config_json is a whole CalendarConfig — see shared/calendar.ts) — upsert rather than separate create/update since there's only ever one to have. */
export class CalendarRepo {
  constructor(private db: DatabaseType) {}

  findByCampaignId(campaignId: string): CalendarRow | undefined {
    return this.db.prepare('SELECT * FROM campaign_calendars WHERE campaign_id = ?').get(campaignId) as
      | CalendarRow
      | undefined
  }

  upsert(campaignId: string, configJson: string): CalendarRow {
    const existing = this.findByCampaignId(campaignId)
    if (existing) {
      this.db
        .prepare(
          "UPDATE campaign_calendars SET config_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE campaign_id = ?"
        )
        .run(configJson, campaignId)
      return this.findByCampaignId(campaignId)!
    }
    const id = uuid()
    this.db
      .prepare('INSERT INTO campaign_calendars (id, campaign_id, config_json) VALUES (?, ?, ?)')
      .run(id, campaignId, configJson)
    return this.findByCampaignId(campaignId)!
  }

  remove(campaignId: string): void {
    this.db.prepare('DELETE FROM campaign_calendars WHERE campaign_id = ?').run(campaignId)
  }
}
