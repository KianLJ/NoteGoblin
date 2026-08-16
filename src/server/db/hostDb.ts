import { join } from 'path'
import type { Database as DatabaseType } from 'better-sqlite3'
import { openDatabase, tableIsMissingColumn } from './openDatabase'
import { HOST_SCHEMA } from '../../../db/hostSchema'

let db: DatabaseType | null = null

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
    })
  }
  return db
}
