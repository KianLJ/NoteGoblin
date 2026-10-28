/** Loading/error line for a section — once data has loaded once (cached), a later refresh failing stays quiet rather than covering what's already shown. */
export function Status({ error, loading, onRetry }: { error: string | null; loading: boolean; onRetry: () => void }): JSX.Element | null {
  if (error && loading) {
    return (
      <p className="v-error">
        {error}{' '}
        <button type="button" className="v-link-button" onClick={onRetry}>
          Try again
        </button>
      </p>
    )
  }
  if (loading) return <p className="v-muted">Loading…</p>
  return null
}
