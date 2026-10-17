// A cache key for a pack that changes whenever its content does — not just
// its version, since a pack saved from the Workshop can change without a
// version bump. Computed once per pack object (packs are immutable once
// loaded; an edit or re-fetch is a new object).

import type { ContentPack } from './schema'

const keys = new WeakMap<ContentPack, string>()

/** FNV-1a over a string — fast, and plenty to tell two versions of a pack apart. */
function hash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/** "<id>@<version>#<content hash>". */
export function packKey(pack: ContentPack): string {
  let key = keys.get(pack)
  if (!key) {
    key = `${pack.id}@${pack.version}#${hash(JSON.stringify(pack))}`
    keys.set(pack, key)
  }
  return key
}
