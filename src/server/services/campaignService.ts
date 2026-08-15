import type { Database as DatabaseType } from 'better-sqlite3'
import { CampaignRepo, type CampaignRow } from '../repositories/campaignRepo'
import { NoteRepo, type NoteRow } from '../repositories/noteRepo'
import { FolderRepo, type FolderRow } from '../repositories/folderRepo'
import { UserRepo } from '../repositories/userRepo'

/**
 * Campaign/note logic shared by two callers: the host's HTTP API (for remote
 * players, only reachable while hosting is on) and the main process's direct
 * in-process path (for the DM working on their own table, which shouldn't
 * require the network server to be running at all). Both operate on the same
 * host SQLite file, so nothing needs to sync between them.
 */

export interface CampaignJson {
  id: string
  name: string
  dmUserId: string
  dmDisplayName: string
  createdAt: string
  myRole: 'dm' | 'player' | null
}

export interface NoteJson {
  id: string
  campaignId: string
  authorUserId: string
  authorDisplayName: string
  title: string
  bodyMarkdown: string
  visibility: 'dm' | 'shared'
  folderId: string | null
  createdAt: string
  updatedAt: string
}

export interface FolderJson {
  id: string
  campaignId: string
  authorUserId: string
  authorDisplayName: string
  name: string
  parentFolderId: string | null
  visibility: 'dm' | 'shared'
  createdAt: string
  updatedAt: string
}

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string }

function toCampaignJson(
  userRepo: UserRepo,
  campaignRepo: CampaignRepo,
  row: CampaignRow,
  viewerUserId: string
): CampaignJson {
  const dm = userRepo.findById(row.dm_user_id)
  return {
    id: row.id,
    name: row.name,
    dmUserId: row.dm_user_id,
    dmDisplayName: dm?.display_name ?? 'Unknown',
    createdAt: row.created_at,
    myRole: campaignRepo.getRole(row.id, viewerUserId)
  }
}

function toNoteJson(userRepo: UserRepo, row: NoteRow): NoteJson {
  const author = userRepo.findById(row.author_user_id)
  return {
    id: row.id,
    campaignId: row.campaign_id,
    authorUserId: row.author_user_id,
    authorDisplayName: author?.display_name ?? 'Unknown',
    title: row.title,
    bodyMarkdown: row.body_markdown,
    visibility: row.visibility,
    folderId: row.folder_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function toFolderJson(userRepo: UserRepo, row: FolderRow): FolderJson {
  const author = userRepo.findById(row.author_user_id)
  return {
    id: row.id,
    campaignId: row.campaign_id,
    authorUserId: row.author_user_id,
    authorDisplayName: author?.display_name ?? 'Unknown',
    name: row.name,
    parentFolderId: row.parent_folder_id,
    visibility: row.visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/** A note/folder's folderId must point at a real folder in the same campaign with matching visibility — otherwise a 'dm' note could hide inside a 'shared' folder (or vice versa) and leak across the visibility boundary. */
function validateFolderId(
  folderRepo: FolderRepo,
  campaignId: string,
  visibility: 'dm' | 'shared',
  folderId: string | null
): { error: string } | { ok: true } {
  if (folderId === null) return { ok: true }
  const folder = folderRepo.findById(folderId)
  if (!folder || folder.campaign_id !== campaignId) return { error: 'Folder not found.' }
  if (folder.visibility !== visibility) return { error: 'A note can only live in a folder of the same visibility.' }
  return { ok: true }
}

/** Walks up from `startFolderId` through parent_folder_id — true if `candidateId` is `startFolderId` itself or any ancestor of it. Used to stop a folder being dragged into its own subtree. */
function isSelfOrDescendant(folderRepo: FolderRepo, candidateId: string, startFolderId: string): boolean {
  let current: string | null = startFolderId
  while (current) {
    if (current === candidateId) return true
    current = folderRepo.findById(current)?.parent_folder_id ?? null
  }
  return false
}

export function listCampaigns(db: DatabaseType, viewerUserId: string): ServiceResult<CampaignJson[]> {
  const userRepo = new UserRepo(db)
  const campaignRepo = new CampaignRepo(db)
  const rows = campaignRepo.list()
  return { ok: true, data: rows.map((row) => toCampaignJson(userRepo, campaignRepo, row, viewerUserId)) }
}

export function createCampaign(
  db: DatabaseType,
  dmUserId: string,
  name: string
): ServiceResult<CampaignJson> {
  if (typeof name !== 'string' || name.trim().length < 2) {
    return { ok: false, status: 400, error: 'Give your campaign a name (2+ characters).' }
  }
  const userRepo = new UserRepo(db)
  const campaignRepo = new CampaignRepo(db)
  const row = campaignRepo.create(name.trim(), dmUserId)
  return { ok: true, data: toCampaignJson(userRepo, campaignRepo, row, dmUserId) }
}

export function joinCampaign(
  db: DatabaseType,
  campaignId: string,
  userId: string
): ServiceResult<CampaignJson> {
  const userRepo = new UserRepo(db)
  const campaignRepo = new CampaignRepo(db)
  const row = campaignRepo.findById(campaignId)
  if (!row) return { ok: false, status: 404, error: 'Campaign not found.' }
  campaignRepo.addMember(row.id, userId, 'player')
  return { ok: true, data: toCampaignJson(userRepo, campaignRepo, row, userId) }
}

/** Whatever campaign the DM currently has open — `null` if they haven't opened one (or aren't hosting anything yet). Not membership-gated: this is the discovery step a connecting player uses *before* they're necessarily a member of anything. */
export function getActiveCampaign(db: DatabaseType, viewerUserId: string): ServiceResult<CampaignJson | null> {
  const userRepo = new UserRepo(db)
  const campaignRepo = new CampaignRepo(db)
  const activeId = campaignRepo.getActiveCampaignId()
  if (!activeId) return { ok: true, data: null }
  const row = campaignRepo.findById(activeId)
  if (!row) return { ok: true, data: null }
  return { ok: true, data: toCampaignJson(userRepo, campaignRepo, row, viewerUserId) }
}

/** Only the DM (campaign owner) decides what "the table" currently is — this is what the CampaignSwitcher calls whenever the DM's own active campaign changes. */
export function setActiveCampaign(
  db: DatabaseType,
  campaignId: string,
  userId: string
): ServiceResult<CampaignJson> {
  const userRepo = new UserRepo(db)
  const campaignRepo = new CampaignRepo(db)
  const row = campaignRepo.findById(campaignId)
  if (!row) return { ok: false, status: 404, error: 'Campaign not found.' }
  if (row.dm_user_id !== userId) return { ok: false, status: 403, error: 'Only the DM can set the active campaign.' }
  campaignRepo.setActiveCampaignId(row.id)
  return { ok: true, data: toCampaignJson(userRepo, campaignRepo, row, userId) }
}

/** A connecting player's one-step join — auto-adds them to whatever campaign the DM currently has active, instead of making them pick one from a list. */
export function joinActiveCampaign(db: DatabaseType, userId: string): ServiceResult<CampaignJson> {
  const campaignRepo = new CampaignRepo(db)
  const activeId = campaignRepo.getActiveCampaignId()
  if (!activeId) return { ok: false, status: 404, error: "The DM hasn't started a session yet." }
  return joinCampaign(db, activeId, userId)
}

export function listNotes(
  db: DatabaseType,
  campaignId: string,
  userId: string
): ServiceResult<NoteJson[]> {
  const userRepo = new UserRepo(db)
  const campaignRepo = new CampaignRepo(db)
  const noteRepo = new NoteRepo(db)
  const campaign = campaignRepo.findById(campaignId)
  if (!campaign) return { ok: false, status: 404, error: 'Campaign not found.' }
  if (!campaignRepo.getRole(campaign.id, userId)) {
    return { ok: false, status: 403, error: 'Join this campaign first.' }
  }
  const rows = noteRepo.listVisibleTo(campaign.id, userId)
  return { ok: true, data: rows.map((row) => toNoteJson(userRepo, row)) }
}

export function createNote(
  db: DatabaseType,
  campaignId: string,
  userId: string,
  input: { title: unknown; bodyMarkdown: unknown; visibility: unknown; folderId?: unknown }
): ServiceResult<NoteJson> {
  const userRepo = new UserRepo(db)
  const campaignRepo = new CampaignRepo(db)
  const noteRepo = new NoteRepo(db)
  const folderRepo = new FolderRepo(db)

  const campaign = campaignRepo.findById(campaignId)
  if (!campaign) return { ok: false, status: 404, error: 'Campaign not found.' }
  if (!campaignRepo.getRole(campaign.id, userId)) {
    return { ok: false, status: 403, error: 'Join this campaign first.' }
  }

  const { title, bodyMarkdown, visibility, folderId } = input
  if (typeof title !== 'string' || title.trim().length === 0) {
    return { ok: false, status: 400, error: 'A note needs a title.' }
  }
  if (visibility !== 'dm' && visibility !== 'shared') {
    return { ok: false, status: 400, error: 'Invalid visibility.' }
  }
  if (visibility === 'dm' && campaign.dm_user_id !== userId) {
    return { ok: false, status: 403, error: 'Only the DM can write private DM notes.' }
  }
  const resolvedFolderId = typeof folderId === 'string' ? folderId : null
  const folderCheck = validateFolderId(folderRepo, campaign.id, visibility, resolvedFolderId)
  if ('error' in folderCheck) return { ok: false, status: 400, error: folderCheck.error }

  const row = noteRepo.create({
    campaignId: campaign.id,
    authorUserId: userId,
    title: title.trim(),
    bodyMarkdown: typeof bodyMarkdown === 'string' ? bodyMarkdown : '',
    visibility,
    folderId: resolvedFolderId
  })
  return { ok: true, data: toNoteJson(userRepo, row) }
}

export function updateNote(
  db: DatabaseType,
  campaignId: string,
  noteId: string,
  userId: string,
  input: { title?: unknown; bodyMarkdown?: unknown; folderId?: unknown; visibility?: unknown }
): ServiceResult<NoteJson> {
  const userRepo = new UserRepo(db)
  const campaignRepo = new CampaignRepo(db)
  const noteRepo = new NoteRepo(db)
  const folderRepo = new FolderRepo(db)

  const note = noteRepo.findById(noteId)
  if (!note || note.campaign_id !== campaignId) {
    return { ok: false, status: 404, error: 'Note not found.' }
  }
  if (note.author_user_id !== userId) {
    return { ok: false, status: 403, error: 'Only the author can edit this note.' }
  }

  let visibility: 'dm' | 'shared' | undefined
  if ('visibility' in input) {
    if (input.visibility !== 'dm' && input.visibility !== 'shared') {
      return { ok: false, status: 400, error: 'Invalid visibility.' }
    }
    if (input.visibility === 'dm' && campaignRepo.findById(note.campaign_id)?.dm_user_id !== userId) {
      return { ok: false, status: 403, error: 'Only the DM can make a note DM-only.' }
    }
    visibility = input.visibility
  }
  const resolvedVisibility = visibility ?? note.visibility

  let folderId: string | null | undefined
  if ('folderId' in input) {
    folderId = typeof input.folderId === 'string' ? input.folderId : null
  } else if (visibility && note.folder_id) {
    // Visibility is changing but folderId wasn't given explicitly — the
    // note's existing folder belongs to the OLD visibility's tree, so it
    // would no longer match. Drop it to root rather than leave a dangling
    // cross-visibility reference.
    folderId = null
  }
  if (folderId !== undefined) {
    const folderCheck = validateFolderId(folderRepo, note.campaign_id, resolvedVisibility, folderId)
    if ('error' in folderCheck) return { ok: false, status: 400, error: folderCheck.error }
  }

  const updated = noteRepo.update(note.id, {
    title: typeof input.title === 'string' ? input.title.trim() : undefined,
    bodyMarkdown: typeof input.bodyMarkdown === 'string' ? input.bodyMarkdown : undefined,
    ...(folderId !== undefined ? { folderId } : {}),
    ...(visibility ? { visibility } : {})
  })
  return { ok: true, data: toNoteJson(userRepo, updated as NoteRow) }
}

export function deleteNote(
  db: DatabaseType,
  campaignId: string,
  noteId: string,
  userId: string
): ServiceResult<void> {
  const noteRepo = new NoteRepo(db)
  const note = noteRepo.findById(noteId)
  if (!note || note.campaign_id !== campaignId) {
    return { ok: false, status: 404, error: 'Note not found.' }
  }
  if (note.author_user_id !== userId) {
    return { ok: false, status: 403, error: 'Only the author can delete this note.' }
  }
  noteRepo.remove(note.id)
  return { ok: true, data: undefined }
}

export function listFolders(
  db: DatabaseType,
  campaignId: string,
  userId: string
): ServiceResult<FolderJson[]> {
  const userRepo = new UserRepo(db)
  const campaignRepo = new CampaignRepo(db)
  const folderRepo = new FolderRepo(db)
  const campaign = campaignRepo.findById(campaignId)
  if (!campaign) return { ok: false, status: 404, error: 'Campaign not found.' }
  if (!campaignRepo.getRole(campaign.id, userId)) {
    return { ok: false, status: 403, error: 'Join this campaign first.' }
  }
  const rows = folderRepo.listVisibleTo(campaign.id, userId)
  return { ok: true, data: rows.map((row) => toFolderJson(userRepo, row)) }
}

export function createFolder(
  db: DatabaseType,
  campaignId: string,
  userId: string,
  input: { name: unknown; visibility: unknown; parentFolderId?: unknown }
): ServiceResult<FolderJson> {
  const userRepo = new UserRepo(db)
  const campaignRepo = new CampaignRepo(db)
  const folderRepo = new FolderRepo(db)

  const campaign = campaignRepo.findById(campaignId)
  if (!campaign) return { ok: false, status: 404, error: 'Campaign not found.' }
  if (!campaignRepo.getRole(campaign.id, userId)) {
    return { ok: false, status: 403, error: 'Join this campaign first.' }
  }

  const { name, visibility, parentFolderId } = input
  if (typeof name !== 'string' || name.trim().length === 0) {
    return { ok: false, status: 400, error: 'A folder needs a name.' }
  }
  if (visibility !== 'dm' && visibility !== 'shared') {
    return { ok: false, status: 400, error: 'Invalid visibility.' }
  }
  if (visibility === 'dm' && campaign.dm_user_id !== userId) {
    return { ok: false, status: 403, error: 'Only the DM can create private DM folders.' }
  }
  const resolvedParentId = typeof parentFolderId === 'string' ? parentFolderId : null
  const parentCheck = validateFolderId(folderRepo, campaign.id, visibility, resolvedParentId)
  if ('error' in parentCheck) return { ok: false, status: 400, error: parentCheck.error }

  const row = folderRepo.create({
    campaignId: campaign.id,
    authorUserId: userId,
    name: name.trim(),
    parentFolderId: resolvedParentId,
    visibility
  })
  return { ok: true, data: toFolderJson(userRepo, row) }
}

export function updateFolder(
  db: DatabaseType,
  campaignId: string,
  folderId: string,
  userId: string,
  input: { name?: unknown; parentFolderId?: unknown; visibility?: unknown }
): ServiceResult<FolderJson> {
  const userRepo = new UserRepo(db)
  const campaignRepo = new CampaignRepo(db)
  const folderRepo = new FolderRepo(db)

  const folder = folderRepo.findById(folderId)
  if (!folder || folder.campaign_id !== campaignId) {
    return { ok: false, status: 404, error: 'Folder not found.' }
  }
  if (folder.author_user_id !== userId) {
    return { ok: false, status: 403, error: 'Only the author can edit this folder.' }
  }

  let visibility: 'dm' | 'shared' | undefined
  if ('visibility' in input) {
    if (input.visibility !== 'dm' && input.visibility !== 'shared') {
      return { ok: false, status: 400, error: 'Invalid visibility.' }
    }
    if (input.visibility === 'dm' && campaignRepo.findById(folder.campaign_id)?.dm_user_id !== userId) {
      return { ok: false, status: 403, error: 'Only the DM can make a folder DM-only.' }
    }
    visibility = input.visibility
  }
  const resolvedVisibility = visibility ?? folder.visibility

  let parentFolderId: string | null | undefined
  if ('parentFolderId' in input) {
    parentFolderId = typeof input.parentFolderId === 'string' ? input.parentFolderId : null
  } else if (visibility && folder.parent_folder_id) {
    // Same reasoning as notes: an existing parent belongs to the OLD
    // visibility's tree, so a bare visibility change without an explicit
    // new parent drops it to root instead of leaving a mismatched parent.
    parentFolderId = null
  }
  if (parentFolderId !== undefined) {
    const parentCheck = validateFolderId(folderRepo, folder.campaign_id, resolvedVisibility, parentFolderId)
    if ('error' in parentCheck) return { ok: false, status: 400, error: parentCheck.error }
    if (parentFolderId !== null && isSelfOrDescendant(folderRepo, folder.id, parentFolderId)) {
      return { ok: false, status: 400, error: 'A folder cannot be moved into itself or one of its own sub-folders.' }
    }
  }

  // Cascade first so the folder and everything beneath it share the new
  // visibility before any name/parent change is applied.
  if (visibility && visibility !== folder.visibility) {
    folderRepo.setVisibilityCascade(folder.id, visibility)
  }

  const updated = folderRepo.update(folder.id, {
    name: typeof input.name === 'string' ? input.name.trim() : undefined,
    ...(parentFolderId !== undefined ? { parentFolderId } : {})
  })
  return { ok: true, data: toFolderJson(userRepo, updated as FolderRow) }
}

export function deleteFolder(
  db: DatabaseType,
  campaignId: string,
  folderId: string,
  userId: string
): ServiceResult<void> {
  const folderRepo = new FolderRepo(db)
  const folder = folderRepo.findById(folderId)
  if (!folder || folder.campaign_id !== campaignId) {
    return { ok: false, status: 404, error: 'Folder not found.' }
  }
  if (folder.author_user_id !== userId) {
    return { ok: false, status: 403, error: 'Only the author can delete this folder.' }
  }
  folderRepo.remove(folder.id)
  return { ok: true, data: undefined }
}
