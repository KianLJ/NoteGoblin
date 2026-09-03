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

/** 'normal' rolls the usual single d20; 'advantage'/'disadvantage' roll two and keep the higher/lower — see buildCheckRollEntry. */
export type AdvantageMode = 'normal' | 'advantage' | 'disadvantage'

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
  /** Set only for a check/save/attack roll built via buildCheckRollEntry (e.g. "Wisdom Saving Throw", "Longsword Attack") — a plain Dice Tray roll has no such concept and leaves this unset. */
  label?: string
  /** Set only for a check roll: whether it was rolled with advantage/disadvantage (two d20s, one kept) or normally. */
  advantage?: AdvantageMode
  /** The DC the roller was trying to beat, if this was rolled against one (e.g. a DM's forced roll) — used to show a pass/fail badge. Absent for an ordinary roll with no target number. */
  dc?: number | null
}

/**
 * One-stop "roll a d20 check/save/attack + build a loggable entry" — like
 * buildRollEntry, but specifically for the single-d20-plus-modifier shape
 * every ability check, saving throw, skill check, and attack roll takes, and
 * the only place advantage/disadvantage (roll two, keep one) is modeled.
 * Kept separate from buildRollEntry/DiceGroup's pooled-dice model since
 * advantage doesn't generalize to an arbitrary pool of mixed dice — it's
 * specifically "reroll this one d20".
 */
export function buildCheckRollEntry(
  rollerId: string,
  rollerName: string,
  modifier: number,
  advantage: AdvantageMode,
  isPrivate: boolean,
  label?: string,
  dc?: number | null,
  /** Already-rolled d20 face(s) to use instead of rolling fresh ones — for an advantage/disadvantage roll where the player clicked each die themselves in RollAnimationOverlay.tsx and already saw both real faces before this entry is even built, so the entry has to carry forward the exact numbers shown, not a second independently-rolled pair. */
  presetResults?: number[]
): DiceRollLogEntry {
  const rollCount = advantage === 'normal' ? 1 : 2
  const results = presetResults ?? Array.from({ length: rollCount }, () => rollDie(20))
  const picked = advantage === 'disadvantage' ? Math.min(...results) : Math.max(...results)
  // Plain English ("d20 (Advantage)") rather than dice-notation shorthand
  // ("2d20kh1") — that shorthand is standard among players who already know
  // it, but reads as a confusing typo to anyone who doesn't.
  const dicePart = advantage === 'advantage' ? 'd20 (Advantage)' : advantage === 'disadvantage' ? 'd20 (Disadvantage)' : 'd20'
  return {
    id: crypto.randomUUID(),
    rollerId,
    rollerName,
    formula: modifier ? `${dicePart} ${formatModifierTerm(modifier)}` : dicePart,
    groups: [{ sides: 20, results }],
    modifier,
    total: picked + modifier,
    private: isPrivate,
    createdAt: new Date().toISOString(),
    label,
    advantage,
    dc: dc ?? null
  }
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

export function formatModifierTerm(modifier: number): string {
  return modifier >= 0 ? `+ ${modifier}` : `- ${Math.abs(modifier)}`
}

/** "[4, 5] + [2] + 3" — the actual per-die breakdown, for the log's "how did we get there" line. Only meaningful on an unredacted (non-private, or your-own) entry. */
export function formatBreakdown(entry: DiceRollLogEntry): string {
  if (!entry.groups) return ''
  // A check roll with advantage/disadvantage stores both d20 results in one
  // group but only one of them counted toward the total — show which,
  // rather than the plain "[a, b]" a reader would otherwise misread as a sum.
  if (entry.advantage && entry.advantage !== 'normal' && entry.groups.length === 1 && entry.groups[0].results.length === 2) {
    const [a, b] = entry.groups[0].results
    const kept = entry.advantage === 'advantage' ? Math.max(a, b) : Math.min(a, b)
    const dropped = kept === a && a !== b ? b : kept === b ? a : b
    let result = `${a} & ${b} (kept ${kept}, dropped ${dropped})`
    if (entry.modifier) result += entry.modifier >= 0 ? ` + ${entry.modifier}` : ` - ${Math.abs(entry.modifier)}`
    return result
  }
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
