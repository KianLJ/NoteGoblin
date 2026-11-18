import { useEffect, useRef } from 'react'
import { dueReminders } from '@shared/planner'
import { openPlanner, usePlanner } from './usePlanner'

const FIRED = 'gb-planner-reminded'

function readFired(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FIRED) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

/**
 * Reminds you of booked sessions the day before and the hour before, as a system notification, while the app is
 * open. Each reminder once, remembered across restarts.
 * shortcut: only while NoteGoblin is running; a reminder with the app closed needs the relay to send it (push).
 */
export function useSessionReminders(): void {
  const { state } = usePlanner()
  const plans = useRef(state?.plans ?? [])
  plans.current = state?.plans ?? []
  useEffect(() => {
    const check = (): void => {
      const fired = readFired()
      const due = dueReminders(plans.current, Date.now(), fired)
      if (!due.length) return
      for (const { key, plan, soon } of due) {
        fired.add(key)
        const at = new Date(plan.booked!.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
        const note = new Notification(soon === 'hour' ? `${plan.title} starts soon` : `${plan.title} is tomorrow`, {
          body: soon === 'hour' ? `At ${at}, with ${plan.members.map((m) => m.username).join(', ')}.` : `At ${at}. Time to get your character sheet ready.`
        })
        note.onclick = () => {
          window.focus()
          openPlanner()
        }
      }
      try {
        // Only the latest hundred: old sessions' reminders don't need remembering.
        localStorage.setItem(FIRED, JSON.stringify([...fired].slice(-100)))
      } catch {
        /* forgotten: at worst a reminder shows again */
      }
    }
    check()
    const timer = setInterval(check, 60_000)
    return () => clearInterval(timer)
  }, [state])
}
