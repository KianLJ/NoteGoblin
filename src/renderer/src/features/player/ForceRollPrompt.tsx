import { useEffect, useState } from 'react'
import { ABILITIES } from '@shared/dnd5e'
import { deriveSheet, skillModeOf, skillOf } from '@shared/content/sheet'
import type { AdvantageMode } from '@shared/dice'
import type { CharacterSheet, ForceRollRequest } from '@shared/ipc'
import { Modal } from '../../ui/Modal'
import { Button } from '../../ui/Button'
import { useSheetRoller } from '../dice/useSheetRoller'

interface ForceRollPromptProps {
  sessionId: string | null
  /** The character to resolve the requested check/save/skill's modifier against — the player's currently active character. Nothing to roll (and this component renders nothing) without one. */
  character: CharacterSheet | null
}

/** The content engine's 'advantage'/'disadvantage'/undefined roll mode, coalesced to shared/dice.ts's AdvantageMode for useSheetRoller. */
function toAdvantageMode(value: 'advantage' | 'disadvantage' | undefined): AdvantageMode {
  return value ?? 'normal'
}

/**
 * Listens for a DM's forced-roll push (see sessionHost.ts's pushForceRoll)
 * and puts up a non-dismissible prompt — the DM is demanding this roll, so
 * unlike every other Modal in the app there's no Escape/backdrop-click out
 * of it, only Roll. Resolves the actual modifier locally against the
 * player's own character (the DM never sees or sets it), then rolls through
 * the exact same performCheckRoll path a sheet button would, so it lands in
 * the shared dice log/broadcast and gets the same dramatic reveal.
 */
export function ForceRollPrompt({ sessionId, character }: ForceRollPromptProps): JSX.Element | null {
  const [request, setRequest] = useState<ForceRollRequest | null>(null)
  const { rollCheck } = useSheetRoller(sessionId, character?.name)

  useEffect(() => window.goblin.dice.onForceRoll((req) => setRequest(req)), [])

  if (!request || !character) return null

  // Same numbers the sheet shows — the content engine's (see shared/content/sheet.ts), cached per sheet.
  const { derived } = deriveSheet(character)

  let modifier = 0
  let advantage: AdvantageMode = 'normal'
  if (request.mode === 'ability-check' && request.ability) {
    modifier = derived.abilities[request.ability].mod
    advantage = toAdvantageMode(derived.checkModes[request.ability])
  } else if (request.mode === 'saving-throw' && request.ability) {
    modifier = derived.saves[request.ability].bonus
    advantage = toAdvantageMode(derived.saves[request.ability].mode)
  } else if (request.mode === 'skill-check' && request.skill) {
    modifier = skillOf(derived, request.skill)?.bonus ?? 0
    advantage = toAdvantageMode(skillModeOf(derived, request.skill))
  }

  function roll(): void {
    if (!request) return
    rollCheck(request.label, modifier, { advantage, dc: request.dc })
    setRequest(null)
  }

  const abilityLabel = request.ability ? ABILITIES.find((a) => a.id === request.ability)?.label : null

  return (
    <Modal onClose={() => {}} dismissible={false} width={380}>
      <h3 style={{ marginTop: 0 }}>{request.fromDisplayName} demands a roll!</h3>
      <p style={{ margin: '0 0 var(--space-3)' }}>
        <strong>{request.label}</strong>
        {abilityLabel && request.mode !== 'skill-check' ? ` (${abilityLabel})` : ''}
        {request.dc != null && ` — DC ${request.dc}`}
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" onClick={roll}>
          Roll ({modifier >= 0 ? '+' : ''}
          {modifier})
        </Button>
      </div>
    </Modal>
  )
}
