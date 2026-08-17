import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Where the user's notes vault lives on disk, if they've opted into local
 * file storage — a tiny JSON file in userData, separate from host.sqlite3
 * (which stays the source of truth for everything not yet migrated to
 * files: characters, initiative, messages, and — regardless of vault mode —
 * users and the active-campaign pointer). `null` vaultPath means "not opted
 * in yet"; campaignService falls back to the SQLite repos in that case, so
 * existing installs see zero behavior change until they explicitly choose a
 * folder in Account settings.
 */
interface VaultConfigFile {
  vaultPath: string | null
}

let configPath: string | null = null
let cached: VaultConfigFile | null = null

function load(): VaultConfigFile {
  if (cached) return cached
  if (!configPath) throw new Error('initVaultConfig must be called before using the vault.')
  if (existsSync(configPath)) {
    try {
      const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as Partial<VaultConfigFile>
      cached = { vaultPath: typeof parsed.vaultPath === 'string' ? parsed.vaultPath : null }
      return cached
    } catch {
      // Corrupt/unreadable config — fall through to the default below rather
      // than crashing the app over a file that's just supposed to hold one path.
    }
  }
  cached = { vaultPath: null }
  return cached
}

function save(): void {
  if (!configPath || !cached) return
  writeFileSync(configPath, JSON.stringify(cached, null, 2), 'utf8')
}

/** Call once at startup (alongside getHostDb/getLocalDb) so getVaultPath/setVaultPath know where to persist. */
export function initVaultConfig(userDataDir: string): void {
  configPath = join(userDataDir, 'vault-config.json')
  cached = null
}

export function getVaultPath(): string | null {
  return load().vaultPath
}

export function setVaultPath(path: string | null): void {
  const cfg = load()
  cfg.vaultPath = path
  save()
}
