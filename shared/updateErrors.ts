// Turning electron-updater's errors (often a multi-line HTTP dump) into one
// short line for the version badge. Pure, so it's tested without Electron.

/** A short, readable reason from electron-updater's error (which is often a multi-line HTTP dump). */
export function updateErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  if (/ERR_INTERNET_DISCONNECTED|ENOTFOUND|EAI_AGAIN|ERR_NAME_NOT_RESOLVED/.test(raw)) return 'No internet connection.'
  if (/ETIMEDOUT|ERR_TIMED_OUT|ESOCKETTIMEDOUT/.test(raw)) return 'The update server took too long to answer.'
  if (/sha512 checksum mismatch/i.test(raw)) return 'The download was damaged — it will try again.'
  if (/\b(403|429)\b/.test(raw) && /rate limit/i.test(raw)) return 'GitHub is limiting update checks right now — try again in a while.'
  const first = raw.split('\n')[0].trim()
  return first.length > 200 ? `${first.slice(0, 200)}…` : first || 'Something went wrong.'
}
