import { describe, expect, it } from 'vitest'
import { placeHoverCard } from '../shared/hoverPlacement'

const overlaps = (a: { left: number; top: number; right: number; bottom: number }, c: { x: number; y: number; w: number; h: number }): boolean =>
  c.x < a.right && c.x + c.w > a.left && c.y < a.bottom && c.y + c.h > a.top

describe('hover card placement', () => {
  it('goes beside a small target, right when there is room, else left', () => {
    const tile = { left: 100, top: 200, right: 180, bottom: 280 }
    expect(placeHoverCard(tile, { w: 320, h: 200 }, { w: 1200, h: 800 })).toMatchObject({ x: 190, y: 200 })
    const nearRight = { left: 1000, top: 200, right: 1080, bottom: 280 }
    expect(placeHoverCard(nearRight, { w: 320, h: 200 }, { w: 1200, h: 800 })).toMatchObject({ x: 670 })
  })

  it('never covers its target, at any window size', () => {
    for (const view of [
      { w: 1600, h: 900 },
      { w: 800, h: 600 },
      { w: 420, h: 700 },
      { w: 360, h: 480 }
    ]) {
      for (const target of [
        { left: 8, top: 8, right: 88, bottom: 88 },
        { left: view.w / 2 - 40, top: view.h / 2 - 40, right: view.w / 2 + 40, bottom: view.h / 2 + 40 },
        // A row as wide as the window.
        { left: 0, top: view.h - 60, right: view.w, bottom: view.h - 20 },
        { left: 0, top: 20, right: view.w, bottom: 60 }
      ]) {
        const at = placeHoverCard(target, { w: 320, h: 400 }, view)
        const shown = { x: at.x, y: at.y, w: at.w, h: Math.min(400, at.maxH) }
        expect(overlaps(target, shown)).toBe(false)
        expect(at.x).toBeGreaterThanOrEqual(8)
        expect(at.x + at.w).toBeLessThanOrEqual(view.w - 8)
        expect(at.y).toBeGreaterThanOrEqual(8)
        expect(at.y + shown.h).toBeLessThanOrEqual(view.h - 8)
      }
    }
  })
})
