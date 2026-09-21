import { useEffect, useRef, useState, type ReactNode } from 'react'
import { getStoredFontScale } from '../theme'
import { useMountAnimation } from './useMountAnimation'

export interface ContextMenuItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
  danger?: boolean
}

export interface ContextMenuState {
  x: number
  y: number
  items: ContextMenuItem[]
}

/** Right-click menu positioned at the cursor, clamped inside the viewport. Closes on outside click, Escape, or picking an item. */
export function ContextMenu({
  state,
  onClose
}: {
  state: ContextMenuState | null
  onClose: () => void
}): JSX.Element | null {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const { rendered, closing } = useMountAnimation(state !== null)
  // `state` itself goes null the instant the caller closes it — during the
  // closing beat (see useMountAnimation) there'd be nothing left to render
  // (position, items) without remembering the last real one.
  const lastStateRef = useRef<ContextMenuState | null>(null)
  if (state) lastStateRef.current = state
  const shown = state ?? lastStateRef.current

  useEffect(() => {
    // Deliberately doesn't reset `pos` back to null when `state` goes null —
    // the menu stays visible (at its last measured position) through the
    // closing beat (see useMountAnimation/`shown` above); it only actually
    // leaves the DOM once `rendered` flips false.
    if (!state) return
    // Measure after mount so we can clamp to the viewport, then reveal.
    // `state.x`/`state.y` (from the triggering MouseEvent) and window/rect
    // measurements are always in real screen pixels, regardless of the
    // app-wide transform: scale() wrapper (see App.tsx) — but this menu's
    // own `position: fixed` is anchored to that transformed ancestor, so its
    // CSS left/top are read in the wrapper's *local*, pre-scale coordinate
    // system. Dividing by the current scale is what keeps the menu glued to
    // the actual cursor instead of drifting away from it as scale increases.
    const scale = getStoredFontScale()
    const el = menuRef.current
    if (!el) {
      setPos({ x: state.x / scale, y: state.y / scale })
      return
    }
    const rect = el.getBoundingClientRect()
    const x = Math.min(state.x, window.innerWidth - rect.width - 8)
    const y = Math.min(state.y, window.innerHeight - rect.height - 8)
    setPos({ x: Math.max(4, x) / scale, y: Math.max(4, y) / scale })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  useEffect(() => {
    if (!state) return
    function handlePointerDown(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [state, onClose])

  if (!rendered || !shown) return null

  return (
    <div
      ref={menuRef}
      className={closing ? 'gb-card gb-pop-out' : 'gb-card'}
      style={{
        position: 'fixed',
        top: pos?.y ?? shown.y,
        left: pos?.x ?? shown.x,
        visibility: pos ? 'visible' : 'hidden',
        padding: 'var(--space-1)',
        minWidth: 160,
        zIndex: 100,
        boxShadow: 'var(--shadow-lg)'
      }}
    >
      {shown.items.map((item, i) => (
        <button
          key={i}
          type="button"
          onClick={() => {
            item.onSelect()
            onClose()
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            textAlign: 'left',
            padding: '6px var(--space-3)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            background: 'transparent',
            color: item.danger ? 'var(--danger)' : 'var(--text-primary)',
            fontSize: 13,
            cursor: 'pointer'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-sunken)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  )
}
