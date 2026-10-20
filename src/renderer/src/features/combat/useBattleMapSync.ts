import { useEffect, useRef } from 'react'
import { emptyBattleLibrary, hiddenCombatantIds, isTestUser, placeTokens, sizeInSquares, slotOf, testUserId, withPlacements } from '@shared/battleMap'
import { addExplored, lightsOf, viewerSources, visibleCells, visionActive } from '@shared/vision'
import { emptyCombatant, type Combatant } from '@shared/encounter'
import { useAllMonsters } from '../../data/useAllMonsters'
import { useVehicles } from '../vehicles/useVehicles'
import { currentLibrary, loadLibrary, setBattleMap, setEncounter, useBattleLibrary, useBattleMap, useEncounter } from './encounterStore'

/**
 * The DM's battles, kept in step behind the scenes (mounted by the app shell
 * in DM mode, whether or not the Combat tab is open): the campaign's battles
 * are loaded when it opens; every combatant gets a token — where it stood
 * last time on this map, a party start, or the map's edge — and where things
 * stand is remembered as they move; changes are saved a moment later; and
 * while hosting every change goes out to the players, whose own token moves
 * come back in here.
 */
export function useBattleMapSync(campaignId: string | null, hostedSessionId: string | null): void {
  const [map] = useBattleMap()
  const library = useBattleLibrary()
  const [encounter] = useEncounter()
  const { monsters } = useAllMonsters()
  const vehicles = useVehicles(null, campaignId)
  const loaded = useRef<string | null>(null)
  const skipSave = useRef(true)

  // Load the campaign's battles (or a fresh one).
  useEffect(() => {
    loaded.current = null
    if (!campaignId) {
      loadLibrary(emptyBattleLibrary())
      return
    }
    let cancelled = false
    void window.goblin.battleMap.get(campaignId).then((result) => {
      if (cancelled) return
      skipSave.current = true
      loadLibrary(result.ok ? result.data : emptyBattleLibrary())
      loaded.current = campaignId
    })
    return () => {
      cancelled = true
    }
  }, [campaignId])

  // Test players are in every fight, as party members (their sheet's numbers come in through useCombatSheetSync).
  useEffect(() => {
    const tests = library.testPlayers ?? []
    setEncounter((s) => {
      const wanted = new Map(tests.map((t) => [testUserId(t.id), t]))
      let combatants = s.combatants.filter((c) => !isTestUser(c.userId) || wanted.has(c.userId!))
      combatants = combatants.map((c) => {
        const t = c.userId ? wanted.get(c.userId) : undefined
        if (!t || (c.name === t.name && (t.characterId || (c.darkvision ?? 0) === (t.darkvision ?? 0)))) return c
        return { ...c, name: t.name, ...(t.characterId ? {} : { darkvision: t.darkvision ?? 0 }) }
      })
      for (const [userId, t] of wanted)
        if (!combatants.some((c) => c.userId === userId))
          combatants = [...combatants, { id: `player:${userId}`, name: t.name, kind: 'player', initiative: null, maxHp: 20, currentHp: 20, ac: 12, userId, test: true, darkvision: t.darkvision ?? 0, ...emptyCombatant() }]
      const same = combatants.length === s.combatants.length && combatants.every((c, i) => c === s.combatants[i])
      return same ? s : { ...s, combatants }
    })
  }, [library.testPlayers, encounter.combatants.length])

  // A token for every combatant (automatic, so not an undo step); one put back on a spot it was hidden on starts hidden.
  useEffect(() => {
    const sizeOf = (c: Combatant): number => {
      if (c.kind === 'vehicle') return sizeInSquares(vehicles.doc.vehicles.find((v) => v.id === c.vehicleId)?.def.size)
      if (c.kind === 'monster') return sizeInSquares(monsters.find((m) => m.index === c.monsterIndex)?.size)
      return 1
    }
    const toHide: string[] = []
    setBattleMap(
      (m) => {
        const next = placeTokens(m, encounter.combatants, sizeOf)
        for (const c of encounter.combatants) if (!m.tokens[c.id] && next.tokens[c.id] && !c.hidden && m.placements[slotOf(c, encounter.combatants)]?.hidden) toHide.push(c.id)
        return next
      },
      { record: false }
    )
    if (toHide.length) setEncounter((s) => ({ ...s, combatants: s.combatants.map((c) => (toHide.includes(c.id) ? { ...c, hidden: true } : c)) }))
  }, [encounter.combatants, monsters, vehicles.doc, library.activeId])

  // Remember where everything stands (and what's hidden), so loading this battle again puts it back.
  useEffect(() => {
    setBattleMap((m) => withPlacements(m, encounter.combatants), { record: false })
  }, [map.tokens, encounter.combatants])

  // What the party has seen, remembered as they move (a map with walls or darkness): explored squares stay drawn, dimmed, once out of sight.
  useEffect(() => {
    setBattleMap(
      (m) => {
        if (!visionActive(m)) return m
        const lights = lightsOf(m, hiddenCombatantIds(encounter.combatants))
        const viewers: Array<[string, string | null]> =
          m.sharedVision !== false ? [['party', null]] : [...new Set(encounter.combatants.filter((c) => c.kind === 'player' && c.userId).map((c) => c.userId!))].map((u) => [`user:${u}`, u])
        let explored = m.explored
        for (const [key, userId] of viewers) {
          const next = addExplored(explored[key], visibleCells(m, viewerSources(m, encounter.combatants, userId), lights))
          if (next !== explored[key]) explored = { ...explored, [key]: next }
        }
        return explored === m.explored ? m : { ...m, explored }
      },
      { record: false }
    )
  }, [map.tokens, map.walls, map.lights, map.ambient, map.sharedVision, map.cols, map.rows, encounter.combatants])

  // Save a moment after the last change (not the load itself).
  useEffect(() => {
    if (!campaignId || loaded.current !== campaignId) return
    if (skipSave.current) {
      skipSave.current = false
      return
    }
    const timer = setTimeout(() => void window.goblin.battleMap.save(campaignId, currentLibrary()), 1000)
    return () => clearTimeout(timer)
  }, [map, library, campaignId])

  // While hosting, players see every change (batched briefly so a drag doesn't flood the table).
  useEffect(() => {
    if (!hostedSessionId) return
    const timer = setTimeout(() => void window.goblin.battleMap.broadcast(map, encounter), 120)
    return () => clearTimeout(timer)
  }, [map, encounter, hostedSessionId])

  // A player moved their own token (the host already checked it's theirs and allowed).
  useEffect(
    () =>
      window.goblin.battleMap.onPlayerMove(({ combatantId, x, y }) =>
        setBattleMap((m) => (m.tokens[combatantId] ? { ...m, tokens: { ...m.tokens, [combatantId]: { ...m.tokens[combatantId], x, y } } } : m), { record: false })
      ),
    []
  )
}
