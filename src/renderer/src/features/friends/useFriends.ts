import { useCallback, useEffect, useState } from 'react'
import type { FriendRequest, FriendSummary, RelayStatus } from '@shared/relay'

interface UseFriendsResult {
  status: RelayStatus
  friends: FriendSummary[]
  incomingRequests: FriendRequest[]
  loading: boolean
  error: string | null
  sendRequest: (username: string) => Promise<{ ok: true; status: 'requested' | 'accepted' } | { ok: false; error: string }>
  accept: (userId: string) => Promise<void>
  decline: (userId: string) => Promise<void>
  remove: (userId: string) => Promise<void>
  refresh: () => void
}

/** Wraps window.goblin.relay.* — re-fetches on mount and whenever the main process signals presence/friend-graph changes, rather than trying to apply pushed deltas locally. */
export function useFriends(): UseFriendsResult {
  const [status, setStatus] = useState<RelayStatus>('unavailable')
  const [friends, setFriends] = useState<FriendSummary[]>([])
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setLoading(true)
    Promise.all([
      window.goblin.relay.status(),
      window.goblin.relay.friends.list(),
      window.goblin.relay.friends.listRequests()
    ]).then(([nextStatus, friendsResult, requestsResult]) => {
      setStatus(nextStatus)
      if (friendsResult.ok) setFriends(friendsResult.data)
      if (requestsResult.ok) setIncomingRequests(requestsResult.data)
      setError(!friendsResult.ok ? friendsResult.error : null)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    refresh()
    return window.goblin.relay.onFriendsChanged(refresh)
  }, [refresh])

  async function sendRequest(
    username: string
  ): Promise<{ ok: true; status: 'requested' | 'accepted' } | { ok: false; error: string }> {
    const result = await window.goblin.relay.friends.sendRequest(username)
    if (result.ok) refresh()
    return result.ok ? { ok: true, status: result.data.status } : { ok: false, error: result.error }
  }

  async function accept(userId: string): Promise<void> {
    await window.goblin.relay.friends.accept(userId)
    refresh()
  }

  async function decline(userId: string): Promise<void> {
    await window.goblin.relay.friends.decline(userId)
    refresh()
  }

  async function remove(userId: string): Promise<void> {
    await window.goblin.relay.friends.remove(userId)
    refresh()
  }

  return { status, friends, incomingRequests, loading, error, sendRequest, accept, decline, remove, refresh }
}
