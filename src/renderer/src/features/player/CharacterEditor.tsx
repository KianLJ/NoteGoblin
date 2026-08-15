import { useEffect, useRef, useState } from 'react'
import type { CharacterSheet } from '@shared/ipc'

interface CharacterEditorProps {
  character: CharacterSheet
  onSave: (patch: { name?: string; notes?: string }) => void
  onDelete: () => void
}

const AUTOSAVE_DELAY_MS = 700

/** Keyed by character.id from the parent, so switching characters remounts this with fresh local state. Minimal for now (name + freeform notes) — real 5e stat fields are a later, dedicated pass. */
export function CharacterEditor({ character, onSave, onDelete }: CharacterEditorProps): JSX.Element {
  const [name, setName] = useState(character.name)
  const [notes, setNotes] = useState(character.notes)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  function scheduleSave(patch: { name?: string; notes?: string }): void {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => onSave(patch), AUTOSAVE_DELAY_MS)
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 'var(--space-5)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-3)'
        }}
      >
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            scheduleSave({ name: e.target.value })
          }}
          onBlur={() => onSave({ name })}
          style={{
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--text-primary)',
            flex: 1,
            minWidth: 0
          }}
        />
        <button
          type="button"
          onClick={onDelete}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: 12,
            cursor: 'pointer',
            textDecoration: 'underline',
            padding: 0,
            flexShrink: 0
          }}
        >
          Delete
        </button>
      </div>

      <textarea
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value)
          scheduleSave({ notes: e.target.value })
        }}
        onBlur={() => onSave({ notes })}
        placeholder="Backstory, personality, gear, whatever you're tracking so far…"
        style={{
          flex: 1,
          resize: 'none',
          border: 'none',
          outline: 'none',
          background: 'transparent',
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          lineHeight: 1.7,
          color: 'var(--text-primary)'
        }}
      />
    </div>
  )
}
