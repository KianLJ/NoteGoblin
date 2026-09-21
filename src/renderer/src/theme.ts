import { hexToHsl, hslToHex } from './color'

/** Debounced push of the current theme/font choices up to the relay account, so they follow the user to another device. Every local mutator below calls this; fire-and-forget and silently a no-op without a relay connection (see identity:push-prefs), so this never needs its own error handling here. */
let pushPrefsTimer: ReturnType<typeof setTimeout> | undefined
function schedulePrefsPush(): void {
  if (pushPrefsTimer) clearTimeout(pushPrefsTimer)
  pushPrefsTimer = setTimeout(() => {
    void window.goblin.identity.pushPrefs(collectThemePrefs())
  }, 1000)
}

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export interface ColorToken {
  /** The CSS custom property name, e.g. '--accent'. */
  key: string
  label: string
  group: string
}

/** Every color token theme.css defines, grouped. Groups in TINTABLE_GROUPS get one picked color per group (see tintGroup) — every other token keeps its own default lightness, just recolored to the picked hue/saturation, so contrast relationships within the group survive. 'Status' is deliberately left out of that (success/danger need to stay visually distinct, not share a hue) and its two tokens are edited individually instead. */
export const COLOR_TOKENS: ColorToken[] = [
  { key: '--bg-canvas', label: 'Canvas', group: 'Backgrounds' },
  { key: '--bg-surface', label: 'Surface', group: 'Backgrounds' },
  { key: '--bg-surface-raised', label: 'Raised surface', group: 'Backgrounds' },
  { key: '--bg-sunken', label: 'Sunken', group: 'Backgrounds' },
  { key: '--border-subtle', label: 'Subtle border', group: 'Borders' },
  { key: '--border-strong', label: 'Strong border', group: 'Borders' },
  { key: '--text-primary', label: 'Primary text', group: 'Text' },
  { key: '--text-secondary', label: 'Secondary text', group: 'Text' },
  { key: '--text-muted', label: 'Muted text', group: 'Text' },
  { key: '--text-on-accent', label: 'Text on accent', group: 'Text' },
  { key: '--accent', label: 'Accent', group: 'Accent' },
  { key: '--accent-hover', label: 'Accent (hover)', group: 'Accent' },
  { key: '--accent-subtle', label: 'Accent (subtle)', group: 'Accent' },
  { key: '--focus-ring', label: 'Focus ring', group: 'Accent' },
  { key: '--success', label: 'Success', group: 'Status' },
  { key: '--danger', label: 'Danger', group: 'Status' }
]

export const TINTABLE_GROUPS = ['Backgrounds', 'Borders', 'Text', 'Accent'] as const

/** One representative token per tintable group, used to seed the group's swatch with a sensible starting color and to read back "what color is this group roughly showing right now". */
export const GROUP_REPRESENTATIVE_TOKEN: Record<(typeof TINTABLE_GROUPS)[number], string> = {
  Backgrounds: '--bg-surface',
  Borders: '--border-strong',
  Text: '--text-primary',
  Accent: '--accent'
}

/** The stylesheet's own default values (theme.css), hardcoded here so tinting always has a stable lightness ladder to recolor, independent of whatever inline overrides currently happen to be applied. */
const DEFAULT_COLORS: Record<ResolvedTheme, Record<string, string>> = {
  light: {
    '--bg-canvas': '#faf6ec',
    '--bg-surface': '#fffdf7',
    '--bg-surface-raised': '#ffffff',
    '--bg-sunken': '#f2ead6',
    '--border-subtle': '#d6c69c',
    '--border-strong': '#4a4030',
    '--text-primary': '#1b1712',
    '--text-secondary': '#5c5340',
    '--text-muted': '#8a7f68',
    '--text-on-accent': '#faf6ec',
    '--accent': '#b5502c',
    '--accent-hover': '#973f22',
    '--accent-subtle': '#f4e2d6',
    '--focus-ring': '#c96a3f',
    '--success': '#4b6350',
    '--danger': '#8c3a35'
  },
  dark: {
    '--bg-canvas': '#1a160f',
    '--bg-surface': '#302921',
    '--bg-surface-raised': '#453b2c',
    '--bg-sunken': '#150f0a',
    '--border-subtle': '#453b2c',
    '--border-strong': '#d6c69c',
    '--text-primary': '#f2ead6',
    '--text-secondary': '#c7b995',
    '--text-muted': '#8f8265',
    '--text-on-accent': '#faf6ec',
    '--accent': '#c96a3f',
    '--accent-hover': '#d98456',
    '--accent-subtle': '#3a271e',
    '--focus-ring': '#c96a3f',
    '--success': '#6c8367',
    '--danger': '#c2564f'
  }
}

const MODE_KEY = 'gb-theme-mode'
const overridesKey = (theme: ResolvedTheme): string => `gb-theme-overrides-${theme}`
const groupColorKey = (theme: ResolvedTheme, group: string): string => `gb-theme-group-${theme}-${group}`

/**
 * Which local identity the theme/font state currently sitting in this
 * device's localStorage actually belongs to — every key above is a single
 * device-wide bucket, not namespaced per identity, so switching to a
 * different local identity on the same device leaves the PREVIOUS
 * identity's customization sitting right there in storage. Without this,
 * App.tsx's onPrefsChecked seed-an-empty-account logic (see
 * hasCustomThemePrefs's own doc comment for why that exists) couldn't tell
 * "this device's own real customization, made by whoever's logged in now"
 * apart from "leftover colors from someone else who used this device
 * earlier" — and would happily push the latter up as if it were the
 * newly-logged-in identity's own, silently overwriting THEIR real saved
 * account prefs with a stranger's.
 */
const THEME_OWNER_KEY = 'gb-theme-owner-identity'

export function getThemeOwnerIdentityId(): string | null {
  return localStorage.getItem(THEME_OWNER_KEY)
}

export function setThemeOwnerIdentityId(id: string): void {
  localStorage.setItem(THEME_OWNER_KEY, id)
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function getStoredMode(): ThemeMode {
  const raw = localStorage.getItem(MODE_KEY)
  return isThemeMode(raw) ? raw : 'dark'
}

export function resolveMode(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return mode
}

/** Per-theme, so switching light/dark (or system flipping) doesn't mix up which overrides apply where. */
export function getOverrides(theme: ResolvedTheme): Record<string, string> {
  try {
    const raw = localStorage.getItem(overridesKey(theme))
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function saveOverrides(theme: ResolvedTheme, overrides: Record<string, string>): void {
  localStorage.setItem(overridesKey(theme), JSON.stringify(overrides))
}

function applyOverridesToRoot(theme: ResolvedTheme): void {
  const root = document.documentElement
  // Clear every known token first — otherwise an override left over from
  // before a reset (or a stale value from switching theme) would keep
  // showing through as a stale inline style.
  for (const token of COLOR_TOKENS) root.style.removeProperty(token.key)
  const overrides = getOverrides(theme)
  for (const [key, value] of Object.entries(overrides)) {
    root.style.setProperty(key, value)
  }
}

export function applyTheme(mode: ThemeMode): void {
  const resolved = resolveMode(mode)
  document.documentElement.setAttribute('data-theme', resolved)
  applyOverridesToRoot(resolved)
}

export function setThemeMode(mode: ThemeMode): void {
  localStorage.setItem(MODE_KEY, mode)
  applyTheme(mode)
  schedulePrefsPush()
}

/** Recolors every token in `group` to `pickedHex`'s hue/saturation, each keeping its own default lightness — the "greyscale with this color laid on top" effect, so light/dark relationships within the group stay intact. */
export function tintGroup(theme: ResolvedTheme, group: (typeof TINTABLE_GROUPS)[number], pickedHex: string): void {
  const { h, s } = hexToHsl(pickedHex)
  const overrides = getOverrides(theme)
  for (const token of COLOR_TOKENS.filter((t) => t.group === group)) {
    const defaultHex = DEFAULT_COLORS[theme][token.key]
    const { l } = hexToHsl(defaultHex)
    overrides[token.key] = hslToHex(h, s, l)
  }
  saveOverrides(theme, overrides)
  localStorage.setItem(groupColorKey(theme, group), pickedHex)
  if (resolveMode(getStoredMode()) === theme) applyOverridesToRoot(theme)
  schedulePrefsPush()
}

export function resetGroup(theme: ResolvedTheme, group: (typeof TINTABLE_GROUPS)[number]): void {
  const overrides = getOverrides(theme)
  for (const token of COLOR_TOKENS.filter((t) => t.group === group)) {
    delete overrides[token.key]
  }
  saveOverrides(theme, overrides)
  localStorage.removeItem(groupColorKey(theme, group))
  if (resolveMode(getStoredMode()) === theme) applyOverridesToRoot(theme)
  schedulePrefsPush()
}

/** The last color picked for a group, or its representative token's current default if it hasn't been tinted — what the group's swatch should show. */
export function getGroupColor(theme: ResolvedTheme, group: (typeof TINTABLE_GROUPS)[number]): string {
  const stored = localStorage.getItem(groupColorKey(theme, group))
  if (stored) return stored
  return DEFAULT_COLORS[theme][GROUP_REPRESENTATIVE_TOKEN[group]]
}

export function isGroupTinted(theme: ResolvedTheme, group: (typeof TINTABLE_GROUPS)[number]): boolean {
  return localStorage.getItem(groupColorKey(theme, group)) !== null
}

export function setColorOverride(theme: ResolvedTheme, key: string, hex: string): void {
  const overrides = getOverrides(theme)
  overrides[key] = hex
  saveOverrides(theme, overrides)
  if (resolveMode(getStoredMode()) === theme) applyOverridesToRoot(theme)
  schedulePrefsPush()
}

export function resetColorOverride(theme: ResolvedTheme, key: string): void {
  const overrides = getOverrides(theme)
  delete overrides[key]
  saveOverrides(theme, overrides)
  if (resolveMode(getStoredMode()) === theme) applyOverridesToRoot(theme)
  schedulePrefsPush()
}

export function resetAllColorOverrides(theme: ResolvedTheme): void {
  localStorage.removeItem(overridesKey(theme))
  for (const group of TINTABLE_GROUPS) localStorage.removeItem(groupColorKey(theme, group))
  if (resolveMode(getStoredMode()) === theme) applyOverridesToRoot(theme)
  schedulePrefsPush()
}

/**
 * Wipes every local theme/font key back to unset (so every getter above
 * resolves to its built-in default) and re-applies immediately — used when
 * switching to an identity that owns none of this device's current
 * customization (see THEME_OWNER_KEY) and has no relay-saved prefs of its
 * own either, so it sees the app's real defaults instead of a previous
 * identity's leftover colors. Deliberately does NOT call schedulePrefsPush
 * — clearing a display artifact locally is not this identity's own choice
 * to push up as their saved preference.
 */
export function resetThemePrefs(): void {
  localStorage.removeItem(MODE_KEY)
  localStorage.removeItem(FONT_KEY)
  localStorage.removeItem(FONT_SCALE_KEY)
  for (const theme of ['light', 'dark'] as ResolvedTheme[]) {
    localStorage.removeItem(overridesKey(theme))
    for (const group of TINTABLE_GROUPS) localStorage.removeItem(groupColorKey(theme, group))
  }
  applyTheme(getStoredMode())
  applyFont(getStoredFontId())
  applyFontScale(getStoredFontScale())
}

/** Applies the stored (or default) theme immediately, and keeps 'system' mode in sync with OS changes while the app is open. Call once at startup. */
export function initTheme(): void {
  applyTheme(getStoredMode())
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getStoredMode() === 'system') applyTheme('system')
  })
}

/** The app's built-in default — used whenever the user hasn't picked an installed system font. */
const DEFAULT_FONT_STACK = {
  display: "'Cambria', 'Iowan Old Style', 'Georgia', serif",
  body: "'Segoe UI Variable', 'Segoe UI', -apple-system, sans-serif"
}
export const DEFAULT_FONT_ID = 'default'

const FONT_KEY = 'gb-font-choice'
/** Prefix marking a stored font id as an arbitrary installed system font (picked via querySystemFonts) rather than the built-in default. */
const SYSTEM_FONT_PREFIX = 'system:'

/** True for a locally-installed font id (as opposed to the built-in default). */
export function isSystemFontId(id: string): boolean {
  return id.startsWith(SYSTEM_FONT_PREFIX)
}

export function systemFontFamily(id: string): string {
  return id.slice(SYSTEM_FONT_PREFIX.length)
}

export function makeSystemFontId(family: string): string {
  return `${SYSTEM_FONT_PREFIX}${family}`
}

export function getStoredFontId(): string {
  const stored = localStorage.getItem(FONT_KEY)
  if (stored && isSystemFontId(stored)) return stored
  return DEFAULT_FONT_ID
}

export function applyFont(id: string): void {
  if (isSystemFontId(id)) {
    const family = systemFontFamily(id)
    document.documentElement.style.setProperty('--font-display', `'${family}'`)
    document.documentElement.style.setProperty('--font-body', `'${family}'`)
    return
  }
  document.documentElement.style.setProperty('--font-display', DEFAULT_FONT_STACK.display)
  document.documentElement.style.setProperty('--font-body', DEFAULT_FONT_STACK.body)
}

export function setFont(id: string): void {
  localStorage.setItem(FONT_KEY, id)
  applyFont(id)
  schedulePrefsPush()
}

const FONT_SCALE_KEY = 'gb-font-scale'
export const FONT_SCALE_MIN = 0.75
export const FONT_SCALE_MAX = 1.5
export const FONT_SCALE_DEFAULT = 1
export const FONT_SCALE_STEPS = [0.75, 0.85, 1, 1.1, 1.25, 1.5]

export function getStoredFontScale(): number {
  const raw = localStorage.getItem(FONT_SCALE_KEY)
  const n = raw ? Number(raw) : FONT_SCALE_DEFAULT
  return Number.isFinite(n) && n >= FONT_SCALE_MIN && n <= FONT_SCALE_MAX ? n : FONT_SCALE_DEFAULT
}

/**
 * Scales the whole rendered app proportionally to each element's own size —
 * not just font-size — since most of the UI is sized in raw pixels rather
 * than rem. This is what an oversized custom/system font (whose glyphs
 * render far bigger than its declared px size implies) can be scaled back
 * down to compensate for, without needing to change fonts.
 *
 * Applied as a CSS `transform: scale()` on a single wrapper around the whole
 * app (see App.tsx), not either flavor of browser zoom — both were tried and
 * both had a real problem:
 *
 *  - The CSS `zoom` property inflates an element's rendered box by the
 *    factor even when that box's height came from a `vh` unit, and `vh`
 *    resolves against the real (un-zoomed) viewport — so `100vh` containers
 *    rendered taller than the actual window and pushed the header/corner
 *    menu out of reach. It also forces scrolling off Chromium's composited
 *    fast path, causing visible scroll lag in content-heavy views.
 *  - `webContents.setZoomFactor` (real browser zoom, main-process side) fixed
 *    both of those, but introduced its own Chromium quirk: scroll repaint
 *    gets deferred until the scroll gesture ends, felt as the view "sticking"
 *    then snapping into place.
 *
 * `transform: scale()` is a pure compositor-layer operation — no layout
 * recalculation, no repaint-throttling — so scrolling underneath it stays
 * smooth at any scale. The tradeoff: it changes the positioning context for
 * every `position: fixed` descendant (dividing raw clientX/clientY-derived
 * pixel math by the current scale is what compensates for that — see
 * ContextMenu.tsx, HoverDetailCard.tsx, ResizableSidebar.tsx, NoteSidebar.tsx/
 * PlayerSidebar.tsx's drag-resize handlers), and callers still read the scale
 * via getStoredFontScale() rather than a DOM zoom query.
 */
export function applyFontScale(scale: number): void {
  document.documentElement.style.setProperty('--font-scale', String(scale))
}

export function setFontScale(scale: number): void {
  const clamped = Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, scale))
  localStorage.setItem(FONT_SCALE_KEY, String(clamped))
  applyFontScale(clamped)
  schedulePrefsPush()
}

/** Every theme/font choice bundled into one plain object, for syncing an account's look to another device via the relay (see identity.pushPrefs/pullPrefs). Opaque to the relay — it just stores and returns this blob. */
export interface ThemePrefs {
  mode: ThemeMode
  overrides: Partial<Record<ResolvedTheme, Record<string, string>>>
  groupColors: Partial<Record<ResolvedTheme, Record<string, string>>>
  fontId: string
  fontScale: number
}

export function collectThemePrefs(): ThemePrefs {
  const overrides: Partial<Record<ResolvedTheme, Record<string, string>>> = {}
  const groupColors: Partial<Record<ResolvedTheme, Record<string, string>>> = {}
  for (const theme of ['light', 'dark'] as ResolvedTheme[]) {
    const o = getOverrides(theme)
    if (Object.keys(o).length > 0) overrides[theme] = o

    const g: Record<string, string> = {}
    for (const group of TINTABLE_GROUPS) {
      const stored = localStorage.getItem(groupColorKey(theme, group))
      if (stored) g[group] = stored
    }
    if (Object.keys(g).length > 0) groupColors[theme] = g
  }
  return { mode: getStoredMode(), overrides, groupColors, fontId: getStoredFontId(), fontScale: getStoredFontScale() }
}

/**
 * Whether this device actually has any explicit theme/font customization —
 * as opposed to simply resolving every setting to its built-in default,
 * which every getter above happily does even on a device that's never been
 * touched. This distinction matters for seeding a relay account that has no
 * prefs saved yet (see App.tsx's onPrefsChecked): a never-customized device
 * must never push its resolved defaults up as if they were a real answer —
 * doing so would let a fresh/throwaway device silently overwrite a
 * genuinely customized account with nothing, the moment it happens to log
 * in first. Checks raw localStorage presence, not the resolved values.
 */
export function hasCustomThemePrefs(): boolean {
  if (localStorage.getItem(MODE_KEY) !== null) return true
  if (localStorage.getItem(FONT_KEY) !== null) return true
  if (localStorage.getItem(FONT_SCALE_KEY) !== null) return true
  for (const theme of ['light', 'dark'] as ResolvedTheme[]) {
    if (localStorage.getItem(overridesKey(theme)) !== null) return true
    for (const group of TINTABLE_GROUPS) {
      if (localStorage.getItem(groupColorKey(theme, group)) !== null) return true
    }
  }
  return false
}

/** Writes a bundle from collectThemePrefs (typically fetched from another device via the relay) into local storage and re-applies it immediately. */
export function applyThemePrefs(prefs: ThemePrefs): void {
  localStorage.setItem(MODE_KEY, prefs.mode)
  for (const theme of ['light', 'dark'] as ResolvedTheme[]) {
    const o = prefs.overrides[theme]
    if (o) saveOverrides(theme, o)
    const g = prefs.groupColors[theme]
    if (g) for (const [group, hex] of Object.entries(g)) localStorage.setItem(groupColorKey(theme, group), hex)
  }
  localStorage.setItem(FONT_KEY, prefs.fontId)
  localStorage.setItem(FONT_SCALE_KEY, String(prefs.fontScale))

  applyTheme(prefs.mode)
  applyFont(prefs.fontId)
  applyFontScale(prefs.fontScale)
}

/** Every installed system font family, alphabetized — via Chromium's Local Font Access API. Resolves to [] if the API isn't available (older Chromium) or the user denies the permission, so callers should treat an empty list as "fall back to the curated presets," not an error. */
export async function querySystemFonts(): Promise<string[]> {
  if (!window.queryLocalFonts) return []
  try {
    const fonts = await window.queryLocalFonts()
    return [...new Set(fonts.map((f) => f.family))].sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}
