/**
 * Schema for a HOST database — created the first time this app hosts a
 * campaign. Lives entirely on the DM's (or whoever is hosting's) machine.
 * Every row that belongs to a specific user or campaign carries the
 * relevant foreign key so the server layer can enforce membership checks
 * before returning or accepting any data (see server auth/session layer).
 */
export const HOST_SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  dm_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS campaign_members (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('dm', 'player')),
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (campaign_id, user_id)
);

-- Singleton (id is always 1) — which campaign the DM currently has open.
-- Connecting players auto-join whatever this points at rather than picking
-- from a list themselves; the DM decides what "the table" is, not each
-- player individually. Deliberately NOT a foreign key against campaigns(id)
-- despite looking like it should be one: once a vault folder is configured,
-- campaigns live as files (see vaultStore.ts's CampaignFileRepo) and never
-- get a row in this table at all, so a real FK here throws "FOREIGN KEY
-- constraint failed" the moment a vault-mode campaign is set active — this
-- pointer is plain local app state referencing whichever id is currently
-- "the table," not campaign content that SQLite needs to guarantee exists.
CREATE TABLE IF NOT EXISTS host_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_campaign_id TEXT
);

-- Folders organize notes into a tree, scoped to the same 'dm'/'shared'
-- visibility split as notes (a folder's own visibility, not its contents'
-- individual notes, gates who sees it) so the two note sections in the
-- sidebar (Shared Notes / DM Only) each get their own independent tree.
-- Deleting a folder deletes everything beneath it (sub-folders and notes),
-- recursively — see FolderRepo.remove.
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
  visibility TEXT NOT NULL DEFAULT 'dm' CHECK (visibility IN ('dm', 'shared', 'private')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_folders_campaign ON folders(campaign_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_folder_id);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body_markdown TEXT NOT NULL DEFAULT '',
  -- 'dm' notes are only ever returned to their author (the DM); 'shared'
  -- notes are returned to every campaign member. Enforced server-side.
  visibility TEXT NOT NULL DEFAULT 'dm' CHECK (visibility IN ('dm', 'shared', 'private')),
  folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
  -- JSON array of userIds the author has granted edit access to (title/body
  -- only — visibility, folder, and this list itself stay author-only).
  -- Meaningless on a 'dm'-visibility note since only the author can ever see it.
  editor_user_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_notes_campaign ON notes(campaign_id);
CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id);

-- The campaign-facing copy of a character, created when a player pairs a
-- locally-owned character (see localSchema.ts) to this campaign.
CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sheet_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_characters_campaign ON characters(campaign_id);

CREATE TABLE IF NOT EXISTS initiative_entries (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  initiative_score INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  linked_character_id TEXT REFERENCES characters(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_initiative_campaign ON initiative_entries(campaign_id);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  -- 'party': visible to players, excludes the DM. 'whisper': DM <-> one
  -- player only. Both rules are enforced by the server's channel
  -- membership logic, not by this schema alone.
  channel TEXT NOT NULL CHECK (channel IN ('party', 'whisper')),
  sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_campaign_channel ON messages(campaign_id, channel);
`
