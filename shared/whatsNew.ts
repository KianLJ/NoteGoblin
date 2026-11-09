/**
 * Which changelog entries the "What's new" window shows after an update: every
 * version newer than the one you last saw, up to the one you're running —
 * several, if you skipped some updates. `changelog` is newest first.
 */
export function entriesSince<T extends { version: string }>(changelog: T[], lastSeen: string, current: string): T[] {
  return changelog.filter((e) => compareVersions(e.version, lastSeen) > 0 && compareVersions(e.version, current) <= 0)
}

/** Negative, zero or positive as `a` is older than, the same as, or newer than `b` ("0.9.10" is newer than "0.9.2"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}
