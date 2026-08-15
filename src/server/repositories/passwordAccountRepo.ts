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

  async verify(displayName: string, password: string): Promise<Account | null> {
    const row = this.findByDisplayName(displayName)
    if (!row) return null
    const valid = await argon2.verify(row.password_hash, password)
    if (!valid) return null
    return { id: row.id, displayName: row.display_name }
  }
}
