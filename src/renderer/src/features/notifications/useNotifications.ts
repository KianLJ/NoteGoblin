import { useCallback, useEffect, useState } from 'react'
import type { RelayNotification } from '@shared/relay'

/** Mirrors useFriends.ts's shape — re-fetches on mount and whenever the main process signals a new push, rather than trying to apply a delta locally. */
export function useNotifications() {
  const [notifications, setNotifications] = useState<RelayNotification[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    setLoading(true)
    window.goblin.relay.notifications.list().then((result) => {
      if (result.ok) setNotifications(result.data)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    refresh()
    return window.goblin.relay.onNotificationsChanged(refresh)
  }, [refresh])

  async function markRead(id: string): Promise<void> {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    await window.goblin.relay.notifications.markRead(id)
  }

  const unreadCount = notifications.filter((n) => !n.read).length

  return { notifications, unreadCount, loading, markRead, refresh }
}

export type Notifications = ReturnType<typeof useNotifications>
