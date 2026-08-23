import type { DiceRollLogEntry } from '@shared/dice'

/** Anchored below the Dice tab button by whichever parent sets `position: relative` on it — see useDiceRollToast.ts. */
export function DiceRollToast({ entry }: { entry: DiceRollLogEntry }): JSX.Element {
  const text =
    entry.private && entry.total === null
      ? `${entry.rollerName} rolled ${entry.formula} privately`
      : `${entry.rollerName} rolled ${entry.formula}: ${entry.total ?? '—'}`
  return (
    <div
      className="gb-toast-fade"
      style={{
        position: 'absolute',
        top: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        marginTop: 4,
        background: 'var(--bg-surface-raised)',
        border: '1px solid var(--accent)',
        borderRadius: 'var(--radius-sm)',
        padding: '4px 8px',
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--text-primary)',
        whiteSpace: 'nowrap',
        boxShadow: 'var(--shadow-md)',
        zIndex: 10,
        pointerEvents: 'none'
      }}
    >
      {text}
    </div>
  )
}
