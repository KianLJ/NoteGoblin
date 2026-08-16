import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '../../ui/Button'

interface CompendiumPickerProps<T> {
  search: (query: string) => T[]
  getLabel: (item: T) => string
  getSublabel?: (item: T) => string
  onPick: (item: T) => void
  onAddCustom: () => void
  buttonLabel: string
  searchPlaceholder: string
  disabled?: boolean
  disabledReason?: string
  /** Optional filter controls (e.g. a spell-level or damage-type select) rendered between the search box and the results — the caller owns the filter state and folds it into its `search` callback. */
  filters?: ReactNode
}

/** "+ Add" button that opens a small search popover over the compendium (SRD spells/weapons/equipment), with a "Custom…" escape hatch for anything outside SRD scope — used identically across SpellsTab, CombatTab's Attacks, and InventoryTab. */
export function CompendiumPicker<T>({
  search,
  getLabel,
  getSublabel,
  onPick,
  onAddCustom,
  buttonLabel,
  searchPlaceholder,
  disabled,
  disabledReason,
  filters
}: CompendiumPickerProps<T>): JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const results = open ? search(query) : []

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="gb-btn gb-btn--secondary"
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {buttonLabel}
      </button>

      {open && (
        <div
          className="gb-card"
          style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, width: 300, zIndex: 30, padding: 'var(--space-3)' }}
        >
          <input
            className="gb-input"
            autoFocus
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ marginBottom: filters ? 6 : 'var(--space-2)' }}
          />
          {filters && <div style={{ marginBottom: 'var(--space-2)' }}>{filters}</div>}
          <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {results.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>No matches.</p>
            ) : (
              results.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    onPick(item)
                    setOpen(false)
                    setQuery('')
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '5px 8px',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: 13
                  }}
                >
                  {getLabel(item)}
                  {getSublabel && (
                    <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 6 }}>{getSublabel(item)}</span>
                  )}
                </button>
              ))
            )}
          </div>
          <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)' }}>
            <Button
              variant="ghost"
              style={{ width: '100%', fontSize: 12 }}
              onClick={() => {
                onAddCustom()
                setOpen(false)
                setQuery('')
              }}
            >
              + Custom…
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
