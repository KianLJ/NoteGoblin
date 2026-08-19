import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { PresencePlayer } from '@shared/ipc'
import type { FriendSummary, WhisperThread } from '@shared/relay'
import { useCampaignChat } from './useCampaignChat'
import { useRelayMessages, useUnreadMessageNotifications } from './useRelayMessages'
import { ChatIcon, PlayersIcon } from '../campaigns/panelIcons'
import { LockIcon as WhisperIcon } from '../campaigns/icons'
import { UserIcon } from '../player/icons'

interface ChatPanelProps {
  /** null before a campaign exists (DM) or before one's been joined (player) — Party is unavailable without one, but Friends/Whispers still work (they're account-scoped, not campaign-scoped). */
  campaignId: string | null
  campaignName: string | null
  sessionId: string | null
  myUserId: string | null
  /** DM gets a per-connected-player whisper picker; a player whispers their current campaign's DM directly. */
  isDm: boolean
  /** Player-only — the current campaign's DM, so a whisper can be started even before any history exists with them. */
  dmUserId?: string | null
  dmDisplayName?: string | null
}

type Section = 'party' | 'friends' | 'whispers'

/**
 * The bottom-of-the-right-panel messages strip — shared between
 * RightPanel.tsx (DM, isDm) and PartySidebar.tsx (player, !isDm). Three
 * independent kinds of conversation live here:
 *  - Party: the whole table, scoped to whichever campaign is currently
 *    open — unchanged from before, still backed by the DM's local
 *    per-campaign storage (see useCampaignChat) since it only ever needs
 *    to exist while that campaign's session is reachable.
 *  - Friends: any relay friend, anytime, campaign-independent.
 *  - Whispers: the DM<->one-player thread(s) you've ever had, tagged with
 *    whichever campaign each one came from — spans every campaign two
 *    accounts have shared, not just the one currently open.
 * Friends/Whispers are both backed by the relay's persistent store (see
 * useRelayMessages), not local SQLite — see shared/relay.ts and
 * relay/src/directory.ts.
 */
export function ChatPanel({ campaignId, campaignName, sessionId, myUserId, isDm, dmUserId, dmDisplayName }: ChatPanelProps): JSX.Element {
  const [section, setSection] = useState<Section>('party')
  const unreadNotifications = useUnreadMessageNotifications()
  const friendsUnread = unreadNotifications.filter((n) => n.messageKind === 'friend')
  const whispersUnread = unreadNotifications.filter((n) => n.messageKind === 'whisper')
  const unreadFriendIds = new Set(friendsUnread.map((n) => n.fromUserId))
  const unreadWhisperIds = new Set(whispersUnread.map((n) => n.fromUserId))

  // Party has no relay-backed notification to pair with (it's local,
  // per-campaign SQLite) — a lightweight local counter instead: bump it on
  // any live party message that isn't your own while you're looking at a
  // different section, clear it the moment Party becomes active again.
  const [partyUnread, setPartyUnread] = useState(0)
  useEffect(() => {
    if (!campaignId) return
    return window.goblin.messages.onMessage((message) => {
      if (message.campaignId !== campaignId || message.channel !== 'party' || message.senderUserId === myUserId) return
      setPartyUnread((prev) => (section === 'party' ? prev : prev + 1))
    })
  }, [campaignId, myUserId, section])
  useEffect(() => {
    if (section === 'party') setPartyUnread(0)
  }, [section])

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '9px 4px',
            flex: 1,
            borderBottom: '2px solid var(--accent)',
            color: 'var(--text-primary)',
            fontSize: 11,
            fontWeight: 700
          }}
        >
          <ChatIcon />
          Messages
        </div>
      </div>

      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <SectionTabButton icon={<PlayersIcon />} label="Party" active={section === 'party'} count={partyUnread} onClick={() => setSection('party')} />
        <SectionTabButton icon={<UserIcon />} label="Friends" active={section === 'friends'} count={friendsUnread.length} onClick={() => setSection('friends')} />
        <SectionTabButton icon={<WhisperIcon />} label="Whispers" active={section === 'whispers'} count={whispersUnread.length} onClick={() => setSection('whispers')} />
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <div style={{ display: section === 'party' ? 'block' : 'none', height: '100%' }}>
          <PartySection campaignId={campaignId} sessionId={sessionId} myUserId={myUserId} isDm={isDm} />
        </div>
        <div style={{ display: section === 'friends' ? 'block' : 'none', height: '100%' }}>
          <FriendsSection myUserId={myUserId} unreadFriendIds={unreadFriendIds} />
        </div>
        <div style={{ display: section === 'whispers' ? 'block' : 'none', height: '100%' }}>
          <WhispersSection
            campaignId={campaignId}
            campaignName={campaignName}
            sessionId={sessionId}
            myUserId={myUserId}
            isDm={isDm}
            dmUserId={dmUserId}
            dmDisplayName={dmDisplayName}
            unreadPeerIds={unreadWhisperIds}
          />
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
  isDm: boolean
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
    <div style={sectionStyle}>
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

function FriendsSection({ myUserId, unreadFriendIds }: { myUserId: string | null; unreadFriendIds: Set<string> }): JSX.Element {
  const [friends, setFriends] = useState<FriendSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { messages, error, send } = useRelayMessages(selectedId, 'friend')
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

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
      <div style={sectionStyle}>
        <ThreadHeader label={selected.username} onBack={() => setSelectedId(null)} />
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
    <div style={sectionStyle}>
      {friends.length === 0 ? (
        <EmptyState text="Add a friend to start messaging them." />
      ) : (
        <ThreadPicker
          items={friends.map((f) => ({ id: f.userId, label: f.username, sublabel: f.online ? 'Online' : undefined, unread: unreadFriendIds.has(f.userId) }))}
          onSelect={setSelectedId}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Whispers — the DM<->one-player thread(s), tagged per message with a
// campaign; can span every campaign two accounts have shared.
// ---------------------------------------------------------------------------

function WhispersSection({
  campaignId,
  campaignName,
  sessionId,
  myUserId,
  isDm,
  dmUserId,
  dmDisplayName,
  unreadPeerIds
}: {
  campaignId: string | null
  campaignName: string | null
  sessionId: string | null
  myUserId: string | null
  isDm: boolean
  dmUserId?: string | null
  dmDisplayName?: string | null
  unreadPeerIds: Set<string>
}): JSX.Element {
  const [threads, setThreads] = useState<WhisperThread[]>([])
  const [players, setPlayers] = useState<PresencePlayer[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedName, setSelectedName] = useState<string>('')
  const { messages, error, send } = useRelayMessages(selectedId, 'whisper')
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  function refreshThreads(): void {
    window.goblin.relay.messages.whisperThreads().then((result) => {
      if (result.ok) setThreads(result.data)
    })
  }

  useEffect(() => {
    refreshThreads()
    return window.goblin.relay.messages.onMessage((m) => {
      if (m.kind === 'whisper') refreshThreads()
    })
  }, [])

  // DM only — who's currently connected, so a whisper can be started with
  // someone even before any history with them exists.
  useEffect(() => {
    if (!isDm || !sessionId || !campaignId) {
      setPlayers([])
      return
    }
    window.goblin.presence.subscribe(sessionId, campaignId)
    return window.goblin.presence.onUpdate((update) => {
      if (update.sessionId === sessionId && update.campaignId === campaignId) setPlayers(update.players)
    })
  }, [isDm, sessionId, campaignId])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages.length])

  const threadPeerIds = new Set(threads.map((t) => t.userId))
  const quickStart = isDm
    ? players.filter((p) => !threadPeerIds.has(p.userId)).map((p) => ({ id: p.userId, label: p.displayName }))
    : dmUserId && !threadPeerIds.has(dmUserId) && dmDisplayName
      ? [{ id: dmUserId, label: dmDisplayName }]
      : []

  function openThread(id: string, label: string): void {
    setSelectedId(id)
    setSelectedName(label)
  }

  function handleSend(): void {
    if (!draft.trim() || !campaignId || !campaignName) return
    void send(draft, campaignId, campaignName)
    setDraft('')
  }

  if (selectedId) {
    const canSend = !!campaignId && !!campaignName
    return (
      <div style={sectionStyle}>
        <ThreadHeader label={selectedName} onBack={() => setSelectedId(null)} />
        <MessageList
          listRef={listRef}
          emptyText={`No whispers with ${selectedName} yet.`}
          items={messages.map((m) => ({
            id: m.id,
            senderName: m.senderUsername,
            isMine: m.senderUserId === myUserId,
            body: m.body,
            createdAt: m.createdAt,
            tag: m.campaignName ?? undefined
          }))}
        />
        {error && <ErrorLine text={error} />}
        <Composer
          placeholder={canSend ? `Whisper ${selectedName}…` : 'Open a campaign to whisper'}
          value={draft}
          onChange={setDraft}
          onSend={handleSend}
          disabled={!canSend}
        />
      </div>
    )
  }

  return (
    <div style={sectionStyle}>
      {threads.length === 0 && quickStart.length === 0 ? (
        <EmptyState text="No whispers yet." />
      ) : (
        <ThreadPicker
          items={[
            ...threads.map((t) => ({ id: t.userId, label: t.username, sublabel: t.lastCampaignName ?? undefined, unread: unreadPeerIds.has(t.userId) })),
            ...quickStart.map((q) => ({ id: q.id, label: q.label, sublabel: 'Start a whisper', unread: false }))
          ]}
          onSelect={(id) => {
            const thread = threads.find((t) => t.userId === id)
            const quick = quickStart.find((q) => q.id === id)
            openThread(id, thread?.username ?? quick?.label ?? '')
          }}
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
  /** A campaign name badge — whisper messages only, since one thread can span several campaigns. */
  tag?: string
}

function MessageList({ listRef, items, emptyText }: { listRef: React.RefObject<HTMLDivElement>; items: MessageItem[]; emptyText: string }): JSX.Element {
  return (
    <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {items.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 'auto', textAlign: 'center' }}>{emptyText}</p>}
      {items.map((item) => (
        <div key={item.id} style={{ fontSize: 12, lineHeight: 1.4 }}>
          <span style={{ fontWeight: 700, color: item.isMine ? 'var(--accent)' : 'var(--text-primary)' }}>{item.isMine ? 'You' : item.senderName}</span>{' '}
          <span style={{ color: 'var(--text-secondary)', wordBreak: 'break-word' }}>{item.body}</span>{' '}
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatTime(item.createdAt)}</span>
          {item.tag && (
            <span className="gb-badge" style={{ fontSize: 9, marginLeft: 4 }}>
              {item.tag}
            </span>
          )}
        </div>
      ))}
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
    <div style={{ display: 'flex', gap: 4, padding: 'var(--space-2)', flexShrink: 0 }}>
      <input
        className="gb-input"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSend()
        }}
        style={{ flex: 1, fontSize: 12, padding: '5px 8px' }}
      />
      <button type="button" onClick={onSend} disabled={disabled || !value.trim()} className="gb-btn gb-btn--primary" style={{ fontSize: 12, padding: '5px 10px' }}>
        Send
      </button>
    </div>
  )
}

function ThreadPicker({
  items,
  onSelect
}: {
  items: { id: string; label: string; sublabel?: string; unread?: boolean }[]
  onSelect: (id: string) => void
}): JSX.Element {
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: 'var(--space-2) var(--space-3)',
            border: 'none',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'transparent',
            color: 'var(--text-primary)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            textAlign: 'left'
          }}
        >
          {item.unread && <span title="New" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />}
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
          {item.sublabel && (
            <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)', flexShrink: 0 }}>{item.sublabel}</span>
          )}
        </button>
      ))}
    </div>
  )
}

function ThreadHeader({ label, onBack }: { label: string; onBack: () => void }): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px var(--space-2)', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
      <button
        type="button"
        onClick={onBack}
        title="Back"
        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, padding: '2px 4px' }}
      >
        ‹
      </button>
      <strong style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</strong>
    </div>
  )
}

function EmptyState({ text }: { text: string }): JSX.Element {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, textAlign: 'center', padding: '0 var(--space-3)' }}>{text}</p>
    </div>
  )
}

function ErrorLine({ text }: { text: string }): JSX.Element {
  return <p style={{ fontSize: 11, color: 'var(--danger)', margin: '0 var(--space-2)' }}>{text}</p>
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
    <button
      type="button"
      onClick={onClick}
      title={label}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        padding: '5px 8px',
        flex: 1,
        border: 'none',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        background: 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontSize: 11,
        fontWeight: 700,
        cursor: 'pointer',
        whiteSpace: 'nowrap'
      }}
    >
      {icon}
      {label}
      {!!count && (
        <span
          style={{
            minWidth: 15,
            height: 15,
            padding: '0 3px',
            borderRadius: '999px',
            background: 'var(--accent)',
            color: 'var(--accent-contrast, #fff)',
            fontSize: 9,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1
          }}
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  )
}

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  background: 'var(--bg-sunken)'
}

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%'
}
