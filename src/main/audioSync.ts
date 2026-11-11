import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { BrowserWindow } from 'electron'
import { RELAY_URL } from '@server/relay/relayConfig'
import { allCustomMusic, applyCustomMusicSync, mimeTypeForPath, type CustomMusicTrack } from './customMusic'
import { getRelaySession } from './relayState'

/**
 * Keeps a DM's own music and sound effects with their relay account (the relay's audio.ts, files in R2), so
 * every device they sign in on has the same library: the songs and sounds themselves, which mood or Sound
 * Board category each is in, the moods and categories they made, and their own names for the built-in ones.
 *
 * A sync reads the account's library list, downloads anything this computer doesn't have, drops anything that
 * was synced before but has since been removed elsewhere, uploads anything new here, deletes from the account
 * anything removed here, then writes the list back. It runs on sign-in and a moment after any change.
 */

/** The renderer's part of the library: your moods and categories (audioGroups.ts) and names (audioNames.ts). */
export interface LibraryMeta {
  groups: { mood: Array<{ id: string; label: string }>; sfx: Array<{ id: string; label: string }> }
  names: Record<string, string>
}

interface RemoteTrack {
  id: string
  groupId: string
  title: string
  ext: string
}

interface RemoteLibrary {
  tracks: RemoteTrack[]
  meta?: LibraryMeta
}

/** Kept beside custom-music.json: the moods and names as last known, and tracks removed here but not yet from the account. */
interface SyncState {
  meta?: LibraryMeta
  /** The moods or names were changed on this computer since the last sync — then this computer's copy goes up. */
  metaDirty?: boolean
  deleted: string[]
}

let userDataDir = ''
let window: BrowserWindow | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let running: Promise<void> | null = null
let again = false

function statePath(): string {
  return join(userDataDir, 'audio-sync.json')
}

function readState(): SyncState {
  try {
    return existsSync(statePath()) ? { deleted: [], ...(JSON.parse(readFileSync(statePath(), 'utf-8')) as Partial<SyncState>) } : { deleted: [] }
  } catch {
    return { deleted: [] }
  }
}

function writeState(state: SyncState): void {
  writeFileSync(statePath(), JSON.stringify(state), 'utf-8')
}

/** Where downloaded songs and sounds are kept on this computer. */
function downloadsDir(): string {
  const dir = join(userDataDir, 'synced-audio')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function audioUrl(path: string): string {
  return `${RELAY_URL}/audio/${path}`
}

/** Starts syncing: on every sign-in, and from then on whenever something changes. */
export function initAudioSync(dir: string, win: BrowserWindow, onSessionStarted: (listener: () => void) => void): void {
  userDataDir = dir
  window = win
  onSessionStarted(() => scheduleAudioSync(0))
}

/** A song was removed here: once it's synced, it's removed from the account (and so every other device) too. */
export function noteAudioRemoved(track: CustomMusicTrack | null): void {
  if (!track?.synced) return
  const state = readState()
  if (!state.deleted.includes(track.id)) writeState({ ...state, deleted: [...state.deleted, track.id] })
  scheduleAudioSync()
}

/**
 * The renderer's moods and names, sent whenever they change. `initial` is its copy on start-up, which only
 * counts if this computer has never synced them (an existing library meeting syncing for the first time).
 */
export function setLibraryMeta(meta: LibraryMeta, initial: boolean): void {
  const state = readState()
  if (initial && state.meta) return
  if (JSON.stringify(state.meta) === JSON.stringify(meta)) return
  writeState({ ...state, meta, metaDirty: !initial || state.metaDirty })
  if (!initial) scheduleAudioSync()
}

/** Syncs a moment from now (changes made close together go in one sync). */
export function scheduleAudioSync(delayMs = 2000): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void runSync()
  }, delayMs)
}

/** Syncs now (or joins the sync already running) — resolves once it's done. */
export function syncAudioNow(): Promise<void> {
  return runSync()
}

function runSync(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = syncOnce()
    .catch((err) => console.error('audio sync failed', err))
    .finally(() => {
      running = null
      if (again) {
        again = false
        void runSync()
      }
    })
  return running
}

async function syncOnce(): Promise<void> {
  const session = getRelaySession()
  if (!session || !userDataDir) return
  const headers = { authorization: `Bearer ${session.token}` }

  const res = await fetch(audioUrl('library'), { headers })
  if (res.status === 503 || res.status === 401) return // not set up on this relay, or signed out — nothing to do
  if (!res.ok && res.status !== 404) throw new Error(`library ${res.status}`)
  const remote: RemoteLibrary | null = res.ok ? ((await res.json()) as RemoteLibrary) : null

  const state = readState()
  const deleted = new Set(state.deleted)
  const local = allCustomMusic(userDataDir)
  const remoteTracks = (remote?.tracks ?? []).filter((t) => typeof t.id === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(t.id) && !deleted.has(t.id))
  const remoteIds = new Set(remoteTracks.map((t) => t.id))
  let changedHere = false

  // Removed here: from the account too.
  for (const id of deleted) await fetch(audioUrl(`file/${id}`), { method: 'DELETE', headers })

  // Removed on another device (it was synced, and the account no longer has it): removed here.
  const drop = remote ? local.filter((t) => t.synced && !remoteIds.has(t.id)).map((t) => t.id) : []

  // On the account but not here: downloaded. Renamed or moved elsewhere: follows.
  const put: Array<CustomMusicTrack & { groupId: string }> = []
  for (const t of remoteTracks) {
    const mine = local.find((l) => l.id === t.id)
    if (mine) {
      if (mine.synced && (mine.title !== t.title || mine.groupId !== t.groupId)) put.push({ ...mine, title: t.title, groupId: t.groupId })
      continue
    }
    const file = await fetch(audioUrl(`file/${t.id}`), { headers })
    if (!file.ok) continue
    const ext = /^\.[a-z0-9]{1,5}$/i.test(t.ext) ? t.ext : '.mp3'
    const path = join(downloadsDir(), `${t.id}${ext}`)
    writeFileSync(path, Buffer.from(await file.arrayBuffer()))
    put.push({ id: t.id, title: String(t.title).slice(0, 200), path, groupId: String(t.groupId).slice(0, 120), synced: true })
  }
  if (put.length || drop.length) {
    applyCustomMusicSync(userDataDir, { put, drop })
    changedHere = true
  }

  // Added here: uploaded.
  const uploaded: string[] = []
  for (const t of allCustomMusic(userDataDir)) {
    if (t.synced || !existsSync(t.path)) continue
    const body = await readFile(t.path)
    const up = await fetch(audioUrl(`file/${t.id}`), { method: 'PUT', headers: { ...headers, 'content-type': mimeTypeForPath(t.path) }, body })
    if (up.ok) uploaded.push(t.id)
    else console.warn('audio sync: upload refused', t.title, up.status, await up.text().catch(() => ''))
  }
  if (uploaded.length) applyCustomMusicSync(userDataDir, { synced: uploaded })

  // The moods and names: the account's copy wins when this computer hasn't changed its own since the last sync.
  let meta = state.meta
  if (remote?.meta && JSON.stringify(remote.meta) !== JSON.stringify(meta) && !state.metaDirty) {
    meta = remote.meta
    window?.webContents.send('music:library-meta', meta)
  }

  // The list the account keeps: every synced track here, and the moods and names.
  const tracks: RemoteTrack[] = allCustomMusic(userDataDir)
    .filter((t) => t.synced)
    .map((t) => ({ id: t.id, groupId: t.groupId, title: t.title, ext: extname(t.path).toLowerCase() || '.mp3' }))
  const list: RemoteLibrary = { tracks, ...(meta ? { meta } : {}) }
  const saved = await fetch(audioUrl('library'), { method: 'PUT', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(list) })
  // Anything changed here while this sync ran is kept for the next one.
  if (saved.ok) {
    const now = readState()
    const changedMeanwhile = JSON.stringify(now.meta) !== JSON.stringify(state.meta)
    writeState({ meta: changedMeanwhile ? now.meta : meta, metaDirty: changedMeanwhile, deleted: now.deleted.filter((id) => !deleted.has(id)) })
  }

  if (changedHere) window?.webContents.send('music:custom-changed')
}
