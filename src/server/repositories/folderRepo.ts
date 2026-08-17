import type { Database as DatabaseType } from 'better-sqlite3'
import { v4 as uuid } from 'uuid'

export type FolderVisibility = 'dm' | 'shared' | 'private'

export interface FolderRow {
  id: string
  campaign_id: string
  author_user_id: string
  name: string
  parent_folder_id: string | null
  visibility: FolderVisibility
  created_at: string
  updated_at: string
}

export class FolderRepo {
  constructor(private db: DatabaseType) {}

  /** Same visibility rule as notes: 'shared' (party) folders go to every campaign member, 'dm' and 'private' folders only to their author. */
  listVisibleTo(campaignId: string, userId: string): FolderRow[] {
    return this.db
      .prepare(
        `SELECT * FROM folders
         WHERE campaign_id = ?
           AND (visibility = 'shared' OR ((visibility = 'dm' OR visibility = 'private') AND author_user_id = ?))
         ORDER BY name COLLATE NOCASE`
      )
      .all(campaignId, userId) as FolderRow[]
  }

  findById(id: string): FolderRow | undefined {
    return this.db.prepare('SELECT * FROM folders WHERE id = ?').get(id) as FolderRow | undefined
  }

  create(input: {
    campaignId: string
    authorUserId: string
    name: string
    parentFolderId: string | null
    visibility: FolderVisibility
  }): FolderRow {
    const id = uuid()
    this.db
      .prepare(
        'INSERT INTO folders (id, campaign_id, author_user_id, name, parent_folder_id, visibility) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(id, input.campaignId, input.authorUserId, input.name, input.parentFolderId, input.visibility)
    return this.findById(id)!
  }

  /** `parentFolderId` is tri-state: omit to leave unchanged, pass null to move to root, pass an id to move under that folder. */
  update(id: string, input: { name?: string; parentFolderId?: string | null }): FolderRow | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined
    const name = input.name ?? existing.name
    const parentFolderId: string | null =
      'parentFolderId' in input ? (input.parentFolderId as string | null) : existing.parent_folder_id
    this.db
      .prepare(
        "UPDATE folders SET name = ?, parent_folder_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
      )
      .run(name, parentFolderId, id)
    return this.findById(id)
  }

  /** All descendant folder ids under `rootId`, via breadth-first walk of parent_folder_id. */
  listDescendantIds(rootId: string): string[] {
    const result: string[] = []
    const queue = [rootId]
    while (queue.length) {
      const current = queue.shift() as string
      const children = this.db
        .prepare('SELECT id FROM folders WHERE parent_folder_id = ?')
        .all(current) as { id: string }[]
      for (const child of children) {
        result.push(child.id)
        queue.push(child.id)
      }
    }
    return result
  }

  /** Flips this folder's visibility, cascading to every sub-folder and note beneath it — a folder's contents must always share its own visibility, so moving a folder across the dm/shared boundary has to carry its whole subtree with it. */
  setVisibilityCascade(rootId: string, visibility: FolderVisibility): void {
    const ids = [rootId, ...this.listDescendantIds(rootId)]
    const placeholders = ids.map(() => '?').join(',')
    this.db.prepare(`UPDATE folders SET visibility = ? WHERE id IN (${placeholders})`).run(visibility, ...ids)
    this.db
      .prepare(`UPDATE notes SET visibility = ? WHERE folder_id IN (${placeholders})`)
      .run(visibility, ...ids)
  }

  /** Deletes this folder and everything beneath it — every note and sub-folder in its subtree, recursively. Irreversible; callers are expected to confirm with the user first. */
  remove(id: string): void {
    const ids = [id, ...this.listDescendantIds(id)]
    const placeholders = ids.map(() => '?').join(',')
    const runRemoval = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM notes WHERE folder_id IN (${placeholders})`).run(...ids)
      this.db.prepare(`DELETE FROM folders WHERE id IN (${placeholders})`).run(...ids)
    })
    runRemoval()
  }
}
