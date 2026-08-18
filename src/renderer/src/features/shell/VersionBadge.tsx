import { useEffect, useState } from 'react'
import { Changelog } from './Changelog'

/** Tiny, out-of-the-way version label — mainly so an update can be visually confirmed (before/after version strings) without digging through file properties. Doubles as the entry point to the changelog. */
export function VersionBadge(): JSX.Element | null {
  const [version, setVersion] = useState<string | null>(null)
  const [changelogOpen, setChangelogOpen] = useState(false)

  useEffect(() => {
    window.goblin.getAppVersion().then(setVersion)
  }, [])

  if (!version) return null

  return (
    <>
      <button
        type="button"
        className="gb-no-drag"
        onClick={() => setChangelogOpen(true)}
        title="View changelog"
        style={{
          position: 'fixed',
          bottom: 4,
          right: 6,
          fontSize: 10,
          color: 'var(--text-muted)',
          opacity: 0.6,
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          userSelect: 'none',
          zIndex: 1
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
      >
        v{version}
      </button>
      {changelogOpen && <Changelog currentVersion={version} onClose={() => setChangelogOpen(false)} />}
    </>
  )
}
