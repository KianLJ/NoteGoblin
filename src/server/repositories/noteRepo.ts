import type { Database as DatabaseType } from 'better-sqlite3'
import { v4 as uuid } from 'uuid'

export type NoteVisibility = 'dm' | 'shared'

export interface NoteRow {
  id: string
  campaign_id: string
  author_user_id: string
  title: string
  body_markdown: string
  visibility: NoteVisibility
  created_at: string
  updated_at: string
}

export class NoteRepo {
  constructor(private db: DatabaseType) {}

  /** 'shared' notes go to every campaign member; 'dm' notes only ever come back to the user who wrote them. */
  listVisibleTo(campaignId: string, userId: string): NoteRow[] {
    return this.db
      .prepare(
        `SELECT * FROM notes
         WHERE campaign_id = ?
           AND (visibility = 'shared' OR (visibility = 'dm' AND author_user_id = ?))
         ORDER BY updated_at DESC`
      )
      .all(campaignId, userId) as NoteRow[]
  }

  findById(id: string): NoteRow | undefined {
    return this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as NoteRow | undefined
  }

  create(input: {
    campaignId: string
    authorUserId: string
    title: string
    bodyMarkdown: string
    visibility: NoteVisibility
  }): NoteRow {
    const id = uuid()
    this.db
      .prepare(
        'INSERT INTO notes (id, campaign_id, author_user_id, title, body_markdown, visibility) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        id,
        input.campaignId,
        input.authorUserId,
        input.title,
        input.bodyMarkdown,
        input.visibility
      )
    return this.findById(id)!
  }

  update(id: string, input: { title?: string; bodyMarkdown?: string }): NoteRow | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined
    const title = input.title ?? existing.title
    const bodyMarkdown = input.bodyMarkdown ?? existing.body_markdown
    this.db
      .prepare(
        "UPDATE notes SET title = ?, body_markdown = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
      )
      .run(title, bodyMarkdown, id)
    return this.findById(id)
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM notes WHERE id = ?').run(id)
  }
}
