import { useState } from 'react'
import { Button } from '../../ui/Button'
import { Mark } from '../../ui/Mark'
import { ModeToggle, type Mode } from './ModeToggle'
import { HostingPanel } from '../connect/HostingPanel'
import { JoinCampaignPanel } from '../connect/JoinCampaignPanel'

interface AppShellProps {
  displayName: string
}

export function AppShell({ displayName }: AppShellProps): JSX.Element {
  const [mode, setMode] = useState<Mode>('dm')

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        className="gb-drag"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          padding: 'var(--space-3) var(--space-5)',
          borderBottom: '1px solid var(--border-subtle)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Mark size={22} />
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16 }}>
            NoteGoblin
          </span>
        </div>

        <div className="gb-no-drag">
          <ModeToggle mode={mode} onChange={setMode} />
        </div>

        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{displayName}</span>
      </header>

      <main style={{ flex: 1, padding: 'var(--space-6)' }}>
        {mode === 'dm' ? <DmHome /> : <PlayerHome />}
      </main>
    </div>
  )
}

function DmHome(): JSX.Element {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <span className="gb-badge gb-badge--accent">DM</span>
      <h2 style={{ marginTop: 'var(--space-2)', marginBottom: 'var(--space-4)', fontSize: 22 }}>
        Your Table
      </h2>
      <HostingPanel />
      <p style={{ marginTop: 'var(--space-4)', fontSize: 12, color: 'var(--text-muted)' }}>
        Campaign creation, notes, and the bestiary land here once hosting is wired to a real
        campaign (next build step).
      </p>
    </div>
  )
}

function PlayerHome(): JSX.Element {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-5)'
        }}
      >
        <div>
          <span className="gb-badge gb-badge--accent">Player</span>
          <h2 style={{ marginTop: 'var(--space-2)', fontSize: 22 }}>Your Characters</h2>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button variant="primary" disabled>
            New Character
          </Button>
        </div>
      </div>

      <div
        className="gb-card"
        style={{ textAlign: 'center', padding: 'var(--space-7) var(--space-5)', marginBottom: 'var(--space-5)' }}
      >
        <h3 style={{ fontSize: 17 }}>No characters yet</h3>
        <p>
          Build a character whenever inspiration strikes — you don't need a campaign lined up
          first. Pair it to a campaign later, from here or once you've joined one.
        </p>
      </div>

      <JoinCampaignPanel />
    </div>
  )
}
