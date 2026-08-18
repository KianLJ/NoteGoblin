import { useEffect, useRef, useState, type ReactNode } from 'react'

interface ResizableSidebarProps {
  defaultWidth?: number
  minWidth?: number
  maxWidth?: number
  /** The scrollable main content — the drag handle only spans this region's height, never the footer's, so footer buttons stay reliably clickable. */
  children: ReactNode
  /** Rendered below children, same width, outside the drag handle's reach entirely. */
  footer?: ReactNode
  /** Which edge the drag handle sits on — 'right' for a left-docked sidebar, 'left' for a right-docked one. */
  handleSide?: 'left' | 'right'
  /** Persists the collapsed state in localStorage under this key — omit to leave it un-persisted (resets to expanded on remount). */
  collapseStorageKey?: string
}

function loadCollapsed(key: string | undefined): boolean {
  if (!key) return false
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

/** Wraps a docked sidebar with a drag handle on one edge, and a small always-visible tab to collapse/expand it. Owns its own width and collapsed state locally — nothing outside needs to know either. */
export function ResizableSidebar({
  defaultWidth = 220,
  minWidth = 160,
  maxWidth = 480,
  children,
  footer,
  handleSide = 'right',
  collapseStorageKey
}: ResizableSidebarProps): JSX.Element {
  const [width, setWidth] = useState(defaultWidth)
  const [dragging, setDragging] = useState(false)
  const [collapsed, setCollapsed] = useState(() => loadCollapsed(collapseStorageKey))
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!collapseStorageKey) return
    try {
      localStorage.setItem(collapseStorageKey, collapsed ? '1' : '0')
    } catch {
      /* best-effort persistence only */
    }
  }, [collapsed, collapseStorageKey])

  // Tracked on window rather than the (6px-wide) handle itself: pointer
  // capture on that thin a target is unreliable during a fast drag — the
  // cursor can outrun it, events stop arriving, and the drag never ends.
  // Window-level listeners keep firing no matter where the cursor ends up.
  useEffect(() => {
    if (!dragging) return

    function handleMove(e: globalThis.PointerEvent): void {
      if (!wrapperRef.current) return
      const rect = wrapperRef.current.getBoundingClientRect()
      const raw = handleSide === 'right' ? e.clientX - rect.left : rect.right - e.clientX
      setWidth(Math.min(maxWidth, Math.max(minWidth, raw)))
    }
    function handleUp(): void {
      setDragging(false)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [dragging, handleSide, minWidth, maxWidth])

  // A big, unmissable tab flush against the panel's outer edge — same size,
  // same vertical spot, whether expanded (points "hide me") or collapsed
  // (points "show me"), so it's never a matter of hunting for a tiny sliver.
  //
  // The anchor side flips between the two states, and that's deliberate,
  // not a bug: expanded, the tab sits inside a real (e.g. 220px) box, so
  // anchoring to its outer edge (`outward`) places it visibly at that
  // border. Collapsed, the wrapper is a 0-width box sitting exactly at that
  // same border — anchoring to `outward` there would grow the tab into the
  // void where the panel used to be, off the edge of the window entirely.
  // Anchoring to the opposite (`inward`) side instead grows it into the
  // remaining visible content, which is the only place it can actually show.
  const outward = handleSide === 'right' ? 'right' : 'left'
  const inward = outward === 'right' ? 'left' : 'right'
  const anchor = collapsed ? inward : outward
  const tab = (
    <button
      type="button"
      title={collapsed ? 'Show panel' : 'Hide panel'}
      onClick={() => setCollapsed((c) => !c)}
      style={{
        position: 'absolute',
        top: '50%',
        transform: 'translateY(-50%)',
        [anchor]: 0,
        width: 20,
        height: 64,
        border: '1px solid var(--border-subtle)',
        borderRadius: anchor === 'right' ? '8px 0 0 8px' : '0 8px 8px 0',
        boxShadow: 'var(--shadow-md)',
        background: 'var(--bg-surface-raised)',
        color: 'var(--text-muted)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 6
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'var(--accent-hover)'
        e.currentTarget.style.background = 'var(--accent-subtle)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--text-muted)'
        e.currentTarget.style.background = 'var(--bg-surface-raised)'
      }}
    >
      <Chevron direction={collapsed ? (handleSide === 'right' ? 'right' : 'left') : handleSide === 'right' ? 'left' : 'right'} />
    </button>
  )

  if (collapsed) {
    return <div style={{ position: 'relative', width: 0, flexShrink: 0 }}>{tab}</div>
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width, flexShrink: 0, display: 'flex' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          <div style={{ height: '100%' }}>{children}</div>
          <div
            onPointerDown={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            title="Drag to resize"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              [handleSide]: -3,
              width: 6,
              cursor: 'col-resize',
              zIndex: 5
            }}
          />
          {tab}
        </div>
        {footer}
      </div>
    </div>
  )
}

function Chevron({ direction }: { direction: 'left' | 'right' }): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={direction === 'right' ? 'M5 3l6 5-6 5' : 'M11 3l-6 5 6 5'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
