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

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onSave(draft), AUTOSAVE_DELAY_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  function setDraft(updater: (prev: T) => T): void {
    setDraftState(updater)
  }

  return [draft, setDraft]
}
