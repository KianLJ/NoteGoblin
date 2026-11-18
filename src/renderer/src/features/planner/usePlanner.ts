import { useCallback, useEffect, useState } from 'react'
import type { PlannerState } from '@shared/planner'

/** The planner's state from the relay, re-read whenever someone in one of your plans changes it. */
export function usePlanner(): { state: PlannerState | null; error: string | null; refresh: () => void; setState: (s: PlannerState) => void } {
  const [state, setState] = useState<PlannerState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(() => {
    void window.goblin.relay.planner.get().then((r) => {
      if (r.ok) {
        setState(r.data)
        setError(null)
      } else setError(r.error)
    })
  }, [])
  useEffect(() => {
    refresh()
    const offPlans = window.goblin.relay.onPlannerChanged(refresh)
    // Coming back online (or signing in) re-reads it too.
    const offFriends = window.goblin.relay.onFriendsChanged(refresh)
    return () => {
      offPlans()
      offFriends()
    }
  }, [refresh])
  return { state, error, refresh, setState }
}

/** Opens the top bar's Session planner (the notification toasts' "Open planner"). */
export const OPEN_PLANNER_EVENT = 'gb-open-planner'
export function openPlanner(): void {
  window.dispatchEvent(new Event(OPEN_PLANNER_EVENT))
}
