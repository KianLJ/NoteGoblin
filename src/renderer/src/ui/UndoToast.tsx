import { useEffect } from 'react'
import { dismissUndo, undoLast, useUndoOffer } from './undo'
import './undoToast.css'

/**
 * The "Deleted X · Undo" pop-up at the foot of the window (undo.ts). While it's up, Ctrl+Z outside a text box undoes
 * that deletion — caught before anything else hears it, so the battle map doesn't also undo its own last change.
 * Typing keeps its own Ctrl+Z.
 */
export function UndoToast(): JSX.Element | null {
  const offer = useUndoOffer()
  useEffect(() => {
    if (!offer) return
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"], .cm-editor')) return
      e.preventDefault()
      e.stopImmediatePropagation()
      undoLast()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [offer])
  if (!offer) return null
  return (
    <div className="gb-undo" role="status" key={offer.id}>
      <span className="gb-undo-label">{offer.label}</span>
      <button type="button" className="gb-undo-btn" onClick={undoLast}>
        Undo
      </button>
      <button type="button" className="gb-undo-close" aria-label="Dismiss" onClick={dismissUndo}>
        ×
      </button>
      <span className="gb-undo-timer" aria-hidden="true" />
    </div>
  )
}
