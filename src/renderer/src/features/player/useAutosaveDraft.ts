import { useEffect, useRef, useState } from 'react'

const AUTOSAVE_DELAY_MS = 700

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The actual patch to send: for an object-shaped draft (every tab except
 * CharacterSheetEditor's bare `name` string), only the top-level keys that
 * differ from `base` — never the whole draft. A primitive draft (just
 * `name`) has no sub-fields to diff, so the value itself is the patch, same
 * as before. The `as T` cast is safe: every real caller of `onSave` already
 * treats its parameter as a partial merge into the persisted record (see
 * e.g. `characters:update`'s IPC handler) — T here just names "the shape
 * this draft cares about," not a promise that every field is present.
 */
function computeDelta<T>(base: T, next: T): T {
  if (!isPlainObject(base) || !isPlainObject(next)) return next
  const patch: Record<string, unknown> = {}
  for (const key of Object.keys(next)) {
    if (JSON.stringify(next[key]) !== JSON.stringify(base[key])) patch[key] = next[key]
  }
  return patch as T
}

function isEmptyPatch(patch: unknown): boolean {
  return isPlainObject(patch) && Object.keys(patch).length === 0
}

/**
 * Local draft state for one character-sheet tab, debounce-saved via onSave
 * whenever it changes. Skips the save on mount (the draft starts equal to
 * what's already persisted) so opening a tab never writes a no-op patch.
 *
 * The debounced save only ever sends the fields that actually changed since
 * the last sync (a real delta, computed against `lastSyncedRef`) — never
 * the whole draft. This matters because several tabs hold overlapping
 * fields (e.g. Overview's `abilityScores` also gets written directly by
 * FeaturesTab.tsx when an Ability Score Improvement or feat is resolved):
 * re-sending a field this draft never touched would silently stomp a
 * concurrent write from elsewhere with this tab's now-stale copy of it,
 * one debounce cycle later. Sending only the real delta makes that class
 * of clobber impossible.
 *
 * `readOnly` (viewing someone else's character, e.g. the DM watching a
 * connected player) always mirrors the latest `initial` — there's no local
 * typing to protect there.
 *
 * Editing your own character adopts an external update to `initial`
 * whenever there's no local edit actively in flight (no debounce pending) —
 * this is what makes another part of the sheet writing straight to the
 * character record (e.g. FeaturesTab.tsx resolving an ASI slot or a
 * subclass pick) actually show up here. If a local edit *is* in flight,
 * the external update is skipped for now so it doesn't clobber mid-typing
 * — the next `initial` change (e.g. once that save lands) will pick it up.
 */
export function useAutosaveDraft<T>(
  initial: T,
  onSave: (patch: T) => void,
  readOnly?: boolean
): [T, (updater: (prev: T) => T) => void] {
  const [draft, setDraftState] = useState(initial)
  const isFirstRender = useRef(true)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const draftRef = useRef(draft)
  const onSaveRef = useRef(onSave)
  const pendingRef = useRef(false)
  // What we last knew to be persisted — the baseline the next debounced
  // save diffs against to find only what actually changed.
  const lastSyncedRef = useRef(initial)
  draftRef.current = draft
  onSaveRef.current = onSave

  useEffect(() => {
    if (!readOnly && pendingRef.current) return
    lastSyncedRef.current = initial
    setDraftState((prev) => (JSON.stringify(prev) === JSON.stringify(initial) ? prev : initial))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, readOnly])

  useEffect(() => {
    if (readOnly) return
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      pendingRef.current = false
      const patch = computeDelta(lastSyncedRef.current, draftRef.current)
      if (!isEmptyPatch(patch)) {
        lastSyncedRef.current = draftRef.current
        onSaveRef.current(patch)
      }
    }, AUTOSAVE_DELAY_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, readOnly])

  // Flush a still-pending debounced save immediately on unmount instead of
  // discarding it — otherwise clicking to another character/note within the
  // debounce window silently dropped the edit.
  useEffect(() => {
    return () => {
      if (pendingRef.current) {
        if (timerRef.current) clearTimeout(timerRef.current)
        const patch = computeDelta(lastSyncedRef.current, draftRef.current)
        if (!isEmptyPatch(patch)) onSaveRef.current(patch)
      }
    }
  }, [])

  function setDraft(updater: (prev: T) => T): void {
    if (readOnly) return
    // Set synchronously, in the same event-handler tick as the edit itself
    // — not inside the debounce effect above. Effects run *after* React
    // commits the render, and the "adopt an external update" effect (the
    // one above this one) runs first since it's declared first; if
    // pendingRef were still false at that point (as it would be if it were
    // only set inside the debounce effect), that effect would see a stale
    // `initial` that doesn't yet reflect this edit and immediately
    // overwrite the draft back to it — reverting the edit before its own
    // debounce timer ever got a chance to arm. Setting it here closes that
    // window entirely.
    pendingRef.current = true
    setDraftState(updater)
  }

  return [draft, setDraft]
}
