import { useEffect, useState } from 'react'
import type { RelayMessage, RelayNotification } from '@shared/relay'

/**
 * One relay-persisted thread — either a 'friend' DM (campaign-independent)
 * or a 'whisper' (DM<->one-player, tagged per message with a campaign).
 * Mirrors useCampaignChat's shape, but sourced from the relay's account-
 * centric store (see relay/src/directory.ts) instead of the DM's local
 * per-campaign SQLite, since both these kinds need to work regardless of
 * which campaign (if any) is currently open.
 */
export function useRelayMessages(peerUserId: string | null, kind: 'friend' | 'whisper') {
  const [messages, setMessages] = useState<RelayMessage[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!peerUserId) {
      setMessages([])
      return
    }
    let cancelled = false
    window.goblin.relay.messages.list(peerUserId, kind).then((result) => {
      if (cancelled) return
      if (result.ok) setMessages(result.data)
      else setError(result.error)
    })
    // Opening a thread clears whatever was unread in it — same "you looked, it's read" convention every other unread indicator in the app uses.
    void window.goblin.relay.messages.markRead(peerUserId, kind)
    return () => {
      cancelled = true
    }
  }, [peerUserId, kind])

  useEffect(() => {
    if (!peerUserId) return
    return window.goblin.relay.messages.onMessage((message) => {
      if (message.kind !== kind) return
      if (message.senderUserId !== peerUserId && message.recipientUserId !== peerUserId) return
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]))
      // Already looking at this thread when the new message arrives — mark it read immediately rather than leaving a badge up for something already visible on screen.
      if (message.senderUserId === peerUserId) void window.goblin.relay.messages.markRead(peerUserId, kind)
    })
  }, [peerUserId, kind])

  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), 5000)
    return () => clearTimeout(timer)
  }, [error])

  async function send(body: string, campaignId?: string, campaignName?: string): Promise<void> {
    if (!peerUserId || !body.trim()) return
    const result = await window.goblin.relay.messages.send({ toUserId: peerUserId, kind, campaignId, campaignName, body: body.trim() })
    if (result.ok) {
      setMessages((prev) => (prev.some((m) => m.id === result.data.id) ? prev : [...prev, result.data]))
    } else {
      setError(result.error)
    }
  }

  return { messages, error, send }
}

/**
 * Every unread `kind: 'message'` notification (see relay/src/directory.ts's
 * pushNotification dedup — a burst of messages from the same sender/kind
 * collapses to one entry, so this is naturally "one unread notification per
 * thread with something new," not one per message). Powers the Friends/
 * Whispers tab counters and per-thread "new" markers in ChatPanel.tsx —
 * reusing the exact same notification store the bell/toasts already read,
 * rather than a separate unread-tracking mechanism.
 */
export function useUnreadMessageNotifications(): RelayNotification[] {
  const [notifications, setNotifications] = useState<RelayNotification[]>([])

  useEffect(() => {
    function refresh(): void {
      window.goblin.relay.notifications.list().then((result) => {
        if (result.ok) setNotifications(result.data)
      })
    }
    refresh()
    return window.goblin.relay.onNotificationsChanged(refresh)
  }, [])

  return notifications.filter((n) => n.kind === 'message' && !n.read)
}
