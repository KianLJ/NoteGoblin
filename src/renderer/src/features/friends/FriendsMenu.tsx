import { useEffect, useRef, useState } from 'react'
import { Button } from '../../ui/Button'
import { useFriends } from './useFriends'
import type { Mode } from '../shell/ModeToggle'

interface FriendsMenuProps {
  mode: Mode
  hostedSessionId: string | null
  onHostedSessionChange: (sessionId: string | null) => void
  onJoinedSession: (sessionId: string, label: string) => void
  /** Session ids we've actually been invited to (from session-invite notifications) — a friend showing as "hosting" via presence alone doesn't mean the DM has invited us yet, so Join stays hidden until it's in here. */
  invitedSessionIds: Set<string>
}

/** Friends list + presence + session hosting/joining, all backed by the relay — no IP addresses or invite codes anymore. */
export function FriendsMenu({
  mode,
  hostedSessionId,
  onHostedSessionChange,
  onJoinedSession,
  invitedSessionIds
}: FriendsMenuProps): JSX.Element {
  const { status, friends, incomingRequests, error, sendRequest, accept, decline, remove } = useFriends()
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [sendSuccess, setSendSuccess] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [hostingBusy, setHostingBusy] = useState(false)
  const [inviteBusyId, setInviteBusyId] = useState<string | null>(null)
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set())
  const [joinBusyId, setJoinBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const onlineCount = friends.filter((f) => f.online).length

  async function handleSendRequest(): Promise<void> {
    const trimmed = username.trim()
    if (!trimmed) return
    setSending(true)
    setSendError(null)
    setSendSuccess(null)
    const result = await sendRequest(trimmed)
    setSending(false)
    if (result.ok) {
      setUsername('')
      setSendSuccess(result.status === 'accepted' ? `You and ${trimmed} are now friends!` : `Request sent to ${trimmed}.`)
      setTimeout(() => setSendSuccess(null), 4000)
    } else {
      setSendError(result.error ?? 'Could not send request.')
    }
  }

  async function startHosting(): Promise<void> {
    setHostingBusy(true)
    setActionError(null)
    const result = await window.goblin.sessions.start()
    setHostingBusy(false)
    if (!result.ok) {
      setActionError(result.error)
      return
    }
    onHostedSessionChange(result.sessionId)
  }

  async function stopHosting(): Promise<void> {
    setHostingBusy(true)
    await window.goblin.sessions.stop()
    setHostingBusy(false)
    setInvitedIds(new Set())
    onHostedSessionChange(null)
  }

  async function invite(friendUserId: string): Promise<void> {
    setInviteBusyId(friendUserId)
    setActionError(null)
    const result = await window.goblin.sessions.invite(friendUserId)
    setInviteBusyId(null)
    if (!result.ok) {
      setActionError(result.error)
      return
    }
    setInvitedIds((prev) => new Set(prev).add(friendUserId))
  }

  async function join(friendUserId: string, friendUsername: string, sessionId: string): Promise<void> {
    setJoinBusyId(friendUserId)
    setActionError(null)
    const result = await window.goblin.sessions.join(sessionId)
    setJoinBusyId(null)
    if (!result.ok) {
      setActionError(result.error)
      return
    }
    onJoinedSession(sessionId, `${friendUsername}'s Table`)
    setOpen(false)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="gb-btn gb-btn--secondary"
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: status === 'connected' ? 'var(--success)' : 'var(--text-muted)'
          }}
        />
        Friends{onlineCount > 0 ? ` (${onlineCount})` : ''}
        {incomingRequests.length > 0 && (
          <span className="gb-badge gb-badge--accent" style={{ fontSize: 10 }}>
            {incomingRequests.length}
          </span>
        )}
      </button>

      {open && (
        <div
          className="gb-card"
          style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 300, zIndex: 20 }}
        >
          {status !== 'connected' && (
            <p style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 'var(--space-2)' }}>
              {status === 'connecting' ? 'Connecting to the relay…' : 'Relay unavailable — friends will update once reconnected.'}
            </p>
          )}

          {mode === 'dm' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 6,
                marginBottom: 'var(--space-3)',
                paddingBottom: 'var(--space-2)',
                borderBottom: '1px solid var(--border-subtle)'
              }}
            >
              <span style={{ fontSize: 12, color: hostedSessionId ? 'var(--success)' : 'var(--text-muted)' }}>
                {hostedSessionId ? 'Hosting — invite friends below' : 'Not hosting'}
              </span>
              <Button
                variant={hostedSessionId ? 'ghost' : 'primary'}
                onClick={hostedSessionId ? stopHosting : startHosting}
                disabled={hostingBusy}
                style={{ fontSize: 11, padding: '2px 8px' }}
              >
                {hostingBusy ? '…' : hostedSessionId ? 'Stop Hosting' : 'Start Hosting'}
              </Button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--space-3)' }}>
            <input
              className="gb-input"
              placeholder="Add friend by username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSendRequest()
              }}
              style={{ flex: 1, fontSize: 12 }}
            />
            <Button variant="secondary" onClick={handleSendRequest} disabled={sending || !username.trim()}>
              Add
            </Button>
          </div>
          {sendError && (
            <p style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 'var(--space-2)' }}>{sendError}</p>
          )}
          {sendSuccess && (
            <p style={{ color: 'var(--success)', fontSize: 12, marginBottom: 'var(--space-2)' }}>{sendSuccess}</p>
          )}

          {incomingRequests.length > 0 && (
            <div style={{ marginBottom: 'var(--space-3)' }}>
              <h4 style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 6px' }}>Requests</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {incomingRequests.map((req) => (
                  <div
                    key={req.userId}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}
                  >
                    <span style={{ fontSize: 13 }}>{req.username}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Button
                        variant="secondary"
                        onClick={() => accept(req.userId)}
                        style={{ fontSize: 11, padding: '2px 8px' }}
                      >
                        Accept
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => decline(req.userId)}
                        style={{ fontSize: 11, padding: '2px 8px' }}
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h4 style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 6px' }}>
            Friends {friends.length > 0 ? `(${friends.length})` : ''}
          </h4>
          {friends.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No friends yet — add one by username above.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
              {friends.map((friend) => (
                <div
                  key={friend.userId}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        flexShrink: 0,
                        background: friend.online ? 'var(--success)' : 'var(--text-muted)'
                      }}
                    />
                    <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {friend.username}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {mode === 'dm' && hostedSessionId && (
                      <Button
                        variant="secondary"
                        onClick={() => invite(friend.userId)}
                        disabled={inviteBusyId === friend.userId || invitedIds.has(friend.userId)}
                        style={{ fontSize: 11, padding: '2px 8px' }}
                      >
                        {invitedIds.has(friend.userId) ? 'Invited' : inviteBusyId === friend.userId ? '…' : 'Invite'}
                      </Button>
                    )}
                    {friend.hostingSessionId && invitedSessionIds.has(friend.hostingSessionId) && (
                      <Button
                        variant="primary"
                        onClick={() => join(friend.userId, friend.username, friend.hostingSessionId!)}
                        disabled={joinBusyId === friend.userId}
                        style={{ fontSize: 11, padding: '2px 8px' }}
                      >
                        {joinBusyId === friend.userId ? '…' : 'Join'}
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => remove(friend.userId)}
                      title="Remove friend"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        fontSize: 11,
                        cursor: 'pointer'
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {(error || actionError) && (
            <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 'var(--space-2)' }}>
              {actionError ?? error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
