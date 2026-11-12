import { useSyncExternalStore } from 'react'

/**
 * "Deleted X · Undo": the last thing deleted, with how to put it back, for a few seconds (UndoToast.tsx shows it).
 * Anything that can't be taken back later — a picture's stored file — waits (`whenFinal`) until the chance to undo
 * has passed, and is skipped if it's undone.
 */
export interface UndoOffer {
  id: number
  label: string
  undo: () => void
}

const UNDO_MS = 7000
let offer: (UndoOffer & { finals: Array<() => void>; timer: ReturnType<typeof setTimeout> }) | null = null
let nextId = 1
const listeners = new Set<() => void>()
const emit = (): void => listeners.forEach((l) => l())

function finish(): void {
  if (!offer) return
  clearTimeout(offer.timer)
  const finals = offer.finals
  offer = null
  finals.forEach((f) => f())
  emit()
}

/** Offers to undo a deletion just made. A newer offer makes the one before it final. */
export function offerUndo(label: string, undo: () => void): void {
  finish()
  offer = { id: nextId++, label, undo, finals: [], timer: setTimeout(finish, UNDO_MS) }
  emit()
}

/** Runs `fn` once the latest deletion can no longer be undone — never, if it is. With no offer up, right away. */
export function whenFinal(fn: () => void): void {
  if (offer) offer.finals.push(fn)
  else fn()
}

export function undoLast(): void {
  if (!offer) return
  clearTimeout(offer.timer)
  const { undo } = offer
  offer = null
  emit()
  undo()
}

export function dismissUndo(): void {
  finish()
}

export function useUndoOffer(): UndoOffer | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => offer
  )
}
