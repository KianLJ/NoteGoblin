export interface Hsl {
  h: number
  s: number
  l: number
}

export function hexToHsl(hex: string): Hsl {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      default:
        h = (r - g) / d + 4
    }
    h *= 60
  }
  return { h, s: s * 100, l: l * 100 }
}

export function hslToHex(h: number, s: number, l: number): string {
  const sat = Math.min(100, Math.max(0, s)) / 100
  const light = Math.min(100, Math.max(0, l)) / 100
  const hue = ((h % 360) + 360) % 360

  if (sat === 0) {
    const v = Math.round(light * 255)
    const hex = v.toString(16).padStart(2, '0')
    return `#${hex}${hex}${hex}`
  }

  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat
  const p = 2 * light - q
  const hueToRgb = (t: number): number => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  const r = Math.round(hueToRgb(hue / 360 + 1 / 3) * 255)
  const g = Math.round(hueToRgb(hue / 360) * 255)
  const b = Math.round(hueToRgb(hue / 360 - 1 / 3) * 255)
  const toHex = (v: number): string => v.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/** Normalizes any CSS color string (hex, rgb()/rgba(), or a named color) to `#rrggbb` — `<input type="color">` only accepts that exact format, but `getComputedStyle` hands back resolved values as `rgb(...)`. */
export function toHexColor(value: string): string {
  const trimmed = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  const rgbMatch = trimmed.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch
    const toHex = (v: string): string => Number(v).toString(16).padStart(2, '0')
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }
  // Fall back to letting the browser resolve a named color (e.g. 'transparent'
  // edge cases) via a throwaway element, rather than guessing.
  const probe = document.createElement('div')
  probe.style.color = trimmed
  document.body.appendChild(probe)
  const resolved = getComputedStyle(probe).color
  document.body.removeChild(probe)
  if (resolved !== trimmed) return toHexColor(resolved)
  return '#000000'
}
