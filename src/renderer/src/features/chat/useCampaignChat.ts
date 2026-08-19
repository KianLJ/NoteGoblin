import { useEffect, useState } from 'react'
import type { Message } from '@shared/ipc'

/**
 * Owns one campaign's chat scrollback — a snapshot fetched on mount/campaign
 * switch (via messages.list), kept live afterward by appending whatever
 * arrives over messages.onMessage. Not persisted client-side beyond that:
 * reopening the panel later re-fetches rather than replaying local state,
 * same tradeoff Initiative/Dice make for their own live state.
 *
 * `campaignId` null (not yet joined a campaign) is a valid, common state —
 * this just sits empty rather than erroring, so ChatPanel.tsx can render
 * unconditionally the same way DiceTray does regardless of connection state.
 */
export function useCampaignChat(campaignId: string | null, sessionId: string | null) {
  const [messages, setMessages] = useState<Message[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!campaignId) {
      setMessages([])
      return
    }
    let cancelled = false
    window.goblin.messages.list(campaignId, sessionId ?? undefined).then((result) => {
      if (cancelled) return
      if (result.ok) setMessages(result.data)
      else setError(result.error)
    })
    return () => {
      cancelled = true
    }
  }, [campaignId, sessionId])

  useEffect(() => {
    if (!campaignId) return
    return window.goblin.messages.onMessage((message) => {
      if (message.campaignId !== campaignId) return
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]))
    })
  }, [campaignId])

  // Auto-dismiss, same convention as the workspace-level error toasts —
  // this is a small inline panel, not somewhere a stale error should sit forever.
  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), 5000)
    return () => clearTimeout(timer)
  }, [error])

  /**
   * `recipientUserId` only actually matters when the DM is sending a
   * whisper (they must name which player) — a player's whisper always
   * resolves to the DM server-side regardless of what's passed here (see
   * campaignService.ts's sendMessage), so the player-side caller can pass
   * anything or omit it.
   */
  async function send(channel: 'party' | 'whisper', recipientUserId: string | undefined, body: string): Promise<void> {
    if (!campaignId || !body.trim()) return
    const result = await window.goblin.messages.send(
      campaignId,
      { channel, recipientUserId, body: body.trim() },
      sessionId ?? undefined
    )
    if (result.ok) {
      setMessages((prev) => (prev.some((m) => m.id === result.data.id) ? prev : [...prev, result.data]))
    } else {
      setError(result.error)
    }
  }

  return { messages, error, send }
}
