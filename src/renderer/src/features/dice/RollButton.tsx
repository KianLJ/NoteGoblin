import { useState, type CSSProperties } from 'react'
import type { AdvantageMode } from '@shared/dice'
import { ContextMenu, type ContextMenuState } from '../../ui/ContextMenu'

interface RollButtonProps {
  /** The bonus text to show, e.g. "+5" — this button IS the bonus display, not a separate icon next to it. */
  value: string
  /** Fired on a plain left-click (rolls at whatever the sheet's own computed advantage/disadvantage is, or 'normal' if none applies) or after picking Advantage/Disadvantage from the right-click menu. */
  onRoll: (advantage: AdvantageMode) => void
  /** Whether advantage/disadvantage even applies here — true for ability checks/saves/skills/attacks, false for a damage roll (5e has no such thing as "damage with advantage"). Hides the right-click menu entirely when false. */
  supportsAdvantage?: boolean
  size?: 'sm' | 'md'
}

const SIZE: Record<'sm' | 'md', CSSProperties> = {
  sm: { fontSize: 12, padding: '2px 8px' },
  md: { fontSize: 14, padding: '3px 10px' }
}

/**
 * Every rollable bonus on the character sheet (ability check, save, skill,
 * attack) renders through this — a real, obviously-pressable pill button
 * (not a plain number with a small icon tacked on) that opens the dramatic
 * roll popup rather than rolling immediately; see RollAnimationOverlay.tsx's
 * "pending" phase for the actual second click that rolls it. Right-click
 * offers an explicit Advantage/Disadvantage override, since D&D calls for
 * that far too often for a left-click default to always be right.
 */
export function RollButton({ value, onRoll, supportsAdvantage = true, size = 'md' }: RollButtonProps): JSX.Element {
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [hover, setHover] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => onRoll('normal')}
        onContextMenu={
          supportsAdvantage
            ? (e) => {
                e.preventDefault()
                setMenu({
                  x: e.clientX,
                  y: e.clientY,
                  items: [
                    { label: 'Roll normally', onSelect: () => onRoll('normal') },
                    { label: 'Roll with Advantage', onSelect: () => onRoll('advantage') },
                    { label: 'Roll with Disadvantage', onSelect: () => onRoll('disadvantage') }
                  ]
                })
              }
            : undefined
        }
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title={supportsAdvantage ? 'Click to roll — right-click for advantage/disadvantage' : 'Click to roll'}
        style={{
          ...SIZE[size],
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 'var(--radius-sm)',
          border: `1px solid ${hover ? 'var(--accent-hover)' : 'var(--accent)'}`,
          background: hover ? 'var(--accent)' : 'var(--accent-subtle)',
          color: hover ? 'var(--accent-contrast, #fff)' : 'var(--accent-hover)',
          fontWeight: 700,
          cursor: 'pointer',
          transition: 'background 0.1s ease, color 0.1s ease'
        }}
      >
        {value}
      </button>
      {supportsAdvantage && <ContextMenu state={menu} onClose={() => setMenu(null)} />}
    </>
  )
}
