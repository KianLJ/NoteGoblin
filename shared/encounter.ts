/**
 * Encounter building and initiative-tracking math — SRD 2014 DMG rules
 * (challenge rating → XP, per-level difficulty thresholds, the multi-monster
 * XP multiplier). Shared between the renderer (encounter builder UI,
 * initiative tracker) and the main process (sanitizing what gets broadcast
 * to players — see sessionHost.ts).
 */

export type InjuryLevel = 'undamaged' | 'moderate' | 'bloodied' | 'severe' | 'critical'

/** Rough HP-fraction bands a player is allowed to see for an enemy, instead of exact numbers. */
export function injuryLevel(currentHp: number, maxHp: number): InjuryLevel {
  if (currentHp <= 0 || maxHp <= 0) return 'critical'
  const pct = currentHp / maxHp
  if (pct <= 0.1) return 'critical'
  if (pct <= 0.33) return 'severe'
  if (pct <= 0.5) return 'bloodied'
  if (pct <= 0.75) return 'moderate'
  return 'undamaged'
}

export const INJURY_LABELS: Record<InjuryLevel, string> = {
  undamaged: 'Good / Undamaged',
  moderate: 'Moderately Wounded',
  bloodied: 'Bloodied',
  severe: 'Seriously Wounded',
  critical: 'Critically Wounded'
}

export type Combatant = {
  id: string
  name: string
  kind: 'player' | 'monster'
  initiative: number | null
  maxHp: number
  currentHp: number
  ac: number
  /** kind 'monster' only — links back to a bestiary/custom entry for hover/restat purposes. */
  monsterIndex?: string
  /** kind 'player' only — the connected player's relay userId, so the DM can click through to their sheet like elsewhere in the app. */
  userId?: string
}

export interface InitiativeState {
  round: number
  /** Index into `combatants` (already sorted by initiative, highest first) whose turn it is. -1 = combat not started yet. */
  turnIndex: number
  combatants: Combatant[]
}

export function emptyInitiativeState(): InitiativeState {
  return { round: 1, turnIndex: -1, combatants: [] }
}

/** Combatants in turn order — initiative descending, ties broken by name so the order is at least stable and predictable. */
export function sortedByInitiative(combatants: Combatant[]): Combatant[] {
  return [...combatants].sort((a, b) => (b.initiative ?? -Infinity) - (a.initiative ?? -Infinity) || a.name.localeCompare(b.name))
}

/** What a connected player is allowed to see of one combatant — enemies lose their name/exact stats/position, replaced with an injury-level band; players see everyone's real name and their own real stats. */
export interface PlayerVisibleCombatant {
  id: string
  kind: 'player' | 'monster'
  name: string
  injury: InjuryLevel
  isSelf: boolean
}

export interface PlayerVisibleInitiativeState {
  round: number
  turnIndex: number
  combatants: PlayerVisibleCombatant[]
}

export function sanitizeForPlayer(state: InitiativeState, viewerUserId: string): PlayerVisibleInitiativeState {
  // `combatants` is stored in add-order, not turn order — turnIndex is only
  // ever meaningful against the initiative-sorted view, so both the DM's
  // own UI and this player-facing view have to derive that same sort from
  // the same deterministic function to agree on what index N means.
  const ordered = sortedByInitiative(state.combatants)
  return {
    round: state.round,
    turnIndex: state.turnIndex,
    combatants: ordered.map((c, i) => ({
      id: c.id,
      kind: c.kind,
      name: c.kind === 'player' ? c.name : `Enemy ${i + 1}`,
      injury: injuryLevel(c.currentHp, c.maxHp),
      isSelf: c.kind === 'player' && c.userId === viewerUserId
    }))
  }
}

/** SRD 2014 DMG's challenge-rating → XP table (Monster Manual/SRD appendix). */
export const CR_TO_XP: Record<string, number> = {
  '0': 10,
  '1/8': 25,
  '1/4': 50,
  '1/2': 100,
  '1': 200,
  '2': 450,
  '3': 700,
  '4': 1100,
  '5': 1800,
  '6': 2300,
  '7': 2900,
  '8': 3900,
  '9': 5000,
  '10': 5900,
  '11': 7200,
  '12': 8400,
  '13': 10000,
  '14': 11500,
  '15': 13000,
  '16': 15000,
  '17': 18000,
  '18': 20000,
  '19': 22000,
  '20': 25000,
  '21': 33000,
  '22': 41000,
  '23': 50000,
  '24': 62000,
  '25': 75000,
  '26': 90000,
  '27': 105000,
  '28': 120000,
  '29': 135000,
  '30': 155000
}

export function xpForCr(cr: string): number {
  return CR_TO_XP[cr.trim()] ?? 0
}

export type Difficulty = 'trivial' | 'easy' | 'medium' | 'hard' | 'deadly'

/** SRD 2014 DMG's "XP Thresholds by Character Level" table — one party member's share of Easy/Medium/Hard/Deadly. */
const XP_THRESHOLDS_BY_LEVEL: Record<number, [easy: number, medium: number, hard: number, deadly: number]> = {
  1: [25, 50, 75, 100],
  2: [50, 100, 150, 200],
  3: [75, 150, 225, 400],
  4: [125, 250, 375, 500],
  5: [250, 500, 750, 1100],
  6: [300, 600, 900, 1400],
  7: [350, 750, 1100, 1700],
  8: [450, 900, 1400, 2100],
  9: [550, 1100, 1600, 2400],
  10: [600, 1200, 1900, 2800],
  11: [800, 1600, 2400, 3600],
  12: [1000, 2000, 3000, 4500],
  13: [1100, 2200, 3400, 5100],
  14: [1250, 2500, 3800, 5700],
  15: [1400, 2800, 4300, 6400],
  16: [1600, 3200, 4800, 7200],
  17: [2000, 3900, 5900, 8800],
  18: [2100, 4200, 6300, 9500],
  19: [2400, 4900, 7300, 10900],
  20: [2800, 5700, 8500, 12700]
}

function thresholdsForLevel(level: number): [number, number, number, number] {
  const clamped = Math.min(20, Math.max(1, Math.round(level)))
  return XP_THRESHOLDS_BY_LEVEL[clamped]
}

/** DMG's multiplier for facing multiple monsters at once — more enemies is deadlier than their raw XP sum suggests, since they get more total actions. */
export function encounterMultiplier(monsterCount: number): number {
  if (monsterCount <= 1) return 1
  if (monsterCount === 2) return 1.5
  if (monsterCount <= 6) return 2
  if (monsterCount <= 10) return 2.5
  if (monsterCount <= 14) return 3
  return 4
}

export interface EncounterDifficultyResult {
  totalXp: number
  adjustedXp: number
  multiplier: number
  perPlayerThresholds: { easy: number; medium: number; hard: number; deadly: number }
  partyThresholds: { easy: number; medium: number; hard: number; deadly: number }
  difficulty: Difficulty
  /** Total XP divided evenly across the party — what each player will actually earn if the encounter is won (unaffected by the multiplier, which only measures danger, not reward). */
  xpPerPlayer: number
}

/** Rates an encounter's danger against the party (SRD 2014 DMG method: sum the multiplier-adjusted monster XP, compare against the party's summed thresholds) and how much XP it's actually worth. */
export function computeEncounterDifficulty(partyLevels: number[], monsterXpValues: number[]): EncounterDifficultyResult {
  const totalXp = monsterXpValues.reduce((sum, xp) => sum + xp, 0)
  const multiplier = encounterMultiplier(monsterXpValues.length)
  const adjustedXp = Math.round(totalXp * multiplier)

  const partyThresholds = partyLevels.reduce(
    (acc, level) => {
      const [easy, medium, hard, deadly] = thresholdsForLevel(level)
      return { easy: acc.easy + easy, medium: acc.medium + medium, hard: acc.hard + hard, deadly: acc.deadly + deadly }
    },
    { easy: 0, medium: 0, hard: 0, deadly: 0 }
  )
  const avgLevel = partyLevels.length ? partyLevels.reduce((a, b) => a + b, 0) / partyLevels.length : 1
  const [easy, medium, hard, deadly] = thresholdsForLevel(avgLevel)

  let difficulty: Difficulty = 'trivial'
  if (adjustedXp >= partyThresholds.deadly) difficulty = 'deadly'
  else if (adjustedXp >= partyThresholds.hard) difficulty = 'hard'
  else if (adjustedXp >= partyThresholds.medium) difficulty = 'medium'
  else if (adjustedXp >= partyThresholds.easy) difficulty = 'easy'

  return {
    totalXp,
    adjustedXp,
    multiplier,
    perPlayerThresholds: { easy, medium, hard, deadly },
    partyThresholds,
    difficulty,
    xpPerPlayer: partyLevels.length ? Math.round(totalXp / partyLevels.length) : totalXp
  }
}

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  trivial: 'Trivial',
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  deadly: 'Deadly'
}
