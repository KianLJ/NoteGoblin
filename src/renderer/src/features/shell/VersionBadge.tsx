import { useEffect, useState } from 'react'

/** Tiny, out-of-the-way version label — mainly so an update can be visually confirmed (before/after version strings) without digging through file properties. */
export function VersionBadge(): JSX.Element | null {
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    window.goblin.getAppVersion().then(setVersion)
  }, [])

  if (!version) return null

  return (
    <div
      className="gb-no-drag"
      style={{
        position: 'fixed',
        bottom: 4,
        right: 6,
        fontSize: 10,
        color: 'var(--text-muted)',
        opacity: 0.6,
        userSelect: 'none',
        pointerEvents: 'none',
        zIndex: 1
      }}
    >
      v{version}
    </div>
  )
}
