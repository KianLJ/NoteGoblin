import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { v4 as uuid } from 'uuid'
import { getVaultPath } from './vaultConfig'
import { parseNote, serializeNote, type NoteFrontmatter } from './frontmatter'

/**
 * File-backed replacement for CampaignRepo/NoteRepo/FolderRepo, used instead
 * of the SQLite repos once a vault folder is configured (see vaultConfig.ts).
 * campaignService.ts picks between the SQLite and file repos per call —
 * everything else (permission checks, JSON shaping) is unaware which one is
 * actually backing it, because these classes return rows shaped exactly like
 * NoteRow/FolderRow/CampaignRow.
 *
 * Layout on disk, under the chosen vault folder:
 *   <campaign-slug>-<id8>/
 *     campaign.json                 — { id, name, dmUserId, createdAt, members }
 *     Party Notes/...                — 'shared' visibility tree
 *     DM Only/...                    — 'dm' visibility tree
 *     Private Notes/<authorUserId>/...  — one 'private' subtree per member
 *
 * A note is a `Title.md` file: YAML frontmatter (id/authorUserId/
 * editorUserIds/timestamps, see frontmatter.ts) + the raw markdown body.
 * The frontmatter id is a stable UUID independent of the filename, so
 * renaming a note (which renames the file) doesn't change its id — that
 * matters because the renderer holds onto note ids across a rename (open
 * tabs, the active note). A folder is just a real directory; a `.folder.json`
 * sidecar inside it carries the metadata (author, timestamps) a plain OS
 * directory doesn't have. Folders don't need the same rename-preserves-id
 * guarantee notes do (the only client state keyed by folder id is
 * expand/collapse and current selection, both harmless to lose), so a
 * folder's id is simply its path.
 */

export type FileVisibility = 'dm' | 'shared' | 'private'

const SHARED_DIR = 'Party Notes'
const DM_DIR = 'DM Only'
const PRIVATE_ROOT_DIR = 'Private Notes'
const FOLDER_META_FILE = '.folder.json'
const NOTE_EXT = '.md'

function vaultRoot(): string {
  const path = getVaultPath()
  if (!path) throw new Error('No vault folder configured.')
  return path
}

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'campaign'
}

/** Windows/macOS/Linux-safe filename — strips path separators and other reserved characters, collapses whitespace, caps length. */
function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[/\\:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned.length > 0 ? cleaned : 'Untitled').slice(0, 120)
}

function toPosix(p: string): string {
  return p.split(sep).join('/')
}

function toNative(posixPath: string): string[] {
  return posixPath.split('/').filter(Boolean)
}

/** Appends " (2)", " (3)", … to `fileName` (before the extension) until it doesn't collide with anything already in `dir` — `keepAbsPath` lets a rename/move keep its own current path without treating that as a collision against itself. */
function uniqueFilePath(dir: string, fileName: string, keepAbsPath?: string): string {
  const dot = fileName.lastIndexOf('.')
  const stem = dot === -1 ? fileName : fileName.slice(0, dot)
  const ext = dot === -1 ? '' : fileName.slice(dot)
  let candidate = join(dir, fileName)
  let n = 2
  while (existsSync(candidate) && candidate !== keepAbsPath) {
    candidate = join(dir, `${stem} (${n})${ext}`)
    n += 1
  }
  return candidate
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export interface CampaignFileRow {
  id: string
  name: string
  dm_user_id: string
  created_at: string
}

export type CampaignRole = 'dm' | 'player'

interface CampaignMemberEntry {
  userId: string
  role: CampaignRole
  joinedAt: string
}

interface CampaignFileJson {
  id: string
  name: string
  dmUserId: string
  createdAt: string
  members: CampaignMemberEntry[]
}

function listCampaignDirs(): string[] {
  const root = vaultRoot()
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(root, e.name))
    .filter((dir) => existsSync(join(dir, 'campaign.json')))
}

function readCampaignJson(dir: string): CampaignFileJson | null {
  try {
    return JSON.parse(readFileSync(join(dir, 'campaign.json'), 'utf8')) as CampaignFileJson
  } catch {
    return null
  }
}

function writeCampaignJson(dir: string, json: CampaignFileJson): void {
  writeFileSync(join(dir, 'campaign.json'), JSON.stringify(json, null, 2), 'utf8')
}

/** Exported for noteFileStore's use — resolves a campaignId to its on-disk folder + parsed campaign.json, scanning the vault since folder names aren't derived from id alone. */
export function findCampaignDir(id: string): { dir: string; json: CampaignFileJson } | null {
  for (const dir of listCampaignDirs()) {
    const json = readCampaignJson(dir)
    if (json?.id === id) return { dir, json }
  }
  return null
}

/** Which campaign (if any) owns a changed path — used by the vault file watcher (see registerIpc.ts) to know which campaign to refresh after an edit made outside the app (Explorer, Obsidian, git, …). Just checks the top-level campaign-folder segment rather than walking up from the file; that's all a change notification needs. */
export function campaignIdForVaultPath(absPath: string): string | null {
  const root = vaultRoot()
  const rel = relative(root, absPath)
  if (!rel || rel.startsWith('..')) return null
  const topSegment = rel.split(sep)[0]
  const json = readCampaignJson(join(root, topSegment))
  return json?.id ?? null
}

function toCampaignRow(json: CampaignFileJson): CampaignFileRow {
  return { id: json.id, name: json.name, dm_user_id: json.dmUserId, created_at: json.createdAt }
}

export class CampaignFileRepo {
  list(): CampaignFileRow[] {
    return listCampaignDirs()
      .map(readCampaignJson)
      .filter((j): j is CampaignFileJson => j !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toCampaignRow)
  }

  findById(id: string): CampaignFileRow | undefined {
    const found = findCampaignDir(id)
    return found ? toCampaignRow(found.json) : undefined
  }

  /** `existingId`/`createdAt` are set when migrating an already-existing SQLite campaign, so its id — and anything referencing it, like a character's campaign_id — stays valid across the switch to files. */
  create(name: string, dmUserId: string, existingId?: string, createdAt?: string): CampaignFileRow {
    const id = existingId ?? uuid()
    const stamp = createdAt ?? new Date().toISOString()
    const root = vaultRoot()
    mkdirSync(root, { recursive: true })
    const base = `${slugify(name)}-${id.slice(0, 8)}`
    let dir = join(root, base)
    let n = 2
    while (existsSync(dir)) {
      dir = join(root, `${base}-${n}`)
      n += 1
    }
    mkdirSync(dir, { recursive: true })
    mkdirSync(join(dir, SHARED_DIR), { recursive: true })
    mkdirSync(join(dir, DM_DIR), { recursive: true })
    mkdirSync(join(dir, PRIVATE_ROOT_DIR), { recursive: true })
    const json: CampaignFileJson = {
      id,
      name,
      dmUserId,
      createdAt: stamp,
      members: [{ userId: dmUserId, role: 'dm', joinedAt: stamp }]
    }
    writeCampaignJson(dir, json)
    return toCampaignRow(json)
  }

  addMember(campaignId: string, userId: string, role: CampaignRole): void {
    const found = findCampaignDir(campaignId)
    if (!found) return
    if (found.json.members.some((m) => m.userId === userId)) return
    found.json.members.push({ userId, role, joinedAt: new Date().toISOString() })
    writeCampaignJson(found.dir, found.json)
  }

  getRole(campaignId: string, userId: string): CampaignRole | null {
    const found = findCampaignDir(campaignId)
    return found?.json.members.find((m) => m.userId === userId)?.role ?? null
  }

  /** Renames the campaign's display name only — the on-disk folder name is chosen once at creation and stays put, so existing note paths/links never move underneath anyone just because the campaign got renamed. */
  update(id: string, name: string): CampaignFileRow | undefined {
    const found = findCampaignDir(id)
    if (!found) return undefined
    const json: CampaignFileJson = { ...found.json, name }
    writeCampaignJson(found.dir, json)
    return toCampaignRow(json)
  }

  /** Deletes the whole campaign folder — every note, folder, and the campaign.json itself. Irreversible; callers are expected to have already confirmed with the user. */
  remove(id: string): void {
    const found = findCampaignDir(id)
    if (!found) return
    rmSync(found.dir, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// Notes & folders
// ---------------------------------------------------------------------------

export interface NoteFileRow {
  id: string
  campaign_id: string
  author_user_id: string
  title: string
  body_markdown: string
  visibility: FileVisibility
  folder_id: string | null
  /** JSON-encoded array, matching NoteRow's shape so campaignService's parseEditorUserIds works unmodified. */
  editor_user_ids: string
  created_at: string
  updated_at: string
}

export interface FolderFileRow {
  id: string
  campaign_id: string
  author_user_id: string
  name: string
  parent_folder_id: string | null
  visibility: FileVisibility
  created_at: string
  updated_at: string
}

function sectionRel(visibility: FileVisibility, authorUserId: string): string {
  if (visibility === 'shared') return SHARED_DIR
  if (visibility === 'dm') return DM_DIR
  return `${PRIVATE_ROOT_DIR}/${authorUserId}`
}

function visibilityOfRel(rel: string): FileVisibility | null {
  const top = rel.split('/')[0]
  if (top === SHARED_DIR) return 'shared'
  if (top === DM_DIR) return 'dm'
  if (top === PRIVATE_ROOT_DIR) return 'private'
  return null
}

/** The owning member's userId for a path under `Private Notes/<userId>/...` — recovered from the path itself since that's where it's stored (full id, not shortened, so it round-trips exactly). */
function privateOwnerUserId(rel: string): string | null {
  const parts = rel.split('/')
  return parts[0] === PRIVATE_ROOT_DIR && parts[1] ? parts[1] : null
}

interface FolderMeta {
  authorUserId: string
  createdAt: string
  updatedAt: string
}

function readFolderMeta(dir: string): FolderMeta | null {
  try {
    return JSON.parse(readFileSync(join(dir, FOLDER_META_FILE), 'utf8')) as FolderMeta
  } catch {
    return null
  }
}

function writeFolderMeta(dir: string, meta: FolderMeta): void {
  writeFileSync(join(dir, FOLDER_META_FILE), JSON.stringify(meta, null, 2), 'utf8')
}

/** A folder created outside the app (or migrated) has no `.folder.json` yet — default its ownership to whoever's subtree it lives under (the DM for Party/DM Only, the private owner for Private Notes) rather than refusing to show it. */
function folderMetaOrDefault(dir: string, rel: string, dmUserId: string): FolderMeta {
  const existing = readFolderMeta(dir)
  if (existing) return existing
  const owner = privateOwnerUserId(rel) ?? dmUserId
  let createdAt = new Date().toISOString()
  try {
    createdAt = statSync(dir).birthtime.toISOString()
  } catch {
    // best-effort only
  }
  return { authorUserId: owner, createdAt, updatedAt: createdAt }
}

interface WalkResult {
  notes: NoteFileRow[]
  folders: FolderFileRow[]
}

function walkSection(
  campaignId: string,
  dmUserId: string,
  sectionAbsRoot: string,
  sectionRelRoot: string,
  visibility: FileVisibility
): WalkResult {
  const notes: NoteFileRow[] = []
  const folders: FolderFileRow[] = []

  function walk(absDir: string, rel: string, parentFolderId: string | null): void {
    if (!existsSync(absDir)) return
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      const absPath = join(absDir, entry.name)
      const relPath = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        const meta = folderMetaOrDefault(absPath, toPosix(relPath), dmUserId)
        const folderId = toPosix(relPath)
        folders.push({
          id: folderId,
          campaign_id: campaignId,
          author_user_id: meta.authorUserId,
          name: entry.name,
          parent_folder_id: parentFolderId,
          visibility,
          created_at: meta.createdAt,
          updated_at: meta.updatedAt
        })
        walk(absPath, relPath, folderId)
      } else if (entry.isFile() && entry.name.endsWith(NOTE_EXT)) {
        let raw: string
        try {
          raw = readFileSync(absPath, 'utf8')
        } catch {
          continue
        }
        let parsed = parseNote(raw)
        if (!parsed) {
          // A .md file with no (or foreign) frontmatter — e.g. copied in
          // from an Obsidian vault or some other tool — rather than hide it
          // from the sidebar entirely, adopt it: stamp our frontmatter on
          // top now, treating whatever was already in the file as the body.
          // From this point on it's a normal tracked note.
          const owner = privateOwnerUserId(rel) ?? dmUserId
          const now = new Date().toISOString()
          const fm: NoteFrontmatter = { id: uuid(), authorUserId: owner, editorUserIds: [], createdAt: now, updatedAt: now }
          try {
            writeFileSync(absPath, serializeNote(fm, raw), 'utf8')
          } catch {
            continue
          }
          parsed = { frontmatter: fm, body: raw }
        }
        notes.push({
          id: parsed.frontmatter.id,
          campaign_id: campaignId,
          author_user_id: parsed.frontmatter.authorUserId,
          title: entry.name.slice(0, -NOTE_EXT.length),
          body_markdown: parsed.body,
          visibility,
          folder_id: parentFolderId,
          editor_user_ids: JSON.stringify(parsed.frontmatter.editorUserIds),
          created_at: parsed.frontmatter.createdAt,
          updated_at: parsed.frontmatter.updatedAt
        })
      }
    }
  }

  walk(sectionAbsRoot, sectionRelRoot, null)
  return { notes, folders }
}

/** Every section this viewer can see: Party always, DM Only only if they're the DM, and every existing `Private Notes/<uid>` subfolder but scoped so only its own owner's notes/folders come back (mirrors NoteRepo.listVisibleTo's 'dm'-visibility rule extended to 'private'). */
function visibleSections(campaignDir: string, viewerUserId: string, viewerIsDm: boolean): Array<{ abs: string; rel: string; visibility: FileVisibility }> {
  const sections: Array<{ abs: string; rel: string; visibility: FileVisibility }> = [
    { abs: join(campaignDir, SHARED_DIR), rel: SHARED_DIR, visibility: 'shared' }
  ]
  if (viewerIsDm) sections.push({ abs: join(campaignDir, DM_DIR), rel: DM_DIR, visibility: 'dm' })
  const ownPrivateRel = `${PRIVATE_ROOT_DIR}/${viewerUserId}`
  sections.push({ abs: join(campaignDir, ...toNative(ownPrivateRel)), rel: ownPrivateRel, visibility: 'private' })
  return sections
}

function walkVisible(campaignDir: string, campaignId: string, dmUserId: string, viewerUserId: string, viewerIsDm: boolean): WalkResult {
  const notes: NoteFileRow[] = []
  const folders: FolderFileRow[] = []
  for (const section of visibleSections(campaignDir, viewerUserId, viewerIsDm)) {
    const result = walkSection(campaignId, dmUserId, section.abs, section.rel, section.visibility)
    notes.push(...result.notes)
    folders.push(...result.folders)
  }
  return { notes, folders }
}

interface FoundNote {
  absPath: string
  campaignDir: string
  campaignId: string
  visibility: FileVisibility
  folderId: string | null
  frontmatter: NoteFrontmatter
  body: string
}

/** Notes have no location clue in their id (a stable UUID, deliberately independent of path) — finding one means walking every section of every campaign until frontmatter matches. Fine for the vault sizes this is meant for; if that ever becomes a real cost, an id→path cache would be the next step. */
function findNoteEverywhere(id: string): FoundNote | null {
  for (const campaignDir of listCampaignDirs()) {
    const json = readCampaignJson(campaignDir)
    if (!json) continue
    const sectionsToSearch = [
      { rel: SHARED_DIR, visibility: 'shared' as const },
      { rel: DM_DIR, visibility: 'dm' as const },
      ...json.members.map((m) => ({ rel: `${PRIVATE_ROOT_DIR}/${m.userId}`, visibility: 'private' as const }))
    ]
    for (const section of sectionsToSearch) {
      const found = findNoteInDir(campaignDir, join(campaignDir, ...toNative(section.rel)), section.rel, id)
      if (found) return { ...found, campaignDir, campaignId: json.id, visibility: section.visibility }
    }
  }
  return null
}

function findNoteInDir(
  campaignDir: string,
  absDir: string,
  rel: string,
  id: string
): { absPath: string; folderId: string | null; frontmatter: NoteFrontmatter; body: string } | null {
  if (!existsSync(absDir)) return null
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const absPath = join(absDir, entry.name)
    const relPath = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      const nested = findNoteInDir(campaignDir, absPath, relPath, id)
      if (nested) return nested
    } else if (entry.isFile() && entry.name.endsWith(NOTE_EXT)) {
      let raw: string
      try {
        raw = readFileSync(absPath, 'utf8')
      } catch {
        continue
      }
      const parsed = parseNote(raw)
      if (parsed && parsed.frontmatter.id === id) {
        const parentRel = rel
        // parent_folder_id is null when the note sits directly at its section's root ("Party Notes"/"DM Only" are one path segment, "Private Notes/<uid>" is two), not inside a sub-folder.
        const parentVisibility = visibilityOfRel(parentRel)
        const sectionDepth = parentVisibility === 'private' ? 2 : 1
        const isDirectlyAtSectionRoot = parentRel.split('/').length === sectionDepth
        return {
          absPath,
          folderId: isDirectlyAtSectionRoot ? null : toPosix(parentRel),
          frontmatter: parsed.frontmatter,
          body: parsed.body
        }
      }
    }
  }
  return null
}

function noteRowFrom(absPath: string, campaignDir: string, campaignId: string, visibility: FileVisibility, folderId: string | null, fm: NoteFrontmatter, body: string): NoteFileRow {
  const relFromCampaign = toPosix(absPath.slice(campaignDir.length + 1))
  const title = relFromCampaign.slice(relFromCampaign.lastIndexOf('/') + 1, -NOTE_EXT.length)
  return {
    id: fm.id,
    campaign_id: campaignId,
    author_user_id: fm.authorUserId,
    title,
    body_markdown: body,
    visibility,
    folder_id: folderId,
    editor_user_ids: JSON.stringify(fm.editorUserIds),
    created_at: fm.createdAt,
    updated_at: fm.updatedAt
  }
}

export class NoteFileRepo {
  listVisibleTo(campaignId: string, userId: string): NoteFileRow[] {
    const found = findCampaignDir(campaignId)
    if (!found) return []
    const isDm = found.json.dmUserId === userId
    return walkVisible(found.dir, campaignId, found.json.dmUserId, userId, isDm).notes
  }

  findById(id: string): NoteFileRow | undefined {
    const found = findNoteEverywhere(id)
    if (!found) return undefined
    return noteRowFrom(found.absPath, found.campaignDir, found.campaignId, found.visibility, found.folderId, found.frontmatter, found.body)
  }

  create(input: {
    campaignId: string
    authorUserId: string
    title: string
    bodyMarkdown: string
    visibility: FileVisibility
    folderId: string | null
  }): NoteFileRow {
    const found = findCampaignDir(input.campaignId)
    if (!found) throw new Error('Campaign not found.')
    const dirAbs = input.folderId
      ? join(found.dir, ...toNative(input.folderId))
      : join(found.dir, ...toNative(sectionRel(input.visibility, input.authorUserId)))
    mkdirSync(dirAbs, { recursive: true })
    const fileName = sanitizeFileName(input.title) + NOTE_EXT
    const absPath = uniqueFilePath(dirAbs, fileName)
    const now = new Date().toISOString()
    const fm: NoteFrontmatter = { id: uuid(), authorUserId: input.authorUserId, editorUserIds: [], createdAt: now, updatedAt: now }
    writeFileSync(absPath, serializeNote(fm, input.bodyMarkdown), 'utf8')
    return noteRowFrom(absPath, found.dir, input.campaignId, input.visibility, input.folderId, fm, input.bodyMarkdown)
  }

  update(
    id: string,
    input: {
      title?: string
      bodyMarkdown?: string
      folderId?: string | null
      visibility?: FileVisibility
      editorUserIds?: string[]
    }
  ): NoteFileRow | undefined {
    const found = findNoteEverywhere(id)
    if (!found) return undefined
    const newVisibility = input.visibility ?? found.visibility
    // Same rule campaignService already applies before calling us: an explicit
    // folderId wins; otherwise a visibility change (with no new folder given)
    // drops the note to that section's root instead of leaving it pointed at
    // a folder that belongs to the OLD visibility's tree.
    const newFolderId: string | null =
      'folderId' in input ? (input.folderId ?? null) : input.visibility ? null : found.folderId
    const dirAbs = newFolderId
      ? join(found.campaignDir, ...toNative(newFolderId))
      : join(found.campaignDir, ...toNative(sectionRel(newVisibility, found.frontmatter.authorUserId)))
    mkdirSync(dirAbs, { recursive: true })
    const newTitle = input.title ?? found.absPath.slice(found.absPath.lastIndexOf(sep) + 1, -NOTE_EXT.length)
    const fileName = sanitizeFileName(newTitle) + NOTE_EXT
    const newAbsPath = uniqueFilePath(dirAbs, fileName, found.absPath)

    const fm: NoteFrontmatter = {
      ...found.frontmatter,
      editorUserIds: input.editorUserIds ?? found.frontmatter.editorUserIds,
      updatedAt: new Date().toISOString()
    }
    const body = input.bodyMarkdown ?? found.body
    writeFileSync(newAbsPath, serializeNote(fm, body), 'utf8')
    if (newAbsPath !== found.absPath) rmSync(found.absPath)
    return noteRowFrom(newAbsPath, found.campaignDir, found.campaignId, newVisibility, newFolderId, fm, body)
  }

  remove(id: string): void {
    const found = findNoteEverywhere(id)
    if (!found) return
    rmSync(found.absPath)
  }

  /** Migration-only: overwrites editorUserIds/timestamps on an already-created file with the values carried over from its old SQLite row — create() always stamps "now", so this is what makes a migrated note's history (who it's shared with, when it was actually written) survive the move to files. */
  restoreMetadata(id: string, meta: { editorUserIds: string[]; createdAt: string; updatedAt: string }): void {
    const found = findNoteEverywhere(id)
    if (!found) return
    const fm: NoteFrontmatter = { ...found.frontmatter, ...meta }
    writeFileSync(found.absPath, serializeNote(fm, found.body), 'utf8')
  }
}

interface FoundFolder {
  absDir: string
  campaignDir: string
  campaignId: string
  visibility: FileVisibility
  parentFolderId: string | null
  meta: FolderMeta
  name: string
}

function findFolder(id: string): FoundFolder | null {
  const visibility = visibilityOfRel(id)
  if (!visibility) return null
  for (const campaignDir of listCampaignDirs()) {
    const json = readCampaignJson(campaignDir)
    if (!json) continue
    const absDir = join(campaignDir, ...toNative(id))
    if (!existsSync(absDir)) continue
    // Confirmed match only once we know this campaign actually has this
    // relative path — different campaigns share the same relative layout
    // (every campaign has a "Party Notes"), so existence alone within THIS
    // campaign's folder is what disambiguates it.
    // parent_folder_id is null once we're back at the section root — "Party
    // Notes"/"DM Only" are one path segment, "Private Notes/<uid>" is two —
    // so a folder living directly there has no addressable parent above it.
    const parts = id.split('/')
    const sectionDepth = visibility === 'private' ? 2 : 1
    const parentFolderId = parts.length > sectionDepth + 1 ? parts.slice(0, -1).join('/') : null
    const meta = folderMetaOrDefault(absDir, id, json.dmUserId)
    return { absDir, campaignDir, campaignId: json.id, visibility, parentFolderId, meta, name: parts[parts.length - 1] }
  }
  return null
}

function folderRowFrom(f: FoundFolder): FolderFileRow {
  return {
    id: toPosix(f.absDir.slice(f.campaignDir.length + 1)),
    campaign_id: f.campaignId,
    author_user_id: f.meta.authorUserId,
    name: f.name,
    parent_folder_id: f.parentFolderId,
    visibility: f.visibility,
    created_at: f.meta.createdAt,
    updated_at: f.meta.updatedAt
  }
}

export class FolderFileRepo {
  listVisibleTo(campaignId: string, userId: string): FolderFileRow[] {
    const found = findCampaignDir(campaignId)
    if (!found) return []
    const isDm = found.json.dmUserId === userId
    return walkVisible(found.dir, campaignId, found.json.dmUserId, userId, isDm).folders
  }

  findById(id: string): FolderFileRow | undefined {
    const found = findFolder(id)
    return found ? folderRowFrom(found) : undefined
  }

  create(input: { campaignId: string; authorUserId: string; name: string; parentFolderId: string | null; visibility: FileVisibility }): FolderFileRow {
    const found = findCampaignDir(input.campaignId)
    if (!found) throw new Error('Campaign not found.')
    const parentAbs = input.parentFolderId
      ? join(found.dir, ...toNative(input.parentFolderId))
      : join(found.dir, ...toNative(sectionRel(input.visibility, input.authorUserId)))
    mkdirSync(parentAbs, { recursive: true })
    const dirName = sanitizeFileName(input.name)
    let absDir = join(parentAbs, dirName)
    let n = 2
    while (existsSync(absDir)) {
      absDir = join(parentAbs, `${dirName} (${n})`)
      n += 1
    }
    mkdirSync(absDir, { recursive: true })
    const now = new Date().toISOString()
    const meta: FolderMeta = { authorUserId: input.authorUserId, createdAt: now, updatedAt: now }
    writeFolderMeta(absDir, meta)
    return folderRowFrom({
      absDir,
      campaignDir: found.dir,
      campaignId: input.campaignId,
      visibility: input.visibility,
      parentFolderId: input.parentFolderId,
      meta,
      name: dirName
    })
  }

  /** Migration-only: overwrites a just-created folder's timestamps with the ones carried over from its old SQLite row. */
  restoreTimestamps(id: string, createdAt: string, updatedAt: string): void {
    const found = findFolder(id)
    if (!found) return
    writeFolderMeta(found.absDir, { ...found.meta, createdAt, updatedAt })
  }

  /** Renames in place — `parentFolderId` (an actual move) isn't supported here since campaignService only ever calls this for a plain rename; a move goes through setVisibilityCascade or a direct fs move triggered by the drag/drop path below. */
  update(id: string, input: { name?: string; parentFolderId?: string | null }): FolderFileRow | undefined {
    const found = findFolder(id)
    if (!found) return undefined
    let absDir = found.absDir
    if (input.name && input.name !== found.name) {
      const parentAbs = join(absDir, '..')
      const newName = sanitizeFileName(input.name)
      let candidate = join(parentAbs, newName)
      let n = 2
      while (existsSync(candidate) && candidate !== absDir) {
        candidate = join(parentAbs, `${newName} (${n})`)
        n += 1
      }
      if (candidate !== absDir) {
        renameSync(absDir, candidate)
        absDir = candidate
      }
    }
    if ('parentFolderId' in input && input.parentFolderId !== found.parentFolderId) {
      const newParentAbs = input.parentFolderId
        ? join(found.campaignDir, ...toNative(input.parentFolderId))
        : join(found.campaignDir, ...toNative(sectionRel(found.visibility, found.meta.authorUserId)))
      mkdirSync(newParentAbs, { recursive: true })
      const dest = uniqueFilePath(newParentAbs, toPosix(absDir).split('/').pop()!, absDir)
      renameSync(absDir, dest)
      absDir = dest
    }
    const meta: FolderMeta = { ...found.meta, updatedAt: new Date().toISOString() }
    writeFolderMeta(absDir, meta)
    return folderRowFrom({ ...found, absDir, meta, name: toPosix(absDir).split('/').pop()! })
  }

  /** Moves the folder's whole directory (and therefore everything beneath it) to the new visibility's tree in one fs move — matches FolderRepo's cascade, but here the move IS the cascade since children are just nested paths. */
  setVisibilityCascade(rootId: string, visibility: FileVisibility): void {
    const found = findFolder(rootId)
    if (!found) return
    const newParentAbs = join(found.campaignDir, ...toNative(sectionRel(visibility, found.meta.authorUserId)))
    mkdirSync(newParentAbs, { recursive: true })
    const dest = uniqueFilePath(newParentAbs, found.name, found.absDir)
    renameSync(found.absDir, dest)
  }

  remove(id: string): void {
    const found = findFolder(id)
    if (!found) return
    rmSync(found.absDir, { recursive: true, force: true })
  }
}
