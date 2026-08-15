import { useEffect, useRef, useState, type ReactNode } from 'react'

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

  useEffect(() => {
    if (!state) {
      setPos(null)
      return
    }
    // Measure after mount so we can clamp to the viewport, then reveal.
    const el = menuRef.current
    if (!el) {
      setPos({ x: state.x, y: state.y })
      return
    }
    const rect = el.getBoundingClientRect()
    const x = Math.min(state.x, window.innerWidth - rect.width - 8)
    const y = Math.min(state.y, window.innerHeight - rect.height - 8)
    setPos({ x: Math.max(4, x), y: Math.max(4, y) })
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

  if (!state) return null

  return (
    <div
      ref={menuRef}
      className="gb-card"
      style={{
        position: 'fixed',
        top: pos?.y ?? state.y,
        left: pos?.x ?? state.x,
        visibility: pos ? 'visible' : 'hidden',
        padding: 'var(--space-1)',
        minWidth: 160,
        zIndex: 100,
        boxShadow: 'var(--shadow-lg)'
      }}
    >
      {state.items.map((item, i) => (
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
