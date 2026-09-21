import type { Database as DatabaseType } from 'better-sqlite3'

/**
 * Reassigns a host user's id everywhere it's referenced in this database —
 * used to reconcile an old, per-machine-random host user id (from before
 * host user ids were pinned to the relay's stable account id, see
 * `ensureMyHostUser` in registerIpc.ts) with the new canonical one, in
 * place, without losing any campaign data.
 *
 * SQLite's `ON DELETE CASCADE` (used throughout db/hostSchema.ts) only fires
 * on deletes, not on updating a referenced primary key — so every
 * referencing column has to be updated explicitly here, inside one
 * transaction with foreign key checks suspended for its duration (turning
 * them back on mid-transaction isn't necessary or possible in SQLite; a
 * `users` row disappearing out from under its children for the instant
 * between statements would otherwise fail every one of these UPDATEs).
 *
 * Caller (ensureMyHostUser) is responsible for backing up the database
 * first — this rewrites real campaign ownership data with no way back out
 * if something in the caller's vault-file half of the migration goes wrong
 * afterward.
 */
/**
 * Whether a host `users` row has zero real data attached anywhere
 * reassignHostUserId would otherwise touch — a stale, empty row left behind
 * by some earlier provisioning path (e.g. this same device briefly acting
 * as a different account while testing, or a remote player id that got
 * seeded here and never used) rather than a real second identity worth
 * protecting. Only a row this empty is ever safe to silently delete out of
 * the way of a reassignment — see ensureMyHostUser's collision handling in
 * registerIpc.ts.
 */
export function isHostUserDataFree(db: DatabaseType, id: string): boolean {
  const checks: [string, string][] = [
    ['campaigns', 'dm_user_id'],
    ['campaign_members', 'user_id'],
    ['folders', 'author_user_id'],
    ['notes', 'author_user_id'],
    ['characters', 'owner_user_id'],
    ['messages', 'sender_user_id'],
    ['messages', 'recipient_user_id']
  ]
  return checks.every(([table, column]) => !db.prepare(`SELECT 1 FROM ${table} WHERE ${column} = ? LIMIT 1`).get(id))
}

export function reassignHostUserId(db: DatabaseType, oldId: string, newId: string): void {
  if (oldId === newId) return

  const wasForeignKeysOn = (db.pragma('foreign_keys', { simple: true }) as number) === 1
  db.pragma('foreign_keys = OFF')
  try {
    const reassign = db.transaction(() => {
      db.prepare('UPDATE users SET id = ? WHERE id = ?').run(newId, oldId)
      db.prepare('UPDATE campaigns SET dm_user_id = ? WHERE dm_user_id = ?').run(newId, oldId)
      db.prepare('UPDATE campaign_members SET user_id = ? WHERE user_id = ?').run(newId, oldId)
      db.prepare('UPDATE folders SET author_user_id = ? WHERE author_user_id = ?').run(newId, oldId)
      db.prepare('UPDATE notes SET author_user_id = ? WHERE author_user_id = ?').run(newId, oldId)
      db.prepare('UPDATE characters SET owner_user_id = ? WHERE owner_user_id = ?').run(newId, oldId)
      db.prepare('UPDATE messages SET sender_user_id = ? WHERE sender_user_id = ?').run(newId, oldId)
      db.prepare('UPDATE messages SET recipient_user_id = ? WHERE recipient_user_id = ?').run(newId, oldId)
    })
    reassign()
  } finally {
    if (wasForeignKeysOn) db.pragma('foreign_keys = ON')
  }
}
