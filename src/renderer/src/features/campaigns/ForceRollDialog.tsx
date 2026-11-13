import { useState } from 'react'
import { ABILITIES, SKILLS, type Ability, type SkillName } from '@shared/dnd5e'
import type { ForceRollRequest } from '@shared/ipc'
import { Modal } from '../../ui/Modal'
import { Button } from '../../ui/Button'
import { XIcon } from '../../ui/icons'
import { DiceIcon } from '../player/characterSheetTabs/icons'
import './forceRoll.css'

type Mode = 'ability-check' | 'saving-throw' | 'skill-check' | 'flat'

interface ForceRollDialogProps {
  open: boolean
  playerName: string
  fromDisplayName: string
  onClose: () => void
  onSend: (request: ForceRollRequest) => void
}

const MODES: Array<{ mode: Mode; label: string }> = [
  { mode: 'ability-check', label: 'Check' },
  { mode: 'saving-throw', label: 'Save' },
  { mode: 'skill-check', label: 'Skill' },
  { mode: 'flat', label: 'Plain d20' }
]

const DCS: Array<{ dc: number | null; label: string }> = [
  { dc: null, label: 'No DC' },
  { dc: 10, label: 'Easy 10' },
  { dc: 15, label: 'Medium 15' },
  { dc: 20, label: 'Hard 20' },
  { dc: 25, label: 'Very hard 25' }
]

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
  const [dc, setDc] = useState<number | null>(null)
  const label = labelFor(mode, ability, skill)

  function send(): void {
    onSend({
      id: crypto.randomUUID(),
      mode,
      ability: mode === 'ability-check' || mode === 'saving-throw' ? ability : undefined,
      skill: mode === 'skill-check' ? skill : undefined,
      dc,
      label,
      fromDisplayName
    })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} width={440}>
      <div className="fr">
        <header className="fr-head">
          <span className="fr-icon" aria-hidden="true">
            <DiceIcon size={16} />
          </span>
          <div>
            <strong>Ask {playerName} to roll</strong>
            <small>It comes up on their screen, using their character’s bonuses.</small>
          </div>
          <button type="button" className="fr-close" onClick={onClose} aria-label="Close">
            <XIcon size={12} />
          </button>
        </header>

        <div className="fr-seg" role="radiogroup" aria-label="Kind of roll">
          {MODES.map((m) => (
            <button key={m.mode} type="button" role="radio" aria-checked={mode === m.mode} className={mode === m.mode ? 'on' : ''} onClick={() => setMode(m.mode)}>
              {m.label}
            </button>
          ))}
        </div>

        {(mode === 'ability-check' || mode === 'saving-throw') && (
          <div className="fr-grid fr-grid--abilities" role="radiogroup" aria-label="Ability">
            {ABILITIES.map((a) => (
              <button key={a.id} type="button" role="radio" aria-checked={ability === a.id} className={ability === a.id ? 'on' : ''} onClick={() => setAbility(a.id)} title={a.label}>
                <b>{a.id.toUpperCase()}</b>
                <span>{a.label}</span>
              </button>
            ))}
          </div>
        )}

        {mode === 'skill-check' && (
          <div className="fr-grid fr-grid--skills" role="radiogroup" aria-label="Skill">
            {SKILLS.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={skill === s.id} className={skill === s.id ? 'on' : ''} onClick={() => setSkill(s.id)}>
                {s.id}
              </button>
            ))}
          </div>
        )}

        <div className="fr-dc">
          <span className="fr-label">Difficulty</span>
          <div className="fr-chips">
            {DCS.map((d) => (
              <button key={d.label} type="button" className={dc === d.dc ? 'on' : ''} onClick={() => setDc(d.dc)}>
                {d.label}
              </button>
            ))}
            <input
              type="number"
              min={0}
              className="gb-input fr-dc-input"
              value={dc ?? ''}
              onChange={(e) => setDc(e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0))}
              placeholder="DC"
              aria-label="DC"
            />
          </div>
        </div>

        <footer className="fr-foot">
          <span className="fr-summary">
            {label}
            {dc !== null && ` · DC ${dc}`}
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={send}>
            Ask for the roll
          </Button>
        </footer>
      </div>
    </Modal>
  )
}
