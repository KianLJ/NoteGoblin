import { useEffect, useRef, useState } from 'react'

const AUTOSAVE_DELAY_MS = 700

/**
 * Local draft state for one character-sheet tab, debounce-saved via onSave
 * whenever it changes. Skips the save on mount (the draft starts equal to
 * what's already persisted) so opening a tab never writes a no-op patch.
 *
 * `readOnly` (viewing someone else's character, e.g. the DM watching a
 * connected player) switches the draft to always mirror the latest
 * `initial` instead of freezing at whatever it was on mount — there's no
 * local typing to protect there, so the alternative is a sheet that only
 * shows their latest edits after you close and reopen it. Editing your own
 * character keeps the normal behavior: local edits stay authoritative
 * until they're saved, not clobbered by an echoed update mid-typing.
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
  draftRef.current = draft
  onSaveRef.current = onSave

  useEffect(() => {
    if (!readOnly) return
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
    pendingRef.current = true
    timerRef.current = setTimeout(() => {
      pendingRef.current = false
      onSaveRef.current(draftRef.current)
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
        onSaveRef.current(draftRef.current)
      }
    }
  }, [])

  function setDraft(updater: (prev: T) => T): void {
    if (readOnly) return
    setDraftState(updater)
  }

  return [draft, setDraft]
}
