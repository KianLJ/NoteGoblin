import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import { activeFeatIds, computeMaxHp } from '@shared/dnd5e'
import { effectiveAbilityScores, computeArmorClassFromEquipment } from '@shared/compendium'
import {
  emptyInitiativeState,
  emptyCombatant,
  sortedByInitiative,
  computeEncounterDifficulty,
  DIFFICULTY_LABELS,
  type Combatant,
  type InitiativeState
} from '@shared/encounter'
import { BESTIARY, formatCr } from '../../data/bestiary'
import { loadCustomMonsters, isCustomMonster } from '../../data/customBestiary'
import type { BestiaryMonster } from '../../data/bestiary'
import { Button } from '../../ui/Button'

interface InitiativeTrackerProps {
  sessionId: string | null
  playerCharacters: Map<string, CharacterSheet>
  /** Clicking a monster combatant's name opens its full statblock in the main pane (see CampaignWorkspace.tsx) — DM-only, since this whole tracker only ever renders on the DM's side (the player-facing view is PlayerInitiativeView.tsx, a separate component that never sees monster identity). */
  onSelectMonster: (monster: BestiaryMonster) => void
}

const STORAGE_KEY = 'gb-saved-encounters'

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

interface SavedEncounter {
  id: string
  name: string
  monsterIndexes: string[]
  createdAt: string
}

function loadSavedEncounters(): SavedEncounter[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SavedEncounter[]) : []
  } catch {
    return []
  }
}

function saveSavedEncounters(list: SavedEncounter[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    /* best-effort */
  }
}

function playerToCombatant(userId: string, character: CharacterSheet): Combatant {
  const effScores = effectiveAbilityScores(character.abilityScores, character.classes, character.asiSlotChoices)
  const featIds = activeFeatIds(character.classes, character.asiSlotChoices)
  return {
    id: `player:${userId}`,
    name: character.name,
    kind: 'player',
    initiative: null,
    maxHp: computeMaxHp(character.classes, character.abilityScores),
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

/**
 * The DM's combat panel — auto-adds connected players (HP/AC pulled live
 * from their synced character), monsters added by hand or via the built-in
 * encounter builder, and a play mode (Start/Next/Previous) that steps
 * through initiative order. Every change broadcasts a sanitized copy to
 * connected players (see shared/encounter.ts's sanitizeForPlayer and
 * sessionHost.ts's broadcastInitiative) — enemies show only as an injury
 * band, never their real name/HP/AC.
 */
export function InitiativeTracker({ sessionId, playerCharacters, onSelectMonster }: InitiativeTrackerProps): JSX.Element {
  const [state, setState] = useState<InitiativeState>(emptyInitiativeState())
  const [view, setView] = useState<'tracker' | 'build'>('tracker')
  const [monsterQuery, setMonsterQuery] = useState('')
  const [savedEncounters, setSavedEncounters] = useState(() => loadSavedEncounters())
  const [encounterDraft, setEncounterDraft] = useState<Record<string, number>>({})
  const [encounterName, setEncounterName] = useState('')

  useEffect(() => {
    if (sessionId) void window.goblin.initiative.broadcast(state)
  }, [state, sessionId])

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

  const allMonstersForQuickAdd = useMemo(
    () => [...loadCustomMonsters(), ...BESTIARY].sort((a, b) => a.name.localeCompare(b.name)),
    []
  )

  const ordered = sortedByInitiative(state.combatants)
  const inCombat = state.turnIndex >= 0

  function patch(fields: Partial<InitiativeState>): void {
    setState((prev) => ({ ...prev, ...fields }))
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

  function bumpDeathSave(id: string, kind: 'successes' | 'failures', delta: number): void {
    patch({
      combatants: state.combatants.map((c) => {
        if (c.id !== id || !c.deathSaves) return c
        const next = Math.min(3, Math.max(0, c.deathSaves[kind] + delta))
        return { ...c, deathSaves: { ...c.deathSaves, [kind]: next } }
      })
    })
  }

  function addStatusEffect(id: string, effect: string): void {
    if (!effect.trim()) return
    patch({
      combatants: state.combatants.map((c) =>
        c.id === id && !c.statusEffects.includes(effect) ? { ...c, statusEffects: [...c.statusEffects, effect] } : c
      )
    })
  }

  function removeStatusEffect(id: string, effect: string): void {
    patch({ combatants: state.combatants.map((c) => (c.id === id ? { ...c, statusEffects: c.statusEffects.filter((e) => e !== effect) } : c)) })
  }

  function removeCombatant(id: string): void {
    patch({ combatants: state.combatants.filter((c) => c.id !== id), turnIndex: -1, round: 1 })
  }

  function addMissingPlayers(): void {
    const existingUserIds = new Set(state.combatants.filter((c) => c.kind === 'player').map((c) => c.userId))
    const toAdd = [...playerCharacters.entries()]
      .filter(([userId]) => !existingUserIds.has(userId))
      .map(([userId, character]) => playerToCombatant(userId, character))
    if (toAdd.length) patch({ combatants: [...state.combatants, ...toAdd] })
  }

  function startCombat(): void {
    patch({ turnIndex: 0, round: 1 })
  }

  function nextTurn(): void {
    if (ordered.length === 0) return
    const next = state.turnIndex + 1
    if (next >= ordered.length) patch({ turnIndex: 0, round: state.round + 1 })
    else patch({ turnIndex: next })
  }

  function prevTurn(): void {
    if (ordered.length === 0) return
    const prev = state.turnIndex - 1
    if (prev < 0) patch({ turnIndex: ordered.length - 1, round: Math.max(1, state.round - 1) })
    else patch({ turnIndex: prev })
  }

  function endCombat(): void {
    patch({ turnIndex: -1, round: 1 })
  }

  function clearAll(): void {
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
            <Button variant="secondary" onClick={addMissingPlayers} style={{ fontSize: 11, padding: '3px 8px' }}>
              + Add Players
            </Button>
            <select
              className="gb-input"
              value=""
              onChange={(e) => {
                const monster = allMonstersForQuickAdd.find((m) => m.index === e.target.value)
                if (monster) patch({ combatants: [...state.combatants, monsterToCombatant(monster)] })
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={state.deathSavesPrivate}
                onChange={(e) => patch({ deathSavesPrivate: e.target.checked })}
              />
              Private death saves
            </label>
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
              className="gb-card"
              style={{
                padding: 'var(--space-2)',
                borderColor: inCombat && i === state.turnIndex ? 'var(--accent)' : undefined,
                background: inCombat && i === state.turnIndex ? 'var(--accent-subtle)' : undefined
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  className="gb-input"
                  value={c.initiative ?? ''}
                  onChange={(e) => updateCombatant(c.id, { initiative: e.target.value === '' ? null : Number(e.target.value) })}
                  placeholder="Init"
                  style={{ width: 48, fontSize: 12, padding: '3px 4px' }}
                  title="Initiative"
                />
                {c.kind === 'monster' ? (
                  <button
                    type="button"
                    onClick={() => {
                      const monster = allMonstersForQuickAdd.find((m) => m.index === c.monsterIndex)
                      if (monster) onSelectMonster(monster)
                    }}
                    title="View statblock"
                    style={{
                      flex: 1,
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      color: 'var(--accent)',
                      fontSize: 13,
                      fontWeight: 700,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {c.name}
                  </button>
                ) : (
                  <strong style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name}
                  </strong>
                )}
                {c.currentHp <= 0 && (
                  <span className="gb-badge" style={{ fontSize: 10, color: 'var(--danger)' }}>
                    Dead
                  </span>
                )}
                <span className="gb-badge" style={{ fontSize: 10 }}>
                  {c.kind === 'player' ? 'PC' : 'Monster'}
                </span>
                <button type="button" onClick={() => removeCombatant(c.id)} title="Remove" style={removeBtnStyle}>
                  ×
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text-muted)' }}>
                  HP
                  <input
                    type="number"
                    className="gb-input"
                    value={c.currentHp}
                    onChange={(e) => setCombatantHp(c.id, Number(e.target.value))}
                    style={{ width: 60, fontSize: 11, padding: '2px 4px' }}
                  />
                  / {c.maxHp}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text-muted)' }}>
                  AC
                  <input
                    type="number"
                    className="gb-input"
                    value={c.ac}
                    onChange={(e) => updateCombatant(c.id, { ac: Number(e.target.value) })}
                    style={{ width: 48, fontSize: 11, padding: '2px 4px' }}
                  />
                </label>
              </div>

              {c.deathSaves && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                  <DeathSaveRow label="Success" count={c.deathSaves.successes} color="var(--success)" onChange={(delta) => bumpDeathSave(c.id, 'successes', delta)} />
                  <DeathSaveRow label="Fail" count={c.deathSaves.failures} color="var(--danger)" onChange={(delta) => bumpDeathSave(c.id, 'failures', delta)} />
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                {c.statusEffects.map((effect) => (
                  <span key={effect} className="gb-badge" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                    {effect}
                    <button
                      type="button"
                      onClick={() => removeStatusEffect(c.id, effect)}
                      style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 11, lineHeight: 1 }}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <select
                  value=""
                  onChange={(e) => addStatusEffect(c.id, e.target.value)}
                  style={{ fontSize: 10, padding: '2px 3px', background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)' }}
                >
                  <option value="">+ Status…</option>
                  {STATUS_EFFECT_PRESETS.filter((s) => !c.statusEffects.includes(s)).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
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
  const filtered = useMemo(() => {
    const q = monsterQuery.trim().toLowerCase()
    if (!q) return []
    return allMonsters.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 20)
  }, [allMonsters, monsterQuery])

  const partyLevels = useMemo(
    () => [...playerCharacters.values()].map((c) => c.classes.reduce((sum, cl) => sum + cl.level, 0) || 1),
    [playerCharacters]
  )

  const draftMonsters = useMemo(() => {
    const result: BestiaryMonster[] = []
    for (const [index, count] of Object.entries(encounterDraft)) {
      const monster = allMonsters.find((m) => m.index === index)
      if (monster) for (let i = 0; i < count; i++) result.push(monster)
    }
    return result
  }, [encounterDraft, allMonsters])

  const difficulty = useMemo(
    () => computeEncounterDifficulty(partyLevels.length ? partyLevels : [1], draftMonsters.map((m) => m.xp)),
    [partyLevels, draftMonsters]
  )

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
      <input
        className="gb-input"
        placeholder="Search monsters to add…"
        value={monsterQuery}
        onChange={(e) => setMonsterQuery(e.target.value)}
        style={{ fontSize: 12 }}
      />
      {filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 140, overflowY: 'auto' }}>
          {filtered.map((m) => (
            <button
              key={m.index}
              type="button"
              onClick={() => {
                addToDraft(m.index)
                setMonsterQuery('')
              }}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 6,
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
          ))}
        </div>
      )}

      <div className="gb-label">Encounter</div>
      {draftMonsters.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Search above to add monsters.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {Object.entries(encounterDraft).map(([index, count]) => {
            const monster = allMonsters.find((m) => m.index === index)
            if (!monster) return null
            return (
              <div key={index} className="gb-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px' }}>
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
