import { describe, expect, it } from 'vitest'
import { adjustTimer, elapsedMs, parseStopwatch, runStopwatch, stopStopwatch, formatTimer, parseTimer, pauseTimer, remainingMs, resumeTimer, startTimer } from '../shared/sessionTimer'

const H = 3600_000

describe('session timer', () => {
  it('counts down, pauses and resumes from where it stopped', () => {
    const running = startTimer(2 * H, 0)
    expect(remainingMs(running, 30 * 60_000)).toBe(90 * 60_000)
    const paused = pauseTimer(running, 30 * 60_000)
    // Time passing while paused doesn't count.
    expect(remainingMs(paused, 5 * H)).toBe(90 * 60_000)
    const resumed = resumeTimer(paused, 5 * H)
    expect(remainingMs(resumed, 5 * H + 60_000)).toBe(89 * 60_000)
    expect(remainingMs(resumed, 99 * H)).toBe(0)
  })

  it('adds and takes time, never below zero', () => {
    const running = startTimer(10 * 60_000, 0)
    expect(remainingMs(adjustTimer(running, 15 * 60_000, 0), 0)).toBe(25 * 60_000)
    expect(remainingMs(adjustTimer(running, -60 * 60_000, 0), 0)).toBe(0)
    expect(remainingMs(adjustTimer(pauseTimer(running, 0), -5 * 60_000, 0), 0)).toBe(5 * 60_000)
  })

  it('formats with hours only when there are some', () => {
    expect(formatTimer(5 * 60_000 + 9_000)).toBe('05:09')
    expect(formatTimer(H + 5 * 60_000 + 9_000)).toBe('1:05:09')
    expect(formatTimer(400)).toBe('00:01')
  })

  it('reads a saved timer back, and anything broken as idle', () => {
    expect(parseTimer({ kind: 'running', endsAt: 5, totalMs: 10 })).toEqual({ kind: 'running', endsAt: 5, totalMs: 10 })
    expect(parseTimer({ kind: 'paused', remainingMs: 'x', totalMs: 10 })).toEqual({ kind: 'idle' })
    expect(parseTimer(null)).toEqual({ kind: 'idle' })
  })

  it('runs a stopwatch up, stops it and carries on from where it stopped', () => {
    const running = runStopwatch({ kind: 'idle' }, 1000)
    expect(elapsedMs(running, 61_000)).toBe(60_000)
    const stopped = stopStopwatch(running, 61_000)
    // Time passing while stopped doesn't count.
    expect(elapsedMs(stopped, 5 * H)).toBe(60_000)
    expect(elapsedMs(runStopwatch(stopped, 5 * H), 5 * H + 30_000)).toBe(90_000)
    expect(parseStopwatch(JSON.parse(JSON.stringify(stopped)))).toEqual(stopped)
    expect(parseStopwatch({ kind: 'running', startedAt: 'x' })).toEqual({ kind: 'idle' })
  })
})
