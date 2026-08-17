import { CrownIcon } from './icons'
import { UserIcon } from '../player/icons'

export type Mode = 'dm' | 'player'

interface ModeToggleProps {
  mode: Mode
  onChange: (mode: Mode) => void
  /** Blocks switching TO this mode — e.g. Player is locked while you're hosting, DM is locked while you've joined someone else's session — so you can't accidentally step away mid-session. */
  disabledMode?: Mode
  disabledReason?: string
}

const OPTIONS: Array<{ mode: Mode; label: string; icon: JSX.Element }> = [
  { mode: 'dm', label: 'DM Mode', icon: <CrownIcon /> },
  { mode: 'player', label: 'Player Mode', icon: <UserIcon /> }
]

export function ModeToggle({ mode, onChange, disabledMode, disabledReason }: ModeToggleProps): JSX.Element {
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
      {OPTIONS.map((option) => {
        const locked = option.mode === disabledMode
        return (
          <button
            key={option.mode}
            role="tab"
            aria-selected={mode === option.mode}
            aria-disabled={locked}
            title={locked ? disabledReason : option.label}
            onClick={() => {
              if (!locked) onChange(option.mode)
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: locked ? 'not-allowed' : 'pointer',
              opacity: locked ? 0.4 : 1,
              background: mode === option.mode ? 'var(--bg-surface-raised)' : 'transparent',
              color: mode === option.mode ? 'var(--accent)' : 'var(--text-muted)',
              boxShadow: mode === option.mode ? 'var(--shadow-sm)' : 'none',
              transition: 'all 120ms ease'
            }}
          >
            {option.icon}
          </button>
        )
      })}
    </div>
  )
}
