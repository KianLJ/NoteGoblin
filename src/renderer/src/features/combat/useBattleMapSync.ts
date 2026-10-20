import { useEffect, useRef } from 'react'
import { emptyBattleLibrary, placeTokens, sizeInSquares, slotOf, withPlacements } from '@shared/battleMap'
import type { Combatant } from '@shared/encounter'
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
