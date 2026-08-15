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
}

/** Wraps a docked sidebar with a drag handle on one edge. Owns its own width locally — nothing outside needs to know it. */
export function ResizableSidebar({
  defaultWidth = 220,
  minWidth = 160,
  maxWidth = 480,
  children,
  footer,
  handleSide = 'right'
}: ResizableSidebarProps): JSX.Element {
  const [width, setWidth] = useState(defaultWidth)
  const [dragging, setDragging] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

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
        </div>
        {footer}
      </div>
    </div>
  )
}
