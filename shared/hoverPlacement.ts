// Space kept from the screen's edges, and between the card and what it explains.
export const HOVER_MARGIN = 8
const MARGIN = HOVER_MARGIN
const GAP = 10

/**
 * Where a hover card goes, in screen pixels: beside its target (right, else
 * left), or failing that above or below it (whichever has room, else more
 * room) — never over the thing it's explaining, at any window size. Its
 * height is capped to the room it gets (it scrolls inside).
 */
export function placeHoverCard(
  target: { left: number; top: number; right: number; bottom: number },
  card: { w: number; h: number },
  view: { w: number; h: number }
): { x: number; y: number; w: number; maxH: number } {
  const w = Math.min(card.w, view.w - 2 * MARGIN)
  const clampY = (h: number, y: number): number => Math.max(MARGIN, Math.min(y, view.h - MARGIN - h))
  const sideH = Math.min(card.h, view.h - 2 * MARGIN)
  if (target.right + GAP + w <= view.w - MARGIN) return { x: target.right + GAP, y: clampY(sideH, target.top), w, maxH: view.h - 2 * MARGIN }
  if (target.left - GAP - w >= MARGIN) return { x: target.left - GAP - w, y: clampY(sideH, target.top), w, maxH: view.h - 2 * MARGIN }
  const x = Math.max(MARGIN, Math.min(target.left, view.w - MARGIN - w))
  const above = target.top - GAP - MARGIN
  const below = view.h - MARGIN - target.bottom - GAP
  const up = card.h <= above || (card.h > below && above > below)
  const maxH = Math.max(0, up ? above : below)
  return { x, y: up ? target.top - GAP - Math.min(card.h, maxH) : target.bottom + GAP, w, maxH }
}
