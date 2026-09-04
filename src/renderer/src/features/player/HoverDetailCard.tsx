import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { getStoredFontScale } from '../../theme'
import type { DetailField } from './CompendiumDetailModal'

interface HoverDetailCardProps {
  title?: string
  subtitle?: string
  fields?: DetailField[]
  description?: string
  extra?: { label: string; value: string }
  /** Renders this raw HTML instead of the title/fields/description layout above — e.g. a full ```statblock render (see InitiativeTracker.tsx's monster search dropdown), which already carries its own name/CR/etc. and would just duplicate `title` if both were shown. When set, every other content prop is ignored. */
  bodyHtml?: string
  /** Overrides CARD_WIDTH — a full statblock wants more room than a plain field list. */
  width?: number
  /** Default true — redirects wheel-scrolling into the tooltip's own content while hovering (see the wheel effect's own doc comment), since the underlying row it's attached to normally isn't itself something worth scrolling. Set false when `children` sits inside a scrollable list of its own (e.g. InitiativeTracker.tsx's monster search dropdown) where a wheel over one row should keep scrolling that list, not hijack it into a tooltip most rows won't even need to scroll. */
  interceptWheel?: boolean
  children: ReactNode
}

const CARD_WIDTH = 320
const OFFSET = 32
// Smaller than OFFSET on purpose — the card anchors above the cursor (see
// handleMove/the translateY below), and a full OFFSET gap there left a
// noticeable dead zone between the cursor and the card's bottom edge.
const VERTICAL_OFFSET = 12

/**
 * Wraps a whole entry card (attack/spell/item) so hovering anywhere on it
 * shows a read-only stat-block tooltip that follows the mouse — the primary
 * way to inspect an entry, replacing a click-to-open modal for the common
 * "just let me see what this does" case. Rendered through a portal so it
 * isn't clipped by the scrollable tab panel.
 *
 * Positioning anchors the card's bottom edge just above the cursor (via
 * translateY(-100%), so the card's actual height never needs to be guessed
 * ahead of a render) and only nudges it down by the exact overflow amount if
 * the (measured) card would run off the top of the screen — so it stays
 * close to the mouse instead of jumping far away.
 * While hovering, wheel scrolling is redirected into the tooltip's own
 * content instead of the page underneath, since the tooltip follows the
 * mouse and you can't move onto it to scroll it directly. Native
 * addEventListener with {passive:false} is required here — React 17+
 * attaches synthetic wheel handlers as passive, silently ignoring
 * preventDefault().
 */
export function HoverDetailCard({ title, subtitle, fields, description, extra, bodyHtml, width, interceptWheel = true, children }: HoverDetailCardProps): JSX.Element {
  const cardWidth = width ?? CARD_WIDTH
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const posRef = useRef(pos)
  posRef.current = pos
  // Every attack/spell/skill/ability row on the sheet wraps its own
  // HoverDetailCard, so `onMouseMove` here fires at raw native event
  // frequency (often 120+/s) across dozens of rows at once. Calling setPos
  // straight from that handler used to mean a React re-render *and* the
  // getBoundingClientRect() below on every single one of those events — real
  // layout-thrashing, felt as the whole app's input queue backing up (a
  // scroll gesture right after moving the mouse would visibly stall then
  // "catch up"). Coalescing into at most one update per animation frame
  // caps the real work to the display's own refresh rate regardless of how
  // fast the raw mousemove events arrive.
  const rafRef = useRef<number | null>(null)
  const latestMoveRef = useRef<{ clientX: number; clientY: number } | null>(null)

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    },
    []
  )

  // Defaults to the cursor's right, but flips to its left when there isn't
  // room — e.g. weapon/spell rows in the right-side panel, where clamping
  // the card to stay on-screen used to land it right on top of the row's
  // own buttons (prepare/edit/delete) instead of actually moving out of
  // the way of them.
  // `e.clientX/Y` and `window.innerWidth/Height` are always real screen
  // pixels, regardless of the app-wide transform: scale() wrapper (see
  // App.tsx) — but this card renders through a portal into that same
  // transformed subtree as a `position: fixed` element, so its CSS
  // left/top are read in the wrapper's *local*, pre-scale coordinate
  // system. Dividing by the current scale is what keeps the tooltip glued
  // to the actual cursor instead of drifting away from it as scale increases.
  function handleMove(e: React.MouseEvent): void {
    latestMoveRef.current = { clientX: e.clientX, clientY: e.clientY }
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const move = latestMoveRef.current
      if (!move) return
      const scale = getStoredFontScale()
      const spaceRight = window.innerWidth - move.clientX - OFFSET
      const x = spaceRight >= cardWidth + 8 ? move.clientX + OFFSET : Math.max(8, move.clientX - OFFSET - cardWidth)
      // `top` anchors the card's BOTTOM edge (see the translateY(-100%) on
      // the card itself below), not its top — the whole card sits above the
      // cursor rather than dropping down over whatever's below it, without
      // needing to know the card's height ahead of a render to do it.
      setPos({ x: x / scale, y: (move.clientY - VERTICAL_OFFSET) / scale })
    })
  }

  // Measure the actual rendered card after each move and nudge it down only if it would run past the top edge (rare — a very tall card near the top of the screen) — keeps it close to the cursor instead of jumping far away.
  useLayoutEffect(() => {
    if (!pos || !cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const overflowTop = 8 - rect.top
    if (overflowTop > 0.5) {
      const scale = getStoredFontScale()
      setPos((prev) => (prev ? { ...prev, y: prev.y + overflowTop / scale } : prev))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos?.x, pos?.y])

  useEffect(() => {
    if (!interceptWheel) return
    const el = wrapperRef.current
    if (!el) return
    function handleWheel(e: WheelEvent): void {
      // cardRef, not contentRef — cardRef is the actual scrolling element
      // for both branches (see the maxHeight/overflowY above); contentRef is
      // just the plain (non-overflowing) content inside it.
      if (!posRef.current || !cardRef.current) return
      e.preventDefault()
      cardRef.current.scrollTop += e.deltaY
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [interceptWheel])

  function handleLeave(): void {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    setPos(null)
  }

  return (
    <div ref={wrapperRef} onMouseMove={handleMove} onMouseLeave={handleLeave}>
      {children}
      {pos &&
        createPortal(
          <div
            ref={cardRef}
            style={{
              position: 'fixed',
              left: pos.x,
              top: pos.y,
              transform: 'translateY(-100%)',
              width: cardWidth,
              maxHeight: '80vh',
              overflowY: 'auto',
              zIndex: 3000,
              pointerEvents: 'none'
            }}
            className={bodyHtml === undefined ? 'gb-card' : 'gb-hover-statblock'}
          >
            {bodyHtml !== undefined ? (
              // No extra card chrome here — renderStatblockHtml's own markup
              // already opens with its own .gb-statblock box (border, accent
              // top edge, background), so wrapping it in this component's own
              // .gb-card would just nest one bordered box inside another.
              // This div is purely a transparent scroll container.
              <div ref={contentRef} dangerouslySetInnerHTML={{ __html: bodyHtml }} />
            ) : (
              <div ref={contentRef} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--accent)' }}>{title}</div>
                  {subtitle && <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--text-secondary)' }}>{subtitle}</div>}
                </div>
                {fields && fields.length > 0 && (
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
            )}
          </div>,
          document.body
        )}
    </div>
  )
}
