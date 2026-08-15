import Database from 'better-sqlite3'

/**
 * Opens (creating if needed) a SQLite file and applies the given schema.
 * `CREATE TABLE IF NOT EXISTS` is idempotent for genuinely new installs, but
 * does nothing to a table that already exists with an older shape — `repair`
 * runs first so callers can drop/rebuild specific tables that changed shape
 * during development, before dev builds ever ship real user data.
 */
export function openDatabase(
  filePath: string,
  schema: string,
  repair?: (db: Database.Database) => void
): Database.Database {
  const db = new Database(filePath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  repair?.(db)
  db.exec(schema)
  return db
}

/** True if `table` exists but is missing `column` — i.e. it predates a schema change. */
export function tableIsMissingColumn(
  db: Database.Database,
  table: string,
  column: string
): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return columns.length > 0 && !columns.some((c) => c.name === column)
}
