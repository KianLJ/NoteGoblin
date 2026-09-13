import { cpSync, copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { getVaultPath } from '../files/vaultConfig'

/**
 * Copies `host.sqlite3` and (if configured) the whole vault folder aside
 * before `reassignHostUserId`/`reassignVaultOwnerId` run — the ownership id
 * migration rewrites real, irreplaceable campaign content in place with no
 * built-in undo, so this is the actual safety net, not perfect atomicity
 * (see hostUserMigration.ts's doc comment). Returns the paths backed up to,
 * so the caller can surface them to the user rather than backing up silently.
 */
export function backupBeforeOwnerMigration(userDataDir: string): { hostDbBackupPath: string; vaultBackupPath: string | null } {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')

  const hostDbPath = join(userDataDir, 'host.sqlite3')
  const hostDbBackupPath = join(userDataDir, `host.sqlite3.bak-${stamp}`)
  if (existsSync(hostDbPath)) copyFileSync(hostDbPath, hostDbBackupPath)

  const vaultPath = getVaultPath()
  let vaultBackupPath: string | null = null
  if (vaultPath && existsSync(vaultPath)) {
    vaultBackupPath = join(dirname(vaultPath), `.notegoblin-backup-${stamp}`)
    cpSync(vaultPath, vaultBackupPath, { recursive: true })
  }

  return { hostDbBackupPath, vaultBackupPath }
}
