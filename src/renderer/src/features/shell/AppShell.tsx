import { useEffect, useRef, useState } from 'react'
import { ModeToggle, type Mode } from './ModeToggle'
import { WindowControls } from './WindowControls'
import { HostingCorner } from '../connect/HostingCorner'
import { CampaignWorkspace } from '../campaigns/CampaignWorkspace'
import { WorkspaceHeaderBar } from '../campaigns/WorkspaceHeaderBar'
import { useNotesWorkspace } from '../campaigns/useNotesWorkspace'
import { PlayerWorkspaceBody } from '../player/PlayerWorkspaceBody'
import { PlayerWorkspaceHeaderBar } from '../player/PlayerWorkspaceHeaderBar'
import { usePlayerWorkspace } from '../player/usePlayerWorkspace'
import type { Campaign, HostingStatus } from '@shared/ipc'

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

  // --- DM side: one active campaign workspace, switched via CampaignSwitcher (lives in the sidebar footer) ---
  const [activeWorkspace, setActiveWorkspace] = useState<OpenWorkspace | null>(null)
  const workspace = useNotesWorkspace(activeWorkspace?.address, activeWorkspace?.campaign.id ?? null)
  const dmAutoOpenedRef = useRef(false)
  const [hostingSelfAddress, setHostingSelfAddress] = useState<string | null>(null)

  function handleHostingStatusChange(status: HostingStatus): void {
    if (status.hosting) {
      window.goblin.hosting.selfAddress().then(setHostingSelfAddress)
    } else {
      setHostingSelfAddress(null)
    }
  }

  // --- Player side: characters (always available) + the connected table's campaigns/notes ---
  const [connectedHost, setConnectedHost] = useState<{ address: string; label: string } | null>(null)
  const playerWorkspace = usePlayerWorkspace(connectedHost?.address)

  // Auto-open the most recent DM campaign you're actually part of, once per
  // app session. There's no "back" to re-arm this from — once a campaign
  // exists it's always the active one, switching only happens via the
  // sidebar's CampaignSwitcher. (Player-side auto-open lives inside
  // usePlayerWorkspace, keyed by connected address instead.)
  useEffect(() => {
    if (activeWorkspace || mode !== 'dm' || dmAutoOpenedRef.current) return
    dmAutoOpenedRef.current = true
    window.goblin.campaigns.list().then((result) => {
      if (!result.ok) return
      // Only campaigns you actually DM, not ones you've merely joined as a
      // player (myRole would be 'player' there, still non-null) — otherwise
      // a test identity that joined someone else's campaign as a player
      // gets auto-opened straight into *their* campaign in DM mode, showing
      // the DM's info under the wrong identity.
      const mine = result.data.filter((c) => c.myRole === 'dm')
      if (mine.length > 0) setActiveWorkspace({ campaign: mine[0] })
    })
  }, [mode, activeWorkspace])

  // Whatever campaign the DM has open is "the table" — connecting players
  // auto-join this instead of picking from a list themselves. Recorded
  // server-side (host_state) so it's there for a player to discover the
  // moment they connect, regardless of whether hosting was already running
  // when the DM switched campaigns.
  useEffect(() => {
    if (!activeWorkspace) return
    window.goblin.campaigns.setActive(activeWorkspace.campaign.id, activeWorkspace.address)
  }, [activeWorkspace])

  // Player: subscribe to presence once connected to a campaign, and keep the
  // rest of the table updated about which character you're currently on.
  useEffect(() => {
    if (!connectedHost || !playerWorkspace.activeCampaign) return
    window.goblin.presence.subscribe(connectedHost.address, playerWorkspace.activeCampaign.id)
  }, [connectedHost, playerWorkspace.activeCampaign])

  useEffect(() => {
    if (!connectedHost || !playerWorkspace.activeCampaign) return
    window.goblin.presence.selectCharacter(
      connectedHost.address,
      playerWorkspace.activeCharacter?.name ?? null
    )
  }, [connectedHost, playerWorkspace.activeCampaign, playerWorkspace.activeCharacter])

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <header
        className="gb-drag"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
          height: 44,
          padding: '0 0 0 var(--space-5)',
          background: 'var(--bg-canvas)',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0
        }}
      >
        <div
          className="gb-no-drag"
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0, flexShrink: 1 }}
        >
          <ModeToggle mode={mode} onChange={setMode} />

          {mode === 'dm' && activeWorkspace && (
            <>
              <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', flexShrink: 0 }} />
              <WorkspaceHeaderBar campaign={activeWorkspace.campaign} workspace={workspace} />
            </>
          )}

          {mode === 'player' && playerWorkspace.tabItems.length > 0 && (
            <>
              <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', flexShrink: 0 }} />
              <PlayerWorkspaceHeaderBar workspace={playerWorkspace} />
            </>
          )}
        </div>

        {/* Plain flex spacer, deliberately left off the gb-no-drag list — it
            inherits gb-drag from the header, so empty header space (e.g. no
            tabs open) stays draggable instead of being silently claimed by
            the no-drag group next to it. */}
        <div style={{ flex: 1, minWidth: 'var(--space-4)' }} />

        <div
          className="gb-no-drag"
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexShrink: 0 }}
        >
          {mode === 'dm' && <HostingCorner onStatusChange={handleHostingStatusChange} />}
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{displayName}</span>
        </div>

        <WindowControls />
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {mode === 'dm' ? (
          <CampaignWorkspace
            campaign={activeWorkspace?.campaign ?? null}
            myDisplayName={displayName}
            workspace={workspace}
            onSwitchCampaign={(campaign) => setActiveWorkspace({ campaign })}
            hostingSelfAddress={hostingSelfAddress}
          />
        ) : (
          <PlayerWorkspaceBody
            workspace={playerWorkspace}
            myDisplayName={displayName}
            connectedLabel={connectedHost?.label ?? null}
            onConnected={(address, label) => setConnectedHost({ address, label })}
          />
        )}
      </main>
    </div>
  )
}
