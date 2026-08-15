import { join } from 'path'
import type { Database as DatabaseType } from 'better-sqlite3'
import { openDatabase } from './openDatabase'
import { HOST_SCHEMA } from '../../../db/hostSchema'

let db: DatabaseType | null = null

/** Opens the singleton host database (the campaigns this installation hosts). */
export function getHostDb(userDataDir: string): DatabaseType {
  if (!db) {
    db = openDatabase(join(userDataDir, 'host.sqlite3'), HOST_SCHEMA)
  }
  return db
}
