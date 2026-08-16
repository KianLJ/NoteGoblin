import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { DetailField } from './CompendiumDetailModal'

interface HoverDetailCardProps {
  title: string
  subtitle?: string
  fields: DetailField[]
  description: string
  extra?: { label: string; value: string }
  children: ReactNode
}

const CARD_WIDTH = 320
const OFFSET = 18

/**
 * Wraps a whole entry card (attack/spell/item) so hovering anywhere on it
 * shows a read-only stat-block tooltip that follows the mouse — the primary
 * way to inspect an entry, replacing a click-to-open modal for the common
 * "just let me see what this does" case. Rendered through a portal so it
 * isn't clipped by the scrollable tab panel.
 *
 * Positioning starts right next to the cursor and only shifts up by the
 * exact overflow amount if the (measured, not guessed) card would run off
 * the bottom — so it stays close to the mouse instead of jumping far away.
 * While hovering, wheel scrolling is redirected into the tooltip's own
 * content instead of the page underneath, since the tooltip follows the
 * mouse and you can't move onto it to scroll it directly. Native
 * addEventListener with {passive:false} is required here — React 17+
 * attaches synthetic wheel handlers as passive, silently ignoring
 * preventDefault().
 */
export function HoverDetailCard({ title, subtitle, fields, description, extra, children }: HoverDetailCardProps): JSX.Element {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const posRef = useRef(pos)
  posRef.current = pos

  function handleMove(e: React.MouseEvent): void {
    const maxX = window.innerWidth - CARD_WIDTH - 8
    const x = Math.min(e.clientX + OFFSET, Math.max(8, maxX))
    setPos({ x, y: e.clientY + OFFSET })
  }

  // Measure the actual rendered card after each move and nudge it up only if it would run past the bottom edge — keeps it close to the cursor instead of the old fixed-height guess that could land it far away.
  useLayoutEffect(() => {
    if (!pos || !cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const overflowBottom = rect.bottom - (window.innerHeight - 8)
    if (overflowBottom > 0.5) {
      setPos((prev) => (prev ? { ...prev, y: Math.max(8, prev.y - overflowBottom) } : prev))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos?.x, pos?.y])

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    function handleWheel(e: WheelEvent): void {
      if (!posRef.current || !contentRef.current) return
      e.preventDefault()
      contentRef.current.scrollTop += e.deltaY
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  return (
    <div ref={wrapperRef} onMouseMove={handleMove} onMouseLeave={() => setPos(null)}>
      {children}
      {pos &&
        createPortal(
          <div
            ref={cardRef}
            style={{
              position: 'fixed',
              left: pos.x,
              top: pos.y,
              width: CARD_WIDTH,
              zIndex: 3000,
              pointerEvents: 'none'
            }}
            className="gb-card"
          >
            <div ref={contentRef} style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '70vh', overflowY: 'auto' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--accent)' }}>{title}</div>
                {subtitle && <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--text-secondary)' }}>{subtitle}</div>}
              </div>
              {fields.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {fields.map((f) => (
                    <div key={f.label} style={{ fontSize: 12 }}>
                      <strong>{f.label}: </strong>
                      <span style={{ color: 'var(--text-secondary)' }}>{f.value}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                {description || <span style={{ color: 'var(--text-muted)' }}>No description.</span>}
              </div>
              {extra && (
                <div style={{ fontSize: 12 }}>
                  <strong>{extra.label}. </strong>
                  <span style={{ color: 'var(--text-secondary)' }}>{extra.value}</span>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
