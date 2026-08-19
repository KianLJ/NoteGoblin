import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Message, PresencePlayer } from '@shared/ipc'
import { useCampaignChat } from './useCampaignChat'

interface ChatPanelProps {
  /** null before a campaign exists (DM) or before one's been joined (player) — the panel still renders, just with an empty placeholder instead of tabs, same "always mounted, adapts to connection state" treatment DiceTray gets. */
  campaignId: string | null
  sessionId: string | null
  myUserId: string | null
  /** DM gets a whisper tab per connected player (picked from live presence); a player gets a single "DM" whisper tab — there's only ever one person to whisper. */
  isDm: boolean
}

type ChatChannel = { kind: 'party' } | { kind: 'whisper'; peerUserId: string; peerName: string }

/**
 * The bottom-of-the-right-panel chat strip — shared between RightPanel.tsx
 * (DM, isDm) and PartySidebar.tsx (player, !isDm). 'Party' reaches the whole
 * table; the whisper tab(s) are the DM<->one-player thread(s), scoped and
 * enforced server-side (see campaignService.ts's sendMessage) regardless of
 * what this UI sends — this just picks which thread to show/post to.
 */
export function ChatPanel({ campaignId, sessionId, myUserId, isDm }: ChatPanelProps): JSX.Element {
  const { messages, error, send } = useCampaignChat(campaignId, sessionId)
  const [channel, setChannel] = useState<ChatChannel>({ kind: 'party' })
  const [draft, setDraft] = useState('')
  const [players, setPlayers] = useState<PresencePlayer[]>([])
  const listRef = useRef<HTMLDivElement>(null)

  // DM only — the live connected-players list drives the per-player whisper tabs.
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

  // A player's connected-DM-hosting session drops out of `players` scope, so
  // reset back to Party if the whisper peer you were viewing disconnects —
  // otherwise the tab stays selected but silently stops being reachable.
  useEffect(() => {
    if (channel.kind === 'whisper' && isDm && !players.some((p) => p.userId === channel.peerUserId)) {
      setChannel({ kind: 'party' })
    }
  }, [players, channel, isDm])

  const visibleMessages = messages.filter((m) => {
    if (channel.kind === 'party') return m.channel === 'party'
    if (!isDm) return m.channel === 'whisper'
    return m.channel === 'whisper' && (m.senderUserId === channel.peerUserId || m.recipientUserId === channel.peerUserId)
  })

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [visibleMessages.length])

  function handleSend(): void {
    if (!draft.trim()) return
    if (channel.kind === 'party') void send('party', undefined, draft)
    else void send('whisper', channel.peerUserId, draft)
    setDraft('')
  }

  if (!campaignId) {
    return (
      <div style={{ ...containerStyle, alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          {isDm ? 'Open a campaign to chat.' : 'Join a campaign to chat.'}
        </p>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', gap: 2, overflowX: 'auto', flexShrink: 0, borderBottom: '1px solid var(--border-subtle)' }}>
        <ChatTabButton label="Party" active={channel.kind === 'party'} onClick={() => setChannel({ kind: 'party' })} />
        {isDm
          ? players.map((p) => (
              <ChatTabButton
                key={p.userId}
                label={p.displayName}
                active={channel.kind === 'whisper' && channel.peerUserId === p.userId}
                onClick={() => setChannel({ kind: 'whisper', peerUserId: p.userId, peerName: p.displayName })}
              />
            ))
          : (
              <ChatTabButton
                label="DM"
                active={channel.kind === 'whisper'}
                onClick={() => setChannel({ kind: 'whisper', peerUserId: 'dm', peerName: 'DM' })}
              />
            )}
      </div>

      <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {visibleMessages.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 'auto', textAlign: 'center' }}>
            {channel.kind === 'party' ? 'No messages yet — say hi.' : 'No messages in this thread yet.'}
          </p>
        )}
        {visibleMessages.map((m) => (
          <ChatMessageRow key={m.id} message={m} isMine={m.senderUserId === myUserId} />
        ))}
      </div>

      {error && <p style={{ fontSize: 11, color: 'var(--danger)', margin: '0 var(--space-2)' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 4, padding: 'var(--space-2)', flexShrink: 0 }}>
        <input
          className="gb-input"
          placeholder={channel.kind === 'party' ? 'Message the party…' : `Whisper ${channel.kind === 'whisper' ? channel.peerName : ''}…`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend()
          }}
          style={{ flex: 1, fontSize: 12, padding: '5px 8px' }}
        />
        <button type="button" onClick={handleSend} disabled={!draft.trim()} className="gb-btn gb-btn--primary" style={{ fontSize: 12, padding: '5px 10px' }}>
          Send
        </button>
      </div>
    </div>
  )
}

function ChatMessageRow({ message, isMine }: { message: Message; isMine: boolean }): JSX.Element {
  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return (
    <div style={{ fontSize: 12, lineHeight: 1.4 }}>
      <span style={{ fontWeight: 700, color: isMine ? 'var(--accent)' : 'var(--text-primary)' }}>
        {isMine ? 'You' : message.senderDisplayName}
      </span>{' '}
      <span style={{ color: 'var(--text-secondary)', wordBreak: 'break-word' }}>{message.body}</span>{' '}
      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{time}</span>
    </div>
  )
}

function ChatTabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      style={{
        padding: '5px 8px',
        border: 'none',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        background: 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontSize: 11,
        fontWeight: 700,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        maxWidth: 100,
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }}
    >
      {label}
    </button>
  )
}

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  background: 'var(--bg-sunken)'
}
