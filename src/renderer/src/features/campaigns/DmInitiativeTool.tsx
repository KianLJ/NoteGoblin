import { useState } from 'react'
import type { TrackedVehicle } from '@shared/vehicles'
import type { CharacterSheet } from '@shared/ipc'
import type { BestiaryMonster } from '../../data/bestiary'
import { InitiativeTracker } from './InitiativeTracker'
import { VehiclesPanel } from '../vehicles/VehiclesPanel'
import { useVehicles } from '../vehicles/useVehicles'

/**
 * The DM's Initiative box on the canvas: the same tracker, encounter builder
 * and vehicles as the Combat screen's left panel (the encounter lives in
 * encounterStore, so both show the same fight). Clicking an enemy opens its
 * statblock as a box of its own.
 */
export function DmInitiativeTool({
  sessionId,
  campaignId,
  combatCharacters,
  onOpenMonster
}: {
  sessionId: string | null
  campaignId: string | null
  /** The connected players' characters plus the DM's test players' — who can join a fight or crew a vehicle. */
  combatCharacters: Map<string, CharacterSheet>
  onOpenMonster: (monster: BestiaryMonster) => void
}): JSX.Element {
  const vehicles = useVehicles(null, campaignId)
  const [pendingVehicle, setPendingVehicle] = useState<TrackedVehicle | null>(null)
  return (
    <InitiativeTracker
      sessionId={sessionId}
      playerCharacters={combatCharacters}
      onSelectMonster={onOpenMonster}
      pendingVehicle={pendingVehicle}
      onPendingVehicleConsumed={() => setPendingVehicle(null)}
      vehicles={vehicles.doc.vehicles}
      onVehicleHp={(id, hp) => void vehicles.save({ vehicles: vehicles.doc.vehicles.map((v) => (v.id === id ? { ...v, hp } : v)) })}
      vehiclesView={
        <VehiclesPanel sessionId={null} rollSessionId={sessionId} campaignId={campaignId} readOnly={false} playerCharacters={combatCharacters} onAddToInitiative={setPendingVehicle} />
      }
    />
  )
}
