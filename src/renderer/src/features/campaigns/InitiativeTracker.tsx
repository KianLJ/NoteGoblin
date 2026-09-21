import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import { activeFeatIds, applyExhaustionToMaxHp, computeMaxHp, exhaustionEffectsDescription, abilityModifier } from '@shared/dnd5e'
import { buildCheckRollEntry, formatModifierTerm } from '@shared/dice'
import { ExhaustionIcon, HeartIcon, ShieldIcon, DiceIcon } from '../player/characterSheetTabs/icons'
import { GearIcon } from '../account/icons'
import { useMountAnimation } from '../../ui/useMountAnimation'
import { useLastTruthy } from '../../ui/useLastTruthy'
import { effectiveAbilityScores, computeArmorClassFromEquipment } from '@shared/compendium'
import { HoverDetailCard } from '../player/HoverDetailCard'
import { renderStatblockHtml } from '../../statblock'
import {
  emptyInitiativeState,
  emptyCombatant,
  sortedByInitiative,
  computeEncounterDifficulty,
  encounterMultiplier,
  DIFFICULTY_LABELS,
  MINOR_DISMEMBERMENT_TABLE,
  MAJOR_DISMEMBERMENT_TABLE,
  type Combatant,
  type InitiativeState,
  type Difficulty
} from '@shared/encounter'
import { BESTIARY, formatCr } from '../../data/bestiary'
import { loadCustomMonsters, isCustomMonster } from '../../data/customBestiary'
import { loadSavedEncounters, saveSavedEncounters, type SavedEncounter } from '../../data/savedEncounters'
import type { BestiaryMonster } from '../../data/bestiary'
import { Button } from '../../ui/Button'
import { playTurnFlowSfx, playMonsterSfx } from '../audio/sfxBoardEngine'
import { playSfx } from '../audio/soundEffects'

interface InitiativeTrackerProps {
  sessionId: string | null
  playerCharacters: Map<string, CharacterSheet>
  /** Clicking a monster combatant's name opens its full statblock in the main pane (see CampaignWorkspace.tsx) — DM-only, since this whole tracker only ever renders on the DM's side (the player-facing view is PlayerInitiativeView.tsx, a separate component that never sees monster identity). */
  onSelectMonster: (monster: BestiaryMonster) => void
  /** Set by RightPanel when the DM clicks "Load Encounter" on a presented scene (see SessionDeckPanel.tsx) — added to the tracker the same way EncounterBuilder's own "Add to Tracker" does, then cleared via onPendingEncounterConsumed so it doesn't re-add on every re-render. */
  pendingEncounterMonsters?: BestiaryMonster[] | null
  onPendingEncounterConsumed?: () => void
}

const STATUS_EFFECT_PRESETS = [
  'Blinded',
  'Charmed',
  'Concentrating',
  'Deafened',
  'Frightened',
  'Grappled',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious'
]

/** How many past states "Undo" can step back through — capped so a long session's worth of edits doesn't grow this without bound. */
const MAX_UNDO_HISTORY = 20

function playerToCombatant(userId: string, character: CharacterSheet): Combatant {
  const effScores = effectiveAbilityScores(character.abilityScores, character.classes, character.asiSlotChoices)
  const featIds = activeFeatIds(character.classes, character.asiSlotChoices)
  return {
    id: `player:${userId}`,
    name: character.name,
    kind: 'player',
    initiative: null,
    // effScores (not the raw base scores) so a Constitution bonus from a
    // feat/ASI actually raises Max HP here too — same source OverviewTab's
    // own Max HP already uses, and exhaustion level 4's halving on top,
    // matching what the character's own sheet shows instead of a stale/
    // higher number the DM never sees corrected.
    maxHp: applyExhaustionToMaxHp(computeMaxHp(character.classes, effScores), character.exhaustionLevel),
    currentHp: character.currentHp,
    ac: computeArmorClassFromEquipment(character.equipment, effScores, featIds, character.classes),
    userId,
    ...emptyCombatant()
  }
}

function monsterToCombatant(monster: BestiaryMonster): Combatant {
  const hpMatch = /^(\d+)/.exec(monster.hp ?? '')
  const acMatch = /^(\d+)/.exec(monster.ac ?? '')
  const maxHp = hpMatch ? Number(hpMatch[1]) : 10
  return {
    id: `monster:${monster.index}:${crypto.randomUUID()}`,
    name: monster.name,
    kind: 'monster',
    initiative: null,
    maxHp,
    currentHp: maxHp,
    ac: acMatch ? Number(acMatch[1]) : 10,
    monsterIndex: monster.index,
    ...emptyCombatant()
  }
}

/** A monster statblock's Dex is a raw score string (e.g. "14"), not a modifier — same shape OverviewTab parses for players' own ability scores, just from `StatblockData` instead of a `CharacterSheet`. Missing/unparseable Dex falls back to a flat 10 (the modifier-0 baseline) rather than blocking the roll. */
function monsterDexModifier(monster: BestiaryMonster | undefined): number {
  const score = monster?.dex ? Number(monster.dex) : NaN
  return abilityModifier(Number.isFinite(score) ? score : 10)
}

/** Dexterity modifier for whichever combatant this is — the same effective-score derivation already used for HP/AC above, so a feat/ASI Dex bonus raises initiative here too, not just those two. Monsters look themselves up in the bestiary by `monsterIndex`; a combatant that's neither a matched player nor monster (shouldn't normally happen) rolls flat. */
function initiativeModifierFor(
  c: Combatant,
  playerCharacters: Map<string, CharacterSheet>,
  allMonsters: BestiaryMonster[]
): number {
  if (c.kind === 'player' && c.userId) {
    const character = playerCharacters.get(c.userId)
    if (character) {
      const effScores = effectiveAbilityScores(character.abilityScores, character.classes, character.asiSlotChoices)
      return abilityModifier(effScores.dex)
    }
  }
  if (c.kind === 'monster') {
    return monsterDexModifier(allMonsters.find((m) => m.index === c.monsterIndex))
  }
  return 0
}

/**
 * The DM's combat panel — auto-adds connected players (HP/AC pulled live
 * from their synced character), monsters added by hand or via the built-in
 * encounter builder, and a play mode (Start/Next/Previous) that steps
 * through initiative order. Every change broadcasts a sanitized copy to
 * connected players (see shared/encounter.ts's sanitizeForPlayer and
 * sessionHost.ts's broadcastInitiative) — enemies show only as an injury
 * band, never their real name/HP/AC.
 */
export function InitiativeTracker({
  sessionId,
  playerCharacters,
  onSelectMonster,
  pendingEncounterMonsters,
  onPendingEncounterConsumed
}: InitiativeTrackerProps): JSX.Element {
  const [state, setState] = useState<InitiativeState>(emptyInitiativeState())
  const [view, setView] = useState<'tracker' | 'build'>('tracker')
  const [monsterQuery, setMonsterQuery] = useState('')
  const [savedEncounters, setSavedEncounters] = useState(() => loadSavedEncounters())
  const [encounterDraft, setEncounterDraft] = useState<Record<string, number>>({})
  const [encounterName, setEncounterName] = useState('')
  // Snapshots for Undo — pushed explicitly before a discrete action (remove,
  // start/next/prev/end combat, roll, reorder, status/death-save toggles),
  // not on every keystroke of a raw text field (initiative/HP/AC typed by
  // hand), which would otherwise make Undo step back one character at a
  // time instead of one meaningful action.
  const [history, setHistory] = useState<InitiativeState[]>([])
  const [dragFromId, setDragFromId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  // Which combatant just took a qualifying hit and is waiting on the DM to
  // pick (or roll) a dismemberment — see applyDamageOrHeal for the actual
  // thresholds. 'minor' (>=1/4 max HP) only offers small losable parts
  // (hands, fingers, eyes, ears); 'major' (>=1/2 max HP) offers whole limbs;
  // 'overkill' (a killing blow that also dealt >= full max HP in one hit)
  // offers beheading/bisection instead of a table roll at all. Only one
  // prompt at a time; a second qualifying hit before this one is resolved
  // just replaces it rather than queuing.
  const [dismemberPrompt, setDismemberPrompt] = useState<{ combatantId: string; mode: 'minor' | 'major' | 'overkill' } | null>(null)
  const lastDismemberPrompt = useLastTruthy(dismemberPrompt)
  const { rendered: dismemberPromptRendered, closing: dismemberPromptClosing } = useMountAnimation(dismemberPrompt !== null)

  useEffect(() => {
    if (sessionId) void window.goblin.initiative.broadcast(state)
  }, [state, sessionId])

  useEffect(() => {
    if (!pendingEncounterMonsters || pendingEncounterMonsters.length === 0) return
    setState((prev) => ({ ...prev, combatants: [...prev.combatants, ...pendingEncounterMonsters.map(monsterToCombatant)] }))
    setView('tracker')
    onPendingEncounterConsumed?.()
  }, [pendingEncounterMonsters, onPendingEncounterConsumed])

  // A player rolling/entering their own initiative (see PlayerInitiativeView.tsx) arrives here rather than
  // being editable on their end of the combatant list — this is the one write path into a DM-owned combatant
  // a player has, so it's applied by userId rather than combatant id (which the player never sees).
  useEffect(() => {
    return window.goblin.initiative.onPlayerSet(({ userId, initiative }) => {
      setState((prev) => ({
        ...prev,
        combatants: prev.combatants.map((c) => (c.kind === 'player' && c.userId === userId ? { ...c, initiative } : c))
      }))
    })
  }, [])

  // Max HP and AC are derived from the character sheet (level/HP die,
  // equipped armor, active feat/ASI ability bonuses, exhaustion), not
  // something the DM tracks by hand — once a player combatant was added,
  // those two used to freeze at whatever they were at add-time and
  // silently drift out of sync with the actual sheet (a level up, new
  // armor, a feat, exhaustion changing, etc). Re-derives them from the live
  // playerCharacters map on every change. Deliberately leaves currentHp
  // alone — that's real combat state the DM is actively tracking (damage
  // taken this fight), not something a sheet edit should ever overwrite
  // mid-encounter.
  useEffect(() => {
    setState((prev) => {
      let changed = false
      const combatants = prev.combatants.map((c) => {
        if (c.kind !== 'player' || !c.userId) return c
        const character = playerCharacters.get(c.userId)
        if (!character) return c
        const effScores = effectiveAbilityScores(character.abilityScores, character.classes, character.asiSlotChoices)
        const featIds = activeFeatIds(character.classes, character.asiSlotChoices)
        const maxHp = applyExhaustionToMaxHp(computeMaxHp(character.classes, effScores), character.exhaustionLevel)
        const ac = computeArmorClassFromEquipment(character.equipment, effScores, featIds, character.classes)
        if (maxHp === c.maxHp && ac === c.ac) return c
        changed = true
        return { ...c, maxHp, ac }
      })
      return changed ? { ...prev, combatants } : prev
    })
  }, [playerCharacters])

  // A connected player is automatically part of the fight the instant they
  // join — the DM shouldn't have to remember to click "Add Players" (and a
  // player who reconnects mid-session, or joins late, shouldn't need a
  // manual nudge either). Purely additive: never removes a player who
  // disconnects mid-encounter, since their combatant (HP, status, any
  // dismemberment) is still real fight state the DM is tracking.
  useEffect(() => {
    setState((prev) => {
      const existingUserIds = new Set(prev.combatants.filter((c) => c.kind === 'player').map((c) => c.userId))
      const toAdd = [...playerCharacters.entries()]
        .filter(([userId]) => !existingUserIds.has(userId))
        .map(([userId, character]) => playerToCombatant(userId, character))
      return toAdd.length ? { ...prev, combatants: [...prev.combatants, ...toAdd] } : prev
    })
  }, [playerCharacters])

  const allMonstersForQuickAdd = useMemo(
    () => [...loadCustomMonsters(), ...BESTIARY].sort((a, b) => a.name.localeCompare(b.name)),
    []
  )

  const ordered = sortedByInitiative(state.combatants)
  const inCombat = state.turnIndex >= 0

  function patch(fields: Partial<InitiativeState>): void {
    setState((prev) => ({ ...prev, ...fields }))
  }

  /** Snapshots the current state onto the undo stack — call before a discrete action's own patch/setState, not from inside a raw text-field onChange (see this component's `history` doc comment for why). */
  function pushHistory(): void {
    setHistory((h) => [...h.slice(-(MAX_UNDO_HISTORY - 1)), state])
  }

  function undo(): void {
    setHistory((h) => {
      if (h.length === 0) return h
      setState(h[h.length - 1])
      return h.slice(0, -1)
    })
  }

  function updateCombatant(id: string, fields: Partial<Combatant>): void {
    patch({ combatants: state.combatants.map((c) => (c.id === id ? { ...c, ...fields } : c)) })
  }

  /** HP changes need to touch deathSaves too — crossing down to 0 starts tracking them (players only; a monster just dies), crossing back above 0 (a heal) clears whatever was rolled so far. */
  function setCombatantHp(id: string, value: number): void {
    patch({
      combatants: state.combatants.map((c) => {
        if (c.id !== id) return c
        if (c.kind !== 'player') return { ...c, currentHp: value }
        if (value <= 0 && c.deathSaves === null) return { ...c, currentHp: value, deathSaves: { successes: 0, failures: 0 } }
        if (value > 0 && c.deathSaves !== null) return { ...c, currentHp: value, deathSaves: null }
        return { ...c, currentHp: value }
      })
    })
  }

  /** Only an actual forward roll (delta > 0 — clicking a pip past the current count, not undoing one) plays a cue: the tension-tick for the first two, then a distinct success/fail stinger the moment a third one lands — see playTurnFlowSfx's own doc comment for why these never show up as a manual Sound Board button. */
  function bumpDeathSave(id: string, kind: 'successes' | 'failures', delta: number): void {
    pushHistory()
    let resultingCount: number | null = null
    patch({
      combatants: state.combatants.map((c) => {
        if (c.id !== id || !c.deathSaves) return c
        const next = Math.min(3, Math.max(0, c.deathSaves[kind] + delta))
        if (delta > 0) resultingCount = next
        return { ...c, deathSaves: { ...c.deathSaves, [kind]: next } }
      })
    })
    if (resultingCount === 3) playTurnFlowSfx(kind === 'successes' ? 'Death Save Success' : 'Death Save Fail', sessionId)
    else if (resultingCount !== null) playTurnFlowSfx('Death Save Tick', sessionId)
  }

  function addStatusEffect(id: string, effect: string): void {
    if (!effect.trim()) return
    pushHistory()
    patch({
      combatants: state.combatants.map((c) =>
        c.id === id && !c.statusEffects.includes(effect) ? { ...c, statusEffects: [...c.statusEffects, effect] } : c
      )
    })
  }

  function removeStatusEffect(id: string, effect: string): void {
    pushHistory()
    patch({ combatants: state.combatants.map((c) => (c.id === id ? { ...c, statusEffects: c.statusEffects.filter((e) => e !== effect) } : c)) })
  }

  /**
   * Removing a combatant used to always reset turnIndex/round to "combat not
   * started" — losing your place over dragging off one dead monster. Now it
   * only ever adjusts what's strictly necessary: whoever's turn it currently
   * is stays whoever's turn it is (by identity, not position) unless that
   * exact combatant is the one being removed, in which case the "next" slot
   * (same numeric index into the now-shorter list, wrapping) naturally
   * becomes active — matching what nextTurn would have done anyway.
   */
  function removeCombatant(id: string): void {
    pushHistory()
    const activeId = inCombat ? ordered[state.turnIndex]?.id : undefined
    const remaining = ordered.filter((c) => c.id !== id)
    let turnIndex = state.turnIndex
    if (inCombat) {
      if (remaining.length === 0) turnIndex = -1
      else if (activeId === id) turnIndex = state.turnIndex % remaining.length
      else turnIndex = remaining.findIndex((c) => c.id === activeId)
    }
    patch({ combatants: state.combatants.filter((c) => c.id !== id), turnIndex })
  }

  /** 1d20 + Dex modifier, rolled instantly (no interactive reveal — this is DM-side bulk setup, not a player's own suspenseful check) and written straight into that combatant's initiative field. Kept purely local: never broadcast to the dice log, since a monster's exact initiative roll is meant to stay hidden from players (see sanitizeForPlayer). */
  function rollInitiativeFor(c: Combatant): void {
    const modifier = initiativeModifierFor(c, playerCharacters, allMonstersForQuickAdd)
    const entry = buildCheckRollEntry(c.id, c.name, modifier, 'normal', true, 'Initiative')
    updateCombatant(c.id, { initiative: entry.total })
    playSfx('diceRoll')
  }

  /** Rolls initiative for every combatant at once — the common "alright, everybody roll" moment at a fight's start. One history entry for the whole batch, not one per combatant, so Undo reverses it in a single step. */
  function rollAllInitiative(): void {
    if (state.combatants.length === 0) return
    pushHistory()
    patch({
      combatants: state.combatants.map((c) => {
        const modifier = initiativeModifierFor(c, playerCharacters, allMonstersForQuickAdd)
        return { ...c, initiative: buildCheckRollEntry(c.id, c.name, modifier, 'normal', true, 'Initiative').total }
      })
    })
    playSfx('diceRoll')
  }

  /**
   * Drag-and-drop reorder — since turn order is always *derived* from each
   * combatant's initiative number (sortedByInitiative), "moving" a card
   * means renumbering the whole visible list to strictly descending
   * integers matching the drop position (length down to 1), which
   * `sortedByInitiative` then reproduces exactly (no ties left to break by
   * name). Whoever's turn it currently is stays whoever's turn it is by
   * identity across the renumbering, same as removeCombatant.
   */
  function reorderCombatants(fromId: string, toId: string): void {
    if (fromId === toId) return
    const fromIndex = ordered.findIndex((c) => c.id === fromId)
    const toIndex = ordered.findIndex((c) => c.id === toId)
    if (fromIndex === -1 || toIndex === -1) return
    pushHistory()

    const activeId = inCombat ? ordered[state.turnIndex]?.id : undefined
    const reordered = [...ordered]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, moved)
    const renumbered = reordered.map((c, i) => ({ ...c, initiative: reordered.length - i }))
    const byId = new Map(renumbered.map((c) => [c.id, c]))

    patch({
      combatants: state.combatants.map((c) => byId.get(c.id) ?? c),
      turnIndex: inCombat ? renumbered.findIndex((c) => c.id === activeId) : state.turnIndex
    })
  }

  /** Applies a typed delta as damage (subtracts) or healing (adds) to current HP, instead of the DM mentally computing the new absolute number and retyping the whole field — same death-save side effects as typing the result directly (see setCombatantHp). Floors at 0. Unlike the raw HP field (no history snapshot per keystroke), this is a discrete button click, so it does get one — a misclicked "10 damage" should be undoable the same as removing the wrong combatant. */
  function applyDamageOrHeal(id: string, amount: number, kind: 'damage' | 'heal'): void {
    if (!Number.isFinite(amount) || amount <= 0) return
    const c = state.combatants.find((x) => x.id === id)
    if (!c) return
    pushHistory()
    const next = kind === 'damage' ? Math.max(0, c.currentHp - amount) : c.currentHp + amount
    setCombatantHp(id, next)

    // Dismemberment (opt-in, see the toolbar checkbox) — tiered by how much
    // of the hit landed. A killing blow that also dealt the target's entire
    // max HP in one hit is dramatic enough to offer beheading/bisection
    // outright ('overkill'); short of that, >=1/2 max HP earns a whole limb
    // ('major'), and >=1/4 max HP earns only something small (a hand,
    // finger, eye, ear — 'minor'). A heal, or damage below the minor
    // threshold, never triggers this. Checked highest tier first since a
    // killing/major blow also always satisfies the lower thresholds.
    if (kind === 'damage' && state.dismembermentEnabled && c.maxHp > 0) {
      const fraction = amount / c.maxHp
      if (next <= 0 && fraction >= 1) setDismemberPrompt({ combatantId: id, mode: 'overkill' })
      else if (fraction >= 0.5) setDismemberPrompt({ combatantId: id, mode: 'major' })
      else if (fraction >= 0.25) setDismemberPrompt({ combatantId: id, mode: 'minor' })
    }
  }

  function addDismemberment(id: string, tag: string): void {
    pushHistory()
    patch({
      combatants: state.combatants.map((c) =>
        c.id === id && !c.dismemberments.includes(tag) ? { ...c, dismemberments: [...c.dismemberments, tag] } : c
      )
    })
    setDismemberPrompt(null)
  }

  function removeDismemberment(id: string, tag: string): void {
    pushHistory()
    patch({ combatants: state.combatants.map((c) => (c.id === id ? { ...c, dismemberments: c.dismemberments.filter((t) => t !== tag) } : c)) })
  }

  /** Plays (and, at the table, broadcasts to every connected player) the Creatures cue matching whichever combatant's turn is coming up, if it's a monster — a player's own turn has no such cue, so this is a no-op for one. */
  function announceTurnSfx(index: number): void {
    const combatant = ordered[index]
    if (!combatant || combatant.kind !== 'monster' || !combatant.monsterIndex) return
    const monster = allMonstersForQuickAdd.find((m) => m.index === combatant.monsterIndex)
    if (monster) playMonsterSfx(`monster:${monster.index}`, monster, sessionId)
  }

  function startCombat(): void {
    pushHistory()
    patch({ turnIndex: 0, round: 1 })
    playTurnFlowSfx('Initiative Start', sessionId)
    announceTurnSfx(0)
  }

  function nextTurn(): void {
    if (ordered.length === 0) return
    const next = state.turnIndex + 1
    const wrapped = next >= ordered.length
    if (wrapped) patch({ turnIndex: 0, round: state.round + 1 })
    else patch({ turnIndex: next })
    playTurnFlowSfx('Turn Change', sessionId)
    announceTurnSfx(wrapped ? 0 : next)
  }

  function prevTurn(): void {
    if (ordered.length === 0) return
    const prev = state.turnIndex - 1
    if (prev < 0) patch({ turnIndex: ordered.length - 1, round: Math.max(1, state.round - 1) })
    else patch({ turnIndex: prev })
  }

  function endCombat(): void {
    pushHistory()
    patch({ turnIndex: -1, round: 1 })
    playTurnFlowSfx('End Combat', sessionId)
  }

  function clearAll(): void {
    pushHistory()
    setState(emptyInitiativeState())
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: 4, padding: 'var(--space-2)', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <button type="button" onClick={() => setView('tracker')} style={innerTabStyle(view === 'tracker')}>
          Tracker
        </button>
        <button type="button" onClick={() => setView('build')} style={innerTabStyle(view === 'build')}>
          Build Encounter
        </button>
      </div>

      {view === 'tracker' ? (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <select
              className="gb-input"
              value=""
              onChange={(e) => {
                const monster = allMonstersForQuickAdd.find((m) => m.index === e.target.value)
                if (monster) {
                  pushHistory()
                  patch({ combatants: [...state.combatants, monsterToCombatant(monster)] })
                }
              }}
              style={{ fontSize: 11, padding: '3px 4px', maxWidth: 130 }}
              title="Add an enemy"
            >
              <option value="">+ Add Enemy…</option>
              {allMonstersForQuickAdd.map((m) => (
                <option key={m.index} value={m.index}>
                  {m.name}
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              onClick={rollAllInitiative}
              disabled={state.combatants.length === 0}
              title="Roll 1d20 + Dex for every combatant"
              style={{ fontSize: 11, padding: '3px 8px' }}
            >
              🎲 Roll All
            </Button>
            {!inCombat ? (
              <Button variant="primary" onClick={startCombat} disabled={state.combatants.length === 0} style={{ fontSize: 11, padding: '3px 8px' }}>
                Start Combat
              </Button>
            ) : (
              <Button variant="secondary" onClick={endCombat} style={{ fontSize: 11, padding: '3px 8px' }}>
                End Combat
              </Button>
            )}
            <Button variant="ghost" onClick={clearAll} style={{ fontSize: 11, padding: '3px 8px' }}>
              Clear
            </Button>
            <Button variant="ghost" onClick={undo} disabled={history.length === 0} title="Undo the last action" style={{ fontSize: 11, padding: '3px 8px' }}>
              ↶ Undo
            </Button>
            <div style={{ marginLeft: 'auto' }}>
              <TrackerSettingsMenu
                dismembermentEnabled={state.dismembermentEnabled}
                onSetDismembermentEnabled={(v) => patch({ dismembermentEnabled: v })}
                deathSavesPrivate={state.deathSavesPrivate}
                onSetDeathSavesPrivate={(v) => patch({ deathSavesPrivate: v })}
              />
            </div>
          </div>

          {inCombat && (
            <div
              className="gb-card"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-2)' }}
            >
              <button type="button" onClick={prevTurn} title="Previous turn" style={roundBtnStyle}>
                ‹
              </button>
              <div style={{ textAlign: 'center', fontSize: 12 }}>
                <div style={{ fontWeight: 700 }}>Round {state.round}</div>
                <div style={{ color: 'var(--accent)' }}>{ordered[state.turnIndex]?.name ?? '—'}'s turn</div>
              </div>
              <button type="button" onClick={nextTurn} title="Next turn" style={roundBtnStyle}>
                ›
              </button>
            </div>
          )}

          {ordered.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No combatants yet.</p>}

          {ordered.map((c, i) => (
            <div
              key={c.id}
              className="gb-card gb-draggable-card"
              draggable
              onDragStart={() => setDragFromId(c.id)}
              onDragOver={(e) => {
                e.preventDefault()
                if (dragOverId !== c.id) setDragOverId(c.id)
              }}
              onDragLeave={() => setDragOverId((prev) => (prev === c.id ? null : prev))}
              onDrop={(e) => {
                e.preventDefault()
                if (dragFromId) reorderCombatants(dragFromId, c.id)
                setDragFromId(null)
                setDragOverId(null)
              }}
              onDragEnd={() => {
                setDragFromId(null)
                setDragOverId(null)
              }}
              style={{
                position: 'relative',
                padding: 'var(--space-2)',
                borderColor: dragOverId === c.id ? 'var(--accent)' : inCombat && i === state.turnIndex ? 'var(--accent)' : undefined,
                background: inCombat && i === state.turnIndex ? 'var(--accent-subtle)' : undefined,
                opacity: dragFromId === c.id ? 0.5 : 1
              }}
            >
              <button
                type="button"
                onClick={() => removeCombatant(c.id)}
                title="Remove"
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  width: 26,
                  height: 26,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'none',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-muted)',
                  fontSize: 18,
                  lineHeight: 1,
                  cursor: 'pointer'
                }}
              >
                ×
              </button>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 24 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <span
                    title="Drag to reorder"
                    style={{ cursor: 'grab', color: 'var(--text-muted)', fontSize: 13, lineHeight: 1, userSelect: 'none', marginTop: 8 }}
                  >
                    ⠿
                  </span>
                  <IconValueColumn
                    icon={<DiceIcon size={ICON_STAT_SIZE} style={{ color: 'var(--accent)' }} />}
                    iconTitle={`Roll 1d20 ${formatModifierTerm(initiativeModifierFor(c, playerCharacters, allMonstersForQuickAdd))}`}
                    onIconClick={() => rollInitiativeFor(c)}
                    value={c.initiative ?? ''}
                    onChange={(v) => updateCombatant(c.id, { initiative: v === '' ? null : Number(v) })}
                    inputTitle="Initiative"
                    placeholder="—"
                  />

                  <div style={{ flex: 1, minWidth: 0, paddingTop: 6 }}>
                    {c.kind === 'monster' ? (
                      <button
                        type="button"
                        onClick={() => {
                          const monster = allMonstersForQuickAdd.find((m) => m.index === c.monsterIndex)
                          if (monster) onSelectMonster(monster)
                        }}
                        title="View statblock"
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          color: 'var(--accent)',
                          fontSize: 17,
                          fontWeight: 800,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {c.name}
                      </button>
                    ) : (
                      <strong style={{ display: 'block', fontSize: 17, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.name}
                      </strong>
                    )}
                    {c.currentHp <= 0 && (
                      <span className="gb-badge" style={{ fontSize: 10, color: 'var(--danger)', marginTop: 2 }}>
                        Dead
                      </span>
                    )}
                    {c.kind === 'player' &&
                      c.userId &&
                      (() => {
                        const exhaustionLevel = playerCharacters.get(c.userId)?.exhaustionLevel ?? 0
                        if (exhaustionLevel <= 0) return null
                        return (
                          <span
                            title={`Exhaustion ${exhaustionLevel}\n${exhaustionEffectsDescription(exhaustionLevel)}`}
                            style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--danger)', marginTop: 2 }}
                          >
                            <ExhaustionIcon size={13} style={{ color: 'var(--danger)' }} />
                            {exhaustionLevel}
                          </span>
                        )
                      })()}
                  </div>

                  <HpIconColumn
                    currentHp={c.currentHp}
                    maxHp={c.maxHp}
                    onSetHp={(v) => setCombatantHp(c.id, v)}
                    onSetMaxHp={(v) => updateCombatant(c.id, { maxHp: v })}
                    onApply={(amount, kind) => applyDamageOrHeal(c.id, amount, kind)}
                  />
                  <IconValueColumn
                    icon={<ShieldIcon size={ICON_STAT_SIZE} style={{ color: 'var(--text-muted)' }} />}
                    iconTitle="Armor Class"
                    value={c.ac}
                    onChange={(v) => updateCombatant(c.id, { ac: v === '' ? 0 : Number(v) })}
                    inputTitle="Armor Class"
                  />
                </div>

                {c.deathSaves && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--text-muted)' }}>
                    <DeathSaveRow label="Success" count={c.deathSaves.successes} color="var(--success)" onChange={(delta) => bumpDeathSave(c.id, 'successes', delta)} />
                    <DeathSaveRow label="Fail" count={c.deathSaves.failures} color="var(--danger)" onChange={(delta) => bumpDeathSave(c.id, 'failures', delta)} />
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  {c.statusEffects.map((effect) => (
                    <FadeOutBadge key={effect} onRemove={() => removeStatusEffect(c.id, effect)}>
                      {effect}
                    </FadeOutBadge>
                  ))}
                  <AddStatusEffectControl
                    options={STATUS_EFFECT_PRESETS.filter((s) => !c.statusEffects.includes(s))}
                    onAdd={(effect) => addStatusEffect(c.id, effect)}
                  />
                </div>

                {c.dismemberments.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    {c.dismemberments.map((tag) => (
                      <FadeOutBadge key={tag} color="var(--danger)" onRemove={() => removeDismemberment(c.id, tag)}>
                        {tag}
                      </FadeOutBadge>
                    ))}
                  </div>
                )}

                {dismemberPromptRendered && lastDismemberPrompt?.combatantId === c.id && (
                  <DismembermentPrompt
                    mode={lastDismemberPrompt.mode}
                    closing={dismemberPromptClosing}
                    onPick={(tag) => addDismemberment(c.id, tag)}
                    onDismiss={() => setDismemberPrompt(null)}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EncounterBuilder
          playerCharacters={playerCharacters}
          monsterQuery={monsterQuery}
          setMonsterQuery={setMonsterQuery}
          savedEncounters={savedEncounters}
          setSavedEncounters={setSavedEncounters}
          encounterDraft={encounterDraft}
          setEncounterDraft={setEncounterDraft}
          encounterName={encounterName}
          setEncounterName={setEncounterName}
          onAddEncounterToTracker={(monsters) => {
            patch({ combatants: [...state.combatants, ...monsters.map(monsterToCombatant)] })
            setView('tracker')
          }}
        />
      )}
    </div>
  )
}

interface EncounterBuilderProps {
  playerCharacters: Map<string, CharacterSheet>
  monsterQuery: string
  setMonsterQuery: (q: string) => void
  savedEncounters: SavedEncounter[]
  setSavedEncounters: (list: SavedEncounter[]) => void
  encounterDraft: Record<string, number>
  setEncounterDraft: (draft: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void
  encounterName: string
  setEncounterName: (name: string) => void
  onAddEncounterToTracker: (monsters: BestiaryMonster[]) => void
}

function EncounterBuilder({
  playerCharacters,
  monsterQuery,
  setMonsterQuery,
  savedEncounters,
  setSavedEncounters,
  encounterDraft,
  setEncounterDraft,
  encounterName,
  setEncounterName,
  onAddEncounterToTracker
}: EncounterBuilderProps): JSX.Element {
  const allMonsters = useMemo(() => [...loadCustomMonsters(), ...BESTIARY], [])
  // Empty query still shows a default alphabetical page rather than nothing
  // — clicking into the search bar opens a browsable dropdown even before
  // typing, not just a search-results list once you have.
  const filtered = useMemo(() => {
    const q = monsterQuery.trim().toLowerCase()
    const source = q ? allMonsters.filter((m) => m.name.toLowerCase().includes(q)) : allMonsters
    return [...source].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 20)
  }, [allMonsters, monsterQuery])
  const [searchOpen, setSearchOpen] = useState(false)
  const searchWrapperRef = useRef<HTMLDivElement>(null)
  const { rendered: searchResultsRendered, closing: searchResultsClosing } = useMountAnimation(searchOpen && filtered.length > 0)

  useEffect(() => {
    if (!searchOpen) return
    function handleClickOutside(e: MouseEvent): void {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target as Node)) setSearchOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [searchOpen])

  const partyLevels = useMemo(
    () => [...playerCharacters.values()].map((c) => c.classes.reduce((sum, cl) => sum + cl.level, 0) || 1),
    [playerCharacters]
  )

  // A manual stand-in for the party — for planning an encounter before
  // anyone's actually connected, or against a hypothetical party size/level
  // rather than whoever happens to be online right now. Only takes effect
  // once BOTH fields hold a valid number; otherwise every calculation below
  // (the live difficulty readout, and the generator) falls back to the
  // actually-connected party's real levels, same as before this existed.
  const [partySizeInput, setPartySizeInput] = useState('')
  const [partyLevelInput, setPartyLevelInput] = useState('')
  const partyOverride = useMemo(() => {
    const size = parseInt(partySizeInput, 10)
    const level = parseInt(partyLevelInput, 10)
    if (!Number.isFinite(size) || size < 1 || !Number.isFinite(level) || level < 1) return null
    return Array(Math.min(20, size)).fill(Math.min(20, level))
  }, [partySizeInput, partyLevelInput])
  const effectivePartyLevels = partyOverride ?? (partyLevels.length ? partyLevels : [1])

  const draftMonsters = useMemo(() => {
    const result: BestiaryMonster[] = []
    for (const [index, count] of Object.entries(encounterDraft)) {
      const monster = allMonsters.find((m) => m.index === index)
      if (monster) for (let i = 0; i < count; i++) result.push(monster)
    }
    return result
  }, [encounterDraft, allMonsters])

  const difficulty = useMemo(
    () => computeEncounterDifficulty(effectivePartyLevels, draftMonsters.map((m) => m.xp)),
    [effectivePartyLevels, draftMonsters]
  )

  // Harder tiers throw more bodies at the party, not just tougher ones —
  // scales the target headcount alongside the XP budget itself so a Deadly
  // encounter reads as a swarm bearing down, not just one bigger monster.
  const TIER_COUNT_MULTIPLIER: Record<Exclude<Difficulty, 'trivial'>, number> = { easy: 0.8, medium: 1, hard: 1.3, deadly: 1.6 }

  /** A `total` split into `parts` positive integers, each at least 1, randomly sized — used to divide a generated encounter's headcount across however many species were picked, so one species isn't always the same fixed share. */
  function splitRandomly(total: number, parts: number): number[] {
    if (parts <= 1) return [total]
    const counts: number[] = []
    let remaining = total
    for (let i = 0; i < parts - 1; i++) {
      const roomForRest = parts - 1 - i
      const maxHere = remaining - roomForRest
      const n = 1 + Math.floor(Math.random() * Math.max(1, maxHere))
      counts.push(n)
      remaining -= n
    }
    counts.push(remaining)
    return counts
  }

  /** `count` distinct random entries from `pool` (fewer if the pool itself is smaller than that). */
  function pickDistinct<T>(pool: T[], count: number): T[] {
    const shuffled = [...pool].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, count)
  }

  /**
   * One-click "give me an encounter" — replaces the current draft with a
   * mix of one to three monster species (more species once there's enough
   * total headcount to actually split around) whose combined, group-size-
   * adjusted XP lands as close as possible to the chosen difficulty's own
   * threshold for the effective party (see effectivePartyLevels above). The
   * target headcount itself scales with both party size and the difficulty
   * tier (see TIER_COUNT_MULTIPLIER) — a party of six generates noticeably
   * more enemies than a party of three at the same difficulty, and Deadly
   * generates more than Easy for the same party.
   *
   * Tries several random (species combination, headcount split) pairs and
   * keeps whichever lands closest to the target — the DMG's group-size
   * multiplier means "how many" shifts the actual adjusted XP nonlinearly,
   * so this can't just solve for it directly. Not guaranteed to land
   * exactly on the requested tier for an unusual party (a very high-level
   * party with a thin monster pool, for instance), just the closest the
   * bestiary can actually offer.
   */
  function generateEncounter(tier: Exclude<Difficulty, 'trivial'>): void {
    const target = computeEncounterDifficulty(effectivePartyLevels, []).partyThresholds[tier]
    if (!target) return
    const pool = allMonsters.filter((m) => m.xp > 0)
    if (pool.length === 0) return

    const partySize = effectivePartyLevels.length
    const desiredCount = Math.min(12, Math.max(1, Math.round(partySize * TIER_COUNT_MULTIPLIER[tier])))

    // Bias toward species whose own XP is actually plausible for this
    // headcount/budget combination — picking from the *whole* bestiary
    // unfiltered meant a low-level party's Easy encounter could randomly
    // land on ancient dragons every attempt (all equally implausible, so
    // "closest of 60 bad options" was still bad); falls back to the
    // unfiltered pool if this leaves too few candidates to pick from at all.
    const perMonsterBudget = target / (desiredCount * encounterMultiplier(desiredCount))
    const filteredPool = pool.filter((m) => m.xp >= perMonsterBudget * 0.15 && m.xp <= perMonsterBudget * 4)
    const workingPool = filteredPool.length >= 3 ? filteredPool : pool

    let best: { draft: Record<string, number>; diff: number } | null = null
    for (let attempt = 0; attempt < 60; attempt++) {
      const numSpecies = desiredCount <= 1 ? 1 : Math.min(3, desiredCount, 1 + Math.floor(Math.random() * 3))
      const species = pickDistinct(workingPool, numSpecies)
      if (species.length === 0) continue
      const counts = splitRandomly(desiredCount, species.length)

      const totalCount = counts.reduce((sum, n) => sum + n, 0)
      const rawXp = species.reduce((sum, m, i) => sum + m.xp * counts[i], 0)
      const adjustedXp = Math.round(rawXp * encounterMultiplier(totalCount))
      const diff = Math.abs(adjustedXp - target)

      if (!best || diff < best.diff) {
        const draft: Record<string, number> = {}
        species.forEach((m, i) => {
          draft[m.index] = (draft[m.index] ?? 0) + counts[i]
        })
        best = { draft, diff }
      }
    }
    if (!best) return
    setEncounterDraft(best.draft)
    setEncounterName('')
  }

  function addToDraft(index: string): void {
    setEncounterDraft((prev) => ({ ...prev, [index]: (prev[index] ?? 0) + 1 }))
  }

  function removeFromDraft(index: string): void {
    setEncounterDraft((prev) => {
      const next = { ...prev }
      if (next[index] > 1) next[index] -= 1
      else delete next[index]
      return next
    })
  }

  function saveEncounter(): void {
    if (!encounterName.trim() || draftMonsters.length === 0) return
    const monsterIndexes = Object.entries(encounterDraft).flatMap(([index, count]) => Array(count).fill(index))
    const next = [...savedEncounters, { id: crypto.randomUUID(), name: encounterName.trim(), monsterIndexes, createdAt: new Date().toISOString() }]
    saveSavedEncounters(next)
    setSavedEncounters(next)
    setEncounterName('')
    setEncounterDraft({})
  }

  function loadEncounterIntoDraft(enc: SavedEncounter): void {
    const counts: Record<string, number> = {}
    for (const index of enc.monsterIndexes) counts[index] = (counts[index] ?? 0) + 1
    setEncounterDraft(counts)
  }

  function deleteEncounter(id: string): void {
    const next = savedEncounters.filter((e) => e.id !== id)
    saveSavedEncounters(next)
    setSavedEncounters(next)
  }

  // Suggests a handful of monsters (single-instance XP within the party's remaining budget for the target difficulty) whose CR roughly fits what's left, sorted strongest-first.
  function suggestionsFor(target: 'easy' | 'medium' | 'hard' | 'deadly'): BestiaryMonster[] {
    const remaining = Math.max(0, difficulty.partyThresholds[target] - difficulty.adjustedXp)
    if (remaining === 0) return []
    return allMonsters
      .filter((m) => m.xp > 0 && m.xp <= remaining)
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 5)
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="gb-card" style={{ padding: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="gb-label" style={{ margin: 0 }}>
          Generate Encounter
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            className="gb-input"
            type="number"
            min={1}
            placeholder={`Party size${partyLevels.length ? ` (${partyLevels.length})` : ''}`}
            value={partySizeInput}
            onChange={(e) => setPartySizeInput(e.target.value)}
            style={{ fontSize: 12, flex: 1 }}
          />
          <input
            className="gb-input"
            type="number"
            min={1}
            max={20}
            placeholder={`Avg level${partyLevels.length ? ` (${Math.round(partyLevels.reduce((a, b) => a + b, 0) / partyLevels.length)})` : ''}`}
            value={partyLevelInput}
            onChange={(e) => setPartyLevelInput(e.target.value)}
            style={{ fontSize: 12, flex: 1 }}
          />
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
          {partyOverride
            ? `Generating for a hypothetical party of ${partyOverride.length} at level ${partyOverride[0]}.`
            : partyLevels.length
              ? `Generating for the ${partyLevels.length} connected player${partyLevels.length === 1 ? '' : 's'} — fill in both fields above to plan for a different party instead.`
              : 'No players connected yet — fill in both fields above to generate against a hypothetical party.'}
        </p>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['easy', 'medium', 'hard', 'deadly'] as const).map((tier) => (
            <Button key={tier} variant="secondary" onClick={() => generateEncounter(tier)} style={{ fontSize: 11, padding: '4px 6px', flex: 1 }}>
              {DIFFICULTY_LABELS[tier]}
            </Button>
          ))}
        </div>
      </div>

      <div ref={searchWrapperRef} style={{ position: 'relative' }}>
        <input
          className="gb-input"
          placeholder="Search monsters to add…"
          value={monsterQuery}
          onFocus={() => setSearchOpen(true)}
          onChange={(e) => {
            setMonsterQuery(e.target.value)
            setSearchOpen(true)
          }}
          style={{ fontSize: 12, width: '100%' }}
        />
        {searchResultsRendered && (
          <div
            className={searchResultsClosing ? 'gb-pop-out' : 'gb-fade-in'}
            style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflowY: 'auto', marginTop: 4 }}
          >
            {filtered.map((m) => (
              <HoverDetailCard key={m.index} bodyHtml={renderStatblockHtml(m)} width={460} interceptWheel={false}>
                <button
                  type="button"
                  onClick={() => {
                    addToDraft(m.index)
                    setMonsterQuery('')
                    setSearchOpen(false)
                  }}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 6,
                    width: '100%',
                    padding: '4px 6px',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-sunken)',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.name}
                    {isCustomMonster(m.index) && <span style={{ color: 'var(--text-muted)' }}> · custom</span>}
                  </span>
                  <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>CR {formatCr(m.crNumeric)}</span>
                </button>
              </HoverDetailCard>
            ))}
          </div>
        )}
      </div>

      <div className="gb-label">Encounter</div>
      {draftMonsters.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Search above to add monsters.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {Object.entries(encounterDraft).map(([index, count]) => {
            const monster = allMonsters.find((m) => m.index === index)
            if (!monster) return null
            return (
              <HoverDetailCard key={index} bodyHtml={renderStatblockHtml(monster)} width={460} interceptWheel={false}>
                <div className="gb-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px' }}>
                  <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{monster.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <button type="button" onClick={() => removeFromDraft(index)} style={roundBtnStyle}>
                      −
                    </button>
                    <span style={{ fontSize: 12, minWidth: 14, textAlign: 'center' }}>{count}</span>
                    <button type="button" onClick={() => addToDraft(index)} style={roundBtnStyle}>
                      +
                    </button>
                  </div>
                </div>
              </HoverDetailCard>
            )
          })}
        </div>
      )}

      {draftMonsters.length > 0 && (
        <div className="gb-card" style={{ padding: 'var(--space-2)', fontSize: 12 }}>
          <div>
            Difficulty: <strong style={{ color: 'var(--accent)' }}>{DIFFICULTY_LABELS[difficulty.difficulty]}</strong>
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>
            {difficulty.adjustedXp.toLocaleString()} adjusted XP (×{difficulty.multiplier}) · {difficulty.totalXp.toLocaleString()} total
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>~{difficulty.xpPerPlayer.toLocaleString()} XP per player if won</div>
          {(['easy', 'medium', 'hard', 'deadly'] as const).map((tier) => {
            const suggestions = suggestionsFor(tier)
            if (suggestions.length === 0) return null
            return (
              <div key={tier} style={{ marginTop: 4 }}>
                <span style={{ color: 'var(--text-muted)' }}>Room for {DIFFICULTY_LABELS[tier]} (add one):</span>{' '}
                {suggestions.map((s) => (
                  <button
                    key={s.index}
                    type="button"
                    onClick={() => addToDraft(s.index)}
                    className="gb-badge"
                    style={{ marginRight: 4, marginTop: 2, cursor: 'pointer', border: 'none' }}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {draftMonsters.length > 0 && (
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            className="gb-input"
            placeholder="Encounter name…"
            value={encounterName}
            onChange={(e) => setEncounterName(e.target.value)}
            style={{ fontSize: 12, flex: 1 }}
          />
          <Button variant="secondary" onClick={saveEncounter} disabled={!encounterName.trim()} style={{ fontSize: 11, padding: '3px 8px' }}>
            Save
          </Button>
          <Button variant="primary" onClick={() => onAddEncounterToTracker(draftMonsters)} style={{ fontSize: 11, padding: '3px 8px' }}>
            Add to Tracker
          </Button>
        </div>
      )}

      {savedEncounters.length > 0 && (
        <>
          <div className="gb-label">Saved Encounters</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {savedEncounters.map((enc) => (
              <div key={enc.id} className="gb-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px' }}>
                <button
                  type="button"
                  onClick={() => loadEncounterIntoDraft(enc)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12, textAlign: 'left', flex: 1 }}
                >
                  {enc.name} <span style={{ color: 'var(--text-muted)' }}>({enc.monsterIndexes.length})</span>
                </button>
                <button type="button" onClick={() => deleteEncounter(enc.id)} style={removeBtnStyle}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const ICON_STAT_SIZE = 26

/**
 * An icon with its editable value in a small column underneath, instead of
 * overlaid on top of it — used for initiative (d20) and AC (shield), sitting
 * directly beside the combatant's name rather than in a separate row below.
 * Putting the value under the icon (not inside its shape) is what actually
 * fixed the "text doesn't fit" problem the overlaid version kept running
 * into — there's no icon geometry to fit inside anymore. When `onIconClick`
 * is given, the icon itself becomes a button (e.g. rolling initiative),
 * separate from editing the value by hand below it.
 */
function IconValueColumn({
  icon,
  iconTitle,
  onIconClick,
  value,
  onChange,
  inputTitle,
  placeholder
}: {
  icon: JSX.Element
  iconTitle?: string
  onIconClick?: () => void
  value: number | string
  onChange: (value: string) => void
  inputTitle?: string
  placeholder?: string
}): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, flexShrink: 0, width: ICON_STAT_SIZE }}>
      {onIconClick ? (
        <button
          type="button"
          onClick={onIconClick}
          title={iconTitle}
          style={{ display: 'flex', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          {icon}
        </button>
      ) : (
        <span title={iconTitle} style={{ display: 'flex' }}>
          {icon}
        </span>
      )}
      <input
        type="number"
        className="gb-icon-value-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        title={inputTitle ?? iconTitle}
        style={{
          width: '100%',
          textAlign: 'center',
          fontSize: 11,
          fontWeight: 800,
          lineHeight: 1,
          padding: 0,
          border: 'none',
          background: 'transparent',
          color: 'var(--text-primary)'
        }}
      />
    </div>
  )
}

/**
 * Same column shape as IconValueColumn, but for HP: the heart icon is
 * flanked by tiny − and + buttons (applying a damage/heal delta — clicking
 * either swaps the icon row for a small amount field, applies on Enter, and
 * reverts back), with current and max HP shown as two small fields
 * underneath, separated by "/" — both directly editable by typing over them.
 */
function HpIconColumn({
  currentHp,
  maxHp,
  onSetHp,
  onSetMaxHp,
  onApply
}: {
  currentHp: number
  maxHp: number
  onSetHp: (value: number) => void
  onSetMaxHp: (value: number) => void
  onApply: (amount: number, kind: 'damage' | 'heal') => void
}): JSX.Element {
  const [pending, setPending] = useState<'damage' | 'heal' | null>(null)
  const [amount, setAmount] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (pending) inputRef.current?.focus()
  }, [pending])

  function applyPending(): void {
    const value = Number(amount)
    if (pending && Number.isFinite(value) && value > 0) onApply(value, pending)
    setPending(null)
    setAmount('')
  }

  function cancelPending(): void {
    setPending(null)
    setAmount('')
  }

  const valueInputStyle: CSSProperties = {
    width: 20,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: 800,
    lineHeight: 1,
    padding: 0,
    border: 'none',
    background: 'transparent',
    color: 'var(--text-primary)'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <button type="button" onClick={() => setPending('damage')} title="Apply damage" style={{ ...roundBtnStyle, width: 16, height: 16, fontSize: 10, color: 'var(--danger)' }}>
          −
        </button>
        <HeartIcon size={ICON_STAT_SIZE} style={{ color: 'var(--danger)' }} />
        <button type="button" onClick={() => setPending('heal')} title="Apply healing" style={{ ...roundBtnStyle, width: 16, height: 16, fontSize: 10, color: 'var(--success)' }}>
          +
        </button>
      </div>
      {pending ? (
        <input
          ref={inputRef}
          type="number"
          min={0}
          className="gb-input"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') applyPending()
            else if (e.key === 'Escape') cancelPending()
          }}
          onBlur={cancelPending}
          placeholder={pending === 'damage' ? 'Dmg' : 'Heal'}
          style={{ width: 52, fontSize: 12, padding: '3px 4px' }}
          title={pending === 'damage' ? 'Damage amount — Enter to apply' : 'Heal amount — Enter to apply'}
        />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <input
            type="number"
            className="gb-icon-value-input"
            value={currentHp}
            onChange={(e) => onSetHp(Number(e.target.value))}
            title="Current HP"
            style={valueInputStyle}
          />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>/</span>
          <input
            type="number"
            className="gb-icon-value-input"
            value={maxHp}
            onChange={(e) => onSetMaxHp(Number(e.target.value))}
            title="Max HP"
            style={{ ...valueInputStyle, fontWeight: 700, color: 'var(--text-secondary)' }}
          />
        </div>
      )}
    </div>
  )
}

/** The gear button in the tracker toolbar's top-right — condenses the encounter-wide toggles (dismemberment, private death saves) into one popup instead of a growing row of checkboxes competing for toolbar space. Closes on picking nothing further — on Escape or an outside click — same idiom as AddStatusEffectControl/EncounterBuilder's search dropdown. */
function TrackerSettingsMenu({
  dismembermentEnabled,
  onSetDismembermentEnabled,
  deathSavesPrivate,
  onSetDeathSavesPrivate
}: {
  dismembermentEnabled: boolean
  onSetDismembermentEnabled: (value: boolean) => void
  deathSavesPrivate: boolean
  onSetDeathSavesPrivate: (value: boolean) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const { rendered, closing } = useMountAnimation(open)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent): void {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    function handleEscape(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Encounter settings"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 26,
          padding: 0,
          background: 'none',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text-secondary)',
          cursor: 'pointer'
        }}
      >
        <span style={{ display: 'flex', transform: 'scale(0.7)' }}>
          <GearIcon />
        </span>
      </button>
      {rendered && (
        <div
          className={closing ? 'gb-card gb-pop-out' : 'gb-card'}
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            zIndex: 10,
            width: 190,
            padding: 'var(--space-2)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={dismembermentEnabled} onChange={(e) => onSetDismembermentEnabled(e.target.checked)} />
            Dismemberment
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={deathSavesPrivate} onChange={(e) => onSetDeathSavesPrivate(e.target.checked)} />
            Private death saves
          </label>
        </div>
      )}
    </div>
  )
}

/**
 * The panel that appears on a combatant's card right after a qualifying hit
 * (see applyDamageOrHeal's tier thresholds) — 'minor' offers only small
 * losable parts, 'major' offers whole limbs, and 'overkill' (a killing blow
 * that also dealt the target's entire max HP in one hit) offers beheading/
 * bisection instead of a table roll at all, since that's dramatic enough on
 * its own that a body-part roll would undersell it. Any tier can be
 * dismissed without adding anything, for a hit the DM decides isn't
 * dramatic enough this time.
 */
const DISMEMBERMENT_TIER: Record<'minor' | 'major' | 'overkill', { label: string; color: string }> = {
  minor: { label: 'Minor Wound', color: 'var(--accent)' },
  major: { label: 'Major Wound!', color: '#d9822b' },
  overkill: { label: 'Killing Blow!', color: 'var(--danger)' }
}

function DismembermentPrompt({
  mode,
  closing,
  onPick,
  onDismiss
}: {
  mode: 'minor' | 'major' | 'overkill'
  closing: boolean
  onPick: (tag: string) => void
  onDismiss: () => void
}): JSX.Element {
  const tier = DISMEMBERMENT_TIER[mode]
  const table = mode === 'minor' ? MINOR_DISMEMBERMENT_TABLE : mode === 'major' ? MAJOR_DISMEMBERMENT_TABLE : null

  return (
    <div
      className={closing ? 'gb-card gb-pop-out' : 'gb-card'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 'var(--space-2)',
        background: 'var(--bg-sunken)',
        borderColor: tier.color,
        borderWidth: 2,
        boxShadow: `0 0 0 1px ${tier.color} inset`
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 12, color: tier.color, letterSpacing: '0.02em', textTransform: 'uppercase' }}>{tier.label}</strong>
        <button
          type="button"
          onClick={onDismiss}
          title="Dismiss"
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}
        >
          ×
        </button>
      </div>
      {mode === 'overkill' ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <DismembermentTile label="Beheaded" color={tier.color} onClick={() => onPick('Beheaded')} />
          <DismembermentTile label="Bisected" color={tier.color} onClick={() => onPick('Bisected')} />
        </div>
      ) : (
        table && <DismembermentRoller table={table} color={tier.color} onPick={onPick} />
      )}
    </div>
  )
}

/** One overkill result (Beheaded/Bisected) — a proper full-width tile rather than a plain small button, since this is the single biggest moment the whole system offers. */
function DismembermentTile({ label, color, onClick }: { label: string; color: string; onClick: () => void }): JSX.Element {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex: 1,
        padding: '10px 6px',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${color}`,
        background: hover ? color : 'transparent',
        color: hover ? 'var(--bg-surface)' : color,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.02em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        transition: 'background 100ms ease, color 100ms ease'
      }}
    >
      {label}
    </button>
  )
}

const ROLL_TICK_MS = 70
const ROLL_TICKS = 10

/**
 * The minor/major body-part picker — a grid of proper tiles (not small
 * dashed badges) for the DM to pick a specific part by hand (a player
 * targeted it directly), plus a Roll button that chases a highlight through
 * the tiles for a beat before landing on one and adding it, instead of the
 * result just appearing instantly. Chained setTimeout rather than
 * setInterval for the chase, same reasoning as RollAnimationOverlay's own
 * flicker — see that file's doc comment for why.
 */
function DismembermentRoller({ table, color, onPick }: { table: string[]; color: string; onPick: (tag: string) => void }): JSX.Element {
  const [rollingIndex, setRollingIndex] = useState<number | null>(null)
  const [landedIndex, setLandedIndex] = useState<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => clearTimeout(timerRef.current), [])

  function roll(): void {
    if (rollingIndex !== null) return
    playSfx('diceRoll')
    const finalIndex = Math.floor(Math.random() * table.length)

    function tick(remaining: number): void {
      setRollingIndex(Math.floor(Math.random() * table.length))
      if (remaining <= 0) {
        setRollingIndex(null)
        setLandedIndex(finalIndex)
        timerRef.current = setTimeout(() => onPick(table[finalIndex]), 350)
        return
      }
      timerRef.current = setTimeout(() => tick(remaining - 1), ROLL_TICK_MS)
    }
    tick(ROLL_TICKS)
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={roll}
        disabled={rollingIndex !== null || landedIndex !== null}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11, padding: '4px 8px' }}
      >
        <DiceIcon size={13} style={{ color: 'currentColor' }} />
        Roll
      </Button>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
        {table.map((tag, i) => {
          const active = rollingIndex === i || landedIndex === i
          return (
            <button
              key={tag}
              type="button"
              onClick={() => onPick(tag)}
              disabled={rollingIndex !== null}
              style={{
                padding: '5px 4px',
                borderRadius: 'var(--radius-sm)',
                border: `1px solid ${active ? color : 'var(--border-subtle)'}`,
                background: active ? color : 'var(--bg-surface-raised)',
                color: active ? 'var(--bg-surface)' : 'var(--text-secondary)',
                fontSize: 10,
                fontWeight: active ? 700 : 400,
                cursor: rollingIndex !== null ? 'default' : 'pointer',
                transition: 'background 60ms ease, color 60ms ease, border-color 60ms ease'
              }}
            >
              {tag}
            </button>
          )
        })}
      </div>
    </>
  )
}

/**
 * A removable `.gb-badge` (status effect, dismemberment tag) that plays its
 * own gb-pop-out on the × click before actually calling `onRemove` — array
 * items don't get the benefit useMountAnimation gives a single popover
 * (there's no one "open" boolean; each tag needs its own local closing
 * state), so this owns that locally instead: clicking × flips `leaving`,
 * which drives useMountAnimation exactly like a lone popover would, and
 * `onRemove` only actually fires once that animation has played out.
 */
function FadeOutBadge({ children, color, onRemove }: { children: ReactNode; color?: string; onRemove: () => void }): JSX.Element | null {
  const [leaving, setLeaving] = useState(false)
  const { rendered, closing } = useMountAnimation(!leaving)

  useEffect(() => {
    if (leaving && !rendered) onRemove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rendered, leaving])

  if (!rendered) return null

  return (
    <span
      className={closing ? 'gb-badge gb-pop-out' : 'gb-badge'}
      style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color, borderColor: color }}
    >
      {children}
      <button
        type="button"
        onClick={() => setLeaving(true)}
        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 11, lineHeight: 1 }}
      >
        ×
      </button>
    </span>
  )
}

/** A single "+" card that opens the full status-effect list on click, instead of a row of always-visible quick-toggle chips — closes on picking one, on Escape, or on an outside click. */
function AddStatusEffectControl({ options, onAdd }: { options: string[]; onAdd: (effect: string) => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const { rendered, closing } = useMountAnimation(open)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent): void {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Add status effect"
        className="gb-badge"
        style={{ fontSize: 10, cursor: 'pointer', border: '1px dashed var(--border-subtle)', background: 'none', color: 'var(--text-muted)' }}
      >
        + Status
      </button>
      {rendered && (
        <div
          className={closing ? 'gb-card gb-pop-out' : 'gb-card'}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            padding: 4,
            maxHeight: 220,
            overflowY: 'auto',
            minWidth: 120
          }}
        >
          {options.length === 0 ? (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 6px' }}>All applied</span>
          ) : (
            options.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  onAdd(s)
                  setOpen(false)
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: 11,
                  textAlign: 'left',
                  padding: '3px 6px',
                  borderRadius: 'var(--radius-sm)'
                }}
              >
                {s}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/** Three clickable pips — clicking pip N fills up through it (count = N+1), clicking the currently-topmost filled pip again empties it back down by one, same toggle idiom as a rating widget. */
function DeathSaveRow({ label, count, color, onChange }: { label: string; count: number; color: string; onChange: (delta: number) => void }): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      <span>{label}</span>
      {[0, 1, 2].map((i) => {
        const newCount = count === i + 1 ? i : i + 1
        return (
          <button
            key={i}
            type="button"
            onClick={() => onChange(newCount - count)}
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              border: `1px solid ${color}`,
              background: i < count ? color : 'transparent',
              cursor: 'pointer',
              padding: 0
            }}
          />
        )
      })}
    </div>
  )
}

function innerTabStyle(active: boolean): CSSProperties {
  return {
    flex: 1,
    padding: '4px 0',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-subtle)',
    background: active ? 'var(--accent-subtle)' : 'transparent',
    color: active ? 'var(--accent-hover)' : 'var(--text-secondary)',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer'
  }
}

const removeBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: 1,
  padding: '0 4px'
}

const roundBtnStyle: CSSProperties = {
  background: 'var(--bg-sunken)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  fontSize: 14,
  width: 22,
  height: 22,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
}
