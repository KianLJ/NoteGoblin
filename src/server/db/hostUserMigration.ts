import type { Database as DatabaseType } from 'better-sqlite3'

/**
 * Reassigns a host user's id everywhere it's referenced in this database —
 * used to reconcile an old, per-machine-random host user id (from before
 * host user ids were pinned to the relay's stable account id, see
 * `ensureMyHostUser` in registerIpc.ts) with the new canonical one, in
 * place, without losing any campaign data.
 *
 * `newId` may already have its own `users` row — e.g. this device
 * previously completed this exact migration once already (so the canonical
 * row exists with real data of its own), or `newId`'s account was seeded
 * here some other way. Rather than let that collide with the plain `UPDATE
 * users SET id = ?` below (a raw "UNIQUE constraint failed: users.id"),
 * this treats the existing `newId` row as the one to keep — every child
 * table still gets reassigned onto it exactly as normal (merging `oldId`'s
 * content into the canonical account), and `oldId`'s now-superseded `users`
 * row is dropped instead of renumbered. `oldId`'s own display name/password
 * are NOT carried over in this case — the caller (ensureMyHostUser) is
 * responsible for syncing the surviving row's display name/password to the
 * current identity afterward, since "which of the two names is current" is
 * a login-flow concern, not a data-migration one.
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
export function reassignHostUserId(db: DatabaseType, oldId: string, newId: string): void {
  if (oldId === newId) return

  const wasForeignKeysOn = (db.pragma('foreign_keys', { simple: true }) as number) === 1
  db.pragma('foreign_keys = OFF')
  try {
    const reassign = db.transaction(() => {
      const targetAlreadyExists = !!db.prepare('SELECT 1 FROM users WHERE id = ?').get(newId)
      if (targetAlreadyExists) db.prepare('DELETE FROM users WHERE id = ?').run(oldId)
      else db.prepare('UPDATE users SET id = ? WHERE id = ?').run(newId, oldId)
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
