import { describe, expect, it } from 'vitest'
import { compareVersions, entriesSince } from '../shared/whatsNew'

const log = [{ version: '0.10.0' }, { version: '0.9.2' }, { version: '0.9.1' }, { version: '0.9.0' }]

describe("what's new", () => {
  it('compares versions number by number', () => {
    expect(compareVersions('0.9.10', '0.9.2')).toBeGreaterThan(0)
    expect(compareVersions('0.9.2', '0.9.2')).toBe(0)
    expect(compareVersions('0.9', '0.9.1')).toBeLessThan(0)
  })

  it('shows every version since the one last seen, up to the one running', () => {
    expect(entriesSince(log, '0.9.0', '0.9.2').map((e) => e.version)).toEqual(['0.9.2', '0.9.1'])
    expect(entriesSince(log, '0.9.2', '0.9.2')).toEqual([])
    // Running a version older than the newest entry (a dev build mid-release) shows nothing past it.
    expect(entriesSince(log, '0.0.0', '0.9.1').map((e) => e.version)).toEqual(['0.9.1', '0.9.0'])
  })
})
