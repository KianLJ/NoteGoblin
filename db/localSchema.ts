/**
 * Schema for the LOCAL app database — one file per installation, stored in
 * the user's own app-data directory. Never leaves the machine as a whole
 * file; this is the "who am I, and what have I made before pairing it to a
 * campaign" store. Kept separate from the host schema (hostSchema.ts),
 * which describes a DM's per-campaign server database.
 */
export const LOCAL_SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS identity (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Hosts this identity has previously connected to, so re-joining a
-- campaign doesn't require re-typing the address every time.
-- cert_pem is the full pinned certificate (not just its fingerprint) so
-- future connections can be verified against it directly (see
-- src/server/net/pinnedHttpClient.ts) rather than only checked-then-trusted.
CREATE TABLE IF NOT EXISTS known_hosts (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  address TEXT NOT NULL UNIQUE,
  cert_fingerprint TEXT NOT NULL,
  cert_pem TEXT NOT NULL,
  last_connected_at TEXT
);

-- A character belongs to the local identity that created it and is only
-- linked to a campaign once the player pairs it (campaign_id is nullable).
-- sheet_json holds the actual 5e sheet fields; kept schemaless here since
-- the sheet's shape is designed in the character-sheets build step.
CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  owner_identity_id TEXT NOT NULL REFERENCES identity(id) ON DELETE CASCADE,
  campaign_id TEXT,
  known_host_id TEXT REFERENCES known_hosts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  sheet_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_characters_owner ON characters(owner_identity_id);

-- A read-only local copy of a joined campaign's notes/folders (whatever this
-- identity was actually allowed to see — the DM already filtered by
-- visibility before it ever left their machine), refreshed every time the
-- player successfully syncs while connected. Lets "Offline" campaigns stay
-- browsable when the DM isn't hosting, instead of just showing nothing.
-- Schemaless JSON blobs (same pattern as characters.sheet_json) since these
-- mirror the Campaign/Note/Folder wire shapes exactly — no need to duplicate
-- every field as its own column just to store a point-in-time cache.
CREATE TABLE IF NOT EXISTS cached_campaigns (
  identity_id TEXT NOT NULL REFERENCES identity(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  campaign_json TEXT NOT NULL,
  notes_json TEXT NOT NULL,
  folders_json TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  PRIMARY KEY (identity_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_cached_campaigns_identity ON cached_campaigns(identity_id);
`
