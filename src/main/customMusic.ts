import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, extname } from 'node:path'
import { randomUUID } from 'node:crypto'

/**
 * A DM's own local additions to the Goblin Bard library — a file picked off
 * their own disk, filed under whichever mood group they right-clicked (see
 * MusicButton.tsx's context menu). Stored per-machine in userData, not the
 * vault/campaign: this is personal music library config, not campaign
 * content, and never needs to sync anywhere (see shared/ipc.ts's music.*
 * doc comment for how broadcasting one of these to players degrades
 * gracefully instead of trying to ship the actual audio to them).
 */
export interface CustomMusicTrack {
  id: string
  title: string
  path: string
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
