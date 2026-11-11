import { describe, expect, it } from 'vitest'
import { LOGIN_WINDOW_MS, MAX_LOGIN_FAILURES, isLocked, withFailure, type LoginFailures } from '../relay/src/lib/loginLimit'

describe('relay login limit', () => {
  it('locks after the maximum failures inside the window, and not before', () => {
    let record: LoginFailures | undefined
    for (let i = 0; i < MAX_LOGIN_FAILURES - 1; i++) record = withFailure(record, 1000 + i)
    expect(isLocked(record, 2000)).toBe(false)
    record = withFailure(record, 2000)
    expect(isLocked(record, 2000)).toBe(true)
  })

  it('unlocks once the window has passed, and starts a fresh count', () => {
    const record: LoginFailures = { count: MAX_LOGIN_FAILURES, since: 0 }
    expect(isLocked(record, LOGIN_WINDOW_MS - 1)).toBe(true)
    expect(isLocked(record, LOGIN_WINDOW_MS)).toBe(false)
    expect(withFailure(record, LOGIN_WINDOW_MS)).toEqual({ count: 1, since: LOGIN_WINDOW_MS })
  })

  it('never locks a name with no failures', () => {
    expect(isLocked(undefined, 0)).toBe(false)
  })
})
