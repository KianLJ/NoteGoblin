import type { Database as DatabaseType } from 'better-sqlite3'
import { v4 as uuid } from 'uuid'
import { emptyCharacterSheet, type CharacterSheetData } from '@shared/dnd5e'

export interface CharacterRow {
  id: string
  owner_identity_id: string
  campaign_id: string | null
  known_host_id: string | null
  name: string
  sheet_json: string
  created_at: string
  updated_at: string
}

/**
 * Characters live in the LOCAL database, owned by the local identity, not
 * any host — they're campaign-independent by design (see plan: players
 * often have a character idea before a campaign to put it in). sheet_json
 * holds the full 5e sheet (see shared/dnd5e.ts for the shape).
 */
export class CharacterRepo {
  constructor(private db: DatabaseType) {}

  listByOwner(ownerIdentityId: string): CharacterRow[] {
    return this.db
      .prepare('SELECT * FROM characters WHERE owner_identity_id = ? ORDER BY updated_at DESC')
      .all(ownerIdentityId) as CharacterRow[]
  }

  findById(id: string): CharacterRow | undefined {
    return this.db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as
      | CharacterRow
      | undefined
  }

  create(ownerIdentityId: string, name: string, sheet: CharacterSheetData): CharacterRow {
    const id = uuid()
    this.db
      .prepare(
        'INSERT INTO characters (id, owner_identity_id, name, sheet_json) VALUES (?, ?, ?, ?)'
      )
      .run(id, ownerIdentityId, name, JSON.stringify(sheet))
    return this.findById(id)!
  }

  update(
    id: string,
    ownerIdentityId: string,
    input: Partial<CharacterSheetData> & { name?: string }
  ): CharacterRow | undefined {
    const existing = this.findById(id)
    if (!existing || existing.owner_identity_id !== ownerIdentityId) return undefined

    const { name: patchName, ...sheetPatch } = input
    const name = patchName ?? existing.name
    const currentSheet = { ...emptyCharacterSheet(), ...JSON.parse(existing.sheet_json || '{}') }
    const sheet: CharacterSheetData = { ...currentSheet, ...sheetPatch }

    this.db
      .prepare(
        "UPDATE characters SET name = ?, sheet_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
      )
      .run(name, JSON.stringify(sheet), id)
    return this.findById(id)
  }

  remove(id: string, ownerIdentityId: string): boolean {
    const existing = this.findById(id)
    if (!existing || existing.owner_identity_id !== ownerIdentityId) return false
    this.db.prepare('DELETE FROM characters WHERE id = ?').run(id)
    return true
  }
}
