import { useEffect, useRef, useState } from 'react'
import { PlannerPanel } from './PlannerPanel'
import { OPEN_PLANNER_EVENT } from './usePlanner'

/** The top bar's Session planner: a popover beside Messages, opened from here or a planner notification. */
export function PlannerButton({ campaignId, campaignName, campaignDmId, sessionId }: { campaignId: string | null; campaignName?: string; campaignDmId?: string; sessionId: string | null }): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const show = (): void => setOpen(true)
    window.addEventListener(OPEN_PLANNER_EVENT, show)
    return () => window.removeEventListener(OPEN_PLANNER_EVENT, show)
  }, [])
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent): void {
      const target = e.target as Element
      // Menus and the undo toast live in the popup layer: clicking one isn't clicking away.
      if (ref.current?.contains(target) || target.closest?.('#gb-popup-layer')) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className={open ? 'gb-topbtn on' : 'gb-topbtn'} title="Session planner" aria-label="Session planner" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {/* A calendar page with a tick: a session pencilled in. */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3M5.6 10.2l1.6 1.6 3.2-3.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="gb-card gb-plan-pop">
          <PlannerPanel campaignId={campaignId} campaignName={campaignName} campaignDmId={campaignDmId} sessionId={sessionId} />
        </div>
      )}
    </div>
  )
}
