import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { FriendSummary } from '@shared/relay'
import { useCampaignChat } from './useCampaignChat'
import { useRelayMessages, useUnreadMessageNotifications } from './useRelayMessages'
import { ChatIcon, PlayersIcon } from '../campaigns/panelIcons'
import { ArrowLeftIcon } from '../../ui/icons'
import './chat.css'
import { UserIcon } from '../player/icons'

interface ChatPanelProps {
  /** null before a campaign exists (DM) or before one's been joined (player) — Party is unavailable without one, but Friends still works (it's account-scoped, not campaign-scoped). */
  campaignId: string | null
  sessionId: string | null
  myUserId: string | null
  /** Fired whenever the combined Party+Friends unread count changes — lets MessagesButton.tsx show a badge on the header button without duplicating this panel's own unread tracking. Omitted entirely when this panel isn't hosted inside that button (there's currently no other caller). */
  onUnreadTotalChange?: (total: number) => void
  /** Whether the panel is on screen (the Messages popover is open) — only then do messages count as seen. Defaults to true. */
  visible?: boolean
}

type Section = 'party' | 'friends'

const SECTION_STORAGE_KEY = 'gb-messages-section'
const FRIEND_THREAD_STORAGE_KEY = 'gb-messages-friend-thread'

function loadSection(): Section {
  try {
    return localStorage.getItem(SECTION_STORAGE_KEY) === 'friends' ? 'friends' : 'party'
  } catch {
    return 'party'
  }
}

/**
 * The bottom-of-the-right-panel messages strip — shared between
 * RightPanel.tsx (DM, isDm) and PartySidebar.tsx (player, !isDm). Two
 * independent kinds of conversation live here:
 *  - Party: the whole table, scoped to whichever campaign is currently
 *    open, backed by the DM's local per-campaign storage (see
 *    useCampaignChat) since it only ever needs to exist while that
 *    campaign's session is reachable.
 *  - Friends: any relay friend, anytime, campaign-independent — backed by
 *    the relay's persistent store (see useRelayMessages), not local
 *    SQLite. (A separate campaign-tagged "Whispers" section used to live
 *    here too, but it was close enough to Friends to not earn its own
 *    panel — a DM/player still reach each other fine via Friends.)
 */
export function ChatPanel({ campaignId, sessionId, myUserId, onUnreadTotalChange, visible = true }: ChatPanelProps): JSX.Element {
  const [section, setSection] = useState<Section>(loadSection)

  useEffect(() => {
    try {
      localStorage.setItem(SECTION_STORAGE_KEY, section)
    } catch {
      /* best-effort persistence only */
    }
  }, [section])
  const unreadNotifications = useUnreadMessageNotifications()
  const friendsUnread = unreadNotifications.filter((n) => n.messageKind === 'friend')
  const unreadFriendIds = new Set(friendsUnread.map((n) => n.fromUserId))

  // Party has no relay-backed notification to pair with (it's local,
  // per-campaign SQLite) — a lightweight local counter instead: bump it on
  // any live party message that isn't your own while you're looking at a
  // different section, clear it the moment Party becomes active again.
  const [partyUnread, setPartyUnread] = useState(0)
  // Party only counts as seen while it's on screen — the panel stays mounted behind a closed popover.
  const partyOnScreen = visible && section === 'party'
  useEffect(() => {
    if (!campaignId) return
    return window.goblin.messages.onMessage((message) => {
      if (message.campaignId !== campaignId || message.channel !== 'party' || message.senderUserId === myUserId) return
      setPartyUnread((prev) => (partyOnScreen ? prev : prev + 1))
    })
  }, [campaignId, myUserId, partyOnScreen])
  useEffect(() => {
    if (partyOnScreen) setPartyUnread(0)
  }, [partyOnScreen])

  const friendsUnreadCount = friendsUnread.length
  useEffect(() => {
    onUnreadTotalChange?.(partyUnread + friendsUnreadCount)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyUnread, friendsUnreadCount])

  return (
    <div className="ms">
      <div className="ms-tabs" role="tablist" aria-label="Conversations">
        <SectionTabButton icon={<PlayersIcon />} label="Party" active={section === 'party'} count={partyUnread} onClick={() => setSection('party')} />
        <SectionTabButton icon={<UserIcon />} label="Friends" active={section === 'friends'} count={friendsUnread.length} onClick={() => setSection('friends')} />
      </div>

      <div className="ms-body-area">
        <div style={{ display: section === 'party' ? 'block' : 'none', height: '100%' }}>
          <PartySection campaignId={campaignId} sessionId={sessionId} myUserId={myUserId} />
        </div>
        <div style={{ display: section === 'friends' ? 'block' : 'none', height: '100%' }}>
          <FriendsSection myUserId={myUserId} unreadFriendIds={unreadFriendIds} visible={visible && section === 'friends'} />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Party — current campaign's group chat, unchanged from before this file's
// Friends/Whispers restructure.
// ---------------------------------------------------------------------------

function PartySection({
  campaignId,
  sessionId,
  myUserId
}: {
  campaignId: string | null
  sessionId: string | null
  myUserId: string | null
}): JSX.Element {
  const { messages, error, send } = useCampaignChat(campaignId, sessionId)
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages.length])

  if (!campaignId) return <EmptyState text="Open a campaign to chat." />

  function handleSend(): void {
    if (!draft.trim()) return
    void send('party', undefined, draft)
    setDraft('')
  }

  return (
    <div className="ms-section">
      <MessageList
        listRef={listRef}
        emptyText="No messages yet — say hi."
        items={messages.map((m) => ({ id: m.id, senderName: m.senderDisplayName, isMine: m.senderUserId === myUserId, body: m.body, createdAt: m.createdAt }))}
      />
      {error && <ErrorLine text={error} />}
      <Composer placeholder="Message the party…" value={draft} onChange={setDraft} onSend={handleSend} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Friends — any relay friend, campaign-independent.
// ---------------------------------------------------------------------------

function FriendsSection({ myUserId, unreadFriendIds, visible }: { myUserId: string | null; unreadFriendIds: Set<string>; visible: boolean }): JSX.Element {
  const [friends, setFriends] = useState<FriendSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(FRIEND_THREAD_STORAGE_KEY)
    } catch {
      return null
    }
  })
  const { messages, error, send } = useRelayMessages(selectedId, 'friend', visible)
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  function selectThread(id: string | null): void {
    setSelectedId(id)
    try {
      if (id) localStorage.setItem(FRIEND_THREAD_STORAGE_KEY, id)
      else localStorage.removeItem(FRIEND_THREAD_STORAGE_KEY)
    } catch {
      /* best-effort persistence only */
    }
  }

  useEffect(() => {
    function refresh(): void {
      window.goblin.relay.friends.list().then((result) => {
        if (result.ok) setFriends(result.data)
      })
    }
    refresh()
    return window.goblin.relay.onFriendsChanged(refresh)
  }, [])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages.length])

  const selected = friends.find((f) => f.userId === selectedId)

  function handleSend(): void {
    if (!draft.trim()) return
    void send(draft)
    setDraft('')
  }

  if (selectedId && selected) {
    return (
      <div className="ms-section">
        <ThreadHeader label={selected.username} picture={selected.avatar} onBack={() => selectThread(null)} />
        <MessageList
          listRef={listRef}
          emptyText={`No messages with ${selected.username} yet.`}
          items={messages.map((m) => ({ id: m.id, senderName: m.senderUsername, isMine: m.senderUserId === myUserId, body: m.body, createdAt: m.createdAt }))}
        />
        {error && <ErrorLine text={error} />}
        <Composer placeholder={`Message ${selected.username}…`} value={draft} onChange={setDraft} onSend={handleSend} />
      </div>
    )
  }

  return (
    <div className="ms-section">
      {friends.length === 0 ? (
        <EmptyState text="Add a friend to start messaging them." />
      ) : (
        <ThreadPicker
          items={friends.map((f) => ({ id: f.userId, label: f.username, picture: f.avatar, sublabel: f.online ? 'Online' : undefined, unread: unreadFriendIds.has(f.userId) }))}
          onSelect={selectThread}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared presentational pieces
// ---------------------------------------------------------------------------

interface MessageItem {
  id: string
  senderName: string
  isMine: boolean
  body: string
  createdAt: string
}

function MessageList({ listRef, items, emptyText }: { listRef: React.RefObject<HTMLDivElement>; items: MessageItem[]; emptyText: string }): JSX.Element {
  return (
    <div ref={listRef} className="ms-list">
      {items.length === 0 && <EmptyState text={emptyText} />}
      {items.map((item, i) => {
        // A run of messages from one person shows their name once, at its start.
        const first = i === 0 || items[i - 1].senderName !== item.senderName || items[i - 1].isMine !== item.isMine
        return (
          <div key={item.id} className={`ms-msg${item.isMine ? ' ms-msg--mine' : ''}${first ? ' ms-msg--first' : ''}`}>
            {first && !item.isMine && <span className="ms-sender">{item.senderName}</span>}
            <div className="ms-bubble" title={new Date(item.createdAt).toLocaleString()}>
              <span className="ms-body">{item.body}</span>
              <span className="ms-time">{formatTime(item.createdAt)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Composer({
  placeholder,
  value,
  onChange,
  onSend,
  disabled
}: {
  placeholder: string
  value: string
  onChange: (value: string) => void
  onSend: () => void
  disabled?: boolean
}): JSX.Element {
  return (
    <form
      className="ms-composer"
      onSubmit={(e) => {
        e.preventDefault()
        onSend()
      }}
    >
      <input placeholder={placeholder} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
      <button type="submit" disabled={disabled || !value.trim()} className="ms-send" title="Send" aria-label="Send">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M2 2.5l12 5.5-12 5.5 1.6-5.5zM3.6 8h6" />
        </svg>
      </button>
    </form>
  )
}

function ThreadPicker({
  items,
  onSelect
}: {
  items: { id: string; label: string; picture?: string; sublabel?: string; unread?: boolean }[]
  onSelect: (id: string) => void
}): JSX.Element {
  return (
    <div className="ms-threads">
      {items.map((item) => (
        <button key={item.id} type="button" className={`ms-thread${item.unread ? ' ms-thread--unread' : ''}`} onClick={() => onSelect(item.id)}>
          <span className="ms-avatar" aria-hidden="true">
            {item.picture ? <img className="gb-face-img" src={item.picture} alt="" /> : item.label.trim().charAt(0).toUpperCase()}
            {item.sublabel && <i />}
          </span>
          <span className="ms-thread-text">
            <strong>{item.label}</strong>
            <small>{item.unread ? 'New message' : (item.sublabel ?? 'Offline')}</small>
          </span>
          {item.unread && <span className="ms-dot" title="New" />}
        </button>
      ))}
    </div>
  )
}

function ThreadHeader({ label, picture, onBack }: { label: string; picture?: string; onBack: () => void }): JSX.Element {
  return (
    <div className="ms-thread-head">
      <button type="button" className="ms-back" onClick={onBack} title="Back to friends" aria-label="Back to friends">
        <ArrowLeftIcon size={13} />
      </button>
      <span className="ms-avatar ms-avatar--small" aria-hidden="true">
        {picture ? <img className="gb-face-img" src={picture} alt="" /> : label.trim().charAt(0).toUpperCase()}
      </span>
      <strong>{label}</strong>
    </div>
  )
}

function EmptyState({ text }: { text: string }): JSX.Element {
  return (
    <div className="ms-empty">
      <ChatIcon />
      <span>{text}</span>
    </div>
  )
}

function ErrorLine({ text }: { text: string }): JSX.Element {
  return <p className="ms-error">{text}</p>
}

function formatTime(createdAt: string): string {
  return new Date(createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function SectionTabButton({
  icon,
  label,
  active,
  count,
  onClick
}: {
  icon: ReactNode
  label: string
  active: boolean
  /** Unread count — omitted or 0 shows no badge at all. */
  count?: number
  onClick: () => void
}): JSX.Element {
  return (
    <button type="button" role="tab" aria-selected={active} className={`ms-tab${active ? ' ms-tab--on' : ''}`} onClick={onClick}>
      {icon}
      {label}
      {!!count && <span className="ms-badge">{count > 9 ? '9+' : count}</span>}
    </button>
  )
}
