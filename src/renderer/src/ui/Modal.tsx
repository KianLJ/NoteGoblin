import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { useMountAnimation } from './useMountAnimation'
import { createPortal } from 'react-dom'
import { popupLayer } from './popupLayer'

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
  const panelRef = useRef<HTMLDivElement>(null)

  // Keyboard focus moves into the dialog when it opens (unless something in it already took it, e.g. an autoFocus
  // field), and goes back to whatever had it before once it closes — so keyboard users aren't left behind it.
  useEffect(() => {
    if (!open) return
    const before = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    if (panel && !panel.contains(document.activeElement)) (focusables(panel)[0] ?? panel).focus()
    return () => {
      if (before && document.contains(before)) before.focus()
    }
  }, [open, rendered])

  // Tab and Shift+Tab wrap around inside the dialog instead of wandering off to the page behind it.
  function trapTab(e: ReactKeyboardEvent<HTMLDivElement>): void {
    if (e.key !== 'Tab') return
    const items = focusables(e.currentTarget)
    if (items.length === 0) {
      e.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && (document.activeElement === first || document.activeElement === e.currentTarget)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  useEffect(() => {
    if (!dismissible || !open) return
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, dismissible, open])

  if (!rendered) return null

  return createPortal(
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
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onKeyDown={trapTab}
        className={closing ? 'gb-card gb-pop-out' : 'gb-card'}
        style={{
          outline: 'none',
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
    </div>,
    popupLayer()
  )
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

/** What Tab can land on inside `root`, in order — skipping anything hidden. */
function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement)
}
