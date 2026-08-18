// Dice Tray — rolling logic and the shared log entry shape, used by both the
// DM's RightPanel and the player's PartySidebar (see
// src/renderer/src/features/dice/DiceTray.tsx). Kept entirely separate from
// dnd5e.ts/compendium.ts since this is generic dice rolling, not SRD data.

/** The standard polyhedral set — the labeled buttons the tray offers one of each for. */
export const DIE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const
export type DieSides = (typeof DIE_SIDES)[number]

/** How many of one die type are queued up to roll together — the tray's "pending pool" before you press Roll. */
export interface DiceGroup {
  sides: DieSides
  count: number
}

/** One die type's actual rolled results, after rolling. */
export interface DiceGroupResult {
  sides: DieSides
  results: number[]
}

/**
 * One entry in the shared roll log. `groups`/`modifier`/`total` are null for
 * a private roll's *broadcast* copy — redacted at the source (see
 * redactRollForBroadcast) before it ever leaves the roller's own process, so
 * nobody else's copy of this entry ever carries the real numbers over the
 * wire at all. The roller's own local copy (kept only in their own renderer
 * state, never round-tripped) is the same id with those fields still filled
 * in — see DiceTray.tsx.
 */
export interface DiceRollLogEntry {
  id: string
  rollerId: string
  rollerName: string
  formula: string
  groups: DiceGroupResult[] | null
  modifier: number | null
  total: number | null
  private: boolean
  createdAt: string
}

export function rollDie(sides: number): number {
  return 1 + Math.floor(Math.random() * sides)
}

export function rollDiceGroups(groups: DiceGroup[]): DiceGroupResult[] {
  return groups.filter((g) => g.count > 0).map((g) => ({ sides: g.sides, results: Array.from({ length: g.count }, () => rollDie(g.sides)) }))
}

export function sumGroupResults(groups: DiceGroupResult[]): number {
  return groups.reduce((sum, g) => sum + g.results.reduce((a, b) => a + b, 0), 0)
}

/** "2d6 + 1d4 + 3" — omits a zero modifier, and omits the dice part entirely for a flat modifier-only roll. */
export function formatFormula(groups: DiceGroup[], modifier: number): string {
  const dicePart = groups
    .filter((g) => g.count > 0)
    .map((g) => `${g.count}d${g.sides}`)
    .join(' + ')
  if (!dicePart) return modifier ? formatModifierTerm(modifier).trim() : '0'
  if (!modifier) return dicePart
  return `${dicePart} ${formatModifierTerm(modifier)}`
}

function formatModifierTerm(modifier: number): string {
  return modifier >= 0 ? `+ ${modifier}` : `- ${Math.abs(modifier)}`
}

/** "[4, 5] + [2] + 3" — the actual per-die breakdown, for the log's "how did we get there" line. Only meaningful on an unredacted (non-private, or your-own) entry. */
export function formatBreakdown(entry: DiceRollLogEntry): string {
  if (!entry.groups) return ''
  const parts = entry.groups.map((g) => `[${g.results.join(', ')}]`)
  let result = parts.join(' + ')
  if (entry.modifier) result += entry.modifier >= 0 ? ` + ${entry.modifier}` : ` - ${Math.abs(entry.modifier)}`
  return result
}

export function buildRollEntry(rollerId: string, rollerName: string, groups: DiceGroup[], modifier: number, isPrivate: boolean): DiceRollLogEntry {
  const results = rollDiceGroups(groups)
  const total = sumGroupResults(results) + modifier
  return {
    id: crypto.randomUUID(),
    rollerId,
    rollerName,
    formula: formatFormula(groups, modifier),
    groups: results,
    modifier,
    total,
    private: isPrivate,
    createdAt: new Date().toISOString()
  }
}

/**
 * Recognizes the inline `dice: 2d6 + 3` code-span syntax (see markdown.ts's
 * `codespan` renderer override and MarkdownLiveEditor.tsx's matching Write-
 * mode widget) — a single die type plus an optional flat modifier, written
 * as literal inline code (`` `dice: 2d6 + 3` ``) so it reads as a deliberate
 * roll trigger rather than colliding with ordinary backticked text. Returns
 * null for anything that doesn't match, including a die size outside the
 * standard set (DIE_SIDES) — no die-size validation beyond that.
 */
export function parseDiceCodeSpan(text: string): { sides: DieSides; count: number; modifier: number } | null {
  const match = /^dice:\s*(\d+)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?\s*$/i.exec(text.trim())
  if (!match) return null
  const count = parseInt(match[1], 10)
  const sides = parseInt(match[2], 10)
  if (count < 1 || count > 100 || !(DIE_SIDES as readonly number[]).includes(sides)) return null
  const modifier = match[3] ? (match[3] === '-' ? -1 : 1) * parseInt(match[4], 10) : 0
  return { sides: sides as DieSides, count, modifier }
}

/** The version of an entry that's safe to send to everyone else — strips the actual numbers for a private roll, leaving only "who rolled what formula, privately" visible. A no-op for a public roll. */
export function redactRollForBroadcast(entry: DiceRollLogEntry): DiceRollLogEntry {
  if (!entry.private) return entry
  return { ...entry, groups: null, modifier: null, total: null }
}
