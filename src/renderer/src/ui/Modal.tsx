import { useEffect, type ReactNode } from 'react'
import { useMountAnimation } from './useMountAnimation'

interface ModalProps {
  onClose: () => void
  children: ReactNode
  width?: number
  /** Set false for a flow with real progress to lose (e.g. a multi-step wizard) — disables Escape and backdrop-click, so the only way out is whatever explicit close/cancel control the content itself provides. Defaults true (close on Escape or backdrop click), matching every existing caller. */
  dismissible?: boolean
  /**
   * Whether the modal should be showing — always render `<Modal>` itself
   * (rather than the old `{fooOpen && <Modal>}` pattern) so it can keep
   * itself mounted for its own closing animation (see useMountAnimation)
   * instead of the parent yanking it out of the tree the instant this flips
   * to false, before gb-pop-out ever gets a chance to play. Defaults true so
   * a caller that genuinely always wants it open when rendered doesn't need
   * to pass this.
   */
  open?: boolean
}

/** Fixed-position overlay + centered gb-card panel — for flows that need real focus (wizards, confirmations), unlike the corner popovers used elsewhere (CharacterSwitcher, TableBar). Closes on Escape or backdrop click unless `dismissible={false}`. */
export function Modal({ onClose, children, width = 560, dismissible = true, open = true }: ModalProps): JSX.Element | null {
  const { rendered, closing } = useMountAnimation(open)

  useEffect(() => {
    if (!dismissible || !open) return
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, dismissible, open])

  if (!rendered) return null

  return (
    <div
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose()
      }}
      className={closing ? 'gb-pop-out' : undefined}
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
        className={closing ? 'gb-card gb-pop-out' : 'gb-card'}
        style={{
          width,
          // % of the fixed, inset:0 backdrop (above), not vh/vw — see
          // Bestiary.tsx's identical comment for why.
          maxWidth: 'calc(100% - var(--space-6))',
          maxHeight: 'calc(100% - var(--space-6))',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-lg)'
        }}
      >
        {children}
      </div>
    </div>
  )
}
