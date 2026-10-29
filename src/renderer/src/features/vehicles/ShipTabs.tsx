import { useState, type ReactNode } from 'react'

export type ShipTab = 'ship' | 'stations' | 'weapons'

// The tab last looked at, kept while the app is open, so picking another ship (or the same one again) stays on it.
let lastTab: ShipTab = 'ship'

/** A vehicle's panel in the Combat tab, in three tabs: the ship itself, its stations, its weapons. */
export function ShipTabs({ ship, stations, weapons }: { ship: ReactNode; stations: ReactNode; weapons: ReactNode }): JSX.Element {
  const [tab, setTabState] = useState<ShipTab>(lastTab)
  const setTab = (t: ShipTab): void => {
    lastTab = t
    setTabState(t)
  }
  const tabs: Array<[ShipTab, string]> = [
    ['ship', 'Ship'],
    ['stations', 'Stations'],
    ['weapons', 'Weapons']
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', minWidth: 0 }}>
      <div role="tablist" style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border-subtle)' }}>
        {tabs.map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} style={tabButton(tab === t)}>
            {label}
          </button>
        ))}
      </div>
      {/* All stay mounted, so a half-typed amount isn't lost by looking at another tab. */}
      <div style={{ display: tab === 'ship' ? 'flex' : 'none', flexDirection: 'column', gap: 'var(--space-3)' }}>{ship}</div>
      <div style={{ display: tab === 'stations' ? 'flex' : 'none', flexDirection: 'column', gap: 'var(--space-3)' }}>{stations}</div>
      <div style={{ display: tab === 'weapons' ? 'flex' : 'none', flexDirection: 'column', gap: 'var(--space-3)' }}>{weapons}</div>
    </div>
  )
}

const tabButton = (on: boolean): React.CSSProperties => ({
  background: 'none',
  border: 'none',
  borderBottom: `2px solid ${on ? 'var(--accent)' : 'transparent'}`,
  color: on ? 'var(--text-primary)' : 'var(--text-secondary)',
  padding: '6px 10px',
  fontSize: 13,
  fontWeight: on ? 700 : 500,
  cursor: 'pointer',
  marginBottom: -1
})
