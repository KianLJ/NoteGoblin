import { join } from 'path'
import type { Database as DatabaseType } from 'better-sqlite3'
import { openDatabase } from './openDatabase'
import { LOCAL_SCHEMA } from '../../../db/localSchema'

let db: DatabaseType | null = null

/** Opens the singleton local app database under the given app-data directory. */
export function getLocalDb(userDataDir: string): DatabaseType {
  if (!db) {
    db = openDatabase(join(userDataDir, 'local.sqlite3'), LOCAL_SCHEMA)
  }
  return db
}
