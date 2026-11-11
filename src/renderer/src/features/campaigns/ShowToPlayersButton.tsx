import { useEffect, useState } from 'react'
import type { Handout } from '@shared/ipc'

/**
 * A box's "Show to players" button (DM, while hosting): sends what `build` makes as a handout, which comes up on
 * every connected player's screen (HandoutViewer.tsx). Says how it went on the button itself for a moment.
 */
export function ShowToPlayersButton({ build }: { build: () => Promise<Handout | null> }): JSX.Element {
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => {
    if (!status) return
    const t = setTimeout(() => setStatus(null), status.ok ? 2200 : 4000)
    return () => clearTimeout(t)
  }, [status])

  async function show(): Promise<void> {
    const handout = await build()
    if (!handout) return setStatus({ ok: false, text: 'Nothing to show' })
    const result = await window.goblin.handouts.show(handout)
    setStatus(result.ok ? { ok: true, text: `Shown to ${result.players}` } : { ok: false, text: result.error })
  }

  if (status) {
    return (
      <span className={status.ok ? 'gb-handout-status' : 'gb-handout-status gb-handout-status--error'} role="status" title={status.text}>
        {status.text}
      </span>
    )
  }
  return (
    <button type="button" className="gb-canvas-node-close" title="Show to players" aria-label="Show to players" onClick={() => void show()}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="1.5" y="2.5" width="13" height="8.5" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
        <path d="M5.5 14h5M8 11v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M6.5 5.2v3.1L9.4 6.75Z" fill="currentColor" />
      </svg>
    </button>
  )
}
