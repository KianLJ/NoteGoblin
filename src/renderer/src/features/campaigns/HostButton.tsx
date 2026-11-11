import { useEffect, useRef, useState } from 'react'
import { playSfx } from '../audio/soundEffects'

const ARM_MS = 3500

/**
 * Start or stop hosting the open campaign — the pill beside its name in the canvas's top-left. Not hosting:
 * "Host"; hosting: a live green dot ("Hosting", "Stop" on hover). Either way it takes two clicks (the first asks
 * "…?"), so a stray click never starts a session or drops everyone out of one.
 */
export function HostButton({ hostedSessionId, onHostedSessionChange }: { hostedSessionId: string | null; onHostedSessionChange: (sessionId: string | null) => void }): JSX.Element {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const hosting = hostedSessionId !== null

  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 5000)
    return () => clearTimeout(t)
  }, [error])

  async function act(): Promise<void> {
    setBusy(true)
    setError(null)
    if (hosting) {
      await window.goblin.sessions.stop()
      onHostedSessionChange(null)
    } else {
      const result = await window.goblin.sessions.start()
      if (result.ok) {
        playSfx('sessionHosted')
        onHostedSessionChange(result.sessionId)
      } else setError(result.error)
    }
    setBusy(false)
  }

  function click(): void {
    if (busy) return
    if (armed) {
      clearTimeout(timer.current)
      setArmed(false)
      void act()
      return
    }
    setArmed(true)
    timer.current = setTimeout(() => setArmed(false), ARM_MS)
  }

  const label = busy ? (hosting ? 'Stopping…' : 'Starting…') : armed ? (hosting ? 'Stop hosting?' : 'Start hosting?') : hosting ? 'Hosting' : 'Host'
  return (
    <>
      <button
        type="button"
        className={`gb-host${hosting ? ' gb-host--live' : ''}${armed ? ' gb-host--armed' : ''}`}
        onClick={click}
        onBlur={() => setArmed(false)}
        disabled={busy}
        title={hosting ? 'Hosting — friends can join. Click twice to stop.' : 'Host this campaign so friends can join. Click twice to start.'}
      >
        {hosting ? (
          <span className="gb-host-dot" aria-hidden="true" />
        ) : (
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="1.6" fill="currentColor" />
            <path d="M5.2 5.2a4 4 0 0 0 0 5.6M10.8 5.2a4 4 0 0 1 0 5.6M3 3a7 7 0 0 0 0 10M13 3a7 7 0 0 1 0 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        )}
        <span className="gb-host-label">{label}</span>
        {hosting && !armed && !busy && <span className="gb-host-stop">Stop</span>}
      </button>
      {error && (
        <span className="gb-host-error" role="alert" title={error}>
          {error}
        </span>
      )}
    </>
  )
}
