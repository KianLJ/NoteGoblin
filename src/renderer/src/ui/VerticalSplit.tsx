import { useEffect, useRef, useState, type ReactNode } from 'react'

interface VerticalSplitProps {
  /** The upper region — takes up whatever's left after `bottom`'s fixed height. */
  top: ReactNode
  /** The lower region — starts at `defaultBottomHeight`, drag the handle between them to resize. */
  bottom: ReactNode
  defaultBottomHeight?: number
  minBottomHeight?: number
  maxBottomHeight?: number
  /** Persists the dragged bottom height in localStorage under this key — omit to leave it un-persisted (resets to defaultBottomHeight on remount, e.g. every DM/player mode switch or app restart). */
  heightStorageKey?: string
}

function loadHeight(key: string | undefined, fallback: number, min: number, max: number): number {
  if (!key) return fallback
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? Number(raw) : NaN
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
  } catch {
    return fallback
  }
}

/** Same drag-to-resize idea as ResizableSidebar, just splitting height instead of width — used to give a sidebar a fixed-but-adjustable bottom strip (see RightPanel.tsx/PartySidebar.tsx's chat panel) without needing its own scroll/collapse machinery. */
export function VerticalSplit({
  top,
  bottom,
  defaultBottomHeight = 220,
  minBottomHeight = 120,
  maxBottomHeight = 420,
  heightStorageKey
}: VerticalSplitProps): JSX.Element {
  const [bottomHeight, setBottomHeight] = useState(() => loadHeight(heightStorageKey, defaultBottomHeight, minBottomHeight, maxBottomHeight))
  const [dragging, setDragging] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!heightStorageKey) return
    try {
      localStorage.setItem(heightStorageKey, String(bottomHeight))
    } catch {
      /* best-effort persistence only */
    }
  }, [bottomHeight, heightStorageKey])

  // Tracked on window, not the thin handle itself — same reasoning as
  // ResizableSidebar's drag handling: a fast drag can outrun a narrow target.
  useEffect(() => {
    if (!dragging) return
    function handleMove(e: globalThis.PointerEvent): void {
      if (!wrapperRef.current) return
      const rect = wrapperRef.current.getBoundingClientRect()
      const raw = rect.bottom - e.clientY
      setBottomHeight(Math.min(maxBottomHeight, Math.max(minBottomHeight, raw)))
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
  }, [dragging, minBottomHeight, maxBottomHeight])

  return (
    <div ref={wrapperRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0 }}>{top}</div>
      <div
        onPointerDown={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        title="Drag to resize"
        style={{ height: 6, cursor: 'row-resize', flexShrink: 0, marginTop: -3, marginBottom: -3, position: 'relative', zIndex: 1 }}
      />
      <div style={{ height: bottomHeight, flexShrink: 0, borderTop: '1px solid var(--border-subtle)' }}>{bottom}</div>
    </div>
  )
}
