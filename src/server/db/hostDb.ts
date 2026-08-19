import { join } from 'path'
import type { Database as DatabaseType } from 'better-sqlite3'
import { openDatabase, tableIsMissingColumn } from './openDatabase'
import { HOST_SCHEMA } from '../../../db/hostSchema'

let db: DatabaseType | null = null

/**
 * SQLite CHECK constraints are baked into a table's CREATE statement and
 * can't be altered in place — the only way to widen one on an existing
 * database is to rebuild the table. Used to add 'private' to notes/folders'
 * visibility CHECK after that tier shipped; a no-op once a database is
 * already on the new constraint (checked via sqlite_master, not a flag) or
 * genuinely a fresh install (table doesn't exist yet — the schema exec right
 * after this repair step creates it correctly from the start).
 */
function rebuildVisibilityCheck(database: DatabaseType, table: 'notes' | 'folders'): void {
  const row = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as { sql: string } | undefined
  if (!row || row.sql.includes("'private'")) return

  const createSql =
    table === 'notes'
      ? `CREATE TABLE notes (
          id TEXT PRIMARY KEY,
          campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
          author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          body_markdown TEXT NOT NULL DEFAULT '',
          visibility TEXT NOT NULL DEFAULT 'dm' CHECK (visibility IN ('dm', 'shared', 'private')),
          folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
          editor_user_ids TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        )`
      : `CREATE TABLE folders (
          id TEXT PRIMARY KEY,
          campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
          author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          parent_folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
          visibility TEXT NOT NULL DEFAULT 'dm' CHECK (visibility IN ('dm', 'shared', 'private')),
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        )`

  const tmpTable = `${table}_pre_private_migration`
  const wasForeignKeysOn = (database.pragma('foreign_keys', { simple: true }) as number) === 1
  database.pragma('foreign_keys = OFF')
  const migrate = database.transaction(() => {
    database.exec(`ALTER TABLE ${table} RENAME TO ${tmpTable}`)
    database.exec(createSql)
    database.exec(`INSERT INTO ${table} SELECT * FROM ${tmpTable}`)
    database.exec(`DROP TABLE ${tmpTable}`)
  })
  migrate()
  if (wasForeignKeysOn) database.pragma('foreign_keys = ON')
}

/**
 * host_state.active_campaign_id originally carried a `REFERENCES
 * campaigns(id)` foreign key — wrong the moment vault mode shipped, since a
 * vault-mode campaign never gets a row in this database's own `campaigns`
 * table at all, so setting one active threw "FOREIGN KEY constraint failed"
 * on every attempt. A no-op once a database is already on the FK-less
 * schema (checked via sqlite_master, not a flag) or on a genuinely fresh
 * install (table doesn't exist yet — the schema exec right after this
 * creates it correctly from the start).
 */
function rebuildHostStateWithoutForeignKey(database: DatabaseType): void {
  const row = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'host_state'").get() as
    | { sql: string }
    | undefined
  if (!row || !row.sql.includes('REFERENCES campaigns')) return

  const tmpTable = 'host_state_pre_fk_migration'
  const wasForeignKeysOn = (database.pragma('foreign_keys', { simple: true }) as number) === 1
  database.pragma('foreign_keys = OFF')
  const migrate = database.transaction(() => {
    database.exec(`ALTER TABLE host_state RENAME TO ${tmpTable}`)
    database.exec('CREATE TABLE host_state (id INTEGER PRIMARY KEY CHECK (id = 1), active_campaign_id TEXT)')
    database.exec(`INSERT INTO host_state SELECT * FROM ${tmpTable}`)
    database.exec(`DROP TABLE ${tmpTable}`)
  })
  migrate()
  if (wasForeignKeysOn) database.pragma('foreign_keys = ON')
}

/**
 * characters/initiative_entries/messages originally carried a `REFERENCES
 * campaigns(id)` foreign key on campaign_id — wrong for the same reason
 * host_state's was: a vault-mode campaign never gets a row in this
 * database's own `campaigns` table, so any insert against a vault campaign
 * threw "FOREIGN KEY constraint failed". A no-op once a database is already
 * on the FK-less schema (checked via sqlite_master, not a flag) or on a
 * genuinely fresh install (table doesn't exist yet — the schema exec right
 * after this creates it correctly from the start).
 */
function rebuildCampaignFkTable(
  database: DatabaseType,
  table: 'characters' | 'initiative_entries' | 'messages'
): void {
  const row = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as
    | { sql: string }
    | undefined
  if (!row || !row.sql.includes('campaign_id TEXT NOT NULL REFERENCES campaigns')) return

  const createSql: Record<typeof table, string> = {
    characters: `CREATE TABLE characters (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sheet_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`,
    initiative_entries: `CREATE TABLE initiative_entries (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      label TEXT NOT NULL,
      initiative_score INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      linked_character_id TEXT REFERENCES characters(id) ON DELETE SET NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
    messages: `CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      channel TEXT NOT NULL CHECK (channel IN ('party', 'whisper')),
      sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`
  }

  const tmpTable = `${table}_pre_fk_migration`
  const wasForeignKeysOn = (database.pragma('foreign_keys', { simple: true }) as number) === 1
  database.pragma('foreign_keys = OFF')
  const migrate = database.transaction(() => {
    database.exec(`ALTER TABLE ${table} RENAME TO ${tmpTable}`)
    database.exec(createSql[table])
    database.exec(`INSERT INTO ${table} SELECT * FROM ${tmpTable}`)
    database.exec(`DROP TABLE ${tmpTable}`)
  })
  migrate()
  if (wasForeignKeysOn) database.pragma('foreign_keys = ON')
}

/** Opens the singleton host database (the campaigns this installation hosts). */
export function getHostDb(userDataDir: string): DatabaseType {
  if (!db) {
    db = openDatabase(join(userDataDir, 'host.sqlite3'), HOST_SCHEMA, (database) => {
      // notes gained folder_id after some dev builds already created the
      // table without it — added in place (unlike known_hosts) since this
      // table holds real campaign content that can't just be dropped.
      if (tableIsMissingColumn(database, 'notes', 'folder_id')) {
        database.exec('ALTER TABLE notes ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL')
      }
      if (tableIsMissingColumn(database, 'notes', 'editor_user_ids')) {
        database.exec("ALTER TABLE notes ADD COLUMN editor_user_ids TEXT NOT NULL DEFAULT '[]'")
      }
      rebuildVisibilityCheck(database, 'notes')
      rebuildVisibilityCheck(database, 'folders')
      rebuildHostStateWithoutForeignKey(database)
      rebuildCampaignFkTable(database, 'characters')
      rebuildCampaignFkTable(database, 'initiative_entries')
      rebuildCampaignFkTable(database, 'messages')
    })
  }
  return db
}
