import { useEffect, useRef, useState } from 'react'
import { Button } from '../../ui/Button'
import { ModeToggle, type Mode } from './ModeToggle'
import { HostingCorner } from '../connect/HostingCorner'
import { JoinCampaignPanel } from '../connect/JoinCampaignPanel'
import { CampaignSwitcher } from '../campaigns/CampaignSwitcher'
import { CampaignWorkspace } from '../campaigns/CampaignWorkspace'
import { WorkspaceHeaderBar } from '../campaigns/WorkspaceHeaderBar'
import { useNotesWorkspace } from '../campaigns/useNotesWorkspace'
import { AccountSettingsButton } from '../account/AccountSettingsButton'
import type { Campaign } from '@shared/ipc'

interface AppShellProps {
  displayName: string
}

interface OpenWorkspace {
  campaign: Campaign
  /** undefined = the DM's own table (no network needed); set = a remote host address. */
  address?: string
}

export function AppShell({ displayName }: AppShellProps): JSX.Element {
  const [mode, setMode] = useState<Mode>('dm')
  const [activeWorkspace, setActiveWorkspace] = useState<OpenWorkspace | null>(null)
  const [connectedHost, setConnectedHost] = useState<{ address: string; label: string } | null>(null)

  // Called unconditionally (campaignId is null when nothing's open) so the
  // header's tab strip and the sidebar/editor body below share one source
  // of truth instead of each fetching independently.
  const workspace = useNotesWorkspace(activeWorkspace?.address, activeWorkspace?.campaign.id ?? null)

  // Auto-open the most recent campaign you're actually part of, once per
  // context (your own table, or a given connected host). There's no "back"
  // to re-arm this from — once a campaign exists it's always the active one,
  // switching only happens via the corner CampaignSwitcher.
  const dmAutoOpenedRef = useRef(false)
  const playerAutoOpenedForRef = useRef<string | null>(null)

  useEffect(() => {
    if (activeWorkspace) return

    if (mode === 'dm') {
      if (dmAutoOpenedRef.current) return
      dmAutoOpenedRef.current = true
      window.goblin.campaigns.list().then((result) => {
        if (!result.ok) return
        const mine = result.data.filter((c) => c.myRole !== null)
        if (mine.length > 0) setActiveWorkspace({ campaign: mine[0] })
      })
      return
    }

    if (mode === 'player' && connectedHost) {
      if (playerAutoOpenedForRef.current === connectedHost.address) return
      playerAutoOpenedForRef.current = connectedHost.address
      window.goblin.campaigns.list(connectedHost.address).then((result) => {
        if (!result.ok) return
        const mine = result.data.filter((c) => c.myRole !== null)
        if (mine.length > 0) {
          setActiveWorkspace({ campaign: mine[0], address: connectedHost.address })
        }
      })
    }
  }, [mode, connectedHost, activeWorkspace])

  const switcherAddress = mode === 'dm' ? undefined : connectedHost?.address
  const showSwitcher = mode === 'dm' || (mode === 'player' && !!connectedHost)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        className="gb-drag"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          height: 44,
          padding: '0 var(--space-5)',
          // Leave room for Windows' own minimize/maximize/close buttons, which
          // the overlay draws on top of this corner (see BrowserWindow's
          // titleBarOverlay in src/main/index.ts).
          paddingRight: 150,
          background: 'var(--bg-canvas)',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0
        }}
      >
        <div className="gb-no-drag" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: 1, minWidth: 0 }}>
          <ModeToggle mode={mode} onChange={setMode} />
          {activeWorkspace && (
            <>
              <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', flexShrink: 0 }} />
              <WorkspaceHeaderBar campaign={activeWorkspace.campaign} workspace={workspace} />
            </>
          )}
        </div>

        <div
          className="gb-no-drag"
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexShrink: 0 }}
        >
          {mode === 'dm' && <HostingCorner />}
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{displayName}</span>
        </div>
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {activeWorkspace ? (
          <CampaignWorkspace
            campaign={activeWorkspace.campaign}
            myDisplayName={displayName}
            workspace={workspace}
          />
        ) : mode === 'dm' ? (
          <EmptyMain />
        ) : (
          <PlayerEmptyMain connectedHost={connectedHost} onConnected={setConnectedHost} />
        )}
      </main>

      <div
        style={{
          position: 'fixed',
          bottom: 16,
          left: 16,
          zIndex: 30,
          display: 'flex',
          alignItems: 'flex-end',
          gap: 'var(--space-2)'
        }}
      >
        {showSwitcher && (
          <CampaignSwitcher
            address={switcherAddress}
            canCreate={mode === 'dm'}
            current={activeWorkspace?.campaign ?? null}
            onSelect={(campaign) => setActiveWorkspace({ campaign, address: switcherAddress })}
          />
        )}
        <AccountSettingsButton />
      </div>
    </div>
  )
}

function EmptyMain(): JSX.Element {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
        No campaign yet — add one in the bottom left corner.
      </span>
    </div>
  )
}

function PlayerEmptyMain({
  connectedHost,
  onConnected
}: {
  connectedHost: { address: string; label: string } | null
  onConnected: (host: { address: string; label: string } | null) => void
}): JSX.Element {
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-6)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
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
          style={{
            textAlign: 'center',
            padding: 'var(--space-7) var(--space-5)',
            marginBottom: 'var(--space-5)'
          }}
        >
          <h3 style={{ fontSize: 17 }}>No characters yet</h3>
          <p>
            Build a character whenever inspiration strikes — you don't need a campaign lined up
            first. Pair it to a campaign later, from here or once you've joined one.
          </p>
        </div>

        {connectedHost ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-7) 0' }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
              No campaign yet at {connectedHost.label} — add or join one in the bottom left corner.
            </p>
            <button
              type="button"
              onClick={() => onConnected(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: 12,
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0
              }}
            >
              Switch table
            </button>
          </div>
        ) : (
          <JoinCampaignPanel onConnected={(address, label) => onConnected({ address, label })} />
        )}
      </div>
    </div>
  )
}
