import type { Database as DatabaseType } from 'better-sqlite3'
import type { CampaignRow } from '../repositories/campaignRepo'
import type { NoteRow } from '../repositories/noteRepo'
import type { FolderRow } from '../repositories/folderRepo'
import { CampaignFileRepo, NoteFileRepo, FolderFileRepo, type FileVisibility } from './vaultStore'

/**
 * One-time copy of every campaign/folder/note in the SQLite host db into the
 * newly-chosen vault as files — run right after a vault folder is first
 * chosen. Reads the tables directly rather than through NoteRepo/FolderRepo's
 * `listVisibleTo` (which is viewer-scoped and would silently skip anything
 * not visible to the DM, like a player's private notes) since a migration
 * needs everything, not just what one viewer is allowed to see. Leaves the
 * SQLite tables untouched — nothing is deleted, so this is safe to re-run
 * (already-migrated campaigns are skipped) and the old data stays as a
 * fallback.
 */
export function migrateSqliteCampaignsToVault(db: DatabaseType): { campaigns: number; notes: number; folders: number } {
  const fileCampaigns = new CampaignFileRepo()
  const fileFolders = new FolderFileRepo()
  const fileNotes = new NoteFileRepo()

  let campaignCount = 0
  let folderCount = 0
  let noteCount = 0

  const campaigns = db.prepare('SELECT * FROM campaigns').all() as CampaignRow[]

  for (const campaign of campaigns) {
    if (fileCampaigns.findById(campaign.id)) continue // already migrated on a previous run

    fileCampaigns.create(campaign.name, campaign.dm_user_id, campaign.id, campaign.created_at)
    campaignCount += 1

    const members = db
      .prepare('SELECT user_id, role FROM campaign_members WHERE campaign_id = ? AND user_id != ?')
      .all(campaign.id, campaign.dm_user_id) as Array<{ user_id: string; role: 'dm' | 'player' }>
    for (const member of members) {
      fileCampaigns.addMember(campaign.id, member.user_id, member.role)
    }

    // Folders before notes, parents before children, so each note's
    // folderId already resolves to a real directory by the time it's made.
    const oldFolders = db
      .prepare('SELECT * FROM folders WHERE campaign_id = ? ORDER BY created_at')
      .all(campaign.id) as FolderRow[]
    const idMap = new Map<string, string>() // old folder id -> new (path-based) folder id
    const byParent = new Map<string | null, FolderRow[]>()
    for (const f of oldFolders) {
      const list = byParent.get(f.parent_folder_id) ?? []
      list.push(f)
      byParent.set(f.parent_folder_id, list)
    }
    function migrateFolderLevel(parentOldId: string | null, parentNewId: string | null): void {
      for (const f of byParent.get(parentOldId) ?? []) {
        const created = fileFolders.create({
          campaignId: campaign.id,
          authorUserId: f.author_user_id,
          name: f.name,
          parentFolderId: parentNewId,
          visibility: f.visibility as FileVisibility
        })
        fileFolders.restoreTimestamps(created.id, f.created_at, f.updated_at)
        idMap.set(f.id, created.id)
        folderCount += 1
        migrateFolderLevel(f.id, created.id)
      }
    }
    migrateFolderLevel(null, null)

    const oldNotes = db.prepare('SELECT * FROM notes WHERE campaign_id = ?').all(campaign.id) as NoteRow[]
    for (const n of oldNotes) {
      const newFolderId = n.folder_id ? (idMap.get(n.folder_id) ?? null) : null
      const created = fileNotes.create({
        campaignId: campaign.id,
        authorUserId: n.author_user_id,
        title: n.title,
        bodyMarkdown: n.body_markdown,
        visibility: n.visibility as FileVisibility,
        folderId: newFolderId
      })
      // create() always starts fresh editorUserIds/timestamps — carry the
      // originals over now that the file exists.
      fileNotes.restoreMetadata(created.id, {
        editorUserIds: JSON.parse(n.editor_user_ids) as string[],
        createdAt: n.created_at,
        updatedAt: n.updated_at
      })
      noteCount += 1
    }
  }

  return { campaigns: campaignCount, notes: noteCount, folders: folderCount }
}
