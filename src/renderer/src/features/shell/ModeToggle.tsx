import { DmModeIcon, PlayerModeIcon, WorkshopModeIcon } from './icons'

export type Mode = 'dm' | 'player'

interface ModeToggleProps {
  mode: Mode
  onChange: (mode: Mode) => void
  /** Blocks switching TO this mode — e.g. Player is locked while you're hosting, DM is locked while you've joined someone else's session — so you can't accidentally step away mid-session. */
  disabledMode?: Mode
  disabledReason?: string
  /** The Homebrew Workshop is open — it sits on top of whichever mode you were in, which stays running underneath (a hosted session keeps going). */
  workshop: boolean
  onWorkshop: () => void
}

const OPTIONS: Array<{ mode: Mode | 'workshop'; label: string; icon: JSX.Element }> = [
  { mode: 'dm', label: 'DM Mode', icon: <DmModeIcon /> },
  { mode: 'player', label: 'Player Mode', icon: <PlayerModeIcon /> },
  { mode: 'workshop', label: 'Homebrew Workshop', icon: <WorkshopModeIcon /> }
]

export function ModeToggle({ mode, onChange, disabledMode, disabledReason, workshop, onWorkshop }: ModeToggleProps): JSX.Element {
  const selected = workshop ? 'workshop' : mode
  return (
    <div
      role="tablist"
      aria-label="Switch between DM mode, Player mode and the Homebrew Workshop"
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
        const active = selected === option.mode
        return (
          <button
            key={option.mode}
            role="tab"
            aria-selected={active}
            aria-disabled={locked}
            title={locked ? disabledReason : option.label}
            onClick={() => {
              if (locked) return
              if (option.mode === 'workshop') onWorkshop()
              else onChange(option.mode)
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
              background: active ? 'var(--bg-surface-raised)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--text-muted)',
              boxShadow: active ? 'var(--shadow-sm)' : 'none',
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
