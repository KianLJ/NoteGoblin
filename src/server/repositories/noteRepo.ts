import type { Database as DatabaseType } from 'better-sqlite3'
import { v4 as uuid } from 'uuid'

export type NoteVisibility = 'dm' | 'shared' | 'private'

export interface NoteRow {
  id: string
  campaign_id: string
  author_user_id: string
  title: string
  body_markdown: string
  visibility: NoteVisibility
  folder_id: string | null
  /** JSON-encoded array of userIds — see NoteJson.editorUserIds for the parsed shape callers actually use. */
  editor_user_ids: string
  pinned: 0 | 1
  scene_deck_id: string | null
  created_at: string
  updated_at: string
}

export class NoteRepo {
  constructor(private db: DatabaseType) {}

  /** 'shared' (party) notes go to every campaign member; 'dm' and 'private' notes only ever come back to the user who wrote them — not even the DM sees another member's private notes. */
  listVisibleTo(campaignId: string, userId: string): NoteRow[] {
    return this.db
      .prepare(
        `SELECT * FROM notes
         WHERE campaign_id = ?
           AND (visibility = 'shared' OR ((visibility = 'dm' OR visibility = 'private') AND author_user_id = ?))
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
    folderId: string | null
    /** Set only when this note is actually a session-deck scene (see campaignService.createSceneInDeck) — never passed for a normal user-created note. */
    sceneDeckId?: string | null
  }): NoteRow {
    const id = uuid()
    this.db
      .prepare(
        'INSERT INTO notes (id, campaign_id, author_user_id, title, body_markdown, visibility, folder_id, scene_deck_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        id,
        input.campaignId,
        input.authorUserId,
        input.title,
        input.bodyMarkdown,
        input.visibility,
        input.folderId,
        input.sceneDeckId ?? null
      )
    return this.findById(id)!
  }

  /** `folderId` is tri-state: omit to leave unchanged, pass null to move to root, pass an id to move into that folder. */
  update(
    id: string,
    input: {
      title?: string
      bodyMarkdown?: string
      folderId?: string | null
      visibility?: NoteVisibility
      editorUserIds?: string[]
      pinned?: boolean
    }
  ): NoteRow | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined
    const title = input.title ?? existing.title
    const bodyMarkdown = input.bodyMarkdown ?? existing.body_markdown
    const folderId: string | null = 'folderId' in input ? (input.folderId as string | null) : existing.folder_id
    const visibility = input.visibility ?? existing.visibility
    const editorUserIds = input.editorUserIds ? JSON.stringify(input.editorUserIds) : existing.editor_user_ids
    const pinned = input.pinned !== undefined ? (input.pinned ? 1 : 0) : existing.pinned
    this.db
      .prepare(
        "UPDATE notes SET title = ?, body_markdown = ?, folder_id = ?, visibility = ?, editor_user_ids = ?, pinned = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
      )
      .run(title, bodyMarkdown, folderId, visibility, editorUserIds, pinned, id)
    return this.findById(id)
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM notes WHERE id = ?').run(id)
  }

  /** Every note in the campaign regardless of visibility/author — unlike listVisibleTo, not access-controlled itself; used only by campaignService's sync export, which gates on the caller actually being the DM before ever calling this. */
  listAll(campaignId: string): NoteRow[] {
    return this.db.prepare('SELECT * FROM notes WHERE campaign_id = ? ORDER BY updated_at DESC').all(campaignId) as NoteRow[]
  }

  /**
   * Insert-or-replace at a caller-supplied id, writing through the given
   * timestamps instead of stamping "now" — used to import a note pulled from
   * another device's synced copy (see src/main/campaignContentSync.ts),
   * where the id and timestamps must survive exactly as authored elsewhere
   * for version comparisons and cross-references (scene decks, initiative
   * links) to keep working. Never used for a normal user-authored note.
   */
  upsertWithId(
    id: string,
    input: {
      campaignId: string
      authorUserId: string
      title: string
      bodyMarkdown: string
      visibility: NoteVisibility
      folderId: string | null
      editorUserIds: string[]
      pinned: boolean
      sceneDeckId: string | null
      createdAt: string
      updatedAt: string
    }
  ): NoteRow {
    this.db
      .prepare(
        `INSERT INTO notes
           (id, campaign_id, author_user_id, title, body_markdown, visibility, folder_id, editor_user_ids, pinned, scene_deck_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           body_markdown = excluded.body_markdown,
           visibility = excluded.visibility,
           folder_id = excluded.folder_id,
           editor_user_ids = excluded.editor_user_ids,
           pinned = excluded.pinned,
           scene_deck_id = excluded.scene_deck_id,
           updated_at = excluded.updated_at`
      )
      .run(
        id,
        input.campaignId,
        input.authorUserId,
        input.title,
        input.bodyMarkdown,
        input.visibility,
        input.folderId,
        JSON.stringify(input.editorUserIds),
        input.pinned ? 1 : 0,
        input.sceneDeckId,
        input.createdAt,
        input.updatedAt
      )
    return this.findById(id)!
  }
}
