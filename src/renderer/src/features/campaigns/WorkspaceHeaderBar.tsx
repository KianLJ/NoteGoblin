import { useState } from 'react'
import { CloseIcon, FileIcon, PlusIcon } from './icons'
import type { NotesWorkspace } from './useNotesWorkspace'
import type { Campaign } from '@shared/ipc'

interface WorkspaceHeaderBarProps {
  campaign: Campaign
  workspace: NotesWorkspace
}

/** Renders inline with the mode toggle in AppShell's header — note tabs live in the title bar, Obsidian-style. There's no "back": switching campaigns happens via the corner CampaignSwitcher. */
export function WorkspaceHeaderBar({ campaign, workspace }: WorkspaceHeaderBarProps): JSX.Element {
  const isDm = campaign.myRole === 'dm'
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14 }}>
          {campaign.name}
        </span>
        <span
          className={`gb-badge ${isDm ? 'gb-badge--accent' : ''}`}
          style={{ fontSize: 10, padding: '1px 6px' }}
        >
          {isDm ? 'DM' : 'Player'}
        </span>
      </div>

      <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', flexShrink: 0 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 2, overflowX: 'auto', minWidth: 0 }}>
        {workspace.tabNotes.map((tab) => {
          const active = tab.id === workspace.activeId
          return (
            <div
              key={tab.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move'
                setDraggingId(tab.id)
              }}
              onDragEnd={() => {
                setDraggingId(null)
                setDragOverId(null)
              }}
              onDragOver={(e) => {
                if (!draggingId || draggingId === tab.id) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setDragOverId(tab.id)
              }}
              onDragLeave={() => setDragOverId((id) => (id === tab.id ? null : id))}
              onDrop={(e) => {
                e.preventDefault()
                if (draggingId) workspace.moveTab(draggingId, tab.id)
                setDraggingId(null)
                setDragOverId(null)
              }}
              onClick={() => workspace.setActiveId(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 8px',
                borderRadius: 'var(--radius-sm)',
                fontSize: 13,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                opacity: draggingId === tab.id ? 0.5 : 1,
                background: dragOverId === tab.id ? 'var(--accent-subtle)' : active ? 'var(--bg-surface-raised)' : 'transparent',
                outline: dragOverId === tab.id ? '1px dashed var(--accent)' : 'none',
                outlineOffset: -1,
                color: active ? 'var(--text-primary)' : 'var(--text-muted)'
              }}
            >
              <FileIcon />
              <span>{tab.title || 'Untitled'}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  workspace.closeTab(tab.id)
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  display: 'flex',
                  opacity: 0.6
                }}
              >
                <CloseIcon />
              </button>
            </div>
          )
        })}
        <button
          type="button"
          title="New note"
          onClick={() => workspace.createNote('shared', null)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: 6,
            borderRadius: 'var(--radius-sm)',
            flexShrink: 0
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-sunken)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'none'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
        >
          <PlusIcon />
        </button>
      </div>
    </div>
  )
}
