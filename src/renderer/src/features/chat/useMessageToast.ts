import { useEffect, useRef, useState } from 'react'

const VISIBLE_MS = 5000

export interface MessageToastInfo {
  id: string
  text: string
}

/**
 * A transient "new message" bubble for the Messages header button — same
 * pop-out-for-a-few-seconds idea as useDiceRollToast.ts, so a message
 * doesn't need its own persistent spot in the corner notification stack
 * (see NotificationToasts.tsx, which now skips 'message'-kind notifications
 * entirely in favor of this). Covers both message kinds: Party (a live push
 * over window.goblin.messages.onMessage, scoped to the current campaign) and
 * Friends (a relay-persisted notification, arriving via onNotificationsChanged).
 */
export function useMessageToast(campaignId: string | null, myUserId: string | null): MessageToastInfo | null {
  const [toast, setToast] = useState<MessageToastInfo | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>()
  const seenNotificationIds = useRef<Set<string>>(new Set())

  function show(id: string, text: string): void {
    setToast({ id, text })
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setToast(null), VISIBLE_MS)
  }

  useEffect(() => {
    if (!campaignId) return
    return window.goblin.messages.onMessage((message) => {
      if (message.campaignId !== campaignId || message.channel !== 'party' || message.senderUserId === myUserId) return
      show(message.id, `${message.senderDisplayName}: ${message.body}`)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, myUserId])

  useEffect(() => {
    let seeded = false
    function checkForNew(): void {
      window.goblin.relay.notifications.list().then((result) => {
        if (!result.ok) return
        if (!seeded) {
          for (const n of result.data) seenNotificationIds.current.add(n.id)
          seeded = true
          return
        }
        const fresh = result.data.find((n) => n.kind === 'message' && !seenNotificationIds.current.has(n.id))
        for (const n of result.data) seenNotificationIds.current.add(n.id)
        if (fresh) show(fresh.id, fresh.messageKind === 'whisper' ? `${fresh.fromUsername} whispered you` : `${fresh.fromUsername} sent you a message`)
      })
    }
    checkForNew()
    return window.goblin.relay.onNotificationsChanged(checkForNew)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return toast
}
