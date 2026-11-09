import { getStoredFontScale } from '../theme'

/**
 * How much bigger an element shows on screen than its own CSS pixels: the
 * font-size setting's scale times the workspace canvas's zoom, when it sits
 * on the canvas. Divide a distance measured in mouse (screen) pixels by this
 * to get the element's own pixels.
 */
export function renderedScale(el: HTMLElement | null): number {
  if (!el || el.offsetWidth === 0) return getStoredFontScale()
  return el.getBoundingClientRect().width / el.offsetWidth
}
