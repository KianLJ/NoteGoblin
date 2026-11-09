import { useEffect, useRef, useState, type ReactNode } from 'react'

/** The classic header's tool buttons: a button with its panel dropping down beneath it, closed by a click elsewhere. */
export function HeaderPopover({ trigger, width, children }: { trigger: (toggle: () => void) => ReactNode; width: number; children: ReactNode }): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent): void {
      const target = e.target as Element
      // Menus a panel opens live in the popup layer, outside this box: clicking one isn't clicking away.
      if (ref.current?.contains(target) || target.closest?.('#gb-popup-layer')) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {trigger(() => setOpen((o) => !o))}
      {open && (
        <div
          className="gb-card"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width,
            maxHeight: 'calc(100vh - 80px)',
            overflowY: 'auto',
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}
