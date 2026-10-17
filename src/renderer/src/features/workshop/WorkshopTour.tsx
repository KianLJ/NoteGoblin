import { useEffect, useRef, useState } from 'react'
import { getStoredFontScale } from '../../theme'
import { Button } from '../../ui/Button'
import { XIcon } from '../../ui/icons'

const TOUR_KEY = 'gb-workshop-tour-done'

const STEPS: Array<{ title: string; body: string }> = [
  {
    title: 'Welcome to the full editor',
    body: 'Here you build whole homebrew packs: classes, subclasses, feats, spells, items and creatures that character sheets calculate with. For a single item, spell or feat, “Make something” (top left) is quicker. This takes a minute; you can replay it from the Tour button.'
  },
  { title: 'Your packs', body: 'Your packs are listed on the left — My Homebrew holds what you made with “Make something”. Start a new one, or import a pack file someone shared with you.' },
  {
    title: 'Overview',
    body: 'A pack’s name, version and what it builds on. An empty pack offers “Start with…” shortcuts, and Problems lists anything to fix in plain words, often with a Fix button.'
  },
  {
    title: 'Contents',
    body: 'Every class, feat, spell and item in the pack. The plus next to a section adds one — blank, or copied from the SRD or another pack so you start from something that works.'
  },
  {
    title: 'Effects',
    body: 'Effects make an entry do something on the sheet. “+ Effect” asks what it should do (a bonus, a resistance, a pool of points, a choice…) and fills in the rest.'
  },
  {
    title: 'Formulas',
    body: 'Number fields take formulas. Click into one for chips like Level or Charisma mod; under it you’ll see the formula in plain English and what it works out to for the test character.'
  },
  { title: 'Test as you go', body: 'The test character beside the editor shows the key numbers and highlights whatever your last change moved. The Test character tab has the full sheet.' },
  {
    title: 'Save and share',
    body: 'Save keeps it in your library — your own characters can use it straight away. For a campaign, the DM enables it from Content Packs. Bump the version before updating a campaign.'
  },
  { title: 'Simple or Advanced', body: 'Simple mode hides rarely needed fields. Tick Advanced (top right of the editor) for everything, including the JSON views.' }
]

/** Whether the first-run tour should show (it hasn't been finished or skipped on this device). */
export function tourPending(): boolean {
  try {
    return localStorage.getItem(TOUR_KEY) !== '1'
  } catch {
    return false
  }
}

/** A short step-by-step tour of the Workshop, in a card that starts at the bottom right and can be dragged anywhere by its title bar. Finishing or skipping it remembers that on this device. */
export function WorkshopTour({ onClose }: { onClose: () => void }): JSX.Element {
  const [step, setStep] = useState(0)
  const cardRef = useRef<HTMLDivElement>(null)
  // Top-left within the Workshop, once dragged; null = the default bottom-right spot.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const drag = useRef<{ dx: number; dy: number } | null>(null)

  useEffect(() => {
    // Listening on window, not the card: a fast drag can outrun the card and would otherwise drop the drag.
    function move(e: PointerEvent): void {
      const card = cardRef.current
      const parent = card?.offsetParent as HTMLElement | null
      if (!drag.current || !card || !parent) return
      const scale = getStoredFontScale()
      const box = parent.getBoundingClientRect()
      // Screen pixels → the app's own (pre-scale) units, kept inside the Workshop.
      const left = (e.clientX - box.left) / scale - drag.current.dx
      const top = (e.clientY - box.top) / scale - drag.current.dy
      setPos({
        left: Math.max(0, Math.min(box.width / scale - card.offsetWidth, left)),
        top: Math.max(0, Math.min(box.height / scale - card.offsetHeight, top))
      })
    }
    function up(): void {
      drag.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  function startDrag(e: React.PointerEvent): void {
    const card = cardRef.current
    if (!card || (e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const scale = getStoredFontScale()
    const rect = card.getBoundingClientRect()
    drag.current = { dx: (e.clientX - rect.left) / scale, dy: (e.clientY - rect.top) / scale }
  }
  const done = (): void => {
    try {
      localStorage.setItem(TOUR_KEY, '1')
    } catch {
      /* per-device convenience only */
    }
    onClose()
  }
  const s = STEPS[step]
  const last = step === STEPS.length - 1
  return (
    <div
      role="dialog"
      aria-label="Workshop tour"
      ref={cardRef}
      className="gb-card"
      style={{
        position: 'absolute',
        ...(pos ? { left: pos.left, top: pos.top } : { right: 'var(--space-4)', bottom: 'var(--space-4)' }),
        width: 320, padding: 'var(--space-3) var(--space-4)', boxShadow: 'var(--shadow-lg)', zIndex: 20, display: 'flex', flexDirection: 'column', gap: 8, borderColor: 'var(--accent)' }}
    >
      <div onPointerDown={startDrag} title="Drag to move" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'move', userSelect: 'none' }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {step + 1} / {STEPS.length}
        </span>
        <strong style={{ flex: 1, fontSize: 14 }}>{s.title}</strong>
        <button type="button" onClick={done} title="Skip the tour" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'inline-flex' }}>
          <XIcon size={12} />
        </button>
      </div>
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)' }}>{s.body}</p>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        {step > 0 && (
          <Button variant="ghost" onClick={() => setStep(step - 1)} style={{ fontSize: 12, padding: '4px 10px' }}>
            Back
          </Button>
        )}
        <Button variant="primary" onClick={() => (last ? done() : setStep(step + 1))} style={{ fontSize: 12, padding: '4px 10px' }}>
          {last ? 'Done' : 'Next'}
        </Button>
      </div>
    </div>
  )
}
