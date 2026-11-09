import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { getStoredFontScale } from '../../theme'
import { popupLayer } from '../../ui/popupLayer'
import type { DetailField } from './CompendiumDetailModal'
import { HOVER_MARGIN as MARGIN, placeHoverCard } from '@shared/hoverPlacement'

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
  /** Wraps `children` in an inline span instead of a block div, for a hover target inside running text (a feature name in a class table cell). */
  inline?: boolean
  children: ReactNode
}

const CARD_WIDTH = 320
/**
 * Wraps a whole entry card (attack/spell/item) so hovering anywhere on it
 * shows a read-only stat-block tooltip — the primary way to inspect an
 * entry, replacing a click-to-open modal for the common "just let me see
 * what this does" case. Rendered through a portal so it isn't clipped by
 * the scrollable tab panel.
 *
 * The card is placed beside what it explains (see placeHoverCard), measured
 * before it's painted, so it never covers the thing you're pointing at.
 * While hovering, wheel scrolling is redirected into the tooltip's own
 * content instead of the page underneath, since you can't move onto the
 * tooltip to scroll it directly. Native addEventListener with
 * {passive:false} is required here — React 17+ attaches synthetic wheel
 * handlers as passive, silently ignoring preventDefault().
 */
export function HoverDetailCard({ title, subtitle, fields, description, extra, bodyHtml, width, interceptWheel = true, inline = false, children }: HoverDetailCardProps): JSX.Element {
  const cardWidth = width ?? CARD_WIDTH
  // Shown while hovered; `tick` re-places it as the mouse moves (the target may have scrolled).
  const [pos, setPos] = useState<{ tick: number } | null>(null)
  const wrapperRef = useRef<HTMLElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const posRef = useRef(pos)
  posRef.current = pos
  // Every row on the sheet wraps its own HoverDetailCard, so mousemove fires at raw event frequency across dozens
  // of rows: coalesced into at most one re-place per animation frame.
  const rafRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    },
    []
  )

  function handleMove(): void {
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      setPos((p) => ({ tick: (p?.tick ?? 0) + 1 }))
    })
  }

  // Placed before paint: measure the card at full height, then put it where it fits. The card renders inside the
  // app's font-scale, so its CSS pixels are screen pixels divided by the scale.
  useLayoutEffect(() => {
    const card = cardRef.current
    const target = wrapperRef.current
    if (!pos || !card || !target) return
    const scale = getStoredFontScale()
    card.style.width = `${Math.min(cardWidth * scale, window.innerWidth - 2 * MARGIN) / scale}px`
    card.style.maxHeight = 'none'
    const natural = card.getBoundingClientRect()
    const r = target.getBoundingClientRect()
    const at = placeHoverCard(r, { w: natural.width, h: natural.height }, { w: window.innerWidth, h: window.innerHeight })
    card.style.left = `${at.x / scale}px`
    card.style.top = `${at.y / scale}px`
    card.style.maxHeight = `${at.maxH / scale}px`
    card.style.visibility = 'visible'
  }, [pos, cardWidth])

  useEffect(() => {
    if (!interceptWheel) return
    const el = wrapperRef.current
    if (!el) return
    function handleWheel(e: WheelEvent): void {
      // cardRef, not contentRef — cardRef is the actual scrolling element
      // for both branches (see the maxHeight/overflowY above); contentRef is
      // just the plain (non-overflowing) content inside it.
      if (!posRef.current || !cardRef.current) return
      // A card whose text all fits has nothing to scroll, so the wheel keeps scrolling the page as normal.
      if (cardRef.current.scrollHeight <= cardRef.current.clientHeight) return
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

  const Wrapper = inline ? 'span' : 'div'
  return (
    <Wrapper ref={wrapperRef as never} onMouseEnter={handleMove} onMouseMove={handleMove} onMouseLeave={handleLeave}>
      {children}
      {pos &&
        createPortal(
          <div
            ref={cardRef}
            style={{
              position: 'fixed',
              left: 0,
              top: 0,
              // Hidden until placed (above) — no flash at the corner.
              visibility: 'hidden',
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
          // Inside the app's font-scale (so its text scales with everything else, and its maths above holds).
          popupLayer()
        )}
    </Wrapper>
  )
}
