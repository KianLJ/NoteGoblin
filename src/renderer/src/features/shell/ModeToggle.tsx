import { CrownIcon } from './icons'
import { UserIcon } from '../player/icons'

export type Mode = 'dm' | 'player'

interface ModeToggleProps {
  mode: Mode
  onChange: (mode: Mode) => void
}

const OPTIONS: Array<{ mode: Mode; label: string; icon: JSX.Element }> = [
  { mode: 'dm', label: 'DM Mode', icon: <CrownIcon /> },
  { mode: 'player', label: 'Player Mode', icon: <UserIcon /> }
]

export function ModeToggle({ mode, onChange }: ModeToggleProps): JSX.Element {
  return (
    <div
      role="tablist"
      aria-label="Switch between DM and Player mode"
      style={{
        display: 'inline-flex',
        padding: 3,
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-sunken)',
        border: '1px solid var(--border-subtle)'
      }}
    >
      {OPTIONS.map((option) => (
        <button
          key={option.mode}
          role="tab"
          aria-selected={mode === option.mode}
          title={option.label}
          onClick={() => onChange(option.mode)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '6px 12px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            cursor: 'pointer',
            background: mode === option.mode ? 'var(--bg-surface-raised)' : 'transparent',
            color: mode === option.mode ? 'var(--accent)' : 'var(--text-muted)',
            boxShadow: mode === option.mode ? 'var(--shadow-sm)' : 'none',
            transition: 'all 120ms ease'
          }}
        >
          {option.icon}
        </button>
      ))}
    </div>
  )
}
