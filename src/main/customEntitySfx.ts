import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A DM's own per-entity sound override — "when I click this specific spell
 * or monster in the Codex, play this file instead of its auto-picked cue"
 * (see Bestiary.tsx's "+ Add custom SFX" control). One override per entity,
 * keyed by a generic string (`spell:<compendiumId>` or `monster:<index>` —
 * see the callers), replacing whatever was there before rather than
 * accumulating a list; sfxLibrary.ts's category-based picks already cover
 * the "several takes, played at random" case, so an override here is
 * assumed to be a single deliberate choice, not another pool of variants.
 * Stored per-machine in userData, same as customMusic.ts, and for the same
 * reason: this is personal Codex config, not campaign content. Local-only —
 * unlike a bundled Sound Board cue or a broadcast custom music track, this
 * file only exists on the DM's own disk with nothing to hand a connected
 * player to play it back with, so it never goes out over the relay.
 */
export interface CustomEntitySfx {
  title: string
  path: string
}

type CustomEntitySfxConfig = Record<string, CustomEntitySfx>

let cachedDir: string | null = null
let cache: CustomEntitySfxConfig | null = null

function configPath(userDataDir: string): string {
  return join(userDataDir, 'custom-entity-sfx.json')
}

function load(userDataDir: string): CustomEntitySfxConfig {
  if (cache && cachedDir === userDataDir) return cache
  try {
    const file = configPath(userDataDir)
    cache = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf-8')) as CustomEntitySfxConfig) : {}
  } catch {
    cache = {}
  }
  cachedDir = userDataDir
  return cache
}

function save(userDataDir: string, config: CustomEntitySfxConfig): void {
  cache = config
  cachedDir = userDataDir
  writeFileSync(configPath(userDataDir), JSON.stringify(config, null, 2), 'utf-8')
}

export function listCustomEntitySfx(userDataDir: string): Record<string, { title: string }> {
  const config = load(userDataDir)
  const result: Record<string, { title: string }> = {}
  for (const [key, entry] of Object.entries(config)) result[key] = { title: entry.title }
  return result
}

export function setCustomEntitySfx(userDataDir: string, entityKey: string, filePath: string, title: string): void {
  const config = load(userDataDir)
  config[entityKey] = { title, path: filePath }
  save(userDataDir, config)
}

export function removeCustomEntitySfx(userDataDir: string, entityKey: string): void {
  const config = load(userDataDir)
  delete config[entityKey]
  save(userDataDir, config)
}

/** Looked up by the custom-entity-sfx:// protocol handler (main/index.ts), which only has the entity key from the request URL to go on. */
export function resolveCustomEntitySfxPath(userDataDir: string, entityKey: string): string | null {
  return load(userDataDir)[entityKey]?.path ?? null
}
