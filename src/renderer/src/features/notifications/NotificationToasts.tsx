import { useState } from 'react'
import { Button } from '../../ui/Button'
import type { Notifications } from './useNotifications'
import type { RelayNotification } from '@shared/relay'

interface NotificationToastsProps {
  notifications: Notifications
  /** Same shape AppShell hands to FriendsMenu's onJoinedSession — this component performs the join() call itself and only asks the shell to update state on success, mirroring FriendsMenu's own join button. */
  onJoined: (sessionId: string, label: string) => void
}

function describe(n: RelayNotification): string {
  switch (n.kind) {
    case 'friend-request':
      return `${n.fromUsername} sent you a friend request.`
    case 'friend-accepted':
      return `${n.fromUsername} accepted your friend request.`
    case 'session-invite':
      return `${n.fromUsername} invited you to their session.`
  }
}

/** Stacked, corner-anchored toasts — one per unread notification, each dismissed explicitly (never auto-expiring) since a missed session invite or friend request needing a reply shouldn't silently vanish. Replaces a bell/dropdown: notifications are meant to interrupt, not wait to be checked. */
export function NotificationToasts({ notifications: notificationsApi, onJoined }: NotificationToastsProps): JSX.Element | null {
  const { notifications, markRead } = notificationsApi
  const [joinBusyId, setJoinBusyId] = useState<string | null>(null)
  const [joinErrorId, setJoinErrorId] = useState<string | null>(null)

  // Oldest-unread-on-top, newest-on-bottom (closest to the corner) — each new
  // arrival pushes the stack up rather than shoving already-visible toasts
  // around underneath it.
  const unread = notifications.filter((n) => !n.read).slice().reverse()

  async function handleJoin(n: RelayNotification): Promise<void> {
    if (!n.sessionId) return
    setJoinBusyId(n.id)
    setJoinErrorId(null)
    const result = await window.goblin.sessions.join(n.sessionId)
    setJoinBusyId(null)
    if (!result.ok) {
      setJoinErrorId(n.id)
      return
    }
    markRead(n.id)
    onJoined(n.sessionId, `${n.fromUsername}'s Table`)
  }

  if (unread.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'var(--space-4)',
        right: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 50,
        width: 300
      }}
    >
      {unread.map((n) => (
        <div
          key={n.id}
          className="gb-card"
          style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 6, boxShadow: 'var(--shadow-md)' }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 13, flex: 1 }}>{describe(n)}</span>
            <button
              type="button"
              onClick={() => markRead(n.id)}
              title="Dismiss"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                fontSize: 15,
                lineHeight: 1,
                padding: 0,
                flexShrink: 0
              }}
            >
              ×
            </button>
          </div>
          {n.kind === 'session-invite' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Button
                variant="primary"
                onClick={() => void handleJoin(n)}
                disabled={joinBusyId === n.id}
                style={{ fontSize: 11, padding: '2px 8px', alignSelf: 'flex-start' }}
              >
                {joinBusyId === n.id ? '…' : 'Join'}
              </Button>
              {joinErrorId === n.id && (
                <span style={{ fontSize: 11, color: 'var(--danger)' }}>Couldn't join — try again.</span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
