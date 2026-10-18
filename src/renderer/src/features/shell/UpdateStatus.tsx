import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { UpdateStatus } from '@shared/ipc'
import appIcon from '../../assets/icon.png'

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

const DISMISSED_KEY = 'gb-update-card-dismissed'

/**
 * "NoteGoblin x.y.z is ready" — the app's own card, bottom-right, once an
 * update has downloaded: Restart now, or Later (the badge's "Restart to
 * update" pill stays, and the card doesn't come back for that version).
 */
export function UpdateReadyCard({ status }: { status: UpdateStatus }): JSX.Element | null {
  const version = status.state === 'ready' ? status.version : null
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY)
    } catch {
      return null
    }
  })
  const [restarting, setRestarting] = useState(false)
  if (!version || dismissed === version) return null
  const later = (): void => {
    setDismissed(version)
    try {
      localStorage.setItem(DISMISSED_KEY, version)
    } catch {
      /* per-device convenience only */
    }
  }
  return createPortal(
    <div
      role="dialog"
      aria-label="Update ready"
      className="gb-card gb-no-drag"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 2000,
        width: 340,
        padding: 'var(--space-4)',
        display: 'flex',
        gap: 'var(--space-3)',
        boxShadow: 'var(--shadow-lg, 0 10px 30px rgba(0,0,0,0.25))',
        borderTop: '3px solid var(--accent)',
        animation: 'gb-update-card-in 220ms ease-out'
      }}
    >
      <img src={appIcon} alt="" width={44} height={44} style={{ flexShrink: 0, objectFit: 'contain' }} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, lineHeight: 1.2 }}>NoteGoblin {version} is ready</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Restart to finish installing it. Your campaigns, notes and characters are untouched either way — see what's new from the version number.
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <button
            type="button"
            className="gb-btn gb-btn--primary"
            disabled={restarting}
            onClick={() => {
              setRestarting(true)
              void window.goblin.updates.install()
            }}
            style={{ fontSize: 12, padding: '5px 12px' }}
          >
            {restarting ? 'Restarting…' : 'Restart now'}
          </button>
          <button type="button" className="gb-btn gb-btn--ghost" onClick={later} style={{ fontSize: 12, padding: '5px 12px' }}>
            Later
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
