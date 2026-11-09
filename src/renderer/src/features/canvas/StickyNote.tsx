import { putEntry } from './canvasEntries'
import type { CanvasMode } from '@shared/canvasTools'

export const STICKY_COLORS = ['yellow', 'pink', 'mint', 'blue'] as const
export type StickyColor = (typeof STICKY_COLORS)[number]

export interface Sticky {
  kind: 'sticky'
  id: string
  text: string
  color: StickyColor
}

/** A sticky note's text — just for you, on this computer; never a campaign note. */
export function StickyNote({ mode, sticky }: { mode: CanvasMode; sticky: Sticky }): JSX.Element {
  return (
    <textarea
      className="gb-sticky-text"
      value={sticky.text}
      placeholder="Jot something down…"
      aria-label="Sticky note"
      onChange={(e) => putEntry(mode, { ...sticky, text: e.target.value })}
    />
  )
}

/** The sticky's colour swatch in its title bar — a click moves to the next colour. */
export function StickyColorButton({ mode, sticky }: { mode: CanvasMode; sticky: Sticky }): JSX.Element {
  const next = STICKY_COLORS[(STICKY_COLORS.indexOf(sticky.color) + 1) % STICKY_COLORS.length]
  return (
    <button
      type="button"
      className={`gb-sticky-swatch gb-sticky-swatch--${next}`}
      title="Change colour"
      aria-label="Change the sticky note's colour"
      onClick={() => putEntry(mode, { ...sticky, color: next })}
    />
  )
}
