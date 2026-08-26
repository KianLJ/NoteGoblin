import type { Database as DatabaseType } from 'better-sqlite3'
import { CampaignRepo, type CampaignRole, type CampaignRow } from '../repositories/campaignRepo'
import { NoteRepo, type NoteRow } from '../repositories/noteRepo'
import { FolderRepo, type FolderRow } from '../repositories/folderRepo'
import { MessageRepo, type MessageRow } from '../repositories/messageRepo'
import { CalendarRepo, type CalendarRow } from '../repositories/calendarRepo'
import { SessionDeckRepo, type SessionDeckRow } from '../repositories/sessionDeckRepo'
import { UserRepo } from '../repositories/userRepo'
import { stripDmAsides, type SessionScene } from '@shared/sessionDeck'
import { getVaultPath } from '../files/vaultConfig'
import { CampaignFileRepo, NoteFileRepo, FolderFileRepo } from '../files/vaultStore'
import {
  defaultCalendarConfig,
  generateWeatherSeed,
  SEASON_CLIMATE_PRESETS,
  type CalendarConfig,
  type CalendarWeekday,
  type CalendarMonth,
  type CalendarLeapRule,
  type CalendarEra,
  type CalendarDate,
  type CalendarSeason,
  type CalendarLocation,
  type CalendarClimate,
  type CalendarLocationClimateOverride,
  type CalendarDayNote,
  type CalendarMoon,
  type CalendarEvent
} from '@shared/calendar'

/**
 * Campaign/note logic shared by two callers: the host's HTTP API (for remote
 * players, only reachable while hosting is on) and the main process's direct
 * in-process path (for the DM working on their own table, which shouldn't
 * require the network server to be running at all). Both operate on the same
 * host SQLite file, so nothing needs to sync between them.
 */

/**
 * Campaigns/notes/folders switch to file-backed storage the moment a vault
 * folder is configured (see vaultConfig.ts) — everything below stays
 * unaware of which one it's actually talking to, since CampaignFileRepo/
 * NoteFileRepo/FolderFileRepo return rows shaped exactly like their SQLite
 * counterparts. The one exception is the active-campaign pointer
 * (host_state) and users, which always stay in SQLite regardless of vault
 * mode — see getActiveCampaign/setActiveCampaign/joinActiveCampaign below,
 * which use `db`'s own CampaignRepo directly for that pointer rather than
 * going through makeCampaignRepo.
 */
interface CampaignRepoLike {
  list(): CampaignRow[]
  findById(id: string): CampaignRow | undefined
  create(name: string, dmUserId: string): CampaignRow
  update(id: string, name: string): CampaignRow | undefined
  remove(id: string): void
  addMember(campaignId: string, userId: string, role: CampaignRole): void
  getRole(campaignId: string, userId: string): CampaignRole | null
}

interface NoteRepoLike {
  listVisibleTo(campaignId: string, userId: string): NoteRow[]
  findById(id: string): NoteRow | undefined
  create(input: {
    campaignId: string
    authorUserId: string
    title: string
    bodyMarkdown: string
    visibility: NoteRow['visibility']
    folderId: string | null
    sceneDeckId?: string | null
  }): NoteRow
  update(
    id: string,
    input: {
      title?: string
      bodyMarkdown?: string
      folderId?: string | null
      visibility?: NoteRow['visibility']
      editorUserIds?: string[]
      pinned?: boolean
    }
  ): NoteRow | undefined
  remove(id: string): void
}

interface FolderRepoLike {
  listVisibleTo(campaignId: string, userId: string): FolderRow[]
  findById(id: string): FolderRow | undefined
  create(input: {
    campaignId: string
    authorUserId: string
    name: string
    parentFolderId: string | null
    visibility: FolderRow['visibility']
  }): FolderRow
  update(id: string, input: { name?: string; parentFolderId?: string | null }): FolderRow | undefined
  setVisibilityCascade(rootId: string, visibility: FolderRow['visibility']): void
  remove(id: string): void
}

function makeCampaignRepo(db: DatabaseType): CampaignRepoLike {
  return getVaultPath() ? new CampaignFileRepo() : new CampaignRepo(db)
}

function makeNoteRepo(db: DatabaseType): NoteRepoLike {
  return getVaultPath() ? new NoteFileRepo() : new NoteRepo(db)
}

function makeFolderRepo(db: DatabaseType): FolderRepoLike {
  return getVaultPath() ? new FolderFileRepo() : new FolderRepo(db)
}

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
  visibility: 'dm' | 'shared' | 'private'
  folderId: string | null
  /** userIds (besides the author) allowed to edit this note's title/body — granted by the author only. */
  editorUserIds: string[]
  pinned: boolean
  /** Set only when this note is actually a session-deck scene (see shared/sessionDeck.ts) — hides it from the normal note sidebar tree client-side. */
  sceneDeckId: string | null
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
  visibility: 'dm' | 'shared' | 'private'
  createdAt: string
  updatedAt: string
}

export interface MessageJson {
  id: string
  campaignId: string
  channel: 'party' | 'whisper'
  senderUserId: string
  senderDisplayName: string
  /** Only set for a 'whisper' — the other side of the DM<->one-player thread. Null for 'party'. */
  recipientUserId: string | null
  body: string
  createdAt: string
}

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string }

function toCampaignJson(
  userRepo: UserRepo,
  campaignRepo: CampaignRepoLike,
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

function parseEditorUserIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

/**
 * `viewerIsDm` only matters for a scene note (row.scene_deck_id set) — its
 * `::`-prefixed lines are DM-only asides (see shared/sessionDeck.ts) that
 * must never reach a player, on ANY read path that can return this row, not
 * just the session-deck-specific one. A normal (non-scene) note ignores it
 * entirely since it has no such lines to strip.
 */
function toNoteJson(userRepo: UserRepo, row: NoteRow, viewerIsDm: boolean): NoteJson {
  const author = userRepo.findById(row.author_user_id)
  return {
    id: row.id,
    campaignId: row.campaign_id,
    authorUserId: row.author_user_id,
    authorDisplayName: author?.display_name ?? 'Unknown',
    title: row.title,
    bodyMarkdown: row.scene_deck_id && !viewerIsDm ? stripDmAsides(row.body_markdown) : row.body_markdown,
    visibility: row.visibility,
    folderId: row.folder_id,
    editorUserIds: parseEditorUserIds(row.editor_user_ids),
    pinned: !!row.pinned,
    sceneDeckId: row.scene_deck_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function toMessageJson(userRepo: UserRepo, row: MessageRow): MessageJson {
  const sender = userRepo.findById(row.sender_user_id)
  return {
    id: row.id,
    campaignId: row.campaign_id,
    channel: row.channel,
    senderUserId: row.sender_user_id,
    senderDisplayName: sender?.display_name ?? 'Unknown',
    recipientUserId: row.recipient_user_id,
    body: row.body,
    createdAt: row.created_at
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
  folderRepo: FolderRepoLike,
  campaignId: string,
  visibility: 'dm' | 'shared' | 'private',
  folderId: string | null
): { error: string } | { ok: true } {
  if (folderId === null) return { ok: true }
  const folder = folderRepo.findById(folderId)
  if (!folder || folder.campaign_id !== campaignId) return { error: 'Folder not found.' }
  if (folder.visibility !== visibility) return { error: 'A note can only live in a folder of the same visibility.' }
  return { ok: true }
}

/** Walks up from `startFolderId` through parent_folder_id — true if `candidateId` is `startFolderId` itself or any ancestor of it. Used to stop a folder being dragged into its own subtree. */
function isSelfOrDescendant(folderRepo: FolderRepoLike, candidateId: string, startFolderId: string): boolean {
  let current: string | null = startFolderId
  while (current) {
    if (current === candidateId) return true
    current = folderRepo.findById(current)?.parent_folder_id ?? null
  }
  return false
}

export function listCampaigns(db: DatabaseType, viewerUserId: string): ServiceResult<CampaignJson[]> {
  const userRepo = new UserRepo(db)
  const campaignRepo = makeCampaignRepo(db)
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
  const campaignRepo = makeCampaignRepo(db)
  const row = campaignRepo.create(name.trim(), dmUserId)
  return { ok: true, data: toCampaignJson(userRepo, campaignRepo, row, dmUserId) }
}

/** Only the DM (campaign owner) can rename their own campaign. */
export function renameCampaign(
  db: DatabaseType,
  campaignId: string,
  userId: string,
  name: string
): ServiceResult<CampaignJson> {
  if (typeof name !== 'string' || name.trim().length < 2) {
    return { ok: false, status: 400, error: 'Give your campaign a name (2+ characters).' }
  }
  const userRepo = new UserRepo(db)
  const campaignRepo = makeCampaignRepo(db)
  const row = campaignRepo.findById(campaignId)
  if (!row) return { ok: false, status: 404, error: 'Campaign not found.' }
  if (row.dm_user_id !== userId) return { ok: false, status: 403, error: 'Only the DM can rename this campaign.' }
  const updated = campaignRepo.update(campaignId, name.trim())
  if (!updated) return { ok: false, status: 404, error: 'Campaign not found.' }
  return { ok: true, data: toCampaignJson(userRepo, campaignRepo, updated, userId) }
}

/** Only the DM (campaign owner) can delete their own campaign — irreversible, everything in it (notes, folders, characters, messages, initiative) goes with it. The client is expected to have already confirmed with the user. */
export function deleteCampaign(db: DatabaseType, campaignId: string, userId: string): ServiceResult<void> {
  const campaignRepo = makeCampaignRepo(db)
  const row = campaignRepo.findById(campaignId)
  if (!row) return { ok: false, status: 404, error: 'Campaign not found.' }
  if (row.dm_user_id !== userId) return { ok: false, status: 403, error: 'Only the DM can delete this campaign.' }
  campaignRepo.remove(campaignId)
  // Characters/initiative/messages always stay in SQLite regardless of vault
  // mode (see the file-storage note atop this file) — in SQLite mode the
  // campaigns row's own ON DELETE CASCADE already cleaned these up, so this
  // is a harmless no-op there; in vault mode campaignRepo.remove() only
  // deleted the vault folder, so this is the only place these actually get
  // cleaned up.
  db.prepare('DELETE FROM characters WHERE campaign_id = ?').run(campaignId)
  db.prepare('DELETE FROM initiative_entries WHERE campaign_id = ?').run(campaignId)
  db.prepare('DELETE FROM messages WHERE campaign_id = ?').run(campaignId)
  db.prepare('DELETE FROM campaign_calendars WHERE campaign_id = ?').run(campaignId)
  db.prepare('DELETE FROM session_decks WHERE campaign_id = ?').run(campaignId)
  return { ok: true, data: undefined }
}

export function joinCampaign(
  db: DatabaseType,
  campaignId: string,
  userId: string
): ServiceResult<CampaignJson> {
  const userRepo = new UserRepo(db)
  const campaignRepo = makeCampaignRepo(db)
  const row = campaignRepo.findById(campaignId)
  if (!row) return { ok: false, status: 404, error: 'Campaign not found.' }
  campaignRepo.addMember(row.id, userId, 'player')
  return { ok: true, data: toCampaignJson(userRepo, campaignRepo, row, userId) }
}

/** Whatever campaign the DM currently has open — `null` if they haven't opened one (or aren't hosting anything yet). Not membership-gated: this is the discovery step a connecting player uses *before* they're necessarily a member of anything. The active-campaign pointer itself (host_state) always stays in SQLite regardless of vault mode — it's local app state, not campaign content — so it goes through `db`'s own CampaignRepo directly rather than makeCampaignRepo. */
export function getActiveCampaign(db: DatabaseType, viewerUserId: string): ServiceResult<CampaignJson | null> {
  const userRepo = new UserRepo(db)
  const campaignRepo = makeCampaignRepo(db)
  const activeId = new CampaignRepo(db).getActiveCampaignId()
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
  const campaignRepo = makeCampaignRepo(db)
  const row = campaignRepo.findById(campaignId)
  if (!row) return { ok: false, status: 404, error: 'Campaign not found.' }
  if (row.dm_user_id !== userId) return { ok: false, status: 403, error: 'Only the DM can set the active campaign.' }
  new CampaignRepo(db).setActiveCampaignId(row.id)
  return { ok: true, data: toCampaignJson(userRepo, campaignRepo, row, userId) }
}

/** A connecting player's one-step join — auto-adds them to whatever campaign the DM currently has active, instead of making them pick one from a list. */
export function joinActiveCampaign(db: DatabaseType, userId: string): ServiceResult<CampaignJson> {
  const activeId = new CampaignRepo(db).getActiveCampaignId()
  if (!activeId) return { ok: false, status: 404, error: "The DM hasn't started a session yet." }
  return joinCampaign(db, activeId, userId)
}

export function listNotes(
  db: DatabaseType,
  campaignId: string,
  userId: string
): ServiceResult<NoteJson[]> {
  const userRepo = new UserRepo(db)
  const campaignRepo = makeCampaignRepo(db)
  const noteRepo = makeNoteRepo(db)
  const campaign = campaignRepo.findById(campaignId)
  if (!campaign) return { ok: false, status: 404, error: 'Campaign not found.' }
  if (!campaignRepo.getRole(campaign.id, userId)) {
    return { ok: false, status: 403, error: 'Join this campaign first.' }
  }
  const rows = noteRepo.listVisibleTo(campaign.id, userId)
  const viewerIsDm = campaign.dm_user_id === userId
  // A scene note is 'shared' visibility (every member can normally read it),
  // but a player shouldn't be able to find one at all — via this list, a
  // wikilink, anything — until the DM has actually presented its deck at
  // least once (see markDeckPresented/listSessionDecks's matching filter).
  const visibleRows = viewerIsDm
    ? rows
    : rows.filter((row) => !row.scene_deck_id || !!new SessionDeckRepo(db).findById(row.scene_deck_id)?.presented_at)
  return { ok: true, data: visibleRows.map((row) => toNoteJson(userRepo, row, viewerIsDm)) }
}

export function createNote(
  db: DatabaseType,
  campaignId: string,
  userId: string,
  input: { title: unknown; bodyMarkdown: unknown; visibility: unknown; folderId?: unknown }
): ServiceResult<NoteJson> {
  const userRepo = new UserRepo(db)
  const campaignRepo = makeCampaignRepo(db)
  const noteRepo = makeNoteRepo(db)
  const folderRepo = makeFolderRepo(db)

  const campaign = campaignRepo.findById(campaignId)
  if (!campaign) return { ok: false, status: 404, error: 'Campaign not found.' }
  if (!campaignRepo.getRole(campaign.id, userId)) {
    return { ok: false, status: 403, error: 'Join this campaign first.' }
  }

  const { title, bodyMarkdown, visibility, folderId } = input
  if (typeof title !== 'string' || title.trim().length === 0) {
    return { ok: false, status: 400, error: 'A note needs a title.' }
  }
  if (visibility !== 'dm' && visibility !== 'shared' && visibility !== 'private') {
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
  return { ok: true, data: toNoteJson(userRepo, row, campaign.dm_user_id === userId) }
}

export function updateNote(
  db: DatabaseType,
  campaignId: string,
  noteId: string,
  userId: string,
  input: {
    title?: unknown
    bodyMarkdown?: unknown
    folderId?: unknown
    visibility?: unknown
    editorUserIds?: unknown
    pinned?: unknown
  }
): ServiceResult<NoteJson> {
  const userRepo = new UserRepo(db)
  const campaignRepo = makeCampaignRepo(db)
  const noteRepo = makeNoteRepo(db)
  const folderRepo = makeFolderRepo(db)

  const note = noteRepo.findById(noteId)
  if (!note || note.campaign_id !== campaignId) {
    return { ok: false, status: 404, error: 'Note not found.' }
  }
  const isAuthor = note.author_user_id === userId
  const isEditor = parseEditorUserIds(note.editor_user_ids).includes(userId)
  // The DM runs the table and can always step in on a party (shared) note —
  // a 'dm' visibility note is already only ever authored by the DM (isAuthor
  // covers it), so this only ever adds anything for a player-authored party
  // note. 'private' notes are excluded entirely — not even the DM can see or
  // edit another member's private notes.
  const isDm = campaignRepo.findById(note.campaign_id)?.dm_user_id === userId && note.visibility !== 'private'
  if (!isAuthor && !isEditor && !isDm) {
    return { ok: false, status: 403, error: 'Only the author, an invited editor, or the DM can edit this note.' }
  }
  // The editor list stays author-only — nobody else should be able to
  // grant/revoke someone else's access.
  if (!isAuthor && 'editorUserIds' in input) {
    return { ok: false, status: 403, error: "Only the author can change this note's editors." }
  }
  // A purely personal display preference (see NoteTreeSection's Pinned
  // section) — no reason for anyone but the author to toggle it.
  if (!isAuthor && 'pinned' in input) {
    return { ok: false, status: 403, error: 'Only the author can pin this note.' }
  }
  // Actually reassigning visibility (not just re-sending the current value —
  // the sidebar's drag/drop always includes a `visibility` field, even for a
  // move within the same section) stays author-only too, same reasoning:
  // nobody else should be able to flip a note to DM-only or pull it out of
  // its author's private notes.
  const visibilityActuallyChanging = 'visibility' in input && input.visibility !== note.visibility
  if (!isAuthor && visibilityActuallyChanging) {
    return { ok: false, status: 403, error: "Only the author can change this note's visibility." }
  }
  // Moving a note between folders (without changing its visibility) is
  // reorganizing the tree, not touching who can see or edit it — the DM
  // should be able to do that on a party note the same way they can edit
  // its content, same exclusion for 'private' notes as everywhere else.
  if (!isAuthor && !isDm && 'folderId' in input) {
    return { ok: false, status: 403, error: 'Only the author or the DM can move this note.' }
  }

  let editorUserIds: string[] | undefined
  if ('editorUserIds' in input) {
    if (!Array.isArray(input.editorUserIds) || !input.editorUserIds.every((id) => typeof id === 'string')) {
      return { ok: false, status: 400, error: 'Invalid editor list.' }
    }
    editorUserIds = input.editorUserIds
  }

  let visibility: 'dm' | 'shared' | 'private' | undefined
  if ('visibility' in input) {
    if (input.visibility !== 'dm' && input.visibility !== 'shared' && input.visibility !== 'private') {
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
    ...(visibility ? { visibility } : {}),
    ...(editorUserIds !== undefined ? { editorUserIds } : {}),
    ...(typeof input.pinned === 'boolean' ? { pinned: input.pinned } : {})
  })
  // Can genuinely come back undefined in vault mode: changing visibility
  // moves the note's underlying file into a different folder tree (Party
  // Notes/DM Only/Private), and update()'s own re-fetch-by-id can race that
  // move and miss it. Surfacing a clean error here beats crashing on
  // `undefined.author_user_id` in toNoteJson.
  if (!updated) return { ok: false, status: 404, error: 'Note not found after update — try again.' }
  return { ok: true, data: toNoteJson(userRepo, updated, isDm) }
}

export function deleteNote(
  db: DatabaseType,
  campaignId: string,
  noteId: string,
  userId: string
): ServiceResult<void> {
  const campaignRepo = makeCampaignRepo(db)
  const noteRepo = makeNoteRepo(db)
  const note = noteRepo.findById(noteId)
  if (!note || note.campaign_id !== campaignId) {
    return { ok: false, status: 404, error: 'Note not found.' }
  }
  // Same DM exception as editing/moving — excluded for 'private' notes, the
  // DM never gets a foothold on those.
  const isDm = campaignRepo.findById(note.campaign_id)?.dm_user_id === userId && note.visibility !== 'private'
  if (note.author_user_id !== userId && !isDm) {
    return { ok: false, status: 403, error: 'Only the author or the DM can delete this note.' }
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
  const campaignRepo = makeCampaignRepo(db)
  const folderRepo = makeFolderRepo(db)
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
  const campaignRepo = makeCampaignRepo(db)
  const folderRepo = makeFolderRepo(db)

  const campaign = campaignRepo.findById(campaignId)
  if (!campaign) return { ok: false, status: 404, error: 'Campaign not found.' }
  if (!campaignRepo.getRole(campaign.id, userId)) {
    return { ok: false, status: 403, error: 'Join this campaign first.' }
  }

  const { name, visibility, parentFolderId } = input
  if (typeof name !== 'string' || name.trim().length === 0) {
    return { ok: false, status: 400, error: 'A folder needs a name.' }
  }
  if (visibility !== 'dm' && visibility !== 'shared' && visibility !== 'private') {
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
  const campaignRepo = makeCampaignRepo(db)
  const folderRepo = makeFolderRepo(db)

  const folder = folderRepo.findById(folderId)
  if (!folder || folder.campaign_id !== campaignId) {
    return { ok: false, status: 404, error: 'Folder not found.' }
  }
  const isAuthor = folder.author_user_id === userId
  // Same DM exception as notes — the DM can reorganize a party folder's
  // place in the tree, but not rename it, change its visibility, or touch
  // a 'private' folder at all (no DM standing there, ever).
  const isDm = campaignRepo.findById(folder.campaign_id)?.dm_user_id === userId && folder.visibility !== 'private'
  if (!isAuthor && !isDm) {
    return { ok: false, status: 403, error: 'Only the author or the DM can edit this folder.' }
  }
  if (!isAuthor && ('name' in input || 'visibility' in input)) {
    return { ok: false, status: 403, error: "Only the author can rename or change this folder's visibility." }
  }

  let visibility: 'dm' | 'shared' | 'private' | undefined
  if ('visibility' in input) {
    if (input.visibility !== 'dm' && input.visibility !== 'shared' && input.visibility !== 'private') {
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
  // Can genuinely come back undefined in vault mode: the visibility cascade
  // above just moved this folder's underlying files into a different
  // folder tree (Party Notes/DM Only/Private), and update()'s own
  // re-fetch-by-id can race that move and miss it — this is exactly what
  // crashed on `undefined.author_user_id` in toFolderJson when dragging a
  // folder across visibility (e.g. DM Only -> Party Notes).
  if (!updated) return { ok: false, status: 404, error: 'Folder not found after update — try again.' }
  return { ok: true, data: toFolderJson(userRepo, updated) }
}

export function deleteFolder(
  db: DatabaseType,
  campaignId: string,
  folderId: string,
  userId: string
): ServiceResult<void> {
  const campaignRepo = makeCampaignRepo(db)
  const folderRepo = makeFolderRepo(db)
  const folder = folderRepo.findById(folderId)
  if (!folder || folder.campaign_id !== campaignId) {
    return { ok: false, status: 404, error: 'Folder not found.' }
  }
  const isDm = campaignRepo.findById(folder.campaign_id)?.dm_user_id === userId && folder.visibility !== 'private'
  if (folder.author_user_id !== userId && !isDm) {
    return { ok: false, status: 403, error: 'Only the author or the DM can delete this folder.' }
  }
  folderRepo.remove(folder.id)
  return { ok: true, data: undefined }
}

const MAX_MESSAGE_LENGTH = 4000

// Messages always live in SQLite regardless of vault mode (see
// vaultConfig.ts) — no makeMessageRepo/file-backed alternative needed, this
// is chat scrollback, not campaign content someone would want as a portable
// file.

export function listMessages(db: DatabaseType, campaignId: string, userId: string): ServiceResult<MessageJson[]> {
  const userRepo = new UserRepo(db)
  const campaignRepo = makeCampaignRepo(db)
  const messageRepo = new MessageRepo(db)
  const campaign = campaignRepo.findById(campaignId)
  if (!campaign) return { ok: false, status: 404, error: 'Campaign not found.' }
  if (!campaignRepo.getRole(campaign.id, userId)) {
    return { ok: false, status: 403, error: 'Join this campaign first.' }
  }
  const rows = messageRepo.listVisibleTo(campaign.id, userId)
  return { ok: true, data: rows.map((row) => toMessageJson(userRepo, row)) }
}

/**
 * `channel: 'party'` reaches the whole table (DM included); `'whisper'`
 * always resolves to the DM<->one-player thread regardless of what the
 * caller passes as `recipientUserId` — the DM must name which player
 * (any other campaign member is rejected), while a player's whisper is
 * always to the DM no matter what they send, since that's the only person
 * they're ever allowed to whisper.
 */
export function sendMessage(
  db: DatabaseType,
  campaignId: string,
  userId: string,
  input: { channel: unknown; recipientUserId?: unknown; body: unknown }
): ServiceResult<MessageJson> {
  const userRepo = new UserRepo(db)
  const campaignRepo = makeCampaignRepo(db)
  const messageRepo = new MessageRepo(db)

  const campaign = campaignRepo.findById(campaignId)
  if (!campaign) return { ok: false, status: 404, error: 'Campaign not found.' }
  if (!campaignRepo.getRole(campaign.id, userId)) {
    return { ok: false, status: 403, error: 'Join this campaign first.' }
  }

  const { channel, body } = input
  if (channel !== 'party' && channel !== 'whisper') {
    return { ok: false, status: 400, error: 'Invalid channel.' }
  }
  if (typeof body !== 'string' || body.trim().length === 0) {
    return { ok: false, status: 400, error: 'A message needs a body.' }
  }
  if (body.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, status: 400, error: 'That message is too long.' }
  }

  const isDm = campaign.dm_user_id === userId
  let recipientUserId: string | null = null
  if (channel === 'whisper') {
    if (isDm) {
      const target = input.recipientUserId
      if (typeof target !== 'string' || campaignRepo.getRole(campaign.id, target) !== 'player') {
        return { ok: false, status: 400, error: 'That player is not in this campaign.' }
      }
      recipientUserId = target
    } else {
      // A player can only ever whisper the DM — whatever recipientUserId
      // they sent is ignored rather than trusted.
      recipientUserId = campaign.dm_user_id
    }
  }

  const row = messageRepo.create({
    campaignId: campaign.id,
    channel,
    senderUserId: userId,
    recipientUserId,
    body: body.trim()
  })
  return { ok: true, data: toMessageJson(userRepo, row) }
}

// Calendars always live in SQLite regardless of vault mode (see the note
// above characters/initiative_entries/messages) — no makeCalendarRepo/
// file-backed alternative, so this uses CalendarRepo directly.

export interface CalendarJson {
  id: string
  campaignId: string
  config: CalendarConfig
  createdAt: string
  updatedAt: string
}

// Session decks always live in SQLite regardless of vault mode, same as
// calendars/characters/initiative_entries/messages above.

export interface SessionDeckJson {
  id: string
  campaignId: string
  title: string
  scenes: SessionScene[]
  createdAt: string
  updatedAt: string
}

/**
 * Re-validates rather than just casting the parsed JSON — a calendar saved
 * before a later stage added fields (seasons/locations/selectedLocationId/
 * currentWeather all landed after the first shippable version) would
 * otherwise come back missing them entirely, and every pure function in
 * shared/calendar.ts that reads e.g. `config.seasons.length` assumes that
 * array always exists. validateCalendarConfig already treats every field
 * added after `currentDate` as optional-with-a-default for exactly this
 * "older saved data" reason, so running old rows through it here normalizes
 * them the same way a save always would.
 */
function toCalendarJson(row: CalendarRow): CalendarJson {
  const parsed: unknown = JSON.parse(row.config_json)
  const validated = validateCalendarConfig(parsed)
  // Falling back to the raw, unvalidated JSON here was the actual bug behind
  // two prior "blank window" crashes: every pure function in
  // shared/calendar.ts assumes a fully-shaped CalendarConfig, and a
  // genuinely invalid stored row (rather than just one with older-shape
  // optional fields, which validateCalendarConfig already defaults) would
  // otherwise be handed straight to the renderer as-is. Falling back to a
  // blank calendar instead guarantees this can never crash the render again
  // — at worst a DM sees an empty calendar and has to rebuild it, instead of
  // the whole window going blank.
  const config = 'config' in validated ? validated.config : defaultCalendarConfig()
  return {
    id: row.id,
    campaignId: row.campaign_id,
    config,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/**
 * Defensive but not exhaustive — this only needs to guarantee the shape
 * shared/calendar.ts's pure date-math functions can safely run against
 * (no missing arrays, no NaN indices), not validate every field's semantic
 * sanity (e.g. a month named ''). A DM building their own calendar can type
 * whatever names/lengths they want.
 */
function validateCalendarConfig(input: unknown): { config: CalendarConfig } | { error: string } {
  if (typeof input !== 'object' || input === null) return { error: 'Invalid calendar.' }
  const obj = input as Record<string, unknown>

  if (!isString(obj.name)) return { error: 'A calendar needs a name.' }
  if (!isString(obj.description)) return { error: 'Invalid calendar description.' }
  if (!isString(obj.dateFormat) || obj.dateFormat.trim().length === 0) return { error: 'Invalid date format.' }
  if (!isString(obj.timeOfDay)) return { error: 'Invalid time of day.' }
  const temperatureUnit = obj.temperatureUnit === 'F' ? 'F' : 'C'

  if (!Array.isArray(obj.weekdays) || obj.weekdays.length === 0) return { error: 'Define at least one weekday.' }
  const weekdays: CalendarWeekday[] = []
  for (const w of obj.weekdays) {
    if (typeof w !== 'object' || w === null || !isString((w as never)['name']) || !isString((w as never)['abbreviation'])) {
      return { error: 'Invalid weekday.' }
    }
    weekdays.push({ name: (w as CalendarWeekday).name, abbreviation: (w as CalendarWeekday).abbreviation })
  }

  if (!Array.isArray(obj.months) || obj.months.length === 0) return { error: 'Define at least one month.' }
  const months: CalendarMonth[] = []
  for (const m of obj.months) {
    if (
      typeof m !== 'object' ||
      m === null ||
      !isString((m as never)['name']) ||
      !isFiniteNumber((m as never)['length']) ||
      (m as CalendarMonth).length < 1
    ) {
      return { error: 'Invalid month.' }
    }
    // Clamped, not just floored — an absurd length (a fat-fingered extra
    // digit or two) used to sail straight through into the calendar grid,
    // which would then try to render that many day cells and freeze the
    // whole window. 366 comfortably covers a real calendar's leap day and
    // any homebrew month within reason.
    months.push({ name: (m as CalendarMonth).name, length: Math.min(366, Math.max(1, Math.floor((m as CalendarMonth).length))) })
  }

  const leapRules: CalendarLeapRule[] = []
  if (obj.leapRules !== undefined) {
    if (!Array.isArray(obj.leapRules)) return { error: 'Invalid leap day rules.' }
    for (const r of obj.leapRules) {
      const rule = r as Partial<CalendarLeapRule>
      if (!isFiniteNumber(rule.monthIndex) || !isFiniteNumber(rule.interval) || !isFiniteNumber(rule.offset)) {
        return { error: 'Invalid leap day rule.' }
      }
      if (rule.monthIndex < 0 || rule.monthIndex >= months.length || rule.interval < 1) {
        return { error: 'A leap day rule points at a month that does not exist, or has a non-positive interval.' }
      }
      leapRules.push({ monthIndex: rule.monthIndex, interval: rule.interval, offset: rule.offset })
    }
  }

  const eras: CalendarEra[] = []
  if (obj.eras !== undefined) {
    if (!Array.isArray(obj.eras)) return { error: 'Invalid eras.' }
    for (const e of obj.eras) {
      const era = e as Partial<CalendarEra>
      if (!isString(era.id) || !isString(era.name) || !isString(era.description) || !isString(era.displayFormat) || !isFiniteNumber(era.startYear)) {
        return { error: 'Invalid era.' }
      }
      eras.push({ id: era.id, name: era.name, description: era.description, displayFormat: era.displayFormat, startYear: era.startYear })
    }
  }

  const rawDate = obj.currentDate as Partial<CalendarDate> | undefined
  if (
    typeof rawDate !== 'object' ||
    rawDate === null ||
    !isFiniteNumber(rawDate.year) ||
    !isFiniteNumber(rawDate.monthIndex) ||
    !isFiniteNumber(rawDate.day) ||
    rawDate.monthIndex < 0 ||
    rawDate.monthIndex >= months.length ||
    rawDate.day < 1
  ) {
    return { error: 'Invalid current date.' }
  }

  // Defaults rather than rejects a missing/malformed climate — seasons/
  // locations predate the climate model (they used to carry a discrete
  // `weatherTypes` list instead), and toCalendarJson re-runs stored data
  // through this same validator on every read to normalize it. If this
  // returned an error for that older shape, the whole config would fail
  // validation and toCalendarJson would fall back to the raw, still-broken
  // parsed JSON — which is exactly what crashed CalendarPanel/DayNoteEditor
  // (reading `.climate`/`.dayNotes` off data that never got normalized).
  const climateResult = (raw: unknown): { climate: CalendarClimate } => {
    const c = raw as Partial<CalendarClimate> | undefined
    if (
      typeof c !== 'object' ||
      c === null ||
      !isFiniteNumber(c.tempMin) ||
      !isFiniteNumber(c.tempMax) ||
      !isFiniteNumber(c.rainChance) ||
      !isFiniteNumber(c.cloudiness) ||
      !isFiniteNumber(c.windMinMph) ||
      !isFiniteNumber(c.windMaxMph)
    ) {
      return { climate: SEASON_CLIMATE_PRESETS.spring }
    }
    return {
      climate: {
        tempMin: c.tempMin,
        tempMax: c.tempMax,
        rainChance: Math.min(1, Math.max(0, c.rainChance)),
        cloudiness: Math.min(1, Math.max(0, c.cloudiness)),
        windMinMph: Math.max(0, c.windMinMph),
        windMaxMph: Math.max(0, c.windMaxMph)
      }
    }
  }

  const seasons: CalendarSeason[] = []
  if (obj.seasons !== undefined) {
    if (!Array.isArray(obj.seasons)) return { error: 'Invalid seasons.' }
    for (const s of obj.seasons) {
      const season = s as Partial<CalendarSeason>
      if (
        !isString(season.id) ||
        !isString(season.name) ||
        !isString(season.color) ||
        !isFiniteNumber(season.startMonthIndex) ||
        !isFiniteNumber(season.startDay) ||
        season.startMonthIndex < 0 ||
        season.startMonthIndex >= months.length ||
        season.startDay < 1
      ) {
        return { error: 'Invalid season.' }
      }
      const climate = climateResult(season.climate)
      // Defaults rather than rejects, same reasoning as climateResult — a
      // season saved before sunrise/sunset existed shouldn't fail the whole
      // config's validation on read.
      const sunriseHour = isFiniteNumber(season.sunriseHour) ? season.sunriseHour : 6
      const sunsetHour = isFiniteNumber(season.sunsetHour) ? season.sunsetHour : 18
      seasons.push({
        id: season.id,
        name: season.name,
        color: season.color,
        startMonthIndex: season.startMonthIndex,
        startDay: season.startDay,
        climate: climate.climate,
        sunriseHour,
        sunsetHour
      })
    }
  }

  const locations: CalendarLocation[] = []
  if (obj.locations !== undefined) {
    if (!Array.isArray(obj.locations)) return { error: 'Invalid locations.' }
    for (const l of obj.locations) {
      const location = l as Partial<CalendarLocation>
      if (!isString(location.id) || !isString(location.name) || !isString(location.description)) {
        return { error: 'Invalid location.' }
      }
      const monthOverrides: CalendarLocationClimateOverride[] = []
      if (location.monthOverrides !== undefined) {
        if (!Array.isArray(location.monthOverrides)) return { error: 'Invalid location climate overrides.' }
        for (const o of location.monthOverrides) {
          const override = o as Partial<CalendarLocationClimateOverride>
          if (!isFiniteNumber(override.monthIndex) || override.monthIndex < 0 || override.monthIndex >= months.length) {
            return { error: 'A location climate override points at a month that does not exist.' }
          }
          const climate = climateResult(override.climate)
          monthOverrides.push({ monthIndex: override.monthIndex, climate: climate.climate })
        }
      }
      locations.push({ id: location.id, name: location.name, description: location.description, monthOverrides })
    }
  }

  const selectedLocationId =
    isString(obj.selectedLocationId) && locations.some((l) => l.id === obj.selectedLocationId) ? obj.selectedLocationId : null

  const weatherSeed = isString(obj.weatherSeed) && obj.weatherSeed.trim().length > 0 ? obj.weatherSeed : generateWeatherSeed()

  const dayNotes: CalendarDayNote[] = []
  if (obj.dayNotes !== undefined) {
    if (!Array.isArray(obj.dayNotes)) return { error: 'Invalid day notes.' }
    for (const n of obj.dayNotes) {
      const note = n as Partial<CalendarDayNote>
      const noteDate = note.date as Partial<CalendarDate> | undefined
      if (
        typeof noteDate !== 'object' ||
        noteDate === null ||
        !isFiniteNumber(noteDate.year) ||
        !isFiniteNumber(noteDate.monthIndex) ||
        !isFiniteNumber(noteDate.day) ||
        !isString(note.text)
      ) {
        return { error: 'Invalid day note.' }
      }
      dayNotes.push({ date: { year: noteDate.year, monthIndex: noteDate.monthIndex, day: noteDate.day }, text: note.text })
    }
  }

  const moons: CalendarMoon[] = []
  if (obj.moons !== undefined) {
    if (!Array.isArray(obj.moons)) return { error: 'Invalid moons.' }
    for (const m of obj.moons) {
      const moon = m as Partial<CalendarMoon>
      if (!isString(moon.id) || !isString(moon.name) || !isString(moon.color) || !isFiniteNumber(moon.cycleDays) || !isFiniteNumber(moon.offset)) {
        return { error: 'Invalid moon.' }
      }
      moons.push({ id: moon.id, name: moon.name, color: moon.color, cycleDays: moon.cycleDays, offset: moon.offset })
    }
  }

  const events: CalendarEvent[] = []
  if (obj.events !== undefined) {
    if (!Array.isArray(obj.events)) return { error: 'Invalid events.' }
    for (const ev of obj.events) {
      const event = ev as Partial<CalendarEvent>
      const eventDate = event.date as Partial<CalendarDate> | undefined
      if (
        !isString(event.id) ||
        !isString(event.name) ||
        !isString(event.description) ||
        !isString(event.category) ||
        !isString(event.color) ||
        (event.repeat !== 'none' && event.repeat !== 'yearly' && event.repeat !== 'monthly' && event.repeat !== 'weekly') ||
        typeof eventDate !== 'object' ||
        eventDate === null ||
        !isFiniteNumber(eventDate.year) ||
        !isFiniteNumber(eventDate.monthIndex) ||
        !isFiniteNumber(eventDate.day)
      ) {
        return { error: 'Invalid event.' }
      }
      events.push({
        id: event.id,
        name: event.name,
        description: event.description,
        category: event.category,
        color: event.color,
        repeat: event.repeat,
        date: { year: eventDate.year, monthIndex: eventDate.monthIndex, day: eventDate.day },
        linkedNoteId: isString(event.linkedNoteId) ? event.linkedNoteId : null
      })
    }
  }

  return {
    config: {
      name: obj.name.trim(),
      description: obj.description,
      dateFormat: obj.dateFormat,
      timeOfDay: obj.timeOfDay,
      temperatureUnit,
      weekdays,
      months,
      leapRules,
      eras,
      currentDate: { year: rawDate.year, monthIndex: rawDate.monthIndex, day: rawDate.day },
      seasons,
      locations,
      selectedLocationId,
      weatherSeed,
      dayNotes,
      moons,
      events
    }
  }
}

/** Every campaign member can read the calendar — null if the DM hasn't created one yet. */
export function getCalendar(db: DatabaseType, campaignId: string, userId: string): ServiceResult<CalendarJson | null> {
  const campaignRepo = makeCampaignRepo(db)
  const campaign = campaignRepo.findById(campaignId)
  if (!campaign) return { ok: false, status: 404, error: 'Campaign not found.' }
  if (!campaignRepo.getRole(campaign.id, userId)) {
    return { ok: false, status: 403, error: 'Join this campaign first.' }
  }
  const row = new CalendarRepo(db).findByCampaignId(campaignId)
  return { ok: true, data: row ? toCalendarJson(row) : null }
}

/** Only the DM can create or edit their campaign's calendar — replaces the whole config (creation and every later edit, including just advancing the current date, all go through this one entry point). */
export function saveCalendar(
  db: DatabaseType,
  campaignId: string,
  userId: string,
  input: unknown
): ServiceResult<CalendarJson> {
  const campaignRepo = makeCampaignRepo(db)
  const campaign = campaignRepo.findById(campaignId)
  if (!campaign) return { ok: false, status: 404, error: 'Campaign not found.' }
  if (campaign.dm_user_id !== userId) return { ok: false, status: 403, error: 'Only the DM can edit the calendar.' }

  const validated = validateCalendarConfig(input)
  if ('error' in validated) return { ok: false, status: 400, error: validated.error }

  const row = new CalendarRepo(db).upsert(campaignId, JSON.stringify(validated.config))
  return { ok: true, data: toCalendarJson(row) }
}

/** Only the DM can delete their campaign's calendar — irreversible, the same as deleting a note/folder/campaign. The client is expected to have already confirmed with the user. */
export function deleteCalendar(db: DatabaseType, campaignId: string, userId: string): ServiceResult<void> {
  const campaignRepo = makeCampaignRepo(db)
  const campaign = campaignRepo.findById(campaignId)
  if (!campaign) return { ok: false, status: 404, error: 'Campaign not found.' }
  if (campaign.dm_user_id !== userId) return { ok: false, status: 403, error: 'Only the DM can delete the calendar.' }
  new CalendarRepo(db).remove(campaignId)
  return { ok: true, data: undefined }
}

function parseScenes(raw: string): SessionScene[] {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((s): s is { noteId: unknown; encounterId?: unknown } => typeof s === 'object' && s !== null && typeof s.noteId === 'string')
      .map((s) => ({
        noteId: s.noteId as string,
        encounterId: typeof s.encounterId === 'string' ? s.encounterId : null
      }))
  } catch {
    return []
  }
}

/** Validates and normalizes a `scenes` patch straight off the wire (reordering, or changing which encounter a scene links to) — every entry must reference a noteId that's genuinely one of this deck's existing scenes; you can't smuggle in an arbitrary note by id, or drop/add entries this way (see addSceneToDeck/removeSceneFromDeck for the only ways a scene's membership actually changes). */
function validateSceneReorder(existing: SessionScene[], input: unknown): { scenes: SessionScene[] } | { error: string } {
  if (!Array.isArray(input)) return { error: 'Scenes must be an array.' }
  const existingIds = new Set(existing.map((s) => s.noteId))
  const scenes: SessionScene[] = []
  for (const s of input) {
    if (typeof s !== 'object' || s === null) return { error: 'Invalid scene.' }
    const noteId = (s as { noteId?: unknown }).noteId
    if (typeof noteId !== 'string' || !existingIds.has(noteId)) return { error: 'Invalid scene.' }
    const encounterId = (s as { encounterId?: unknown }).encounterId
    scenes.push({ noteId, encounterId: typeof encounterId === 'string' ? encounterId : null })
  }
  if (scenes.length !== existing.length || new Set(scenes.map((s) => s.noteId)).size !== existing.length) {
    return { error: 'Scenes must match the deck\'s existing scenes exactly (reorder/relink only).' }
  }
  return { scenes }
}

function toSessionDeckJson(row: SessionDeckRow): SessionDeckJson {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    title: row.title,
    // Just the ordering + encounter link — a scene's actual title/body is a
    // real Note (see toNoteJson's DM-aside stripping for how the content
    // itself stays safe for players). encounterId IS dropped for players,
    // but that happens in registerIpc/sessionHost before this reaches them
    // (see campaignService.listSessionDecks), not here.
    scenes: parseScenes(row.scenes_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/** Every campaign member can list session decks — players get every scene's encounterId dropped (DM-only metadata, same reasoning as a scene note's `::` asides), the DM sees everything. A scene's actual content is a real Note, fetched the normal way via listNotes/notes:list. */
export function listSessionDecks(db: DatabaseType, campaignId: string, userId: string): ServiceResult<SessionDeckJson[]> {
  const campaignRepo = makeCampaignRepo(db)
  const campaign = campaignRepo.findById(campaignId)
  if (!campaign) return { ok: false, status: 404, error: 'Campaign not found.' }
  if (!campaignRepo.getRole(campaign.id, userId)) {
    return { ok: false, status: 403, error: 'Join this campaign first.' }
  }
  const isDm = campaign.dm_user_id === userId
  const rows = new SessionDeckRepo(db).listByCampaign(campaignId)
  return {
    ok: true,
    data: rows
      // A deck the DM hasn't presented yet is future-session prep — never
      // listed for a player at all, not just its scenes hidden, so there's
      // nothing to browse ahead of the DM's narration. Once presented, a
      // deck stays visible forever (presented_at never resets), so past
      // sessions stay browsable exactly like the DM's own view.
      .filter((row) => isDm || row.presented_at !== null)
      .map((row) => {
        const deck = toSessionDeckJson(row)
        return isDm ? deck : { ...deck, scenes: deck.scenes.map((s) => ({ noteId: s.noteId, encounterId: null })) }
      })
  }
}

/** Only the DM can present a deck — flips its one-way "has this ever gone live" flag (see the schema comment), which is what makes it visible to players at all (see listSessionDecks). A no-op if it's already been presented before. */
export function markDeckPresented(db: DatabaseType, campaignId: string, deckId: string, userId: string): ServiceResult<void> {
  const campaignRepo = makeCampaignRepo(db)
  const campaign = campaignRepo.findById(campaignId)
  if (!campaign) return { ok: false, status: 404, error: 'Campaign not found.' }
  if (campaign.dm_user_id !== userId) return { ok: false, status: 403, error: 'Only the DM can present a session deck.' }
  const deckRepo = new SessionDeckRepo(db)
  const existing = deckRepo.findById(deckId)
  if (!existing || existing.campaign_id !== campaignId) return { ok: false, status: 404, error: 'Session deck not found.' }
  deckRepo.markPresented(deckId)
  return { ok: true, data: undefined }
}

/** Only the DM can create a session deck. */
export function createSessionDeck(db: DatabaseType, campaignId: string, userId: string, title: unknown): ServiceResult<SessionDeckJson> {
  const campaignRepo = makeCampaignRepo(db)
  const campaign = campaignRepo.findById(campaignId)
  if (!campaign) return { ok: false, status: 404, error: 'Campaign not found.' }
  if (campaign.dm_user_id !== userId) return { ok: false, status: 403, error: 'Only the DM can create a session deck.' }
  const row = new SessionDeckRepo(db).create({ campaignId, title: typeof title === 'string' && title.trim() ? title.trim() : 'Untitled Session' })
  return { ok: true, data: toSessionDeckJson(row) }
}

/** Only the DM can rename a deck, or reorder/relink (not add/remove) its scenes. */
export function updateSessionDeck(
  db: DatabaseType,
  campaignId: string,
  deckId: string,
  userId: string,
  input: { title?: unknown; scenes?: unknown }
): ServiceResult<SessionDeckJson> {
  const campaignRepo = makeCampaignRepo(db)
  const campaign = campaignRepo.findById(campaignId)
  if (!campaign) return { ok: false, status: 404, error: 'Campaign not found.' }
  if (campaign.dm_user_id !== userId) return { ok: false, status: 403, error: 'Only the DM can edit a session deck.' }

  const deckRepo = new SessionDeckRepo(db)
  const existing = deckRepo.findById(deckId)
  if (!existing || existing.campaign_id !== campaignId) return { ok: false, status: 404, error: 'Session deck not found.' }

  let scenesJson: string | undefined
  if ('scenes' in input) {
    const validated = validateSceneReorder(parseScenes(existing.scenes_json), input.scenes)
    if ('error' in validated) return { ok: false, status: 400, error: validated.error }
    scenesJson = JSON.stringify(validated.scenes)
  }

  const updated = deckRepo.update(deckId, {
    title: typeof input.title === 'string' ? input.title.trim() : undefined,
    scenesJson
  })
  if (!updated) return { ok: false, status: 404, error: 'Session deck not found after update — try again.' }
  return { ok: true, data: toSessionDeckJson(updated) }
}

/** Only the DM can delete a session deck — irreversible, and takes every one of its scene notes with it (they're not meaningful as free-floating notes). The client is expected to have already confirmed with the user. */
export function deleteSessionDeck(db: DatabaseType, campaignId: string, deckId: string, userId: string): ServiceResult<void> {
  const campaignRepo = makeCampaignRepo(db)
  const campaign = campaignRepo.findById(campaignId)
  if (!campaign) return { ok: false, status: 404, error: 'Campaign not found.' }
  if (campaign.dm_user_id !== userId) return { ok: false, status: 403, error: 'Only the DM can delete a session deck.' }
  const deckRepo = new SessionDeckRepo(db)
  const existing = deckRepo.findById(deckId)
  if (!existing || existing.campaign_id !== campaignId) return { ok: false, status: 404, error: 'Session deck not found.' }
  const noteRepo = makeNoteRepo(db)
  for (const scene of parseScenes(existing.scenes_json)) noteRepo.remove(scene.noteId)
  deckRepo.remove(deckId)
  return { ok: true, data: undefined }
}

/** Only the DM can add a scene — creates a real 'shared'-visibility Note (marked via sceneDeckId so it's hidden from the normal sidebar tree and has its `::` asides stripped for players — see toNoteJson) and appends it to the deck. Returns the new Note, not the deck — the caller already has the deck's other data and just needs this scene's note to open as a tab. */
export function addSceneToDeck(db: DatabaseType, campaignId: string, deckId: string, userId: string, title: unknown): ServiceResult<NoteJson> {
  const userRepo = new UserRepo(db)
  const campaignRepo = makeCampaignRepo(db)
  const campaign = campaignRepo.findById(campaignId)
  if (!campaign) return { ok: false, status: 404, error: 'Campaign not found.' }
  if (campaign.dm_user_id !== userId) return { ok: false, status: 403, error: 'Only the DM can add a scene.' }

  const deckRepo = new SessionDeckRepo(db)
  const deck = deckRepo.findById(deckId)
  if (!deck || deck.campaign_id !== campaignId) return { ok: false, status: 404, error: 'Session deck not found.' }

  const noteRepo = makeNoteRepo(db)
  const note = noteRepo.create({
    campaignId,
    authorUserId: userId,
    title: typeof title === 'string' && title.trim() ? title.trim() : 'Untitled Scene',
    bodyMarkdown: '',
    visibility: 'shared',
    folderId: null,
    sceneDeckId: deckId
  })

  const scenes = [...parseScenes(deck.scenes_json), { noteId: note.id, encounterId: null }]
  deckRepo.update(deckId, { scenesJson: JSON.stringify(scenes) })

  return { ok: true, data: toNoteJson(userRepo, note, true) }
}

/** Only the DM can remove a scene — removes it from the deck's ordering AND deletes the underlying note (a scene note isn't meaningful floating around outside its deck). */
export function removeSceneFromDeck(db: DatabaseType, campaignId: string, deckId: string, userId: string, noteId: string): ServiceResult<void> {
  const campaignRepo = makeCampaignRepo(db)
  const campaign = campaignRepo.findById(campaignId)
  if (!campaign) return { ok: false, status: 404, error: 'Campaign not found.' }
  if (campaign.dm_user_id !== userId) return { ok: false, status: 403, error: 'Only the DM can remove a scene.' }

  const deckRepo = new SessionDeckRepo(db)
  const deck = deckRepo.findById(deckId)
  if (!deck || deck.campaign_id !== campaignId) return { ok: false, status: 404, error: 'Session deck not found.' }

  const scenes = parseScenes(deck.scenes_json).filter((s) => s.noteId !== noteId)
  deckRepo.update(deckId, { scenesJson: JSON.stringify(scenes) })
  makeNoteRepo(db).remove(noteId)
  return { ok: true, data: undefined }
}
