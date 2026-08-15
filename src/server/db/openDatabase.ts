import Database from 'better-sqlite3'

/** Opens (creating if needed) a SQLite file and applies the given schema. Idempotent. */
export function openDatabase(filePath: string, schema: string): Database.Database {
  const db = new Database(filePath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(schema)
  return db
}
