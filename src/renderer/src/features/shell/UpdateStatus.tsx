import { useEffect, useState } from 'react'
import type { UpdateStatus } from '@shared/ipc'

/** The auto-updater's current status, kept live. */
export function useUpdateStatus(): UpdateStatus {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  useEffect(() => {
    let alive = true
    window.goblin.updates.getStatus().then((s) => alive && setStatus(s))
    const off = window.goblin.updates.onStatus(setStatus)
    return () => {
      alive = false
      off()
    }
  }, [])
  return status
}

const mb = (bytes: number): string => `${Math.round(bytes / 1e6)} MB`

function ago(at: number): string {
  const mins = Math.round((Date.now() - at) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  return `${hours} hour${hours === 1 ? '' : 's'} ago`
}

/** One line saying where updates are ("Downloading 0.6.2 — 35% (140 of 416 MB)"). */
export function describeUpdateStatus(s: UpdateStatus): string {
  switch (s.state) {
    case 'idle':
      return 'Not checked for updates yet.'
    case 'dev':
      return 'Updates are off in a development build.'
    case 'checking':
      return 'Checking for updates…'
    case 'current':
      return `You're on the latest version (checked ${ago(s.checkedAt)}).`
    case 'downloading':
      return `Downloading ${s.version || 'the update'} — ${s.percent}%${s.total ? ` (${mb(s.transferred)} of ${mb(s.total)})` : ''}. You can keep using the app.`
    case 'ready':
      return `Version ${s.version} is downloaded and ready.`
    case 'error':
      return `Couldn't check for updates: ${s.message}`
  }
}

/**
 * The small pill beside the version badge, shown only while there's
 * something to see: an update downloading (with its progress), ready to
 * install, or a failed check.
 */
export function UpdatePill({ status, onOpenDetails }: { status: UpdateStatus; onOpenDetails: () => void }): JSX.Element | null {
  const base = { fontSize: 10, border: 'none', borderRadius: 999, padding: '1px 8px', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' as const }
  if (status.state === 'downloading') {
    return (
      <button
        type="button"
        onClick={onOpenDetails}
        title={describeUpdateStatus(status)}
        style={{ ...base, color: 'var(--accent)', background: `linear-gradient(to right, var(--accent-subtle) ${status.percent}%, transparent ${status.percent}%)`, outline: '1px solid var(--accent)' }}
      >
        Updating to {status.version} · {status.percent}%
      </button>
    )
  }
  if (status.state === 'ready') {
    return (
      <button type="button" onClick={() => void window.goblin.updates.install()} title="Restart NoteGoblin to finish installing the update" style={{ ...base, color: 'var(--text-on-accent)', background: 'var(--accent)' }}>
        Restart to update to {status.version}
      </button>
    )
  }
  if (status.state === 'error') {
    return (
      <button type="button" onClick={onOpenDetails} title={describeUpdateStatus(status)} style={{ ...base, color: 'var(--danger)', background: 'transparent', outline: '1px solid var(--danger)' }}>
        Update check failed
      </button>
    )
  }
  return null
}

/** The updates block at the top of the changelog: the status in words, a Check for updates button, and Restart when one is ready. */
export function UpdatePanel({ status }: { status: UpdateStatus }): JSX.Element {
  const [checking, setChecking] = useState(false)
  const busy = checking || status.state === 'checking' || status.state === 'downloading'
  return (
    <div className="gb-card" style={{ padding: 'var(--space-3)', marginBottom: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, color: status.state === 'error' ? 'var(--danger)' : 'var(--text-secondary)', lineHeight: 1.5 }}>{describeUpdateStatus(status)}</div>
      {status.state === 'downloading' && (
        <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-sunken)', overflow: 'hidden' }}>
          <div style={{ width: `${status.percent}%`, height: '100%', background: 'var(--accent)', transition: 'width 300ms' }} />
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        {status.state === 'ready' ? (
          <button type="button" className="gb-btn gb-btn--primary" onClick={() => void window.goblin.updates.install()} style={{ fontSize: 12, padding: '4px 10px' }}>
            Restart and update
          </button>
        ) : (
          <button
            type="button"
            className="gb-btn gb-btn--secondary"
            disabled={busy || status.state === 'dev'}
            onClick={async () => {
              setChecking(true)
              await window.goblin.updates.check()
              setChecking(false)
            }}
            style={{ fontSize: 12, padding: '4px 10px' }}
          >
            {status.state === 'checking' || checking ? 'Checking…' : status.state === 'error' ? 'Try again' : 'Check for updates'}
          </button>
        )}
      </div>
    </div>
  )
}
