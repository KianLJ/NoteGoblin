import { useEffect, type ReactNode } from 'react'

interface ModalProps {
  onClose: () => void
  children: ReactNode
  width?: number
  /** Set false for a flow with real progress to lose (e.g. a multi-step wizard) — disables Escape and backdrop-click, so the only way out is whatever explicit close/cancel control the content itself provides. Defaults true (close on Escape or backdrop click), matching every existing caller. */
  dismissible?: boolean
}

/** Fixed-position overlay + centered gb-card panel — for flows that need real focus (wizards, confirmations), unlike the corner popovers used elsewhere (CharacterSwitcher, TableBar). Closes on Escape or backdrop click unless `dismissible={false}`. */
export function Modal({ onClose, children, width = 560, dismissible = true }: ModalProps): JSX.Element {
  useEffect(() => {
    if (!dismissible) return
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, dismissible])

  return (
    <div
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20, 17, 12, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
    >
      <div
        className="gb-card"
        style={{
          width,
          maxWidth: 'calc(100vw - var(--space-6))',
          maxHeight: 'calc(100vh - var(--space-6))',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-lg)'
        }}
      >
        {children}
      </div>
    </div>
  )
}
