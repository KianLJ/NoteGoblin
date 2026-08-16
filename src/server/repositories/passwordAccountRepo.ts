import type { Database as DatabaseType } from 'better-sqlite3'
import argon2 from 'argon2'
import { v4 as uuid } from 'uuid'

export interface Account {
  id: string
  displayName: string
}

interface AccountRow {
  id: string
  display_name: string
  password_hash: string
}

/**
 * Shared implementation behind the local `identity` table and a host's
 * `users` table — both are "one row per display name + argon2id hash",
 * just scoped to different databases. `table` is a fixed literal chosen by
 * our own code (never request input), so interpolating it as an identifier
 * is safe; all values still go through parameterized placeholders.
 */
export class PasswordAccountRepo {
  constructor(
    private db: DatabaseType,
    private table: 'identity' | 'users'
  ) {}

  hasAny(): boolean {
    const row = this.db.prepare(`SELECT 1 FROM ${this.table} LIMIT 1`).get()
    return row !== undefined
  }

  list(): Account[] {
    const rows = this.db
      .prepare(`SELECT id, display_name FROM ${this.table} ORDER BY display_name COLLATE NOCASE`)
      .all() as { id: string; display_name: string }[]
    return rows.map((r) => ({ id: r.id, displayName: r.display_name }))
  }

  findByDisplayName(displayName: string): AccountRow | undefined {
    return this.db
      .prepare(`SELECT id, display_name, password_hash FROM ${this.table} WHERE display_name = ?`)
      .get(displayName) as AccountRow | undefined
  }

  findById(id: string): AccountRow | undefined {
    return this.db
      .prepare(`SELECT id, display_name, password_hash FROM ${this.table} WHERE id = ?`)
      .get(id) as AccountRow | undefined
  }

  async create(displayName: string, password: string): Promise<Account> {
    if (this.findByDisplayName(displayName)) {
      throw new Error('That display name is already in use.')
    }
    const id = uuid()
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id })
    this.db
      .prepare(`INSERT INTO ${this.table} (id, display_name, password_hash) VALUES (?, ?, ?)`)
      .run(id, displayName, passwordHash)
    return { id, displayName }
  }

  /** Finds or creates an account using an already-hashed password — used to seed a host's own account from the local identity that's hosting it, without ever needing the plaintext password. */
  ensureWithHash(displayName: string, passwordHash: string): Account {
    const existing = this.findByDisplayName(displayName)
    if (existing) return { id: existing.id, displayName: existing.display_name }
    const id = uuid()
    this.db
      .prepare(`INSERT INTO ${this.table} (id, display_name, password_hash) VALUES (?, ?, ?)`)
      .run(id, displayName, passwordHash)
    return { id, displayName }
  }

  /**
   * Finds or creates an account at a caller-supplied id — used to seed a
   * host's `users` row for a remote player from their relay identity
   * (relay userId, relay username), which already proved who they are
   * before ever reaching this host. No password hash is stored (empty
   * string); these rows are never password-verified, since relay auth
   * already happened at the session-join step.
   */
  ensureWithId(id: string, displayName: string): Account {
    const existing = this.findById(id)
    if (existing) return { id: existing.id, displayName: existing.display_name }
    // display_name is UNIQUE, but this is a fresh row for an id we've never
    // seen — if that name is already taken here (e.g. a stale row from an
    // earlier/reset relay account under a different id), inserting under the
    // real name would throw. Disambiguate instead of crashing the caller.
    const name = this.findByDisplayName(displayName) ? `${displayName} (${id.slice(0, 4)})` : displayName
    this.db
      .prepare(`INSERT INTO ${this.table} (id, display_name, password_hash) VALUES (?, ?, '')`)
      .run(id, name)
    return { id, displayName: name }
  }

  async verify(displayName: string, password: string): Promise<Account | null> {
    const row = this.findByDisplayName(displayName)
    if (!row) return null
    const valid = await argon2.verify(row.password_hash, password)
    if (!valid) return null
    return { id: row.id, displayName: row.display_name }
  }

  rename(id: string, newDisplayName: string): void {
    const existing = this.findByDisplayName(newDisplayName)
    if (existing && existing.id !== id) {
      throw new Error('That display name is already in use.')
    }
    this.db.prepare(`UPDATE ${this.table} SET display_name = ? WHERE id = ?`).run(newDisplayName, id)
  }

  async setPassword(id: string, newPassword: string): Promise<void> {
    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id })
    this.db.prepare(`UPDATE ${this.table} SET password_hash = ? WHERE id = ?`).run(passwordHash, id)
  }
}
