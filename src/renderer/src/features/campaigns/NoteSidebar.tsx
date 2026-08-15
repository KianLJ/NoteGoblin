import type { ReactNode } from 'react'
import { FileIcon, LockIcon, PlusIcon } from './icons'
import { ResizableSidebar } from '../../ui/ResizableSidebar'
import type { Note } from '@shared/ipc'

interface NoteSidebarProps {
  notes: Note[]
  isDm: boolean
  activeId: string | null
  onSelect: (id: string) => void
  /** undefined when there's no campaign to attach a note to yet — sections just hide their "+". */
  onCreate?: (visibility: 'dm' | 'shared') => void
  /** The campaign switcher + account settings — rendered here so they're visually part of the sidebar, not a floating overlay. */
  footer: ReactNode
}

export function NoteSidebar({ notes, isDm, activeId, onSelect, onCreate, footer }: NoteSidebarProps): JSX.Element {
  const shared = notes.filter((n) => n.visibility === 'shared')
  const dmOnly = notes.filter((n) => n.visibility === 'dm')

  return (
    <ResizableSidebar
      defaultWidth={220}
      footer={
        <div
          style={{
            borderRight: '1px solid var(--border-subtle)',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--bg-sunken)',
            padding: 'var(--space-2)',
            display: 'flex',
            gap: 'var(--space-2)',
            flexShrink: 0
          }}
        >
          {footer}
        </div>
      }
    >
      <div
        style={{
          height: '100%',
          borderRight: '1px solid var(--border-subtle)',
          background: 'var(--bg-sunken)',
          overflowY: 'auto',
          padding: 'var(--space-2) 0'
        }}
      >
        <Section title="Shared Notes" onCreate={onCreate && (() => onCreate('shared'))}>
          {shared.map((note) => (
            <FileRow key={note.id} note={note} active={note.id === activeId} onClick={() => onSelect(note.id)} />
          ))}
          {shared.length === 0 && <EmptyHint />}
        </Section>

        {isDm && (
          <Section title="DM Only" icon={<LockIcon />} onCreate={onCreate && (() => onCreate('dm'))}>
            {dmOnly.map((note) => (
              <FileRow key={note.id} note={note} active={note.id === activeId} onClick={() => onSelect(note.id)} />
            ))}
            {dmOnly.length === 0 && <EmptyHint />}
          </Section>
        )}
      </div>
    </ResizableSidebar>
  )
}

function Section({
  title,
  icon,
  onCreate,
  children
}: {
  title: string
  icon?: ReactNode
  onCreate?: () => void
  children: ReactNode
}): JSX.Element {
  return (
    <div style={{ marginBottom: 'var(--space-3)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px var(--space-3)'
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-muted)'
          }}
        >
          {icon}
          {title}
        </span>
        {onCreate && (
          <button
            type="button"
            onClick={onCreate}
            title="New note"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: 2,
              display: 'flex'
            }}
          >
            <PlusIcon />
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

function FileRow({ note, active, onClick }: { note: Note; active: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        width: '100%',
        textAlign: 'left',
        padding: '5px var(--space-3)',
        background: active ? 'var(--accent-subtle)' : 'transparent',
        border: 'none',
        borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
        color: active ? 'var(--accent-hover)' : 'var(--text-secondary)',
        fontSize: 13,
        cursor: 'pointer'
      }}
    >
      <FileIcon />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {note.title || 'Untitled'}
      </span>
    </button>
  )
}

function EmptyHint(): JSX.Element {
  return (
    <div style={{ padding: '4px var(--space-3)', fontSize: 12, color: 'var(--text-muted)' }}>No notes</div>
  )
}
