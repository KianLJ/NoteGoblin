import type { Database as DatabaseType } from 'better-sqlite3'
import { PasswordAccountRepo, type Account } from './passwordAccountRepo'

export type HostUser = Account

export class UserRepo extends PasswordAccountRepo {
  constructor(db: DatabaseType) {
    super(db, 'users')
  }
}
