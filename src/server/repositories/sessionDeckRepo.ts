import type { Database as DatabaseType } from 'better-sqlite3'
import { v4 as uuid } from 'uuid'

export interface SessionDeckRow {
  id: string
  campaign_id: string
  title: string
  /** JSON-encoded SessionScene[] — see SessionDeckJson.scenes for the parsed shape callers actually use. */
  scenes_json: string
  /** Null until presented for the first time — see the schema comment in db/hostSchema.ts. */
  presented_at: string | null
  created_at: string
  updated_at: string
}

export class SessionDeckRepo {
  constructor(private db: DatabaseType) {}

  listByCampaign(campaignId: string): SessionDeckRow[] {
    return this.db
      .prepare('SELECT * FROM session_decks WHERE campaign_id = ? ORDER BY created_at DESC')
      .all(campaignId) as SessionDeckRow[]
  }

  findById(id: string): SessionDeckRow | undefined {
    return this.db.prepare('SELECT * FROM session_decks WHERE id = ?').get(id) as SessionDeckRow | undefined
  }

  create(input: { campaignId: string; title: string }): SessionDeckRow {
    const id = uuid()
    this.db
      .prepare('INSERT INTO session_decks (id, campaign_id, title) VALUES (?, ?, ?)')
      .run(id, input.campaignId, input.title)
    return this.findById(id)!
  }

  update(id: string, input: { title?: string; scenesJson?: string }): SessionDeckRow | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined
    const title = input.title ?? existing.title
    const scenesJson = input.scenesJson ?? existing.scenes_json
    this.db
      .prepare(
        "UPDATE session_decks SET title = ?, scenes_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
      )
      .run(title, scenesJson, id)
    return this.findById(id)
  }

  /** No-op if already presented — first-presentation is a one-way flip, never reset. */
  markPresented(id: string): void {
    this.db
      .prepare("UPDATE session_decks SET presented_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND presented_at IS NULL")
      .run(id)
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM session_decks WHERE id = ?').run(id)
  }

  removeByCampaign(campaignId: string): void {
    this.db.prepare('DELETE FROM session_decks WHERE campaign_id = ?').run(campaignId)
  }
}
