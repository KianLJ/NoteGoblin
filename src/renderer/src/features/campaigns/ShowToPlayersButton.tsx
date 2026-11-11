import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Handout, PresencePlayer } from '@shared/ipc'

/**
 * A box's "Show to players" button (DM, while hosting): sends what `build` makes as a handout, which comes up on
 * connected players' screens (HandoutViewer.tsx). With more than one player at the table it first asks who: everyone
 * is ticked, untick anyone it isn't for. Says how it went on the button itself for a moment.
 */
export function ShowToPlayersButton({ build, players = [] }: { build: () => Promise<Handout | null>; players?: PresencePlayer[] }): JSX.Element {
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [picking, setPicking] = useState<{ x: number; y: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!status) return
    const t = setTimeout(() => setStatus(null), status.ok ? 2200 : 4000)
    return () => clearTimeout(t)
  }, [status])

  async function show(only?: string[]): Promise<void> {
    setPicking(null)
    const handout = await build()
    if (!handout) return setStatus({ ok: false, text: 'Nothing to show' })
    const result = await window.goblin.handouts.show(handout, only)
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
    <>
      <button
        ref={button}
        type="button"
        className="gb-canvas-node-close"
        title="Show to players"
        aria-label="Show to players"
        aria-haspopup={players.length > 1 ? 'dialog' : undefined}
        aria-expanded={players.length > 1 ? !!picking : undefined}
        onClick={() => {
          if (players.length <= 1) return void show()
          if (picking) return setPicking(null)
          const r = button.current!.getBoundingClientRect()
          setPicking({ x: r.right, y: r.bottom + 6 })
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1.5" y="2.5" width="13" height="8.5" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
          <path d="M5.5 14h5M8 11v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M6.5 5.2v3.1L9.4 6.75Z" fill="currentColor" />
        </svg>
      </button>
      {picking && createPortal(<AudiencePicker at={picking} players={players} anchor={button} onShow={(only) => void show(only)} onClose={() => setPicking(null)} />, document.body)}
    </>
  )
}

/** Who a handout goes to: the players at the table, all ticked to start with. */
function AudiencePicker({
  at,
  players,
  anchor,
  onShow,
  onClose
}: {
  at: { x: number; y: number }
  players: PresencePlayer[]
  anchor: React.RefObject<HTMLElement>
  onShow: (only?: string[]) => void
  onClose: () => void
}): JSX.Element {
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(players.map((p) => p.userId)))
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('input')?.focus()
    const away = (e: PointerEvent): void => {
      const t = e.target as Node
      if (!box.current?.contains(t) && !anchor.current?.contains(t)) onClose()
    }
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        anchor.current?.focus()
      }
    }
    document.addEventListener('pointerdown', away, true)
    document.addEventListener('keydown', key, true)
    return () => {
      document.removeEventListener('pointerdown', away, true)
      document.removeEventListener('keydown', key, true)
    }
  }, [anchor, onClose])

  const all = chosen.size === players.length
  return (
    <div ref={box} className="gb-audience" role="dialog" aria-label="Show to whom" style={{ top: at.y, left: Math.max(8, at.x - 220) }}>
      <div className="gb-audience-head">
        <span>Show to</span>
        <button type="button" className="gb-audience-all" onClick={() => setChosen(all ? new Set() : new Set(players.map((p) => p.userId)))}>
          {all ? 'Clear' : 'Everyone'}
        </button>
      </div>
      <ul>
        {players.map((p) => (
          <li key={p.userId}>
            <label>
              <input
                type="checkbox"
                checked={chosen.has(p.userId)}
                onChange={(e) =>
                  setChosen((prev) => {
                    const next = new Set(prev)
                    if (e.target.checked) next.add(p.userId)
                    else next.delete(p.userId)
                    return next
                  })
                }
              />
              <span className="gb-audience-name">{p.displayName}</span>
              {p.characterName && <span className="gb-audience-character">{p.characterName}</span>}
            </label>
          </li>
        ))}
      </ul>
      <button type="button" className="gb-audience-show" disabled={chosen.size === 0} onClick={() => onShow(all ? undefined : [...chosen])}>
        {all ? 'Show to everyone' : chosen.size === 0 ? 'Pick someone' : `Show to ${chosen.size}`}
      </button>
    </div>
  )
}
