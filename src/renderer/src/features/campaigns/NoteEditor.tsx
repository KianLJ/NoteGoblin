import { useEffect, useRef, useState } from 'react'
import type { Note } from '@shared/ipc'

interface NoteEditorProps {
  note: Note
  onSave: (patch: { title?: string; bodyMarkdown?: string }) => void
}

const AUTOSAVE_DELAY_MS = 700

/**
 * Keyed by note.id from the parent, so switching notes remounts this with
 * fresh local state instead of leaking edits between files.
 *
 * Title/body are uncontrolled (defaultValue, not value) on purpose: a
 * controlled value here fights the browser's native undo stack — Ctrl+Z ends
 * up reverting the DOM and then immediately getting stomped back to React's
 * state on the next render, so undo looks broken. Local state still tracks
 * the latest typed value (via onChange) for autosave/onBlur, it just never
 * gets fed back into the field.
 */
export function NoteEditor({ note, onSave }: NoteEditorProps): JSX.Element {
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.bodyMarkdown)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  function scheduleSave(patch: { title?: string; bodyMarkdown?: string }): void {
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
          defaultValue={note.title}
          onChange={(e) => {
            setTitle(e.target.value)
            scheduleSave({ title: e.target.value })
          }}
          onBlur={() => onSave({ title })}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexShrink: 0 }}>
          <span className={`gb-badge ${note.visibility === 'dm' ? 'gb-badge--danger' : 'gb-badge--success'}`}>
            {note.visibility === 'dm' ? 'DM Only' : 'Shared'}
          </span>
        </div>
      </div>

      <textarea
        defaultValue={note.bodyMarkdown}
        onChange={(e) => {
          setBody(e.target.value)
          scheduleSave({ bodyMarkdown: e.target.value })
        }}
        onBlur={() => onSave({ bodyMarkdown: body })}
        placeholder="Write in Markdown…"
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

      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}>
        by {note.authorDisplayName}
      </div>
    </div>
  )
}
