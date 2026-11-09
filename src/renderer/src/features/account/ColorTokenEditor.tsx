import { useState } from 'react'
import { toHexColor } from '../../color'
import { defaultColor, getOverrides, getTone, resetAllColorOverrides, resolveMode, setAccentTone, setBackgroundTone, setStatusColor, toneResult, type ThemeMode } from '../../theme'

// Ready-made colours. `null` is the app's own default.
const ACCENTS: [string, string | null][] = [
  ['Ember', null],
  ['Gold', '#c9a03c'],
  ['Moss', '#4f8a5b'],
  ['Teal', '#2f8f8a'],
  ['Sky', '#3f7fc9'],
  ['Violet', '#7c5cc4'],
  ['Rose', '#c45c8a'],
  ['Crimson', '#b8333a']
]
const TONES: [string, string | null][] = [
  ['Parchment', null],
  ['Stone', '#808080'],
  ['Slate', '#5f7086'],
  ['Forest', '#4f6b55'],
  ['Dusk', '#6b5a80'],
  ['Ocean', '#3f6a80']
]

/**
 * Colours, in two choices and a little extra: the accent (buttons and
 * highlights) and the background tone (backgrounds, borders and text, which
 * lean together so they always match). Each swatch shows what it will really
 * look like, and a choice applies to both light and dark. Success and danger
 * can be changed on their own under "Status colours".
 */
export function ColorTokenEditor({ themeMode }: { themeMode: ThemeMode }): JSX.Element {
  // Re-read on every change; `themeMode` re-renders this when light/dark flips, since swatches show that theme's result.
  const [, setTick] = useState(0)
  const bump = (): void => setTick((t) => t + 1)
  const accent = getTone('accent')
  const tone = getTone('background')
  const overrides = getOverrides(resolveMode(themeMode))
  const [statusOpen, setStatusOpen] = useState(() => '--success' in overrides || '--danger' in overrides)
  const changed = accent !== null || tone !== null || Object.keys(overrides).length > 0

  return (
    <div className="ce">
      <ColourChoice
        label="Accent"
        hint="Buttons, highlights and the current selection."
        options={ACCENTS}
        value={accent}
        token="--accent"
        onPick={(hex) => {
          setAccentTone(hex)
          bump()
        }}
      />
      <ColourChoice
        label="Background tone"
        hint="Backgrounds, borders and text, tinted together so they always match."
        options={TONES}
        value={tone}
        token="--bg-surface-raised"
        onPick={(hex) => {
          setBackgroundTone(hex)
          bump()
        }}
      />

      <div className="ce-preview" aria-hidden="true">
        <div className="ce-preview-card">
          <strong>The Sunken Crypt</strong>
          <span>Beneath the old chapel, water has crept into the burial halls.</span>
          <div className="ce-preview-row">
            <span className="ce-preview-btn">Start combat</span>
            <span className="ce-preview-chip ce-preview-chip--good">Saved</span>
            <span className="ce-preview-chip ce-preview-chip--bad">Dead</span>
          </div>
        </div>
      </div>

      <button type="button" className="ce-more" onClick={() => setStatusOpen((o) => !o)} aria-expanded={statusOpen}>
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" style={{ transform: statusOpen ? 'rotate(90deg)' : undefined }}>
          <path d="M4.5 2.5L8 6l-3.5 3.5" />
        </svg>
        Status colours
      </button>
      {statusOpen && (
        <div className="ce-status">
          {(
            [
              ['--success', 'Success', 'Saves, healing, things going well.'],
              ['--danger', 'Danger', 'Damage, deaths, deleting.']
            ] as const
          ).map(([key, label, hint]) => {
            const custom = overrides[key]
            return (
              <label key={key} className="ce-status-row">
                <input
                  type="color"
                  className="ce-picker"
                  value={toHexColor(custom ?? defaultColor(key))}
                  onChange={(e) => {
                    setStatusColor(key, e.target.value)
                    bump()
                  }}
                  aria-label={`${label} colour`}
                />
                <span className="ce-status-text">
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </span>
                {custom && (
                  <button
                    type="button"
                    className="ce-reset-one"
                    onClick={(e) => {
                      e.preventDefault()
                      setStatusColor(key, null)
                      bump()
                    }}
                  >
                    Default
                  </button>
                )}
              </label>
            )
          })}
        </div>
      )}

      <button
        type="button"
        className="ce-reset"
        disabled={!changed}
        onClick={() => {
          resetAllColorOverrides()
          bump()
        }}
      >
        Reset all colours to the defaults
      </button>
    </div>
  )
}

/** One choice: named swatches showing the colour they'll really give, then a custom colour. */
function ColourChoice({
  label,
  hint,
  options,
  value,
  token,
  onPick
}: {
  label: string
  hint: string
  options: [string, string | null][]
  value: string | null
  /** Which colour the swatches show the result for. */
  token: string
  onPick: (hex: string | null) => void
}): JSX.Element {
  const isPreset = value === null || options.some(([, hex]) => hex === value)
  return (
    <div className="ce-choice">
      <div className="ce-choice-text">
        <strong>{label}</strong>
        <small>{hint}</small>
      </div>
      <div className="ce-swatches" role="radiogroup" aria-label={label}>
        {options.map(([name, hex]) => {
          const on = value === hex
          return (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={on}
              className={on ? 'ce-swatch ce-swatch--on' : 'ce-swatch'}
              onClick={() => onPick(hex)}
              title={hex ? name : `${name} (default)`}
            >
              <i style={{ background: hex ? toneResult(hex, token) : defaultColor(token) }} />
              <span>{name}</span>
            </button>
          )
        })}
        <label className={!isPreset ? 'ce-swatch ce-swatch--on ce-swatch--custom' : 'ce-swatch ce-swatch--custom'} title="Pick any colour">
          <i style={!isPreset && value ? { background: toneResult(value, token) } : undefined}>
            <input type="color" value={value ?? '#888888'} onChange={(e) => onPick(e.target.value)} aria-label={`Custom ${label.toLowerCase()} colour`} />
          </i>
          <span>Custom</span>
        </label>
      </div>
    </div>
  )
}
