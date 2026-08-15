import { join } from 'path'
import type { Database as DatabaseType } from 'better-sqlite3'
import { openDatabase, tableIsMissingColumn } from './openDatabase'
import { LOCAL_SCHEMA } from '../../../db/localSchema'

let db: DatabaseType | null = null

/** Opens the singleton local app database under the given app-data directory. */
export function getLocalDb(userDataDir: string): DatabaseType {
  if (!db) {
    db = openDatabase(join(userDataDir, 'local.sqlite3'), LOCAL_SCHEMA, (database) => {
      // known_hosts gained cert_pem after some dev builds already created the
      // table without it — safe to reset since it's only a trust cache, not
      // campaign data.
      if (tableIsMissingColumn(database, 'known_hosts', 'cert_pem')) {
        database.exec('DROP TABLE known_hosts')
      }
    })
  }
  return db
}
