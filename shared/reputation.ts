/**
 * A campaign's reputation tracker: where the party stands with the people and powers of the world — NPCs, factions,
 * guilds, temples, kingdoms — each from −10 (hated) to +10 (exalted), with the history of what moved it. One JSON
 * document per campaign (campaign_reputation), written by the DM. Each entry is secret until the DM shows it; a
 * player gets the shown ones without the DM's secret notes, and only the history the DM marked as known.
 */

export const REP_KINDS = ['npc', 'faction', 'guild', 'temple', 'kingdom', 'other'] as const
export type RepKind = (typeof REP_KINDS)[number]

export const REP_KIND_LABEL: Record<RepKind, string> = {
  npc: 'NPC',
  faction: 'Faction',
  guild: 'Guild',
  temple: 'Temple',
  kingdom: 'Kingdom',
  other: 'Other'
}

export const MIN_STANDING = -10
export const MAX_STANDING = 10

/** What a standing means, from worst to best: the tier it's in is the one whose `from` it reaches. */
export const STANDING_TIERS = [
  { from: -10, label: 'Hated' },
  { from: -6, label: 'Hostile' },
  { from: -3, label: 'Unfriendly' },
  { from: 0, label: 'Neutral' },
  { from: 1, label: 'Friendly' },
  { from: 4, label: 'Honored' },
  { from: 7, label: 'Exalted' }
] as const

export function standingLabel(standing: number): string {
  let label: string = STANDING_TIERS[0].label
  for (const t of STANDING_TIERS) if (standing >= t.from) label = t.label
  return label
}

/** One change to a standing, and why. */
export interface RepChange {
  id: string
  /** When it happened (ISO). */
  at: string
  delta: number
  reason: string
  /** The party knows why (a player sees this change). */
  known: boolean
}

export interface RepEntry {
  id: string
  name: string
  kind: RepKind
  standing: number
  /** What the party knows of them. */
  description?: string
  /** The DM's own notes — never sent to a player. */
  secret?: string
  /** Who they answer to: another entry's id (an NPC in a faction, a faction in a kingdom). */
  partOf?: string
  /** A note to open with it, by title. */
  noteTitle?: string
  /** Players can see it. */
  shared: boolean
  history: RepChange[]
}

export interface CampaignReputation {
  entries: RepEntry[]
}

const MAX_ENTRIES = 500
const MAX_HISTORY = 100
const MAX_NAME = 120
const MAX_TEXT = 2000

const clampStanding = (n: number): number => Math.max(MIN_STANDING, Math.min(MAX_STANDING, Math.round(n)))
const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)

/** A tracker as it can be trusted. */
export function normalizeReputation(raw: unknown): CampaignReputation {
  const list = (raw as { entries?: unknown })?.entries
  const entries: RepEntry[] = []
  for (const x of Array.isArray(list) ? list.slice(0, MAX_ENTRIES) : []) {
    if (typeof x !== 'object' || x === null) continue
    const r = x as Record<string, unknown>
    const name = str(r.name, MAX_NAME)
    if (typeof r.id !== 'string' || !r.id || !name) continue
    const history: RepChange[] = []
    for (const h of Array.isArray(r.history) ? r.history.slice(-MAX_HISTORY) : []) {
      if (typeof h !== 'object' || h === null) continue
      const c = h as Record<string, unknown>
      if (typeof c.id !== 'string' || typeof c.delta !== 'number' || !Number.isFinite(c.delta)) continue
      history.push({ id: c.id.slice(0, 64), at: typeof c.at === 'string' ? c.at.slice(0, 40) : '', delta: Math.round(Math.max(-20, Math.min(20, c.delta))), reason: str(c.reason, MAX_NAME * 2) ?? '', known: c.known === true })
    }
    const entry: RepEntry = {
      id: r.id.slice(0, 64),
      name,
      kind: (REP_KINDS as readonly string[]).includes(r.kind as string) ? (r.kind as RepKind) : 'other',
      standing: typeof r.standing === 'number' && Number.isFinite(r.standing) ? clampStanding(r.standing) : 0,
      shared: r.shared === true,
      history
    }
    const description = str(r.description, MAX_TEXT)
    if (description) entry.description = description
    const secret = str(r.secret, MAX_TEXT)
    if (secret) entry.secret = secret
    if (typeof r.partOf === 'string' && r.partOf && r.partOf !== entry.id) entry.partOf = r.partOf.slice(0, 64)
    const noteTitle = str(r.noteTitle, MAX_NAME * 2)
    if (noteTitle) entry.noteTitle = noteTitle
    entries.push(entry)
  }
  // Who answers to whom, without loops (a faction can't be part of its own member).
  const byId = new Map(entries.map((e) => [e.id, e]))
  for (const e of entries) {
    const seen = new Set([e.id])
    let up = e.partOf ? byId.get(e.partOf) : undefined
    while (up) {
      if (seen.has(up.id)) {
        delete e.partOf
        break
      }
      seen.add(up.id)
      up = up.partOf ? byId.get(up.partOf) : undefined
    }
    if (e.partOf && !byId.has(e.partOf)) delete e.partOf
  }
  return { entries }
}

/** Moves a standing by `delta` (kept within −10…+10), noting why; the change is known to the party if `known`. */
export function changeStanding(entry: RepEntry, delta: number, reason: string, known: boolean, id: string, at: string): RepEntry {
  const standing = clampStanding(entry.standing + delta)
  const moved = standing - entry.standing
  if (!moved) return entry
  return { ...entry, standing, history: [...entry.history, { id, at, delta: moved, reason: reason.trim().slice(0, MAX_NAME * 2), known }].slice(-MAX_HISTORY) }
}

/**
 * What a player is sent: the shown entries, without the DM's secret notes or the history the party doesn't know of —
 * and pointing only at shown entries above them.
 */
export function reputationForPlayer(doc: CampaignReputation): CampaignReputation {
  const shown = new Set(doc.entries.filter((e) => e.shared).map((e) => e.id))
  return {
    entries: doc.entries
      .filter((e) => e.shared)
      .map((e) => {
        const out: RepEntry = { ...e, history: e.history.filter((h) => h.known) }
        delete out.secret
        if (out.partOf && !shown.has(out.partOf)) delete out.partOf
        return out
      })
  }
}
