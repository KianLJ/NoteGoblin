import { describe, expect, it } from 'vitest'
import { hexToHsl, hslMatchingBrightness, luminance } from '../src/renderer/src/color'

describe('hslMatchingBrightness', () => {
  it('keeps the brightness of the colour it replaces', () => {
    for (const like of ['#1a160f', '#453b2c', '#8f8265', '#f2ead6', '#faf6ec']) {
      for (const tone of ['#3f6a80', '#4f6b55', '#c45c8a']) {
        const out = hslMatchingBrightness(hexToHsl(tone).h, hexToHsl(tone).s, like)
        expect(Math.abs(luminance(out) - luminance(like))).toBeLessThan(0.01)
      }
    }
  })
})
