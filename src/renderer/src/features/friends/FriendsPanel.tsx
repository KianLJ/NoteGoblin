import { useState } from 'react'
import { Button } from '../../ui/Button'
import { useFriends } from './useFriends'
import { ConfirmButton } from '../../ui/ConfirmButton'
import { XIcon } from '../../ui/icons'
import './friends.css'
import type { Mode } from '../shell/ModeToggle'

interface FriendsPanelProps {
  mode: Mode
  hostedSessionId: string | null
  onJoinedSession: (sessionId: string, label: string) => void
  /** Session ids we've actually been invited to (from session-invite notifications) — a friend showing as "hosting" via presence alone doesn't mean the DM has invited us yet, so Join stays hidden until it's in here. */
  invitedSessionIds: Set<string>
  /** Player-mode connection status — was its own separate dropdown (PlayerSidebar's TableBar) until it moved in here, since "who am I connected to" and "who can I connect to" are the same concern. null while not connected. */
  connectedLabel: string | null
  /** The DM's active campaign name, once known — null right after joining, before the auto-join round-trip resolves. */
  activeCampaignName: string | null
  onResync: () => void
}

/** Friends list + presence + session hosting/joining, all backed by the relay — no IP addresses or invite codes anymore. Start/Stop Hosting and Leave used to live here too — they moved to CampaignSwitcher.tsx/CharacterSwitcher.tsx respectively, next to whichever campaign/character they actually apply to. */
export function FriendsPanel({
  mode,
  hostedSessionId,
  onJoinedSession,
  invitedSessionIds,
  connectedLabel,
  activeCampaignName,
  onResync
}: FriendsPanelProps): JSX.Element {
  const { status, friends, incomingRequests, error, sendRequest, accept, decline, remove } = useFriends()
  const [username, setUsername] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [sendSuccess, setSendSuccess] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [inviteBusyId, setInviteBusyId] = useState<string | null>(null)
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set())
  const [joinBusyId, setJoinBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

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

  async function invite(friendUserId: string): Promise<void> {
    setInviteBusyId(friendUserId)
    setActionError(null)
    const result = await window.goblin.sessions.invite(friendUserId)
    setInviteBusyId(null)
    if (!result.ok) {
      setActionError(result.error)
      return
    }
    // Just a transient "it worked" confirmation, not a permanent lock — the
    // relay's invite is idempotent, so re-inviting the same friend (e.g.
    // after they left the session) needs to stay clickable, not stuck
    // showing "Invited" for the rest of the hosting session.
    setInvitedIds((prev) => new Set(prev).add(friendUserId))
    setTimeout(() => {
      setInvitedIds((prev) => {
        const next = new Set(prev)
        next.delete(friendUserId)
        return next
      })
    }, 2500)
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
  }

  // Online first (hosting before just online), then by name.
  const sortedFriends = [...friends].sort((a, b) => Number(!!b.hostingSessionId) - Number(!!a.hostingSessionId) || Number(b.online) - Number(a.online) || a.username.localeCompare(b.username))

  return (
    <div className="fr">
      {status !== 'connected' && (
        <div className={`fr-status${status === 'connecting' ? '' : ' fr-status--down'}`} role="status">
          <span className="fr-dot" />
          {status === 'connecting' ? 'Connecting to friends…' : 'Can’t reach the friends service right now. Your list updates once it’s back.'}
        </div>
      )}

      {mode === 'player' && connectedLabel && (
        <div className="fr-playing">
          <span className="fr-dot fr-dot--on" />
          <span className="fr-playing-text">
            {activeCampaignName ? (
              <>
                Playing <strong>{activeCampaignName}</strong>
              </>
            ) : (
              <>
                At <strong>{connectedLabel}</strong>
              </>
            )}
          </span>
          <Button variant="secondary" onClick={onResync} title="Catch up if the DM switched campaigns" className="fr-small">
            Sync
          </Button>
        </div>
      )}

      <form
        className="fr-add"
        onSubmit={(e) => {
          e.preventDefault()
          void handleSendRequest()
        }}
      >
        <label className="fr-add-field">
          <AddPersonIcon />
          <input placeholder="Add a friend by username" value={username} onChange={(e) => setUsername(e.target.value)} aria-label="Friend's username" />
        </label>
        <Button variant="primary" type="submit" disabled={sending || !username.trim()} className="fr-small">
          {sending ? 'Sending…' : 'Add'}
        </Button>
      </form>
      {sendError && <p className="fr-msg fr-msg--bad">{sendError}</p>}
      {sendSuccess && <p className="fr-msg fr-msg--good">{sendSuccess}</p>}

      {incomingRequests.length > 0 && (
        <section className="fr-section">
          <h4>
            Friend requests <span className="fr-count">{incomingRequests.length}</span>
          </h4>
          {incomingRequests.map((req) => (
            <div key={req.userId} className="fr-row fr-row--request">
              <Avatar name={req.username} picture={req.avatar} />
              <span className="fr-name">
                <strong>{req.username}</strong>
                <small>Wants to be friends</small>
              </span>
              <Button variant="primary" onClick={() => accept(req.userId)} className="fr-small">
                Accept
              </Button>
              <Button variant="ghost" onClick={() => decline(req.userId)} className="fr-small">
                Decline
              </Button>
            </div>
          ))}
        </section>
      )}

      <section className="fr-section">
        <h4>
          Friends {friends.length > 0 && <span className="fr-count">{friends.filter((f) => f.online).length} online</span>}
        </h4>
        {friends.length === 0 ? (
          <div className="fr-empty">
            <strong>No friends yet</strong>
            <span>Add someone by their username above. Once you’re friends you can invite them to your game, or join theirs.</span>
          </div>
        ) : (
          sortedFriends.map((friend) => {
            const hosting = !!friend.hostingSessionId
            const canJoin = hosting && invitedSessionIds.has(friend.hostingSessionId!)
            return (
              <div key={friend.userId} className={`fr-row${friend.online ? '' : ' fr-row--offline'}`}>
                <Avatar name={friend.username} picture={friend.avatar} online={friend.online} />
                <span className="fr-name">
                  <strong>{friend.username}</strong>
                  <small>{canJoin ? 'Invited you to their game' : hosting ? 'Running a game' : friend.online ? 'Online' : 'Offline'}</small>
                </span>
                {mode === 'dm' && hostedSessionId && (
                  <Button variant="secondary" onClick={() => invite(friend.userId)} disabled={inviteBusyId === friend.userId || invitedIds.has(friend.userId)} className="fr-small" title="Invite them to your game">
                    {invitedIds.has(friend.userId) ? 'Invited' : inviteBusyId === friend.userId ? 'Inviting…' : 'Invite'}
                  </Button>
                )}
                {canJoin && (
                  <Button variant="primary" onClick={() => join(friend.userId, friend.username, friend.hostingSessionId!)} disabled={joinBusyId === friend.userId} className="fr-small">
                    {joinBusyId === friend.userId ? 'Joining…' : 'Join'}
                  </Button>
                )}
                <ConfirmButton label={<XIcon size={12} />} confirmLabel="Remove?" variant="ghost" danger className="fr-remove" title={`Remove ${friend.username} from your friends`} onConfirm={() => remove(friend.userId)} />
              </div>
            )
          })
        )}
      </section>

      {(error || actionError) && <p className="fr-msg fr-msg--bad">{actionError ?? error}</p>}
    </div>
  )
}

/** A friend's picture (or initial) in a circle, with a green dot when they're online. */
function Avatar({ name, picture, online }: { name: string; picture?: string; online?: boolean }): JSX.Element {
  return (
    <span className="fr-avatar" aria-hidden="true">
      {picture ? <img className="gb-face-img" src={picture} alt="" /> : name.trim().charAt(0).toUpperCase()}
      {online && <i />}
    </span>
  )
}

function AddPersonIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      <circle cx="6.5" cy="5.5" r="2.8" />
      <path d="M1.5 14c.6-2.6 2.6-4 5-4s4.4 1.4 5 4M13 4.5v4M11 6.5h4" />
    </svg>
  )
}

/** The header's friends status — relay connection, who's online, requests waiting — which opens the Friends tool on the canvas. */
export function FriendsButton({ onOpen }: { onOpen: () => void }): JSX.Element {
  const { status, friends, incomingRequests } = useFriends()
  const onlineCount = friends.filter((f) => f.online).length
  return (
    <button
      type="button"
      onClick={onOpen}
      className="gb-topbtn gb-topbtn--wide"
      title={`Friends${onlineCount > 0 ? `: ${onlineCount} online` : ''}${status === 'connected' ? '' : ' (offline)'}`}
      aria-label={`Friends, ${onlineCount} online${incomingRequests.length ? `, ${incomingRequests.length} requests` : ''}`}
    >
      <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
        <circle cx="6" cy="5.5" r="2.5" />
        <path d="M1.5 13.5c.5-2.5 2.3-3.8 4.5-3.8s4 1.3 4.5 3.8" />
        <path d="M10.5 3.3a2.4 2.4 0 0 1 0 4.4M12.3 9.9c1.2.6 2 1.8 2.2 3.6" />
      </svg>
      {onlineCount > 0 && <span className="gb-topbtn-num">{onlineCount}</span>}
      <i className={status === 'connected' ? 'gb-topbtn-dot gb-topbtn-dot--on' : 'gb-topbtn-dot'} aria-hidden="true" />
      {incomingRequests.length > 0 && <span className="gb-topbtn-count">{incomingRequests.length}</span>}
    </button>
  )
}
