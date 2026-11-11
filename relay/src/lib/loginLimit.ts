/**
 * Caps wrong-password sign-ins per account name, so a relay account can't be
 * guessed at endlessly. Keyed by name, not IP: someone can lock a friend out
 * for a few minutes by failing on purpose, which is fine for a friend-group
 * relay and better than unlimited guesses.
 */

export const MAX_LOGIN_FAILURES = 10
export const LOGIN_WINDOW_MS = 15 * 60 * 1000

/** Kept by the directory as `loginFails:<username>`. */
export interface LoginFailures {
  count: number
  /** When the first failure in this window happened (ms since epoch). */
  since: number
}

export const LOCKED_MESSAGE = 'Too many sign-in attempts. Wait 15 minutes and try again.'

/** Whether sign-in is blocked right now: too many failures, still inside the window. */
export function isLocked(record: LoginFailures | undefined, now: number): boolean {
  return !!record && now - record.since < LOGIN_WINDOW_MS && record.count >= MAX_LOGIN_FAILURES
}

/** The record after one more wrong password — a fresh window once the old one has run out. */
export function withFailure(record: LoginFailures | undefined, now: number): LoginFailures {
  if (!record || now - record.since >= LOGIN_WINDOW_MS) return { count: 1, since: now }
  return { count: record.count + 1, since: record.since }
}
