import { useEffect, useRef, useState } from 'react'
import { allNodeIds, parsePresets, type LayoutPreset } from '@shared/canvasLayout'
import { PRESETS, isKnownId, type CanvasMode } from '@shared/canvasTools'

function storageKey(mode: CanvasMode): string {
  return `gb-canvas-presets:${mode}`
}

function loadCustom(mode: CanvasMode): LayoutPreset[] {
  try {
    return parsePresets(JSON.parse(localStorage.getItem(storageKey(mode)) ?? '[]'), (id) => isKnownId(mode, id))
  } catch {
    return []
  }
}

/** Whether one of this mode's saved layouts has this box in it — an image it does keeps its picture when closed. */
export function inSavedLayout(mode: CanvasMode, nodeId: string): boolean {
  return loadCustom(mode).some((p) => (p.snapshot ? allNodeIds(p.snapshot) : p.nodes.map((n) => n.id)).includes(nodeId))
}

/**
 * The dock's Layouts button and the menu that pops up above it: the built-in
 * layouts, the ones you've saved (each with a delete button), and a name box
 * to save the current arrangement as a new one. Saved layouts are this
 * mode's, on this computer.
 */
export function LayoutsMenu({
  mode,
  onApply,
  onSaveCurrent
}: {
  mode: CanvasMode
  onApply: (preset: LayoutPreset) => void
  /** The current arrangement as a layout called `label`. */
  onSaveCurrent: (label: string) => LayoutPreset
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState(() => loadCustom(mode))
  const [name, setName] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function store(next: LayoutPreset[]): void {
    setCustom(next)
    try {
      localStorage.setItem(storageKey(mode), JSON.stringify(next))
    } catch {
      /* best-effort persistence only */
    }
  }

  function save(): void {
    const label = name.trim()
    if (!label) return
    const existing = custom.find((p) => p.label.toLowerCase() === label.toLowerCase())
    const preset = { ...onSaveCurrent(label), id: existing?.id ?? crypto.randomUUID() }
    // Saving under a name you already have replaces that layout.
    store(existing ? custom.map((p) => (p.id === existing.id ? preset : p)) : [...custom, preset])
    setName('')
  }

  function apply(preset: LayoutPreset): void {
    onApply(preset)
    setOpen(false)
  }

  return (
    <div ref={ref} className="gb-layouts">
      {open && (
        <div className="gb-card gb-layouts-menu" role="menu">
          <div className="gb-layouts-heading">Layouts</div>
          {PRESETS[mode].map((preset) => (
            <button key={preset.id} type="button" className="gb-layouts-item" role="menuitem" onClick={() => apply(preset)}>
              {preset.label}
            </button>
          ))}
          {custom.length > 0 && <div className="gb-layouts-heading">Yours</div>}
          {custom.map((preset) => (
            <div key={preset.id} className="gb-layouts-row">
              <button type="button" className="gb-layouts-item" role="menuitem" onClick={() => apply(preset)}>
                {preset.label}
              </button>
              <button
                type="button"
                className="gb-layouts-delete"
                title={`Delete “${preset.label}”`}
                aria-label={`Delete ${preset.label}`}
                onClick={() => store(custom.filter((p) => p.id !== preset.id))}
              >
                ×
              </button>
            </div>
          ))}
          <form
            className="gb-layouts-save"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <input className="gb-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Save this arrangement as…" aria-label="Name for this layout" maxLength={40} />
            <button type="submit" className="gb-btn gb-btn--primary" disabled={!name.trim()}>
              Save
            </button>
          </form>
        </div>
      )}
      <button type="button" className="gb-dock-tool" data-label={open ? undefined : 'Layouts'} aria-label="Layouts" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1.5" y="1.5" width="5.5" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
          <rect x="9" y="1.5" width="5.5" height="4" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
          <rect x="9" y="7.5" width="5.5" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
          <rect x="1.5" y="10.5" width="5.5" height="4" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
    </div>
  )
}
