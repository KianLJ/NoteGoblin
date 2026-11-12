/**
 * An item from the Codex, pointed to rather than copied: a piece of SRD equipment (weapons and armour too), an SRD
 * magic item, or a content pack's item (by its Codex key, `items:<pack>:<id>`). Quests pay them and the party
 * stash holds them; the name is kept alongside, so it still reads if the pack it came from is switched off.
 */
export interface CodexRef {
  kind: 'equipment' | 'magicItem' | 'homebrew'
  id: string
  name: string
}

/** A Codex reference as it can be trusted, or null. */
export function readCodexRef(raw: unknown): CodexRef | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (r.kind !== 'equipment' && r.kind !== 'magicItem' && r.kind !== 'homebrew') return null
  if (typeof r.id !== 'string' || !r.id || typeof r.name !== 'string' || !r.name.trim()) return null
  return { kind: r.kind, id: r.id.slice(0, 160), name: r.name.trim().slice(0, 120) }
}
