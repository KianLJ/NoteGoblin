import { useState } from 'react'
import { Button } from '../../ui/Button'
import { Mark } from '../../ui/Mark'
import { ModeToggle, type Mode } from './ModeToggle'

interface AppShellProps {
  displayName: string
}

export function AppShell({ displayName }: AppShellProps): JSX.Element {
  const [mode, setMode] = useState<Mode>('dm')

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
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

        <ModeToggle mode={mode} onChange={setMode} />

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
    <EmptyState
      eyebrow="DM"
      title="No campaigns yet"
      description="Start a campaign of your own — notes, initiative, and a bestiary will live here once hosting is wired up."
      action="New Campaign"
    />
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
          <Button variant="secondary" disabled>
            Join a Campaign
          </Button>
          <Button variant="primary" disabled>
            New Character
          </Button>
        </div>
      </div>

      <div
        className="gb-card"
        style={{ textAlign: 'center', padding: 'var(--space-7) var(--space-5)' }}
      >
        <h3 style={{ fontSize: 17 }}>No characters yet</h3>
        <p>
          Build a character whenever inspiration strikes — you don't need a campaign lined up
          first. Pair it to a campaign later, from here or once you've joined one.
        </p>
      </div>
    </div>
  )
}

function EmptyState({
  eyebrow,
  title,
  description,
  action
}: {
  eyebrow: string
  title: string
  description: string
  action: string
}): JSX.Element {
  return (
    <div
      style={{
        maxWidth: 480,
        margin: '0 auto',
        textAlign: 'center',
        paddingTop: 'var(--space-8)'
      }}
    >
      <span className="gb-badge gb-badge--accent">{eyebrow}</span>
      <h2 style={{ marginTop: 'var(--space-3)', fontSize: 22 }}>{title}</h2>
      <p>{description}</p>
      <Button variant="primary" disabled style={{ marginTop: 'var(--space-3)' }}>
        {action}
      </Button>
    </div>
  )
}
