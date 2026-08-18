import { useState } from 'react'
import { CloseIcon, FileIcon, PlusIcon } from '../campaigns/icons'
import { UserIcon } from './icons'
import type { PlayerWorkspace, PlayerTabRef } from './usePlayerWorkspace'

interface PlayerWorkspaceHeaderBarProps {
  workspace: PlayerWorkspace
}

function sameTab(a: PlayerTabRef, b: PlayerTabRef): boolean {
  return a.kind === b.kind && a.id === b.id
}

/** Renders inline with the mode toggle in AppShell's header — mixes character and note tabs in one strip, same as the DM's WorkspaceHeaderBar. */
export function PlayerWorkspaceHeaderBar({ workspace }: PlayerWorkspaceHeaderBarProps): JSX.Element {
  const [draggingRef, setDraggingRef] = useState<PlayerTabRef | null>(null)
  const [dragOverRef, setDragOverRef] = useState<PlayerTabRef | null>(null)

  if (workspace.tabItems.length === 0 && !workspace.activeCampaign) return <></>

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, overflowX: 'auto', minWidth: 0 }}>
      {workspace.tabItems.map(({ ref, title }) => {
        const active =
          workspace.activeTab?.kind === ref.kind && workspace.activeTab.id === ref.id
        const isDragging = !!draggingRef && sameTab(draggingRef, ref)
        const isDragOver = !!dragOverRef && sameTab(dragOverRef, ref)
        return (
          <div
            key={`${ref.kind}:${ref.id}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              setDraggingRef(ref)
            }}
            onDragEnd={() => {
              setDraggingRef(null)
              setDragOverRef(null)
            }}
            onDragOver={(e) => {
              if (!draggingRef || sameTab(draggingRef, ref)) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setDragOverRef(ref)
            }}
            onDragLeave={() => setDragOverRef((r) => (r && sameTab(r, ref) ? null : r))}
            onDrop={(e) => {
              e.preventDefault()
              if (draggingRef) workspace.moveTab(draggingRef, ref)
              setDraggingRef(null)
              setDragOverRef(null)
            }}
            onClick={() => workspace.setActiveTab(ref)}
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
              opacity: isDragging ? 0.5 : 1,
              background: isDragOver ? 'var(--accent-subtle)' : active ? 'var(--bg-surface-raised)' : 'transparent',
              outline: isDragOver ? '1px dashed var(--accent)' : 'none',
              outlineOffset: -1,
              color: active ? 'var(--text-primary)' : 'var(--text-muted)'
            }}
          >
            {ref.kind === 'character' ? <UserIcon /> : <FileIcon />}
            <span>{title}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                workspace.closeTab(ref)
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
      {workspace.activeCampaign && !workspace.isOffline && (
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
      )}
    </div>
  )
}
