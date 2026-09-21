import { useState } from 'react'
import { ABILITIES, SKILLS, type Ability, type SkillName } from '@shared/dnd5e'
import type { ForceRollRequest } from '@shared/ipc'
import { Modal } from '../../ui/Modal'
import { Button } from '../../ui/Button'

type Mode = 'ability-check' | 'saving-throw' | 'skill-check' | 'flat'

interface ForceRollDialogProps {
  open: boolean
  playerName: string
  fromDisplayName: string
  onClose: () => void
  onSend: (request: ForceRollRequest) => void
}

function labelFor(mode: Mode, ability?: Ability, skill?: SkillName): string {
  if (mode === 'flat') return 'd20 Roll'
  if (mode === 'skill-check') return `${skill} Check`
  const abilityLabel = ABILITIES.find((a) => a.id === ability)?.label ?? ''
  return mode === 'saving-throw' ? `${abilityLabel} Saving Throw` : `${abilityLabel} Check`
}

/** The DM's "make this player roll" prompt — right-click a connected player in ConnectedPlayersList.tsx to open this. Sends a targeted, un-acked push (see sessionHost.ts's pushForceRoll); the player's own client resolves the actual modifier against their character sheet, so nothing rolled here or anywhere on the DM's side. */
export function ForceRollDialog({ open, playerName, fromDisplayName, onClose, onSend }: ForceRollDialogProps): JSX.Element {
  const [mode, setMode] = useState<Mode>('ability-check')
  const [ability, setAbility] = useState<Ability>('str')
  const [skill, setSkill] = useState<SkillName>(SKILLS[0].id)
  const [dc, setDc] = useState('')

  function send(): void {
    const parsedDc = dc.trim() === '' ? null : Number(dc)
    const request: ForceRollRequest = {
      id: crypto.randomUUID(),
      mode,
      ability: mode === 'ability-check' || mode === 'saving-throw' ? ability : undefined,
      skill: mode === 'skill-check' ? skill : undefined,
      dc: Number.isFinite(parsedDc) ? Math.max(0, parsedDc as number) : null,
      label: labelFor(mode, ability, skill),
      fromDisplayName
    }
    onSend(request)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} width={380}>
      <h3 style={{ marginTop: 0 }}>Force a roll — {playerName}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
          Roll type
          <select className="gb-input" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="ability-check">Ability Check</option>
            <option value="saving-throw">Saving Throw</option>
            <option value="skill-check">Skill Check</option>
            <option value="flat">Flat d20 (no modifier)</option>
          </select>
        </label>

        {(mode === 'ability-check' || mode === 'saving-throw') && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
            Ability
            <select className="gb-input" value={ability} onChange={(e) => setAbility(e.target.value as Ability)}>
              {ABILITIES.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {mode === 'skill-check' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
            Skill
            <select className="gb-input" value={skill} onChange={(e) => setSkill(e.target.value as SkillName)}>
              {SKILLS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id}
                </option>
              ))}
            </select>
          </label>
        )}

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
          DC (optional)
          <input
            type="number"
            min={0}
            className="gb-input"
            value={dc}
            onChange={(e) => setDc(e.target.value)}
            placeholder="e.g. 15"
          />
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={send}>
            Send
          </Button>
        </div>
      </div>
    </Modal>
  )
}
