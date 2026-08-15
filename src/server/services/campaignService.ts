import type { Database as DatabaseType } from 'better-sqlite3'
import { CampaignRepo, type CampaignRow } from '../repositories/campaignRepo'
import { NoteRepo, type NoteRow } from '../repositories/noteRepo'
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
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
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
  input: { title: unknown; bodyMarkdown: unknown; visibility: unknown }
): ServiceResult<NoteJson> {
  const userRepo = new UserRepo(db)
  const campaignRepo = new CampaignRepo(db)
  const noteRepo = new NoteRepo(db)

  const campaign = campaignRepo.findById(campaignId)
  if (!campaign) return { ok: false, status: 404, error: 'Campaign not found.' }
  if (!campaignRepo.getRole(campaign.id, userId)) {
    return { ok: false, status: 403, error: 'Join this campaign first.' }
  }

  const { title, bodyMarkdown, visibility } = input
  if (typeof title !== 'string' || title.trim().length === 0) {
    return { ok: false, status: 400, error: 'A note needs a title.' }
  }
  if (visibility !== 'dm' && visibility !== 'shared') {
    return { ok: false, status: 400, error: 'Invalid visibility.' }
  }
  if (visibility === 'dm' && campaign.dm_user_id !== userId) {
    return { ok: false, status: 403, error: 'Only the DM can write private DM notes.' }
  }

  const row = noteRepo.create({
    campaignId: campaign.id,
    authorUserId: userId,
    title: title.trim(),
    bodyMarkdown: typeof bodyMarkdown === 'string' ? bodyMarkdown : '',
    visibility
  })
  return { ok: true, data: toNoteJson(userRepo, row) }
}

export function updateNote(
  db: DatabaseType,
  campaignId: string,
  noteId: string,
  userId: string,
  input: { title?: unknown; bodyMarkdown?: unknown }
): ServiceResult<NoteJson> {
  const userRepo = new UserRepo(db)
  const noteRepo = new NoteRepo(db)

  const note = noteRepo.findById(noteId)
  if (!note || note.campaign_id !== campaignId) {
    return { ok: false, status: 404, error: 'Note not found.' }
  }
  if (note.author_user_id !== userId) {
    return { ok: false, status: 403, error: 'Only the author can edit this note.' }
  }

  const updated = noteRepo.update(note.id, {
    title: typeof input.title === 'string' ? input.title.trim() : undefined,
    bodyMarkdown: typeof input.bodyMarkdown === 'string' ? input.bodyMarkdown : undefined
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
