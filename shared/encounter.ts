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

export interface DeathSaves {
  successes: number
  failures: number
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
  /** Free-text condition tags (Prone, Poisoned, Concentrating, etc.) — same list shown to the DM and to players, since knowing an enemy is prone/restrained is normal tactical information, not a secret. */
  statusEffects: string[]
  /** kind 'player' only, and only once currentHp <= 0 — SRD death saving throws. Cleared (set back to null) once currentHp rises back above 0. */
  deathSaves: DeathSaves | null
  /** Optional dismemberment flavor tags ("Left Arm Severed", "Beheaded", etc.) — see InitiativeState.dismembermentEnabled. Visible to players the same way statusEffects is, since a severed limb is as much normal tactical/narrative information as being prone. */
  dismemberments: string[]
}

export interface InitiativeState {
  round: number
  /** DM's call — when true, a player's own death saves are visible only to the DM, not to that player or the rest of the party (some tables prefer the tension of not knowing your own odds). */
  deathSavesPrivate: boolean
  /** Per-encounter opt-in (defaults off) — a single hit dealing 1/4 or more of a combatant's max HP offers the DM a dismemberment (dice-rolled or manually chosen body part), and a hit that kills outright with damage at or past their full max HP offers a beheading/cut-in-half instead. Applies to any combatant taking damage, player or monster, not just monsters — see InitiativeTracker.tsx's applyDamageOrHeal. */
  dismembermentEnabled: boolean
  /** Index into `combatants` (already sorted by initiative, highest first) whose turn it is. -1 = combat not started yet. */
  turnIndex: number
  combatants: Combatant[]
}

export function emptyInitiativeState(): InitiativeState {
  return { round: 1, turnIndex: -1, combatants: [], deathSavesPrivate: false, dismembermentEnabled: false }
}

export function emptyCombatant(): Pick<Combatant, 'statusEffects' | 'deathSaves' | 'dismemberments'> {
  return { statusEffects: [], deathSaves: null, dismemberments: [] }
}

/**
 * Dismemberment results, tiered by how much of a hit it takes to earn them —
 * see InitiativeState.dismembermentEnabled and InitiativeTracker.tsx's
 * applyDamageOrHeal for the actual thresholds. A glancing-but-still-heavy
 * hit (>=1/4 max HP) only offers something losable without immediately
 * crippling the target; a real haymaker (>=1/2 max HP) is what earns a
 * whole limb. Beheading/bisection isn't a table roll at all — see
 * DismembermentPrompt's 'overkill' mode — since it only ever comes up
 * alongside a killing blow that also dealt the target's entire max HP in
 * one hit, at which point it's a DM pick between the two, not a d-whatever.
 */
export const MINOR_DISMEMBERMENT_TABLE = ['Left Hand', 'Right Hand', 'Left Finger', 'Right Finger', 'Left Ear', 'Right Ear', 'Left Eye', 'Right Eye']
export const MAJOR_DISMEMBERMENT_TABLE = ['Left Arm', 'Right Arm', 'Left Leg', 'Right Leg']

/** Combatants in turn order — initiative descending, ties broken by name so the order is at least stable and predictable. */
export function sortedByInitiative(combatants: Combatant[]): Combatant[] {
  return [...combatants].sort((a, b) => (b.initiative ?? -Infinity) - (a.initiative ?? -Infinity) || a.name.localeCompare(b.name))
}

/**
 * What a connected player is allowed to see of one combatant — real name
 * for everyone (including monsters), real current/max HP for a fellow
 * player (so the party can see how banged-up each other is), but only an
 * injury-level band for a monster's HP, never its exact numbers. A dead
 * (currentHp <= 0) monster or player is flagged so the UI can show a tag
 * for it without needing the raw HP itself.
 */
export interface PlayerVisibleCombatant {
  id: string
  kind: 'player' | 'monster'
  name: string
  initiative: number | null
  /** Real numbers for a player combatant; null for a monster (see `injury` instead). */
  currentHp: number | null
  maxHp: number | null
  injury: InjuryLevel
  dead: boolean
  isSelf: boolean
  statusEffects: string[]
  dismemberments: string[]
  /** Only ever populated for the viewer's own combatant, and only when the DM hasn't made death saves private — see InitiativeState.deathSavesPrivate. */
  deathSaves: DeathSaves | null
}

export interface PlayerVisibleInitiativeState {
  round: number
  turnIndex: number
  combatants: PlayerVisibleCombatant[]
}

/** Fisher-Yates — used only to scramble monster display order for players (see sanitizeForPlayer), not anything gameplay-affecting. */
function shuffle<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function sanitizeForPlayer(state: InitiativeState, viewerUserId: string): PlayerVisibleInitiativeState {
  // `combatants` is stored in add-order, not turn order — turnIndex is only
  // ever meaningful against the initiative-sorted view, so both the DM's
  // own UI and this player-facing view have to derive that same sort from
  // the same deterministic function to agree on what index N means.
  const ordered = sortedByInitiative(state.combatants)

  // A monster's exact initiative number is already hidden from players
  // (see PlayerVisibleCombatant.initiative being real only for player
  // combatants below) — but its position in a real-initiative-sorted list
  // still leaks its roll relative to the other monsters (and to the
  // player's own real initiative). Shuffling just the monster slots among
  // themselves removes that, while player combatants keep their real
  // positions (normal party knowledge). Reshuffled fresh on every
  // broadcast/request, independently per viewer, so there's no stable
  // pattern to correlate against, and it fixes up turnIndex to still point
  // at whoever's actually active after the reorder.
  const activeId = state.turnIndex >= 0 ? ordered[state.turnIndex]?.id : undefined
  const monsterSlots = ordered.reduce<number[]>((slots, c, i) => {
    if (c.kind === 'monster') slots.push(i)
    return slots
  }, [])
  const shuffledMonsters = shuffle(monsterSlots.map((i) => ordered[i]))
  const display = [...ordered]
  monsterSlots.forEach((slotIndex, k) => {
    display[slotIndex] = shuffledMonsters[k]
  })
  const turnIndex = activeId !== undefined ? display.findIndex((c) => c.id === activeId) : state.turnIndex

  return {
    round: state.round,
    turnIndex,
    combatants: display.map((c) => {
      const isSelf = c.kind === 'player' && c.userId === viewerUserId
      return {
        id: c.id,
        kind: c.kind,
        name: c.name,
        // Real number for a player (party members already announce their
        // own rolls), but null for a monster — the shuffle above already
        // hides its relative position, and there's no reason to also hand
        // over its literal roll on top of that.
        initiative: c.kind === 'player' ? c.initiative : null,
        currentHp: c.kind === 'player' ? c.currentHp : null,
        maxHp: c.kind === 'player' ? c.maxHp : null,
        injury: injuryLevel(c.currentHp, c.maxHp),
        dead: c.currentHp <= 0,
        isSelf,
        statusEffects: c.statusEffects,
        dismemberments: c.dismemberments,
        deathSaves: isSelf && !state.deathSavesPrivate ? c.deathSaves : null
      }
    })
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
