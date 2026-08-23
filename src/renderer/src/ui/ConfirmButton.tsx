import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Button } from './Button'

const ARM_MS = 3500

interface ConfirmButtonProps {
  /** Shown normally. */
  label: string
  /** Shown for ARM_MS after the first click, while waiting for the confirming second one — defaults to "Confirm?". */
  confirmLabel?: string
  /** Fires only on the second click, while still armed. */
  onConfirm: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'ghost'
  /** Armed state renders in danger red instead of the accent color — for something irreversible/consequential like leaving a session. Starting/stopping hosting isn't destructive, so it stays unset there. */
  danger?: boolean
  style?: CSSProperties
  title?: string
}

/**
 * A destructive/consequential action (start/stop hosting, leaving a session)
 * that shouldn't fire on a single stray click — the first click just arms it
 * (flips the label to `confirmLabel` for a few seconds), the second click
 * while still armed actually calls `onConfirm`. Clicking elsewhere, waiting
 * out the window, or navigating away all just let it quietly disarm — no
 * modal, no extra state to clean up.
 */
export function ConfirmButton({ label, confirmLabel = 'Confirm?', onConfirm, disabled, variant = 'primary', danger, style, title }: ConfirmButtonProps): JSX.Element {
  const [armed, setArmed] = useState(false)
  const disarmTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => clearTimeout(disarmTimer.current), [])

  function handleClick(): void {
    if (armed) {
      clearTimeout(disarmTimer.current)
      setArmed(false)
      onConfirm()
      return
    }
    setArmed(true)
    disarmTimer.current = setTimeout(() => setArmed(false), ARM_MS)
  }

  return (
    <Button
      type="button"
      variant={armed ? 'primary' : variant}
      onClick={handleClick}
      disabled={disabled}
      title={armed ? 'Click again to confirm' : title}
      style={{ ...(armed && danger ? { background: 'var(--danger)', borderColor: 'var(--danger)' } : null), ...style }}
    >
      {armed ? confirmLabel : label}
    </Button>
  )
}
