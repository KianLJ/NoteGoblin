/**
 * Node's raw network error messages ("connect ECONNREFUSED 192.168.0.178:47331")
 * are accurate but not something a non-technical player should have to parse.
 * This maps the common cases to plain language while keeping the error code
 * visible in parentheses, so it's still useful to paste into a bug report.
 */
export function friendlyConnectionError(err: unknown): string {
  const code = (err as NodeJS.ErrnoException)?.code

  // A string `code` means this is a genuine network-level failure (from
  // tls.connect/https.request); anything else is one of our own thrown
  // Error objects, which already carry a friendly message worth keeping.
  if (typeof code !== 'string') {
    return err instanceof Error ? err.message : 'Unable to connect to that host.'
  }

  switch (code) {
    case 'ECONNREFUSED':
      return `Unable to connect — nothing is listening at that address. Make sure the DM has started hosting. (${code})`
    case 'ETIMEDOUT':
      return `Unable to connect — that address didn’t respond in time. (${code})`
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      return `Unable to connect — that address isn’t reachable. Check you’re on the same network (e.g. both on Tailscale). (${code})`
    case 'ENOTFOUND':
      return `Unable to connect — that address could not be found. (${code})`
    case 'ECONNRESET':
      return `Unable to connect — the connection was reset partway through. (${code})`
    default:
      return `Unable to connect to that host. (${code})`
  }
}
