import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { parseJsonField } from '@shared/content/workshop'

const pretty = (value: unknown): string => JSON.stringify(value, null, 2) ?? ''

/**
 * A JSON text area bound to a value: every edit that parses is sent up
 * straight away (so validation and the test character follow along), and
 * text that doesn't parse stays put with the parse error shown under it
 * instead of being thrown away. A change to `value` from outside (another
 * tab, Duplicate, a form) replaces the text.
 */
export function JsonEditor({
  value,
  onChange,
  readOnly,
  minHeight = 320,
  style
}: {
  value: unknown
  onChange: (value: unknown) => void
  readOnly?: boolean
  minHeight?: number
  style?: CSSProperties
}): JSX.Element {
  const [text, setText] = useState(() => pretty(value))
  const [error, setError] = useState<string | null>(null)
  const lastSent = useRef<string>(JSON.stringify(value))

  useEffect(() => {
    const incoming = JSON.stringify(value)
    if (incoming !== lastSent.current) {
      lastSent.current = incoming
      setText(pretty(value))
      setError(null)
    }
  }, [value])

  function edit(next: string): void {
    setText(next)
    const parsed = parseJsonField(next)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setError(null)
    lastSent.current = JSON.stringify(parsed.value)
    onChange(parsed.value)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0, ...style }}>
      <textarea
        className="gb-input"
        spellCheck={false}
        readOnly={readOnly}
        value={text}
        onChange={(e) => edit(e.target.value)}
        onKeyDown={(e) => {
          // Tab indents instead of leaving the field.
          if (e.key !== 'Tab' || readOnly) return
          e.preventDefault()
          const el = e.currentTarget
          const { selectionStart: start, selectionEnd: end } = el
          const next = `${text.slice(0, start)}  ${text.slice(end)}`
          edit(next)
          requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2))
        }}
        style={{
          flex: 1,
          minHeight,
          resize: 'vertical',
          fontFamily: 'var(--font-mono, ui-monospace, Consolas, monospace)',
          fontSize: 12,
          lineHeight: 1.45,
          whiteSpace: 'pre',
          tabSize: 2,
          borderColor: error ? 'var(--danger)' : undefined
        }}
      />
      {error && <div style={{ fontSize: 11, color: 'var(--danger)' }}>Not valid JSON yet: {error}</div>}
    </div>
  )
}
