/**
 * The DM's session timer (see canvas/SessionTimer.tsx): a countdown that is
 * either running toward `endsAt` (ms since epoch) or paused with `remainingMs`
 * left. Kept as plain data so it survives a restart.
 */
export type TimerState = { kind: 'idle' } | { kind: 'running'; endsAt: number; totalMs: number } | { kind: 'paused'; remainingMs: number; totalMs: number }

export function startTimer(totalMs: number, now: number): TimerState {
  return { kind: 'running', endsAt: now + totalMs, totalMs }
}

export function remainingMs(state: TimerState, now: number): number {
  if (state.kind === 'running') return Math.max(0, state.endsAt - now)
  if (state.kind === 'paused') return state.remainingMs
  return 0
}

export function pauseTimer(state: TimerState, now: number): TimerState {
  return state.kind === 'running' ? { kind: 'paused', remainingMs: remainingMs(state, now), totalMs: state.totalMs } : state
}

export function resumeTimer(state: TimerState, now: number): TimerState {
  return state.kind === 'paused' ? { kind: 'running', endsAt: now + state.remainingMs, totalMs: state.totalMs } : state
}

/** Adds (or with a negative `deltaMs`, takes) time, never below zero. */
export function adjustTimer(state: TimerState, deltaMs: number, now: number): TimerState {
  if (state.kind === 'running') return { ...state, endsAt: Math.max(now, state.endsAt + deltaMs), totalMs: Math.max(0, state.totalMs + deltaMs) }
  if (state.kind === 'paused') return { ...state, remainingMs: Math.max(0, state.remainingMs + deltaMs), totalMs: Math.max(0, state.totalMs + deltaMs) }
  return state
}

/** "1:05:09", or "05:09" under an hour. */
export function formatTimer(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** Reads a saved timer back; anything malformed is an idle timer. */
export function parseTimer(raw: unknown): TimerState {
  const t = raw as Partial<{ kind: string; endsAt: number; remainingMs: number; totalMs: number }> | null
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
  if (t?.kind === 'running' && ok(t.endsAt) && ok(t.totalMs)) return { kind: 'running', endsAt: t.endsAt, totalMs: t.totalMs }
  if (t?.kind === 'paused' && ok(t.remainingMs) && ok(t.totalMs)) return { kind: 'paused', remainingMs: t.remainingMs, totalMs: t.totalMs }
  return { kind: 'idle' }
}

/**
 * The stopwatch beside the countdown: counting up from `startedAt` (plus
 * `baseMs` from before its last pause), or stopped with `elapsedMs` on it.
 */
export type StopwatchState = { kind: 'idle' } | { kind: 'running'; startedAt: number; baseMs: number } | { kind: 'paused'; elapsedMs: number }

export function elapsedMs(state: StopwatchState, now: number): number {
  if (state.kind === 'running') return state.baseMs + Math.max(0, now - state.startedAt)
  if (state.kind === 'paused') return state.elapsedMs
  return 0
}

/** Starts it, or carries on from a pause. */
export function runStopwatch(state: StopwatchState, now: number): StopwatchState {
  if (state.kind === 'running') return state
  return { kind: 'running', startedAt: now, baseMs: state.kind === 'paused' ? state.elapsedMs : 0 }
}

export function stopStopwatch(state: StopwatchState, now: number): StopwatchState {
  return state.kind === 'running' ? { kind: 'paused', elapsedMs: elapsedMs(state, now) } : state
}

/** Reads a saved stopwatch back; anything malformed is a stopwatch at zero. */
export function parseStopwatch(raw: unknown): StopwatchState {
  const t = raw as Partial<{ kind: string; startedAt: number; baseMs: number; elapsedMs: number }> | null
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0
  if (t?.kind === 'running' && ok(t.startedAt) && ok(t.baseMs)) return { kind: 'running', startedAt: t.startedAt, baseMs: t.baseMs }
  if (t?.kind === 'paused' && ok(t.elapsedMs)) return { kind: 'paused', elapsedMs: t.elapsedMs }
  return { kind: 'idle' }
}
