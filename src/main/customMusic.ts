import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, extname } from 'node:path'
import { randomUUID } from 'node:crypto'

/**
 * A DM's own additions to the Goblin Bard library — a file picked off their
 * own disk, filed under a mood (or the Sound Board). Listed per-machine in
 * userData, not the vault/campaign: it's the DM's own library, not campaign
 * content. While signed in it's also kept for their account on the relay, so
 * every device they use has it (see audioSync.ts).
 */
export interface CustomMusicTrack {
  id: string
  title: string
  path: string
  /** Stored for the account on the relay — so if it's gone from there, it was removed on another device. */
  synced?: boolean
}

type CustomMusicConfig = Record<string, CustomMusicTrack[]>

let cachedDir: string | null = null
let cache: CustomMusicConfig | null = null

function configPath(userDataDir: string): string {
  return join(userDataDir, 'custom-music.json')
}

function load(userDataDir: string): CustomMusicConfig {
  if (cache && cachedDir === userDataDir) return cache
  try {
    const file = configPath(userDataDir)
    cache = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf-8')) as CustomMusicConfig) : {}
  } catch {
    cache = {}
  }
  cachedDir = userDataDir
  return cache
}

function save(userDataDir: string, config: CustomMusicConfig): void {
  cache = config
  cachedDir = userDataDir
  writeFileSync(configPath(userDataDir), JSON.stringify(config, null, 2), 'utf-8')
}

export function listCustomMusic(userDataDir: string): Record<string, { id: string; title: string }[]> {
  const config = load(userDataDir)
  const result: Record<string, { id: string; title: string }[]> = {}
  for (const [groupId, tracks] of Object.entries(config)) {
    result[groupId] = tracks.map((t) => ({ id: t.id, title: t.title }))
  }
  return result
}

export function addCustomMusicTrack(userDataDir: string, groupId: string, filePath: string, title: string): { id: string; title: string } {
  const config = load(userDataDir)
  const track: CustomMusicTrack = { id: randomUUID(), title, path: filePath }
  config[groupId] = [...(config[groupId] ?? []), track]
  save(userDataDir, config)
  return { id: track.id, title: track.title }
}

export function removeCustomMusicTrack(userDataDir: string, groupId: string, trackId: string): void {
  const config = load(userDataDir)
  config[groupId] = (config[groupId] ?? []).filter((t) => t.id !== trackId)
  save(userDataDir, config)
}

export function renameCustomMusicTrack(userDataDir: string, groupId: string, trackId: string, title: string): void {
  const config = load(userDataDir)
  config[groupId] = (config[groupId] ?? []).map((t) => (t.id === trackId ? { ...t, title } : t))
  save(userDataDir, config)
}

/** Every track with the group it's in — what audioSync.ts compares with the account's copy. */
export function allCustomMusic(userDataDir: string): Array<CustomMusicTrack & { groupId: string }> {
  return Object.entries(load(userDataDir)).flatMap(([groupId, tracks]) => tracks.map((t) => ({ ...t, groupId })))
}

/** Applies what syncing found: tracks to add (downloaded) or move, ones to drop, and ones now stored on the relay. */
export function applyCustomMusicSync(
  userDataDir: string,
  change: { put?: Array<CustomMusicTrack & { groupId: string }>; drop?: string[]; synced?: string[] }
): void {
  const config = load(userDataDir)
  const gone = new Set([...(change.drop ?? []), ...(change.put ?? []).map((t) => t.id)])
  const next: CustomMusicConfig = {}
  for (const [groupId, tracks] of Object.entries(config)) next[groupId] = tracks.filter((t) => !gone.has(t.id))
  for (const { groupId, ...track } of change.put ?? []) next[groupId] = [...(next[groupId] ?? []), track]
  const synced = new Set(change.synced ?? [])
  for (const tracks of Object.values(next)) for (const t of tracks) if (synced.has(t.id)) t.synced = true
  save(userDataDir, next)
}

/** Looks a track id up across every group — the custom-music:// protocol handler (main/index.ts) doesn't know which group a given request belongs to, only the id in the URL. */
export function resolveCustomMusicPath(userDataDir: string, trackId: string): string | null {
  return getCustomMusicTrack(userDataDir, trackId)?.path ?? null
}

/** Same lookup as resolveCustomMusicPath, but the full record — registerIpc.ts's music:broadcast handler needs the title too, to hand players something to show/cache the track by. */
export function getCustomMusicTrack(userDataDir: string, trackId: string): CustomMusicTrack | null {
  const config = load(userDataDir)
  for (const tracks of Object.values(config)) {
    const found = tracks.find((t) => t.id === trackId)
    if (found) return found
  }
  return null
}

export const AUDIO_MIME_BY_EXT: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac'
}

export function mimeTypeForPath(filePath: string): string {
  return AUDIO_MIME_BY_EXT[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}
