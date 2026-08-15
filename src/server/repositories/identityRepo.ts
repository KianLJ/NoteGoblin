import type { Database as DatabaseType } from 'better-sqlite3'
import { PasswordAccountRepo, type Account } from './passwordAccountRepo'

export type Identity = Account

export class IdentityRepo extends PasswordAccountRepo {
  constructor(db: DatabaseType) {
    super(db, 'identity')
  }
}
