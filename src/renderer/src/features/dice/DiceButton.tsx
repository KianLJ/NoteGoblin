import { useEffect, useState } from 'react'
import { DiceIcon } from '../campaigns/panelIcons'
import { DiceTray } from './DiceTray'

/**
 * The round Dice button in the canvas's bottom-right corner. The tray pops
 * out above it (it isn't a box on the canvas) and stays open while you roll —
 * the button, a right-click on it, or Escape puts it away. The roll log lives
 * in diceLogStore, so nothing is lost while it's shut.
 */
export function DiceButton({ sessionId }: { sessionId: string | null }): JSX.Element {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div style={{ position: 'relative' }}>
      {open && (
        <div className="gb-card gb-dice-popover">
          <DiceTray sessionId={sessionId} />
        </div>
      )}
      <button
        type="button"
        className={open ? 'gb-canvas-round gb-canvas-round--open' : 'gb-canvas-round'}
        title={open ? 'Put the dice away' : 'Dice'}
        aria-label="Dice"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onContextMenu={(e) => {
          e.preventDefault()
          setOpen(false)
        }}
      >
        <DiceIcon />
      </button>
    </div>
  )
}
