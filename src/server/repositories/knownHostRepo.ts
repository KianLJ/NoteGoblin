import type { Database as DatabaseType } from 'better-sqlite3'
import { v4 as uuid } from 'uuid'

export interface KnownHost {
  id: string
  label: string
  address: string
  certFingerprint: string
  certPem: string
  lastConnectedAt: string | null
}

interface KnownHostRow {
  id: string
  label: string
  address: string
  cert_fingerprint: string
  cert_pem: string
  last_connected_at: string | null
}

export class KnownHostRepo {
  constructor(private db: DatabaseType) {}

  list(): KnownHost[] {
    const rows = this.db
      .prepare('SELECT * FROM known_hosts ORDER BY last_connected_at DESC')
      .all() as KnownHostRow[]
    return rows.map(toKnownHost)
  }

  remove(address: string): void {
    this.db.prepare('DELETE FROM known_hosts WHERE address = ?').run(address)
  }

  findByAddress(address: string): KnownHost | undefined {
    const row = this.db.prepare('SELECT * FROM known_hosts WHERE address = ?').get(address) as
      | KnownHostRow
      | undefined
    return row ? toKnownHost(row) : undefined
  }

  upsert(input: {
    address: string
    label: string
    certFingerprint: string
    certPem: string
  }): KnownHost {
    const now = new Date().toISOString()
    const existing = this.findByAddress(input.address)
    if (existing) {
      this.db
        .prepare(
          'UPDATE known_hosts SET label = ?, cert_fingerprint = ?, cert_pem = ?, last_connected_at = ? WHERE id = ?'
        )
        .run(input.label, input.certFingerprint, input.certPem, now, existing.id)
      return { ...existing, ...input, lastConnectedAt: now }
    }
    const id = uuid()
    this.db
      .prepare(
        'INSERT INTO known_hosts (id, label, address, cert_fingerprint, cert_pem, last_connected_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(id, input.label, input.address, input.certFingerprint, input.certPem, now)
    return { id, ...input, lastConnectedAt: now }
  }
}

function toKnownHost(row: KnownHostRow): KnownHost {
  return {
    id: row.id,
    label: row.label,
    address: row.address,
    certFingerprint: row.cert_fingerprint,
    certPem: row.cert_pem,
    lastConnectedAt: row.last_connected_at
  }
}
