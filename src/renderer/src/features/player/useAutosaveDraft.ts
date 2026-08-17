import { useEffect, useRef, useState } from 'react'

const AUTOSAVE_DELAY_MS = 700

/**
 * Local draft state for one character-sheet tab, debounce-saved via onSave
 * whenever it changes. Skips the save on mount (the draft starts equal to
 * what's already persisted) so opening a tab never writes a no-op patch.
 */
export function useAutosaveDraft<T>(initial: T, onSave: (patch: T) => void): [T, (updater: (prev: T) => T) => void] {
  const [draft, setDraftState] = useState(initial)
  const isFirstRender = useRef(true)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const draftRef = useRef(draft)
  const onSaveRef = useRef(onSave)
  const pendingRef = useRef(false)
  draftRef.current = draft
  onSaveRef.current = onSave

  useEffect(() => {
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
  }, [draft])

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
    setDraftState(updater)
  }

  return [draft, setDraft]
}
