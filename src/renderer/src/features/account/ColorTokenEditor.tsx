import { useState } from 'react'
import { Button } from '../../ui/Button'
import { toHexColor } from '../../color'
import {
  COLOR_TOKENS,
  GROUP_REPRESENTATIVE_TOKEN,
  TINTABLE_GROUPS,
  getGroupColor,
  getOverrides,
  isGroupTinted,
  resetAllColorOverrides,
  resetColorOverride,
  resetGroup,
  resolveMode,
  setColorOverride,
  tintGroup,
  type ColorToken,
  type ResolvedTheme,
  type ThemeMode
} from '../../theme'

const STATUS_TOKENS = COLOR_TOKENS.filter((t) => t.group === 'Status')

/**
 * One color per section — Backgrounds, Borders, Text, Accent — recolored
 * onto each token's existing lightness ladder (so contrast within the
 * section stays intact, only the hue changes), like a duotone tint over a
 * greyscale base. Status (success/danger) is excluded from that and stays
 * two individually-pickable colors, since forcing them onto one hue would
 * defeat the point of having two different status colors.
 *
 * Always edits whichever theme (light/dark) is currently resolved and
 * visible, so what you pick is exactly what you see change.
 */
export function ColorTokenEditor({ themeMode }: { themeMode: ThemeMode }): JSX.Element {
  const resolved = resolveMode(themeMode)
  // Bumped on "Reset all" so every row remounts and re-reads its default.
  const [resetNonce, setResetNonce] = useState(0)

  return (
    <div>
      <div style={{ maxHeight: 280, overflowY: 'auto', paddingRight: 4 }}>
        {TINTABLE_GROUPS.map((group) => (
          <GroupColorRow key={`${resolved}:${group}:${resetNonce}`} group={group} resolved={resolved} />
        ))}

        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-muted)',
            margin: '8px 0 2px'
          }}
        >
          Status
        </div>
        {STATUS_TOKENS.map((token) => (
          <ColorTokenRow key={`${resolved}:${token.key}:${resetNonce}`} token={token} resolved={resolved} />
        ))}
      </div>
      <Button
        variant="secondary"
        onClick={() => {
          resetAllColorOverrides(resolved)
          setResetNonce((n) => n + 1)
        }}
        style={{ width: '100%', marginTop: 'var(--space-2)' }}
      >
        Reset all colors
      </Button>
    </div>
  )
}

function GroupColorRow({
  group,
  resolved
}: {
  group: (typeof TINTABLE_GROUPS)[number]
  resolved: ResolvedTheme
}): JSX.Element {
  const [value, setValue] = useState(() => getGroupColor(resolved, group))
  const [tinted, setTinted] = useState(() => isGroupTinted(resolved, group))

  function handleChange(hex: string): void {
    setValue(hex)
    setTinted(true)
    tintGroup(resolved, group, hex)
  }

  function handleReset(): void {
    resetGroup(resolved, group)
    setTinted(false)
    setValue(getGroupColor(resolved, group))
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
      <span style={{ fontSize: 13 }}>{group}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {tinted && (
          <button
            type="button"
            onClick={handleReset}
            title="Reset to default"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: 11,
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0
            }}
          >
            reset
          </button>
        )}
        <input
          type="color"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          title={`Recolor ${GROUP_REPRESENTATIVE_TOKEN[group]} and the rest of ${group}`}
          style={{
            width: 26,
            height: 26,
            padding: 0,
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            background: 'none',
            cursor: 'pointer'
          }}
        />
      </div>
    </div>
  )
}

function ColorTokenRow({ token, resolved }: { token: ColorToken; resolved: ResolvedTheme }): JSX.Element {
  const [value, setValue] = useState(() =>
    toHexColor(getComputedStyle(document.documentElement).getPropertyValue(token.key))
  )
  const [hasOverride, setHasOverride] = useState(() => token.key in getOverrides(resolved))

  function handleChange(hex: string): void {
    setValue(hex)
    setHasOverride(true)
    setColorOverride(resolved, token.key, hex)
  }

  function handleReset(): void {
    resetColorOverride(resolved, token.key)
    setHasOverride(false)
    setValue(toHexColor(getComputedStyle(document.documentElement).getPropertyValue(token.key)))
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 0' }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{token.label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {hasOverride && (
          <button
            type="button"
            onClick={handleReset}
            title="Reset to default"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: 11,
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0
            }}
          >
            reset
          </button>
        )}
        <input
          type="color"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          title={token.key}
          style={{
            width: 24,
            height: 24,
            padding: 0,
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            background: 'none',
            cursor: 'pointer'
          }}
        />
      </div>
    </div>
  )
}
