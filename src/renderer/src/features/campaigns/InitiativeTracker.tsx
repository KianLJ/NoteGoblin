import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import { exhaustionEffectsDescription, abilityModifier } from '@shared/dnd5e'
import { deriveSheet } from '@shared/content/sheet'
import { buildCheckRollEntry, formatModifierTerm } from '@shared/dice'
import { ExhaustionIcon, ShieldIcon, DiceIcon } from '../player/characterSheetTabs/icons'
import { GearIcon } from '../account/icons'
import { useMountAnimation } from '../../ui/useMountAnimation'
import { useLastTruthy } from '../../ui/useLastTruthy'
import { HoverDetailCard } from '../player/HoverDetailCard'
import { renderStatblockHtml } from '../../statblock'
import {
  emptyInitiativeState,
  emptyCombatant,
  sortedByInitiative,
  withCombatantHp,
  computeEncounterDifficulty,
  encounterMultiplier,
  DIFFICULTY_LABELS,
  MINOR_DISMEMBERMENT_TABLE,
  MAJOR_DISMEMBERMENT_TABLE,
  type Combatant,
  type InitiativeState,
  type Difficulty
} from '@shared/encounter'
import { formatCr } from '../../data/bestiary'
import { useAllMonsters } from '../../data/useAllMonsters'
import { loadSavedEncounters, onEncounterEditRequest, saveSavedEncounters, type SavedEncounter } from '../../data/savedEncounters'
import './encounter.css'
import './initiative.css'
import { MonsterPicker } from './MonsterPicker'
import type { BestiaryMonster } from '../../data/bestiary'
import { Button } from '../../ui/Button'
import { playTurnFlowSfx, playMonsterSfx } from '../audio/sfxBoardEngine'
import { playSfx } from '../audio/soundEffects'
import { ArrowLeftIcon, ArrowRightIcon, IconLabel, MinusIcon, PlusIcon, UndoIcon, XIcon } from '../../ui/icons'
import { useEncounter } from '../combat/encounterStore'
import { vehicleName, type TrackedVehicle } from '@shared/vehicles'

interface InitiativeTrackerProps {
  sessionId: string | null
  playerCharacters: Map<string, CharacterSheet>
  /** Clicking a monster combatant's name opens its full statblock in the main pane (see CampaignWorkspace.tsx) — DM-only, since this whole tracker only ever renders on the DM's side (the player-facing view is PlayerInitiativeView.tsx, a separate component that never sees monster identity). */
  onSelectMonster: (monster: BestiaryMonster) => void
  /** Set by RightPanel when the DM clicks "Load Encounter" on a presented scene (see SessionDeckPanel.tsx) — added to the tracker the same way EncounterBuilder's own "Add to Tracker" does, then cleared via onPendingEncounterConsumed so it doesn't re-add on every re-render. */
  pendingEncounterMonsters?: BestiaryMonster[] | null
  onPendingEncounterConsumed?: () => void
  /** A vehicle sent from the Vehicles tab's "Add to initiative" — added once, then cleared. */
  pendingVehicle?: TrackedVehicle | null
  onPendingVehicleConsumed?: () => void
  /** The campaign's tracked vehicles: a vehicle combatant's hit points follow its hull. */
  vehicles?: TrackedVehicle[]
  /** A vehicle combatant's hit points changed here — the hull follows. */
  onVehicleHp?: (vehicleId: string, hp: number) => void
  /** Clicking a vehicle combatant's name shows it in the Vehicles tab. */
  onSelectVehicle?: (vehicleId: string) => void
  /** The campaign's vehicles, shown in the tab beside the tracker (a vehicle clicked in the order opens there). */
  vehiclesView?: ReactNode
  /** The saved encounters (the DM's canvas), as a tab beside Build. */
  encountersView?: ReactNode
  /** In the Combat screen: clicking a combatant's name picks it (on the map and in the side panel) instead of opening it elsewhere. */
  onSelectCombatant?: (id: string) => void
  /** The combatant picked in the Combat screen, marked in the order. */
  selectedId?: string | null
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
  // The same content-engine numbers the character's own sheet shows (see
  // shared/content/sheet.ts) — so a Constitution bonus from a feat/ASI,
  // exhaustion level 4's halving, or an item's AC bonus all match here
  // instead of a stale/different number the DM never sees corrected.
  const { derived } = deriveSheet(character)
  return {
    id: `player:${userId}`,
    name: character.name,
    kind: 'player',
    initiative: null,
    maxHp: derived.maxHp,
    currentHp: character.currentHp,
    ac: derived.armorClass,
    userId,
    ...emptyCombatant()
  }
}

export function monsterToCombatant(monster: BestiaryMonster): Combatant {
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

function vehicleToCombatant(v: TrackedVehicle): Combatant {
  return {
    id: `vehicle:${v.id}:${crypto.randomUUID()}`,
    name: vehicleName(v),
    kind: 'vehicle',
    initiative: null,
    maxHp: v.def.hp,
    currentHp: v.hp,
    ac: v.def.ac,
    vehicleId: v.id,
    party: v.party,
    ...(v.def.damageThreshold ? { damageThreshold: v.def.damageThreshold } : {}),
    ...emptyCombatant()
  }
}

/** A monster statblock's Dex is a raw score string (e.g. "14"), not a modifier — same shape OverviewTab parses for players' own ability scores, just from `StatblockData` instead of a `CharacterSheet`. Missing/unparseable Dex falls back to a flat 10 (the modifier-0 baseline) rather than blocking the roll. */
function monsterDexModifier(monster: BestiaryMonster | undefined): number {
  // A statblock with its own initiative line ("+5 (15)") rolls with that; otherwise the Dex modifier.
  const own = monster?.initiative ? /^\s*([+-]?\d+)/.exec(monster.initiative) : null
  if (own) return Number(own[1])
  const score = monster?.dex ? Number(monster.dex) : NaN
  return abilityModifier(Number.isFinite(score) ? score : 10)
}

/** Initiative modifier for whichever combatant this is — a player's comes from the same content-engine derivation as HP/AC above (Dex modifier plus anything like Alert's proficiency bonus), so it matches their sheet. Monsters look themselves up in the bestiary by `monsterIndex`; a combatant that's neither a matched player nor monster (shouldn't normally happen) rolls flat. */
export function initiativeModifierFor(
  c: Combatant,
  playerCharacters: Map<string, CharacterSheet>,
  allMonsters: BestiaryMonster[],
  vehicles?: TrackedVehicle[]
): number {
  if (c.kind === 'player' && c.userId) {
    const character = playerCharacters.get(c.userId)
    if (character) return deriveSheet(character).derived.initiative
  }
  if (c.kind === 'monster') {
    return monsterDexModifier(allMonsters.find((m) => m.index === c.monsterIndex))
  }
  // A vehicle rolls with its creature Dex (a mount); a machine rolls flat — or the DM types its pilot's roll in.
  if (c.kind === 'vehicle') return vehicles?.find((v) => v.id === c.vehicleId)?.def.abilities ? abilityModifier(vehicles.find((v) => v.id === c.vehicleId)!.def.abilities!.dex) : 0
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
  onPendingEncounterConsumed,
  pendingVehicle,
  onPendingVehicleConsumed,
  vehicles,
  onVehicleHp,
  onSelectVehicle,
  vehiclesView,
  encountersView,
  onSelectCombatant,
  selectedId = null
}: InitiativeTrackerProps): JSX.Element {
  // Shared with the Combat tab (features/combat/encounterStore.ts), so both edit the same fight.
  const [state, setState] = useEncounter()
  const [view, setView] = useState<'tracker' | 'build' | 'encounters' | 'vehicles'>('tracker')
  // An encounter the Encounter Library asked to edit (combat/EncounterLibrary.tsx): the builder opens with it.
  const [editRequest, setEditRequest] = useState<SavedEncounter | null>(null)
  useEffect(
    () =>
      onEncounterEditRequest((enc) => {
        setEditRequest(enc)
        setView('build')
      }),
    []
  )
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

  // Each hand-off is taken once. The fight is a shared store, so adding to it re-renders this straight away —
  // before the parent has cleared what it handed over — and without this the same vehicle (or encounter) was
  // added again on every one of those re-renders until React gave up.
  const takenVehicle = useRef<TrackedVehicle | null>(null)
  const takenEncounter = useRef<BestiaryMonster[] | null>(null)

  useEffect(() => {
    if (!pendingVehicle || takenVehicle.current === pendingVehicle) return
    takenVehicle.current = pendingVehicle
    setState((prev) => ({ ...prev, combatants: [...prev.combatants, vehicleToCombatant(pendingVehicle)] }))
    setView('tracker')
    onPendingVehicleConsumed?.()
  }, [pendingVehicle, onPendingVehicleConsumed])

  // A vehicle damaged or repaired in the Vehicles tab: its combatant's hit points follow.
  useEffect(() => {
    if (!vehicles) return
    setState((prev) => {
      let changed = false
      const combatants = prev.combatants.map((c) => {
        const v = c.kind === 'vehicle' ? vehicles.find((x) => x.id === c.vehicleId) : undefined
        if (!v || (v.hp === c.currentHp && v.def.hp === c.maxHp)) return c
        changed = true
        return { ...c, currentHp: v.hp, maxHp: v.def.hp }
      })
      return changed ? { ...prev, combatants } : prev
    })
  }, [vehicles])

  useEffect(() => {
    if (!pendingEncounterMonsters || pendingEncounterMonsters.length === 0 || takenEncounter.current === pendingEncounterMonsters) return
    takenEncounter.current = pendingEncounterMonsters
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
        const { maxHp, armorClass: ac } = deriveSheet(character).derived
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

  const { monsters: everyMonster } = useAllMonsters()
  const allMonstersForQuickAdd = useMemo(() => [...everyMonster].sort((a, b) => a.name.localeCompare(b.name)), [everyMonster])

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
    setState((prev) => withCombatantHp(prev, id, value))
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
    const modifier = initiativeModifierFor(c, playerCharacters, allMonstersForQuickAdd, vehicles)
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
        const modifier = initiativeModifierFor(c, playerCharacters, allMonstersForQuickAdd, vehicles)
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
    // A vehicle shrugs off a hit under its damage threshold, and can't be repaired past full.
    if (kind === 'damage' && c.kind === 'vehicle' && c.damageThreshold && amount < c.damageThreshold) return
    pushHistory()
    const next = kind === 'damage' ? Math.max(0, c.currentHp - amount) : c.kind === 'vehicle' ? Math.min(c.maxHp, c.currentHp + amount) : c.currentHp + amount
    setCombatantHp(id, next)
    if (c.kind === 'vehicle' && c.vehicleId) onVehicleHp?.(c.vehicleId, next)

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
    <div className="it">
      <div className="it-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={view === 'tracker'} className={`it-tab${view === 'tracker' ? ' it-tab--on' : ''}`} onClick={() => setView('tracker')}>
          Tracker
        </button>
        <button type="button" role="tab" aria-selected={view === 'build'} className={`it-tab${view === 'build' ? ' it-tab--on' : ''}`} onClick={() => setView('build')} title="Build an encounter">
          Build
        </button>
        {encountersView && (
          <button type="button" role="tab" aria-selected={view === 'encounters'} className={`it-tab${view === 'encounters' ? ' it-tab--on' : ''}`} onClick={() => setView('encounters')} title="Saved encounters">
            Encounters
          </button>
        )}
        {vehiclesView && (
          <button type="button" role="tab" aria-selected={view === 'vehicles'} className={`it-tab${view === 'vehicles' ? ' it-tab--on' : ''}`} onClick={() => setView('vehicles')}>
            Vehicles
          </button>
        )}
      </div>

      {view === 'tracker' ? (
        <div className="it-body">
          <div className="it-toolbar">
            {!inCombat && (
              <Button variant="primary" onClick={startCombat} disabled={state.combatants.length === 0} className="it-btn">
                Start combat
              </Button>
            )}
            <Button variant="secondary" onClick={rollAllInitiative} disabled={state.combatants.length === 0} title="Roll 1d20 + Dex for every combatant" className="it-btn">
              <IconLabel icon={<DiceIcon size={13} />}>Roll all</IconLabel>
            </Button>
            <MonsterPicker
              monsters={allMonstersForQuickAdd}
              onPick={(monster) => {
                pushHistory()
                patch({ combatants: [...state.combatants, monsterToCombatant(monster)] })
              }}
            />
            <span className="it-spacer" />
            <button type="button" className="it-icon-btn" onClick={undo} disabled={history.length === 0} title="Undo the last change" aria-label="Undo">
              <UndoIcon size={14} />
            </button>
            <button type="button" className="it-icon-btn" onClick={clearAll} disabled={state.combatants.length === 0} title="Clear everyone (undo brings them back)" aria-label="Clear everyone">
              <XIcon size={13} />
            </button>
            <TrackerSettingsMenu
              dismembermentEnabled={state.dismembermentEnabled}
              onSetDismembermentEnabled={(v) => patch({ dismembermentEnabled: v })}
              deathSavesPrivate={state.deathSavesPrivate}
              onSetDeathSavesPrivate={(v) => patch({ deathSavesPrivate: v })}
              shuffleEnemyOrder={!!state.shuffleEnemyOrder}
              onSetShuffleEnemyOrder={(v) => patch({ shuffleEnemyOrder: v })}
            />
          </div>

          {inCombat && (
            <div className="it-turnbar">
              <button type="button" className="it-icon-btn" onClick={prevTurn} title="Previous turn" aria-label="Previous turn">
                <ArrowLeftIcon size={14} />
              </button>
              <div className="it-turn-text">
                <small>Round {state.round}</small>
                <strong>{ordered[state.turnIndex]?.name ?? '—'}</strong>
              </div>
              <Button variant="primary" onClick={nextTurn} className="it-btn">
                <IconLabel icon={<ArrowRightIcon size={13} />} iconAfter>
                  Next turn
                </IconLabel>
              </Button>
              <button type="button" className="it-end" onClick={endCombat} title="End the fight">
                End
              </button>
            </div>
          )}

          {ordered.length === 0 && (
            <div className="it-empty">
              <strong>No one in the fight yet</strong>
              <span>Add an enemy above, build an encounter, or players join as they connect.</span>
            </div>
          )}

          <div className="it-list">
            {ordered.map((c, i) => {
              const isTurn = inCombat && i === state.turnIndex
              const down = c.currentHp <= 0
              const exhaustionLevel = c.kind === 'player' && c.userId ? (playerCharacters.get(c.userId)?.exhaustionLevel ?? 0) : 0
              return (
                <div
                  key={c.id}
                  className={[
                    'it-row',
                    `it-row--${c.kind}`,
                    isTurn && 'it-row--turn',
                    down && 'it-row--down',
                    dragOverId === c.id && 'it-row--drop',
                    dragFromId === c.id && 'it-row--dragging',
                    // Picked on the Combat screen's map.
                    selectedId === c.id && 'it-row--picked'
                  ]
                    .filter(Boolean)
                    .join(' ')}
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
                >
                  <span className="it-grip" title="Drag to reorder" aria-hidden="true">
                    <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor">
                      <circle cx="2" cy="3" r="1.1" />
                      <circle cx="6" cy="3" r="1.1" />
                      <circle cx="2" cy="7" r="1.1" />
                      <circle cx="6" cy="7" r="1.1" />
                      <circle cx="2" cy="11" r="1.1" />
                      <circle cx="6" cy="11" r="1.1" />
                    </svg>
                  </span>
                  <IconValueColumn
                    icon={<DiceIcon size={ICON_STAT_SIZE} />}
                    iconTitle={`Roll 1d20 ${formatModifierTerm(initiativeModifierFor(c, playerCharacters, allMonstersForQuickAdd, vehicles))}`}
                    onIconClick={() => rollInitiativeFor(c)}
                    value={c.initiative ?? ''}
                    onChange={(v) => updateCombatant(c.id, { initiative: v === '' ? null : Number(v) })}
                    inputTitle="Initiative"
                    placeholder="—"
                    className="it-stat--init"
                  />

                  <div className="it-main">
                    {c.kind === 'monster' || c.kind === 'vehicle' ? (
                      <button
                        type="button"
                        className="it-name it-name--link"
                        onClick={() => {
                          if (onSelectCombatant) return onSelectCombatant(c.id)
                          if (c.kind === 'vehicle') {
                            if (c.vehicleId) {
                              onSelectVehicle?.(c.vehicleId)
                              if (vehiclesView) setView('vehicles')
                            }
                            return
                          }
                          const monster = allMonstersForQuickAdd.find((m) => m.index === c.monsterIndex)
                          if (monster) onSelectMonster(monster)
                        }}
                        title={c.kind === 'vehicle' ? `${c.name}: open it under Vehicles` : `${c.name}: view statblock`}
                      >
                        {c.name}
                      </button>
                    ) : (
                      <strong className="it-name" title={c.name}>
                        {c.name}
                      </strong>
                    )}
                    <div className="it-tags">
                      {isTurn && <span className="it-tag it-tag--turn">Their turn</span>}
                      {down && <span className="it-tag it-tag--down">{c.kind === 'vehicle' ? 'Wrecked' : c.kind === 'player' ? 'Down' : 'Dead'}</span>}
                      {exhaustionLevel > 0 && (
                        <span className="it-tag it-tag--down" title={`Exhaustion ${exhaustionLevel}\n${exhaustionEffectsDescription(exhaustionLevel)}`}>
                          <ExhaustionIcon size={11} />
                          {exhaustionLevel}
                        </span>
                      )}
                      {c.statusEffects.map((effect) => (
                        <FadeOutBadge key={effect} onRemove={() => removeStatusEffect(c.id, effect)}>
                          {effect}
                        </FadeOutBadge>
                      ))}
                      {c.dismemberments.map((tag) => (
                        <FadeOutBadge key={tag} className="it-tag it-tag--wound" onRemove={() => removeDismemberment(c.id, tag)}>
                          <WoundIcon size={10} />
                          {tag}
                        </FadeOutBadge>
                      ))}
                      <AddStatusEffectControl options={STATUS_EFFECT_PRESETS.filter((s) => !c.statusEffects.includes(s))} onAdd={(effect) => addStatusEffect(c.id, effect)} />
                    </div>
                  </div>

                  <HpIconColumn
                    currentHp={c.currentHp}
                    maxHp={c.maxHp}
                    onSetHp={(v) => setCombatantHp(c.id, v)}
                    onSetMaxHp={(v) => updateCombatant(c.id, { maxHp: v })}
                    onApply={(amount, kind) => applyDamageOrHeal(c.id, amount, kind)}
                  />
                  <IconValueColumn
                    icon={<ShieldIcon size={ICON_STAT_SIZE} />}
                    iconTitle="Armor Class"
                    value={c.ac}
                    onChange={(v) => updateCombatant(c.id, { ac: v === '' ? 0 : Number(v) })}
                    inputTitle="Armor Class"
                    className="it-stat--ac"
                  />
                  <button type="button" className="it-remove" onClick={() => removeCombatant(c.id)} title={`Remove ${c.name}`} aria-label={`Remove ${c.name}`}>
                    <XIcon size={12} />
                  </button>

                  {c.deathSaves && (
                    <div className="it-extra it-saves">
                      <DeathSaveRow label="Saves" count={c.deathSaves.successes} color="var(--success)" onChange={(delta) => bumpDeathSave(c.id, 'successes', delta)} />
                      <DeathSaveRow label="Fails" count={c.deathSaves.failures} color="var(--danger)" onChange={(delta) => bumpDeathSave(c.id, 'failures', delta)} />
                    </div>
                  )}

                  {dismemberPromptRendered && lastDismemberPrompt?.combatantId === c.id && (
                    <div className="it-extra">
                      <DismembermentPrompt mode={lastDismemberPrompt.mode} closing={dismemberPromptClosing} onPick={(tag) => addDismemberment(c.id, tag)} onDismiss={() => setDismemberPrompt(null)} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : view === 'encounters' ? (
        <div className="it-body">{encountersView}</div>
      ) : view === 'vehicles' ? (
        <div className="it-body">{vehiclesView}</div>
      ) : (
        <EncounterBuilder
          playerCharacters={playerCharacters}
          editRequest={editRequest}
          onEditRequestTaken={() => setEditRequest(null)}
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
  /** An encounter to open for editing (from the Encounter Library); taken once loaded. */
  editRequest: SavedEncounter | null
  onEditRequestTaken: () => void
  encounterDraft: Record<string, number>
  setEncounterDraft: (draft: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void
  encounterName: string
  setEncounterName: (name: string) => void
  onAddEncounterToTracker: (monsters: BestiaryMonster[]) => void
}

function EncounterBuilder({
  playerCharacters,
  editRequest,
  onEditRequestTaken,
  encounterDraft,
  setEncounterDraft,
  encounterName,
  setEncounterName,
  onAddEncounterToTracker
}: EncounterBuilderProps): JSX.Element {
  const { monsters: allMonsters } = useAllMonsters()
  const sortedMonsters = useMemo(() => [...allMonsters].sort((a, b) => a.name.localeCompare(b.name)), [allMonsters])

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

  const [encounterTags, setEncounterTags] = useState('')
  // The saved encounter being edited (opened from the Encounter Library): saving updates it rather than adding another.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState<string | null>(null)

  useEffect(() => {
    if (!editRequest) return
    const counts: Record<string, number> = {}
    for (const index of editRequest.monsterIndexes) counts[index] = (counts[index] ?? 0) + 1
    setEncounterDraft(counts)
    setEncounterName(editRequest.name)
    setEncounterTags((editRequest.tags ?? []).join(', '))
    setEditingId(editRequest.id)
    setSavedNote(null)
    onEditRequestTaken()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequest])

  // Emptying the draft ends an edit.
  useEffect(() => {
    if (draftMonsters.length === 0) setEditingId(null)
  }, [draftMonsters.length])

  function saveEncounter(asNew = false): void {
    if (!encounterName.trim() || draftMonsters.length === 0) return
    const monsterIndexes = Object.entries(encounterDraft).flatMap(([index, count]) => Array(count).fill(index))
    const tags = [...new Set(encounterTags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))]
    const saved = loadSavedEncounters()
    const updating = !asNew && editingId && saved.some((e) => e.id === editingId)
    saveSavedEncounters(
      updating
        ? saved.map((e) => (e.id === editingId ? { ...e, name: encounterName.trim(), monsterIndexes, tags } : e))
        : [...saved, { id: crypto.randomUUID(), name: encounterName.trim(), monsterIndexes, tags, createdAt: new Date().toISOString() }]
    )
    setSavedNote(`“${encounterName.trim()}” ${updating ? 'updated' : 'saved'} — find it in Encounters.`)
    setEncounterName('')
    setEncounterTags('')
    setEncounterDraft({})
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
    <div className="it-body eb">
      <section className="eb-section">
        <div className="eb-head">
          <span>Encounter</span>
          {draftMonsters.length > 0 && (
            <>
              <small>
                {draftMonsters.length} {draftMonsters.length === 1 ? 'creature' : 'creatures'}
              </small>
              <button type="button" className="gb-enc-link" onClick={() => setEncounterDraft({})}>
                Clear
              </button>
            </>
          )}
        </div>
        <MonsterPicker monsters={sortedMonsters} onPick={(m) => addToDraft(m.index)} placeholder="Add monsters…" />

        {draftMonsters.length === 0 ? (
          <div className="gb-enc-empty">Add monsters above, generate an encounter below, or load one from your library.</div>
        ) : (
          <div className="gb-enc-cards">
            {Object.entries(encounterDraft).map(([index, count]) => {
              const monster = allMonsters.find((m) => m.index === index)
              if (!monster) return null
              return (
                <HoverDetailCard key={index} bodyHtml={renderStatblockHtml(monster)} width={460} interceptWheel={false}>
                  <div className="gb-enc-card">
                    <div className="gb-enc-card-head">
                      <span className="gb-enc-card-name">{monster.name}</span>
                      <span className="gb-enc-cr">CR {formatCr(monster.crNumeric)}</span>
                    </div>
                    <div className="gb-enc-card-type">{[monster.size, monster.type].filter(Boolean).join(' ')}</div>
                    <div className="gb-enc-card-stats">
                      <span title="Armor Class">
                        <b>{(monster.ac ?? '—').split(' ')[0]}</b> AC
                      </span>
                      <span title="Hit Points">
                        <b>{(monster.hp ?? '—').split(' ')[0]}</b> HP
                      </span>
                      <span title="XP each">
                        <b>{monster.xp.toLocaleString()}</b> XP
                      </span>
                    </div>
                    <div className="gb-enc-stepper">
                      <button type="button" onClick={() => removeFromDraft(index)} aria-label={`One fewer ${monster.name}`}>
                        <MinusIcon size={11} />
                      </button>
                      <span>×{count}</span>
                      <button type="button" onClick={() => addToDraft(index)} aria-label={`One more ${monster.name}`}>
                        <PlusIcon size={11} />
                      </button>
                    </div>
                  </div>
                </HoverDetailCard>
              )
            })}
          </div>
        )}

        {draftMonsters.length > 0 && (
          <div className="eb-summary">
            <div className="eb-summary-top">
              <strong className={`gb-enc-tier gb-enc-tier--${difficulty.difficulty}`}>{DIFFICULTY_LABELS[difficulty.difficulty]}</strong>
              <span>
                {difficulty.adjustedXp.toLocaleString()} XP <small>(×{difficulty.multiplier})</small>
              </span>
            </div>
            <DifficultyMeter adjustedXp={difficulty.adjustedXp} thresholds={difficulty.partyThresholds} />
            <small className="eb-muted">About {difficulty.xpPerPlayer.toLocaleString()} XP each for the party if they win</small>
            {(['easy', 'medium', 'hard', 'deadly'] as const).map((tier) => {
              const suggestions = suggestionsFor(tier)
              if (suggestions.length === 0) return null
              return (
                <div key={tier} className="eb-suggest">
                  <small className="eb-muted">Add one for {DIFFICULTY_LABELS[tier]}:</small>
                  {suggestions.map((s) => (
                    <button key={s.index} type="button" className="it-tag eb-chip" onClick={() => addToDraft(s.index)} title={`Add a ${s.name} (CR ${formatCr(s.crNumeric)})`}>
                      <PlusIcon size={9} />
                      {s.name}
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        )}

        {draftMonsters.length > 0 && (
          <div className="eb-save">
            <input className="gb-input" placeholder="Name it to save it…" value={encounterName} onChange={(e) => setEncounterName(e.target.value)} aria-label="Encounter name" />
            <input className="gb-input" placeholder="Tags (forest, boss…)" value={encounterTags} onChange={(e) => setEncounterTags(e.target.value)} aria-label="Tags" />
            <div className="eb-save-actions">
              {editingId && (
                <Button variant="ghost" onClick={() => saveEncounter(true)} disabled={!encounterName.trim()} className="it-btn" title="Keep the one you opened as it was, and save this as another">
                  Save as new
                </Button>
              )}
              <Button variant="secondary" onClick={() => saveEncounter()} disabled={!encounterName.trim()} className="it-btn" title={encounterName.trim() ? 'Keep it in your Encounters library' : 'Give it a name first'}>
                {editingId ? 'Save changes' : 'Save to library'}
              </Button>
              <Button variant="primary" onClick={() => onAddEncounterToTracker(draftMonsters)} className="it-btn">
                Add to tracker
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="eb-section">
        <div className="eb-head">
          <span>Generate one</span>
        </div>
        <div className="eb-party">
          <label>
            <small>Party size</small>
            <input className="gb-input" type="number" min={1} placeholder={partyLevels.length ? String(partyLevels.length) : '4'} value={partySizeInput} onChange={(e) => setPartySizeInput(e.target.value)} />
          </label>
          <label>
            <small>Level</small>
            <input
              className="gb-input"
              type="number"
              min={1}
              max={20}
              placeholder={partyLevels.length ? String(Math.round(partyLevels.reduce((a, b) => a + b, 0) / partyLevels.length)) : '1'}
              value={partyLevelInput}
              onChange={(e) => setPartyLevelInput(e.target.value)}
            />
          </label>
        </div>
        <small className="eb-muted">
          {partyOverride
            ? `For a party of ${partyOverride.length} at level ${partyOverride[0]}.`
            : partyLevels.length
              ? `For the ${partyLevels.length} player${partyLevels.length === 1 ? '' : 's'} here now. Fill in both to plan for another party.`
              : 'Nobody connected: fill in both to plan for a party.'}
        </small>
        <div className="eb-tiers">
          {(['easy', 'medium', 'hard', 'deadly'] as const).map((tier) => (
            <button key={tier} type="button" className={`eb-tier eb-tier--${tier}`} onClick={() => generateEncounter(tier)} title={`Replace the encounter with a random ${DIFFICULTY_LABELS[tier]} one`}>
              {DIFFICULTY_LABELS[tier]}
            </button>
          ))}
        </div>
      </section>

      {savedNote && draftMonsters.length === 0 && <p className="eb-muted eb-saved-note">{savedNote}</p>}
    </div>
  )
}

/**
 * How hard the draft is, as a bar: it fills with the adjusted XP, coloured by
 * the tier it's reached, with a tick at each of the party's thresholds (Easy,
 * Medium, Hard, Deadly). Runs a little past Deadly so an overkill fight shows.
 */
function DifficultyMeter({ adjustedXp, thresholds }: { adjustedXp: number; thresholds: Record<'easy' | 'medium' | 'hard' | 'deadly', number> }): JSX.Element {
  const max = Math.max(thresholds.deadly * 1.3, 1)
  const tier = adjustedXp >= thresholds.deadly ? 'deadly' : adjustedXp >= thresholds.hard ? 'hard' : adjustedXp >= thresholds.medium ? 'medium' : adjustedXp >= thresholds.easy ? 'easy' : 'trivial'
  return (
    <div className="gb-enc-meter" role="meter" aria-valuenow={adjustedXp} aria-valuemin={0} aria-valuemax={max} aria-label="Encounter difficulty">
      <div className={`gb-enc-meter-fill gb-enc-meter-fill--${tier}`} style={{ width: `${Math.min(100, (adjustedXp / max) * 100)}%` }} />
      {(['easy', 'medium', 'hard', 'deadly'] as const).map((t) => (
        <span key={t} className="gb-enc-meter-tick" style={{ left: `${(thresholds[t] / max) * 100}%` }} title={`${DIFFICULTY_LABELS[t]}: ${thresholds[t].toLocaleString()} XP`}>
          <span>{DIFFICULTY_LABELS[t]}</span>
        </span>
      ))}
    </div>
  )
}

const ICON_STAT_SIZE = 16

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
  placeholder,
  className
}: {
  icon: JSX.Element
  iconTitle?: string
  onIconClick?: () => void
  value: number | string
  onChange: (value: string) => void
  inputTitle?: string
  placeholder?: string
  className?: string
}): JSX.Element {
  return (
    <div className={`it-stat${className ? ` ${className}` : ''}`}>
      {onIconClick ? (
        <button type="button" className="it-stat-icon it-stat-icon--button" onClick={onIconClick} title={iconTitle} aria-label={iconTitle}>
          {icon}
        </button>
      ) : (
        <span className="it-stat-icon" title={iconTitle}>
          {icon}
        </span>
      )}
      <input type="number" className="gb-icon-value-input it-stat-value" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} title={inputTitle ?? iconTitle} aria-label={inputTitle ?? iconTitle} />
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

  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, currentHp / maxHp)) : 0

  return (
    <div className="it-hp">
      <div className="it-hp-top">
        <button type="button" className="it-hp-btn it-hp-btn--dmg" onClick={() => setPending('damage')} title="Apply damage" aria-label="Apply damage">
          <MinusIcon size={11} />
        </button>
        {pending ? (
          <input
            ref={inputRef}
            type="number"
            min={0}
            className="gb-input it-hp-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyPending()
              else if (e.key === 'Escape') cancelPending()
            }}
            onBlur={cancelPending}
            placeholder={pending === 'damage' ? 'Dmg' : 'Heal'}
            title={pending === 'damage' ? 'Damage amount — Enter to apply' : 'Heal amount — Enter to apply'}
          />
        ) : (
          <span className="it-hp-vals">
            <input type="number" className="gb-icon-value-input it-hp-cur" value={currentHp} onChange={(e) => onSetHp(Number(e.target.value))} title="Current HP" aria-label="Current HP" />
            <span>/</span>
            <input type="number" className="gb-icon-value-input it-hp-max" value={maxHp} onChange={(e) => onSetMaxHp(Number(e.target.value))} title="Max HP" aria-label="Max HP" />
          </span>
        )}
        <button type="button" className="it-hp-btn it-hp-btn--heal" onClick={() => setPending('heal')} title="Apply healing" aria-label="Apply healing">
          <PlusIcon size={11} />
        </button>
      </div>
      <div className="it-hp-bar" aria-hidden="true">
        <i className={ratio <= 0.25 ? 'it-hp-low' : ratio <= 0.5 ? 'it-hp-mid' : undefined} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  )
}

/** The gear button in the tracker toolbar's top-right — condenses the encounter-wide toggles (dismemberment, private death saves) into one popup instead of a growing row of checkboxes competing for toolbar space. Closes on picking nothing further — on Escape or an outside click — same idiom as AddStatusEffectControl/EncounterBuilder's search dropdown. */
function TrackerSettingsMenu({
  dismembermentEnabled,
  onSetDismembermentEnabled,
  deathSavesPrivate,
  onSetDeathSavesPrivate,
  shuffleEnemyOrder,
  onSetShuffleEnemyOrder
}: {
  dismembermentEnabled: boolean
  onSetDismembermentEnabled: (value: boolean) => void
  deathSavesPrivate: boolean
  onSetDeathSavesPrivate: (value: boolean) => void
  shuffleEnemyOrder: boolean
  onSetShuffleEnemyOrder: (value: boolean) => void
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
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}
            title="Players see the enemies in a random order, so where an enemy sits doesn't give away its initiative roll"
          >
            <input type="checkbox" checked={shuffleEnemyOrder} onChange={(e) => onSetShuffleEnemyOrder(e.target.checked)} />
            Random enemy order for players
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
const DISMEMBERMENT_TIER: Record<'minor' | 'major' | 'overkill', { label: string; sub: string }> = {
  minor: { label: 'Minor wound', sub: 'A quarter of their hit points in one hit — something small comes off' },
  major: { label: 'Major wound', sub: 'Half their hit points in one hit — a whole limb' },
  overkill: { label: 'Killing blow', sub: 'Every hit point and more in one blow' }
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
    <div className={closing ? 'it-wound gb-pop-out' : 'it-wound'} data-tier={mode} role="group" aria-label={tier.label}>
      <div className="it-wound-head">
        <WoundIcon />
        <div className="it-wound-titles">
          <strong>{tier.label}</strong>
          <span>{tier.sub}</span>
        </div>
        <button type="button" className="it-wound-skip" onClick={onDismiss} title="No wound this time">
          Skip
        </button>
      </div>
      {mode === 'overkill' ? (
        <div className="it-wound-big">
          <button type="button" onClick={() => onPick('Beheaded')}>
            Beheaded
          </button>
          <button type="button" onClick={() => onPick('Bisected')}>
            Bisected
          </button>
        </div>
      ) : (
        table && <DismembermentRoller table={table} onPick={onPick} />
      )}
    </div>
  )
}

/** A drop of blood — the wound prompt's mark, and a wound tag's. */
function WoundIcon({ size = 14 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="it-wound-icon">
      <path d="M8 1.5C8 1.5 3.5 6.6 3.5 9.9a4.5 4.5 0 0 0 9 0C12.5 6.6 8 1.5 8 1.5Z" fill="currentColor" />
    </svg>
  )
}

const ROLL_TICK_MS = 70
const ROLL_TICKS = 10

/**
 * The minor/major body-part picker: a tile per part for the DM to pick one
 * by hand (a player aimed for it), or Roll, which chases a highlight through
 * the tiles for a beat before landing on one and adding it. Chained
 * setTimeout rather than setInterval for the chase, same reasoning as
 * RollAnimationOverlay's own flicker — see that file's doc comment.
 */
function DismembermentRoller({ table, onPick }: { table: string[]; onPick: (tag: string) => void }): JSX.Element {
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

  const busy = rollingIndex !== null || landedIndex !== null
  return (
    <div className="it-wound-parts">
      {table.map((tag, i) => (
        <button
          key={tag}
          type="button"
          className={rollingIndex === i || landedIndex === i ? 'it-wound-part it-wound-part--hit' : 'it-wound-part'}
          onClick={() => onPick(tag)}
          disabled={busy}
        >
          {tag}
        </button>
      ))}
      <button type="button" className="it-wound-part it-wound-roll" onClick={roll} disabled={busy} title="Roll for where it lands">
        <DiceIcon size={13} style={{ color: 'currentColor' }} />
        Roll
      </button>
    </div>
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
function FadeOutBadge({ children, color, className = 'gb-badge', onRemove }: { children: ReactNode; color?: string; className?: string; onRemove: () => void }): JSX.Element | null {
  const [leaving, setLeaving] = useState(false)
  const { rendered, closing } = useMountAnimation(!leaving)

  useEffect(() => {
    if (leaving && !rendered) onRemove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rendered, leaving])

  if (!rendered) return null

  return (
    <span
      className={closing ? `${className} gb-pop-out` : className}
      style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color, borderColor: color }}
    >
      {children}
      <button
        type="button"
        onClick={() => setLeaving(true)}
        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 11, lineHeight: 1 }}
      >
        <XIcon size={12} />
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
    <div ref={wrapperRef} className="it-add-status-wrap">
      <button type="button" onClick={() => setOpen((o) => !o)} title="Add a status effect" className={`it-tag it-add-status${open ? ' it-add-status--open' : ''}`}>
        <PlusIcon size={9} />
        Status
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
