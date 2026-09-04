/**
 * A DM's own per-Codex-entity sound overrides — module-level singleton (same
 * shape as customMusicStore.ts), backed by main/customEntitySfx.ts's
 * per-machine JSON config. One override per entity key (`spell:<id>` /
 * `monster:<index>` — see Bestiary.tsx), replacing whatever plays for that
 * entity instead of adding another take to its pool.
 */

let titlesByKey: Record<string, string> = {}
let loaded = false

const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

export function subscribeCustomEntitySfx(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Idempotent, safe to call from every mount that might be the first one up — same convention as customMusicStore's ensureCustomMusicLoaded. */
export async function ensureCustomEntitySfxLoaded(): Promise<void> {
  if (loaded) return
  loaded = true
  const raw = await window.goblin.sfxEntity.listCustom()
  titlesByKey = Object.fromEntries(Object.entries(raw).map(([key, v]) => [key, v.title]))
  notify()
}

export function getCustomEntitySfxTitle(entityKey: string): string | null {
  return titlesByKey[entityKey] ?? null
}

/** The playable URL for an entity's override, or null if it has none — the custom-entity-sfx:// protocol (main/index.ts) resolves the entity key straight back to whatever file was picked. */
export function getCustomEntitySfxUrl(entityKey: string): string | null {
  return entityKey in titlesByKey ? `custom-entity-sfx://e/${encodeURIComponent(entityKey)}` : null
}

/** Opens a native file picker (see registerIpc.ts's sfx-entity:set-custom) — a no-op if the DM cancels. */
export async function setCustomEntitySfx(entityKey: string): Promise<void> {
  const added = await window.goblin.sfxEntity.setCustom(entityKey)
  if (!added) return
  titlesByKey = { ...titlesByKey, [entityKey]: added.title }
  notify()
}

export async function removeCustomEntitySfx(entityKey: string): Promise<void> {
  await window.goblin.sfxEntity.removeCustom(entityKey)
  const next = { ...titlesByKey }
  delete next[entityKey]
  titlesByKey = next
  notify()
}
