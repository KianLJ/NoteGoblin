import { useEffect, useState } from 'react'
import { Changelog } from './Changelog'
import { lastSeenVersion, markWhatsNewSeen } from './WhatsNew'
import { CHANGELOG, type ChangelogEntry } from '../../data/changelog'
import { entriesSince } from '@shared/whatsNew'
import { UpdatePill, UpdateReadyCard, useUpdateStatus } from './UpdateStatus'

interface VersionBadgeProps {
  /** Opens the What's New box on the canvas with these versions' notes — on the first launch after an update, and from the changelog. */
  onWhatsNew?: (entries: ChangelogEntry[]) => void
  /** 'fixed' (default) floats it in the bottom-right corner — used on the login screen, which has no header row to sit inline in. 'inline' renders as a plain flex child instead, for AppShell's header (bottom-right is now the Messages panel's chat composer, a real collision the fixed corner used to have). */
  variant?: 'fixed' | 'inline'
}

/** Tiny version label — mainly so an update can be visually confirmed (before/after version strings) without digging through file properties. Doubles as the entry point to the changelog, which also has the update status and Check for updates; a pill beside it shows an update downloading, ready to install, or a failed check. */
export function VersionBadge({ variant = 'fixed', onWhatsNew }: VersionBadgeProps): JSX.Element | null {
  const [version, setVersion] = useState<string | null>(null)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const update = useUpdateStatus()

  useEffect(() => {
    window.goblin.getAppVersion().then((v) => {
      setVersion(v)
      // The first launch after an update: its notes, once — marked seen as soon as they show. Only in the app
      // itself (the header's badge), not on the login screen, where it would count as seen before you got in.
      if (variant !== 'inline' || !onWhatsNew) return
      const fresh = entriesSince(CHANGELOG, lastSeenVersion(v), v)
      markWhatsNewSeen(v)
      if (fresh.length > 0) onWhatsNew(fresh)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant])

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
      <UpdateReadyCard status={update} />
      {changelogOpen && (
        <Changelog
          currentVersion={version}
          update={update}
          onClose={() => setChangelogOpen(false)}
          onShowWhatsNew={
            onWhatsNew &&
            (() => {
              const current = CHANGELOG.find((e) => e.version === version) ?? CHANGELOG[0]
              setChangelogOpen(false)
              if (current) onWhatsNew([current])
            })
          }
        />
      )}
    </span>
  )
}
