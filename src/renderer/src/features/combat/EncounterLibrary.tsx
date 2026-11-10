import { useMemo, useState } from 'react'
import type { CharacterSheet } from '@shared/ipc'
import { activeBattle } from '@shared/battleMap'
import { computeEncounterDifficulty, DIFFICULTY_LABELS } from '@shared/encounter'
import { applyEncounterPlacements, setEncounter, setLibrary, useBattleLibrary, useBattleMap } from './encounterStore'
import { encounterPlacements, loadSavedEncounters, requestEncounterEdit, saveSavedEncounters, useSavedEncounters, type SavedEncounter } from '../../data/savedEncounters'
import { useAllMonsters } from '../../data/useAllMonsters'
import type { BestiaryMonster } from '../../data/bestiary'
import { monsterToCombatant } from '../campaigns/InitiativeTracker'
import { XIcon } from '../../ui/icons'
import '../campaigns/encounter.css'
import './encounterLibrary.css'

/**
 * Every saved encounter, on its own: find one by name or tag, see how hard
 * it is for the party, and put it to use — load its enemies into the fight
 * (on their saved squares), save where they stand on the map now, make it
 * this map's encounter (so loading it from a session scene brings this map
 * up), edit it in the encounter builder, or delete it. A DM canvas tool, and
 * a tab in Combat's right panel.
 */
export function EncounterLibrary({ playerCharacters }: { playerCharacters: Map<string, CharacterSheet> }): JSX.Element {
  const encounters = useSavedEncounters()
  const { monsters: allMonsters } = useAllMonsters()
  const library = useBattleLibrary()
  const battle = activeBattle(library)
  const [map] = useBattleMap()
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [note, setNote] = useState<{ id: string; text: string } | null>(null)

  const partyLevels = useMemo(() => {
    const levels = [...playerCharacters.values()].map((c) => c.classes.reduce((sum, cl) => sum + cl.level, 0) || 1)
    return levels.length ? levels : [1]
  }, [playerCharacters])

  const rows = useMemo(
    () =>
      encounters.map((enc) => {
        const monsters = enc.monsterIndexes.map((i) => allMonsters.find((m) => m.index === i)).filter((m): m is BestiaryMonster => !!m)
        return { enc, monsters, result: computeEncounterDifficulty(partyLevels, monsters.map((m) => m.xp)) }
      }),
    [encounters, allMonsters, partyLevels]
  )
  const tags = useMemo(() => [...new Set(encounters.flatMap((e) => e.tags ?? []))].sort(), [encounters])
  const q = query.trim().toLowerCase()
  const shown = rows.filter(({ enc }) => (!tag || enc.tags?.includes(tag)) && (!q || enc.name.toLowerCase().includes(q) || enc.tags?.some((t) => t.includes(q))))

  function say(id: string, text: string): void {
    setNote({ id, text })
  }

  function loadEnemies(enc: SavedEncounter, monsters: BestiaryMonster[]): void {
    applyEncounterPlacements(enc.id)
    // Its monsters replace whatever monsters are in the fight; the party and vehicles stay.
    setEncounter((s) => ({ ...s, turnIndex: -1, round: 1, combatants: [...s.combatants.filter((c) => c.kind !== 'monster'), ...monsters.map(monsterToCombatant)] }))
    say(enc.id, `${monsters.length} enem${monsters.length === 1 ? 'y' : 'ies'} in the fight${Object.keys(enc.placements ?? {}).length ? ', on their saved squares' : ''}.`)
  }

  function savePositions(enc: SavedEncounter): void {
    const spots = encounterPlacements(enc, map.placements)
    const n = Object.keys(spots).length
    saveSavedEncounters(loadSavedEncounters().map((e) => (e.id === enc.id ? { ...e, placements: spots } : e)))
    say(enc.id, `Saved where ${n === 1 ? 'its enemy stands' : `its ${n} enemies stand`} on “${battle.name}”.`)
  }

  function useOnThisMap(enc: SavedEncounter): void {
    const on = battle.encounterId === enc.id
    setLibrary((l) => ({ ...l, battles: l.battles.map((b) => (b.id === battle.id ? { ...b, encounterId: on ? null : enc.id } : b)) }))
    say(enc.id, on ? `No longer “${battle.name}”’s encounter.` : `Now “${battle.name}”’s encounter: loading it from a scene brings this map up.`)
  }

  if (encounters.length === 0) {
    return (
      <div className="gb-enc-empty el-empty">
        <strong>No saved encounters yet</strong>
        <span>Build one in the Initiative box’s Build tab and save it — it shows up here, ready to load into a fight.</span>
      </div>
    )
  }

  return (
    <div className="el">
      <div className="el-find">
        <input className="gb-input" placeholder="Find an encounter…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find an encounter" />
        {tags.length > 0 && (
          <div className="gb-enc-tags">
            {tags.map((t) => (
              <button key={t} type="button" className={tag === t ? 'gb-enc-tag gb-enc-tag--on' : 'gb-enc-tag'} onClick={() => setTag(tag === t ? null : t)}>
                {t}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="el-list">
        {shown.length === 0 && <p className="el-muted">Nothing matches.</p>}
        {shown.map(({ enc, monsters, result }) => {
          const expanded = open === enc.id
          const saved = Object.keys(enc.placements ?? {}).length
          const onMap = Object.keys(encounterPlacements(enc, map.placements)).length
          const isThisMap = battle.encounterId === enc.id
          return (
            <div key={enc.id} className={`el-row${expanded ? ' el-row--open' : ''}${isThisMap ? ' el-row--map' : ''}`}>
              <button type="button" className="el-row-head" onClick={() => setOpen(expanded ? null : enc.id)} aria-expanded={expanded}>
                <span className="el-row-name">{enc.name}</span>
                <strong className={`gb-enc-tier gb-enc-tier--${result.difficulty}`}>{DIFFICULTY_LABELS[result.difficulty]}</strong>
                <span className="el-row-roster">
                  {countText(monsters)} · {result.totalXp.toLocaleString()} XP
                </span>
                <span className="el-row-flags">
                  {isThisMap && <span className="el-flag el-flag--map">This map</span>}
                  {saved > 0 && <span className="el-flag el-flag--saved">✓ Positions</span>}
                  {enc.tags?.map((t) => (
                    <span key={t} className="el-flag">
                      #{t}
                    </span>
                  ))}
                </span>
              </button>
              {expanded && (
                <div className="el-row-body">
                  <div className="el-actions">
                    <button type="button" className="gb-btn gb-btn--primary" onClick={() => loadEnemies(enc, monsters)} disabled={monsters.length === 0} title="Puts its monsters in the fight (replacing any already there), on their saved squares">
                      Load enemies
                    </button>
                    <button
                      type="button"
                      className="gb-btn gb-btn--secondary"
                      onClick={() => savePositions(enc)}
                      disabled={onMap === 0}
                      title={onMap ? `Saves where its enemies stand on “${battle.name}” now` : 'Load its enemies onto the map first'}
                    >
                      Save positions
                    </button>
                    <button type="button" className="gb-btn gb-btn--secondary" onClick={() => useOnThisMap(enc)} title="Loading this encounter from a session scene brings this map up">
                      {isThisMap ? 'Unlink this map' : 'Use on this map'}
                    </button>
                  </div>
                  <p className="el-muted">
                    {note?.id === enc.id
                      ? note.text
                      : saved
                        ? `Positions saved for ${saved} enem${saved === 1 ? 'y' : 'ies'}. Map up now: “${battle.name}”.`
                        : `No positions saved yet — load its enemies, place them on “${battle.name}”, then Save positions.`}
                  </p>
                  <div className="el-actions el-actions--quiet">
                    <button type="button" className="gb-enc-link" onClick={() => requestEncounterEdit(enc)} title="Opens it in the Initiative box’s encounter builder">
                      Edit in builder
                    </button>
                    <button
                      type="button"
                      className="gb-enc-link el-delete"
                      onClick={() => saveSavedEncounters(loadSavedEncounters().filter((e) => e.id !== enc.id))}
                      title={`Delete ${enc.name}`}
                    >
                      <XIcon size={11} /> Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function countText(monsters: BestiaryMonster[]): string {
  const counts = new Map<string, number>()
  for (const m of monsters) counts.set(m.name, (counts.get(m.name) ?? 0) + 1)
  return [...counts].map(([name, n]) => (n > 1 ? `${n}× ${name}` : name)).join(', ') || 'No monsters found'
}
