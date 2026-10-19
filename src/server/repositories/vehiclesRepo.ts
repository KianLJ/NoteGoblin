import type { Database as DatabaseType } from 'better-sqlite3'

export interface VehiclesRow {
  campaign_id: string
  vehicles_json: string
  updated_at: string
}

/** One row per campaign (vehicles_json is a whole CampaignVehicles — see shared/vehicles.ts), upserted like the calendar. */
export class VehiclesRepo {
  constructor(private db: DatabaseType) {}

  findByCampaignId(campaignId: string): VehiclesRow | undefined {
    return this.db.prepare('SELECT * FROM campaign_vehicles WHERE campaign_id = ?').get(campaignId) as VehiclesRow | undefined
  }

  upsert(campaignId: string, json: string): VehiclesRow {
    this.db
      .prepare(
        `INSERT INTO campaign_vehicles (campaign_id, vehicles_json) VALUES (?, ?)
         ON CONFLICT(campaign_id) DO UPDATE SET vehicles_json = excluded.vehicles_json, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
      )
      .run(campaignId, json)
    return this.findByCampaignId(campaignId)!
  }

  remove(campaignId: string): void {
    this.db.prepare('DELETE FROM campaign_vehicles WHERE campaign_id = ?').run(campaignId)
  }
}
