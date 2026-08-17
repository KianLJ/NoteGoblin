import { useEffect, useRef, useState } from 'react'
import { ModeToggle, type Mode } from './ModeToggle'
import { WindowControls } from './WindowControls'
import { FriendsMenu } from '../friends/FriendsMenu'
import { NotificationToasts } from '../notifications/NotificationToasts'
import { useNotifications } from '../notifications/useNotifications'
import { CampaignWorkspace } from '../campaigns/CampaignWorkspace'
import { WorkspaceHeaderBar } from '../campaigns/WorkspaceHeaderBar'
import { useNotesWorkspace } from '../campaigns/useNotesWorkspace'
import { PlayerWorkspaceBody } from '../player/PlayerWorkspaceBody'
import { PlayerWorkspaceHeaderBar } from '../player/PlayerWorkspaceHeaderBar'
import { usePlayerWorkspace } from '../player/usePlayerWorkspace'
import type { Campaign, CharacterSheet } from '@shared/ipc'

interface AppShellProps {
  displayName: string
}

export function AppShell({ displayName }: AppShellProps): JSX.Element {
  const [mode, setMode] = useState<Mode>('dm')

  // --- DM side: one active campaign workspace, switched via CampaignSwitcher (lives in the sidebar footer) ---
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null)
  const workspace = useNotesWorkspace(undefined, activeCampaign?.id ?? null)
  const dmAutoOpenedRef = useRef(false)
  const [hostedSessionId, setHostedSessionId] = useState<string | null>(null)

  // Restore hosting state on mount (e.g. this window reloaded while another
  // was already hosting isn't possible per-process, but this mirrors the old
  // hosting-status check so a stale UI never disagrees with sessionHost.ts).
  useEffect(() => {
    window.goblin.sessions.status().then((status) => {
      if (status.hosting) setHostedSessionId(status.sessionId)
    })
  }, [])

  // --- Player side: characters (always available) + the joined session's campaigns/notes ---
  const [joinedSession, setJoinedSession] = useState<{ sessionId: string; label: string } | null>(null)
  const [disconnectMessage, setDisconnectMessage] = useState<string | null>(null)
  const playerWorkspace = usePlayerWorkspace(joinedSession?.sessionId)

  // Lifted here (rather than inside NotificationBell) so FriendsMenu's Join
  // button can also be gated on it — a friend showing as "hosting" doesn't
  // mean you've actually been invited to their session.
  const notifications = useNotifications()
  const invitedSessionIds = new Set(
    notifications.notifications.filter((n) => n.kind === 'session-invite' && n.sessionId).map((n) => n.sessionId!)
  )
  function handleJoinedSession(sessionId: string, label: string): void {
    setJoinedSession({ sessionId, label })
    setMode('player')
  }

  // Locks the mode you're NOT currently using once you're mid-session, so
  // Ctrl+Tab (and the toggle itself) can't accidentally step away from a
  // hosted or joined game — DM is locked while you've joined someone else's
  // session, Player is locked while you're hosting your own.
  const lockedMode: Mode | undefined = hostedSessionId ? 'player' : joinedSession ? 'dm' : undefined
  const lockedReason = hostedSessionId
    ? 'Stop hosting to switch to Player mode.'
    : joinedSession
      ? 'Leave the session to switch to DM mode.'
      : undefined

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        setMode((m) => {
          const next = m === 'dm' ? 'player' : 'dm'
          return next === lockedMode ? m : next
        })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lockedMode])

  // Your own relay account id — this is what a note/folder you author over a
  // joined session gets stamped with as authorUserId (see sessionHost.ts's
  // dispatch()), which is NOT the same id space as your local identity or
  // (as the DM) your local host-db user id. Only the player side needs this:
  // the DM's own authorUserId is always their campaign's dmUserId instead.
  const [myRelayUserId, setMyRelayUserId] = useState<string | null>(null)
  useEffect(() => {
    function refresh(): void {
      window.goblin.relay.myUserId().then(setMyRelayUserId)
    }
    refresh()
    return window.goblin.relay.onFriendsChanged(refresh)
  }, [])

  // The DM closing their app (or a dropped connection) doesn't un-join us on
  // its own — sessionClient.ts pushes this the moment the relay tells it the
  // session died, so we can leave the table cleanly instead of sitting on a
  // campaign we can no longer actually reach.
  useEffect(() => {
    return window.goblin.sessions.onDisconnected((reason) => {
      window.goblin.sessions.leave()
      setJoinedSession(null)
      setDisconnectMessage(reason === 'dm-left' ? 'The DM disconnected.' : 'Lost connection to the DM.')
      setTimeout(() => setDisconnectMessage(null), 6000)
    })
  }, [])

  // Auto-open the most recent DM campaign you're actually part of, once per
  // app session. There's no "back" to re-arm this from — once a campaign
  // exists it's always the active one, switching only happens via the
  // sidebar's CampaignSwitcher. (Player-side auto-open lives inside
  // usePlayerWorkspace, keyed by joined session instead.)
  useEffect(() => {
    if (activeCampaign || mode !== 'dm' || dmAutoOpenedRef.current) return
    dmAutoOpenedRef.current = true
    window.goblin.campaigns.list().then((result) => {
      if (!result.ok) return
      // Only campaigns you actually DM, not ones you've merely joined as a
      // player (myRole would be 'player' there, still non-null) — otherwise
      // a test identity that joined someone else's campaign as a player
      // gets auto-opened straight into *their* campaign in DM mode, showing
      // the DM's info under the wrong identity.
      const mine = result.data.filter((c) => c.myRole === 'dm')
      if (mine.length > 0) setActiveCampaign(mine[0])
    })
  }, [mode, activeCampaign])

  // Whatever campaign the DM has open is "the table" — connecting players
  // auto-join this instead of picking from a list themselves. Recorded on
  // the relay session so a player discovers it the moment they join.
  useEffect(() => {
    if (!activeCampaign) return
    window.goblin.campaigns.setActive(activeCampaign.id)
  }, [activeCampaign])

  // Player: subscribe to presence once connected to a campaign, and keep the
  // rest of the table updated about which character you're currently on.
  useEffect(() => {
    if (!joinedSession || !playerWorkspace.activeCampaign) return
    window.goblin.presence.subscribe(joinedSession.sessionId, playerWorkspace.activeCampaign.id)
  }, [joinedSession, playerWorkspace.activeCampaign])

  useEffect(() => {
    if (!joinedSession || !playerWorkspace.activeCampaign) return
    window.goblin.presence.selectCharacter(
      joinedSession.sessionId,
      playerWorkspace.activeCharacter?.name ?? null
    )
  }, [joinedSession, playerWorkspace.activeCampaign, playerWorkspace.activeCharacter])

  // Same trigger as the presence name announcement above, but carries the
  // whole sheet — re-fires on every edit too, since activeCharacter is a new
  // object each time saveCharacter's setCharacters resolves, keeping the
  // DM's view live rather than frozen at whatever it looked like on selection.
  useEffect(() => {
    if (!joinedSession) return
    window.goblin.characters.syncSelected(joinedSession.sessionId, playerWorkspace.activeCharacter ?? null)
  }, [joinedSession, playerWorkspace.activeCharacter])

  // DM: every connected player's currently-selected character, kept live —
  // used by RightPanel's ConnectedPlayersList to open one as a read-only tab.
  const [playerCharacters, setPlayerCharacters] = useState<Map<string, CharacterSheet>>(new Map())
  useEffect(() => {
    return window.goblin.characters.onPlayerCharacterChanged(({ userId, character }) => {
      setPlayerCharacters((prev) => {
        const next = new Map(prev)
        if (character) next.set(userId, character)
        else next.delete(userId)
        return next
      })
    })
  }, [])
  const [viewedPlayerCharacter, setViewedPlayerCharacter] = useState<CharacterSheet | null>(null)

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
          <ModeToggle mode={mode} onChange={setMode} disabledMode={lockedMode} disabledReason={lockedReason} />

          {mode === 'dm' && activeCampaign && (
            <>
              <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', flexShrink: 0 }} />
              <WorkspaceHeaderBar campaign={activeCampaign} workspace={workspace} />
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
          <FriendsMenu
            mode={mode}
            hostedSessionId={hostedSessionId}
            onHostedSessionChange={setHostedSessionId}
            invitedSessionIds={invitedSessionIds}
            onJoinedSession={handleJoinedSession}
            connectedLabel={joinedSession?.label ?? null}
            activeCampaignName={playerWorkspace.activeCampaign?.name ?? null}
            onResync={playerWorkspace.resync}
          />
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{displayName}</span>
        </div>

        <WindowControls />
      </header>

      {disconnectMessage && (
        <div
          style={{
            padding: 'var(--space-2) var(--space-5)',
            background: 'var(--danger-subtle, var(--bg-sunken))',
            color: 'var(--danger)',
            fontSize: 13,
            flexShrink: 0
          }}
        >
          {disconnectMessage}
        </div>
      )}

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {mode === 'dm' ? (
          <CampaignWorkspace
            campaign={activeCampaign}
            workspace={workspace}
            onSwitchCampaign={setActiveCampaign}
            hostedSessionId={hostedSessionId}
            playerCharacters={playerCharacters}
            viewedPlayerCharacter={viewedPlayerCharacter}
            onViewPlayerCharacter={setViewedPlayerCharacter}
          />
        ) : (
          <PlayerWorkspaceBody
            workspace={playerWorkspace}
            myUserId={myRelayUserId}
            sessionId={joinedSession?.sessionId ?? null}
            connectedLabel={joinedSession?.label ?? null}
          />
        )}
      </main>

      <NotificationToasts notifications={notifications} onJoined={handleJoinedSession} />
    </div>
  )
}
