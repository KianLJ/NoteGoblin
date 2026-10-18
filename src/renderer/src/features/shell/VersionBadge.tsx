import { useEffect, useState } from 'react'
import { Changelog } from './Changelog'
import { UpdatePill, useUpdateStatus } from './UpdateStatus'

interface VersionBadgeProps {
  /** 'fixed' (default) floats it in the bottom-right corner — used on the login screen, which has no header row to sit inline in. 'inline' renders as a plain flex child instead, for AppShell's header (bottom-right is now the Messages panel's chat composer, a real collision the fixed corner used to have). */
  variant?: 'fixed' | 'inline'
}

/** Tiny version label — mainly so an update can be visually confirmed (before/after version strings) without digging through file properties. Doubles as the entry point to the changelog, which also has the update status and Check for updates; a pill beside it shows an update downloading, ready to install, or a failed check. */
export function VersionBadge({ variant = 'fixed' }: VersionBadgeProps): JSX.Element | null {
  const [version, setVersion] = useState<string | null>(null)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const update = useUpdateStatus()

  useEffect(() => {
    window.goblin.getAppVersion().then(setVersion)
  }, [])

  if (!version) return null

  return (
    <span
      className={variant === 'fixed' ? 'gb-no-drag' : undefined}
      style={{ ...(variant === 'fixed' ? { position: 'fixed', bottom: 4, right: 6, zIndex: 1 } : { flexShrink: 0 }), display: 'inline-flex', alignItems: 'center', gap: 6 }}
    >
      <UpdatePill status={update} onOpenDetails={() => setChangelogOpen(true)} />
      <button
        type="button"
        onClick={() => setChangelogOpen(true)}
        title="What's new, and check for updates"
        style={{
          flexShrink: 0,
          fontSize: 10,
          color: 'var(--text-muted)',
          opacity: 0.6,
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          userSelect: 'none'
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
      >
        v{version}
      </button>
      {changelogOpen && <Changelog currentVersion={version} update={update} onClose={() => setChangelogOpen(false)} />}
    </span>
  )
}
