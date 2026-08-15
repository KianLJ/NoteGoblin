export type Mode = 'dm' | 'player'

interface ModeToggleProps {
  mode: Mode
  onChange: (mode: Mode) => void
}

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
      {(['dm', 'player'] as const).map((option) => (
        <button
          key={option}
          role="tab"
          aria-selected={mode === option}
          onClick={() => onChange(option)}
          style={{
            padding: '6px 18px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.03em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            background: mode === option ? 'var(--bg-surface-raised)' : 'transparent',
            color: mode === option ? 'var(--accent)' : 'var(--text-muted)',
            boxShadow: mode === option ? 'var(--shadow-sm)' : 'none',
            transition: 'all 120ms ease'
          }}
        >
          {option === 'dm' ? 'DM' : 'Player'}
        </button>
      ))}
    </div>
  )
}
