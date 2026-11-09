import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  adjustTimer,
  elapsedMs,
  formatTimer,
  parseStopwatch,
  parseTimer,
  pauseTimer,
  remainingMs,
  resumeTimer,
  runStopwatch,
  startTimer,
  stopStopwatch,
  type StopwatchState,
  type TimerState
} from '@shared/sessionTimer'
import { playSfx } from '../audio/soundEffects'

const STORAGE_KEY = 'gb-session-timer'
const MIN = 60_000
const WARN_MS = 15 * MIN
const PRESETS = [1, 2, 3, 4]

// One timer, shared by the dock button and the Session Timer box, kept on this computer so it carries on across a restart.
const listeners = new Set<() => void>()
let current: TimerState = (() => {
  try {
    return parseTimer(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'))
  } catch {
    return { kind: 'idle' } as TimerState
  }
})()

export function setSessionTimer(next: TimerState): void {
  setTimer(next)
}

function setTimer(next: TimerState): void {
  current = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* best-effort persistence only */
  }
  listeners.forEach((l) => l())
}

// The stopwatch, kept the same way.
const STOPWATCH_KEY = 'gb-session-stopwatch'
let currentWatch: StopwatchState = (() => {
  try {
    return parseStopwatch(JSON.parse(localStorage.getItem(STOPWATCH_KEY) ?? 'null'))
  } catch {
    return { kind: 'idle' } as StopwatchState
  }
})()

function setWatch(next: StopwatchState): void {
  currentWatch = next
  try {
    localStorage.setItem(STOPWATCH_KEY, JSON.stringify(next))
  } catch {
    /* best-effort persistence only */
  }
  listeners.forEach((l) => l())
}

/** The timer and stopwatch, and the time now — ticking every second while either runs. */
function useTimer(): { timer: TimerState; watch: StopwatchState; now: number } {
  const subscribe = (l: () => void): (() => void) => {
    listeners.add(l)
    return () => listeners.delete(l)
  }
  const timer = useSyncExternalStore(subscribe, () => current)
  const watch = useSyncExternalStore(subscribe, () => currentWatch)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    setNow(Date.now())
    if (timer.kind !== 'running' && watch.kind !== 'running') return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [timer, watch])
  return { timer, watch, now }
}

const VIEW_KEY = 'gb-session-timer-view'

/** '' (plenty left), ' gb-timer--warn' (last 15 minutes) or ' gb-timer--done' (time's up). */
function stateClass(timer: TimerState, left: number): string {
  if (timer.kind === 'running' && left === 0) return ' gb-timer--done'
  return timer.kind !== 'idle' && left <= WARN_MS ? ' gb-timer--warn' : ''
}

/**
 * The timer's button in the DM's dock: a clock while it's unset, then the
 * time left with a ring that runs down — amber in the last 15 minutes, red
 * (with one chime, only for the DM) when time's up. Click it to open the
 * Session Timer box; right-click closes the box.
 */
export function TimerDockButton({ onOpen, onClose }: { onOpen: () => void; onClose: () => void }): JSX.Element {
  const { timer, watch, now } = useTimer()
  const left = remainingMs(timer, now)
  const done = timer.kind === 'running' && left === 0
  // With no countdown set, a running stopwatch shows here instead.
  const watching = timer.kind === 'idle' && watch.kind === 'running'
  const chimed = useRef(false)
  useEffect(() => {
    if (!done) chimed.current = false
    else if (!chimed.current) {
      chimed.current = true
      playSfx('sceneAdvance')
    }
  }, [done])

  const set = timer.kind !== 'idle'
  const fraction = set && timer.totalMs > 0 ? left / timer.totalMs : 0
  return (
    <div className={`gb-timer${stateClass(timer, left)}`}>
      <button
        type="button"
        className={set ? 'gb-dock-tool gb-timer-button gb-timer-button--set' : 'gb-dock-tool gb-timer-button'}
        data-label={set ? `Session timer${timer.kind === 'paused' ? ' (paused)' : ''} · right-click to close` : 'Session timer'}
        aria-label={set ? `Session timer: ${formatTimer(left)} left` : 'Session timer'}
        onClick={onOpen}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      >
        <svg viewBox="0 0 36 36" className="gb-timer-ring" aria-hidden="true">
          <circle cx="18" cy="18" r="15" className="gb-timer-ring-track" />
          {set && <circle cx="18" cy="18" r="15" className="gb-timer-ring-fill" pathLength={100} strokeDasharray={`${fraction * 100} 100`} />}
        </svg>
        {set ? (
          <span className="gb-timer-text">{timer.kind === 'paused' ? '❚❚' : formatTimer(left)}</span>
        ) : watching ? (
          <span className="gb-timer-text">{formatTimer(elapsedMs(watch, now))}</span>
        ) : (
          <TimerIcon />
        )}
      </button>
    </div>
  )
}

export function TimerIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="gb-timer-icon">
      <circle cx="8" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 6v3l2 1.5M6.5 1.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

/**
 * The Session Timer box: a countdown or a stopwatch, picked at the top. The
 * countdown is how long is left in tonight's session, as big as the box is
 * (it scales with the box), with its controls under it — pick 1–4 hours or
 * type a length to start; pause, add or take 15 minutes, or reset while it
 * runs. The stopwatch counts up: start, stop, carry on, reset. Both keep
 * going while the other shows.
 */
export function TimerPanel(): JSX.Element {
  const [view, setViewState] = useState<'timer' | 'stopwatch'>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'stopwatch' ? 'stopwatch' : 'timer'
    } catch {
      return 'timer'
    }
  })
  function setView(next: 'timer' | 'stopwatch'): void {
    setViewState(next)
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {
      /* best-effort only */
    }
  }
  return (
    <div className="gb-timer-wrap">
      <div className="gb-timer-tabs" role="tablist">
        {(['timer', 'stopwatch'] as const).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? 'gb-timer-tab gb-timer-tab--on' : 'gb-timer-tab'} onClick={() => setView(v)}>
            {v === 'timer' ? 'Countdown' : 'Stopwatch'}
          </button>
        ))}
      </div>
      {view === 'timer' ? <CountdownPanel /> : <StopwatchPanel />}
    </div>
  )
}

function StopwatchPanel(): JSX.Element {
  const { watch, now } = useTimer()
  return (
    <div className="gb-timer-panel">
      <div className="gb-timer-big">{formatTimer(elapsedMs(watch, now))}</div>
      <div className="gb-timer-row">
        {watch.kind === 'running' ? (
          <button type="button" className="gb-btn gb-btn--secondary" onClick={() => setWatch(stopStopwatch(watch, Date.now()))}>
            Stop
          </button>
        ) : (
          <button type="button" className="gb-btn gb-btn--primary" onClick={() => setWatch(runStopwatch(watch, Date.now()))}>
            {watch.kind === 'paused' ? 'Carry on' : 'Start'}
          </button>
        )}
        <button type="button" className="gb-btn gb-btn--ghost" onClick={() => setWatch({ kind: 'idle' })} disabled={watch.kind === 'idle'}>
          Reset
        </button>
      </div>
    </div>
  )
}

function CountdownPanel(): JSX.Element {
  const { timer, now } = useTimer()
  const [hours, setHours] = useState('')
  const [minutes, setMinutes] = useState('')
  const left = remainingMs(timer, now)
  const done = timer.kind === 'running' && left === 0
  const set = timer.kind !== 'idle'
  const fraction = set && timer.totalMs > 0 ? left / timer.totalMs : 0

  function startCustom(): void {
    const ms = ((parseInt(hours, 10) || 0) * 60 + (parseInt(minutes, 10) || 0)) * MIN
    if (ms <= 0) return
    setTimer(startTimer(ms, Date.now()))
    setHours('')
    setMinutes('')
  }

  return (
    <div className={`gb-timer-panel${stateClass(timer, left)}`}>
      <div className="gb-timer-big">{set ? formatTimer(left) : '--:--'}</div>
      {set && (
        <div className="gb-timer-bar">
          <div className="gb-timer-bar-fill" style={{ width: `${fraction * 100}%` }} />
        </div>
      )}
      {set ? (
        <div className="gb-timer-row">
          {timer.kind === 'running' ? (
            <button type="button" className="gb-btn gb-btn--secondary" onClick={() => setTimer(pauseTimer(timer, Date.now()))} disabled={done}>
              Pause
            </button>
          ) : (
            <button type="button" className="gb-btn gb-btn--primary" onClick={() => setTimer(resumeTimer(timer, Date.now()))}>
              Resume
            </button>
          )}
          <button type="button" className="gb-btn gb-btn--secondary" onClick={() => setTimer(adjustTimer(timer, 15 * MIN, Date.now()))}>
            +15m
          </button>
          <button type="button" className="gb-btn gb-btn--secondary" onClick={() => setTimer(adjustTimer(timer, -15 * MIN, Date.now()))} disabled={done}>
            −15m
          </button>
          <button type="button" className="gb-btn gb-btn--ghost" onClick={() => setTimer({ kind: 'idle' })}>
            Reset
          </button>
        </div>
      ) : (
        <>
          <div className="gb-timer-row">
            {PRESETS.map((h) => (
              <button key={h} type="button" className="gb-btn gb-btn--secondary" onClick={() => setTimer(startTimer(h * 60 * MIN, Date.now()))}>
                {h}h
              </button>
            ))}
          </div>
          <form
            className="gb-timer-row"
            onSubmit={(e) => {
              e.preventDefault()
              startCustom()
            }}
          >
            <input className="gb-input" type="number" min={0} max={23} placeholder="h" value={hours} onChange={(e) => setHours(e.target.value)} aria-label="Hours" />
            <input className="gb-input" type="number" min={0} max={59} placeholder="min" value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-label="Minutes" />
            <button type="submit" className="gb-btn gb-btn--primary" disabled={!(parseInt(hours, 10) > 0 || parseInt(minutes, 10) > 0)}>
              Start
            </button>
          </form>
        </>
      )}
    </div>
  )
}
