import { useState } from 'react'
import { CloseIcon, FileIcon, PlusIcon, StatblockIcon } from './icons'
import type { NotesWorkspace } from './useNotesWorkspace'
import type { Campaign } from '@shared/ipc'
import type { BestiaryMonster } from '../../data/bestiary'
import type { DmTabRef } from '../shell/AppShell'

interface WorkspaceHeaderBarProps {
  campaign: Campaign
  workspace: NotesWorkspace
  /** Enemy statblock tabs — a separate open list from notes (see AppShell.tsx), interleaved with note tabs via `tabOrder` below rather than always trailing them. */
  monsterTabs: BestiaryMonster[]
  activeMonsterTab: string | null
  /** null deactivates whichever monster tab is active (clicking a note tab) — a real index activates that one. */
  onSelectMonsterTab: (index: string | null) => void
  onCloseMonsterTab: (index: string) => void
  /** The merged visual order of every open tab, note or monster — see AppShell.tsx's dmTabOrder for why this can't just be "notes then monsters." Drag-and-drop reorders this directly, so any tab can end up anywhere regardless of kind. */
  tabOrder: DmTabRef[]
  onMoveTab: (dragged: DmTabRef, target: DmTabRef) => void
}

function sameRef(a: DmTabRef, b: DmTabRef): boolean {
  return a.kind === b.kind && a.id === b.id
}

/** Renders inline with the mode toggle in AppShell's header — note tabs live in the title bar, Obsidian-style. There's no "back": switching campaigns happens via the corner CampaignSwitcher. */
export function WorkspaceHeaderBar({
  campaign,
  workspace,
  monsterTabs,
  activeMonsterTab,
  onSelectMonsterTab,
  onCloseMonsterTab,
  tabOrder,
  onMoveTab
}: WorkspaceHeaderBarProps): JSX.Element {
  const isDm = campaign.myRole === 'dm'
  const [draggingRef, setDraggingRef] = useState<DmTabRef | null>(null)
  const [dragOverRef, setDragOverRef] = useState<DmTabRef | null>(null)

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
        {tabOrder.map((ref) => {
          const isDragging = !!draggingRef && sameRef(draggingRef, ref)
          const isDragOver = !!dragOverRef && sameRef(dragOverRef, ref)
          const note = ref.kind === 'note' ? workspace.tabNotes.find((n) => n.id === ref.id) : undefined
          const monster = ref.kind === 'monster' ? monsterTabs.find((m) => m.index === ref.id) : undefined
          if (ref.kind === 'note' && !note) return null
          if (ref.kind === 'monster' && !monster) return null
          const active = ref.kind === 'note' ? !activeMonsterTab && ref.id === workspace.activeId : activeMonsterTab === ref.id

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
                if (!draggingRef || sameRef(draggingRef, ref)) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setDragOverRef(ref)
              }}
              onDragLeave={() => setDragOverRef((r) => (r && sameRef(r, ref) ? null : r))}
              onDrop={(e) => {
                e.preventDefault()
                if (draggingRef) onMoveTab(draggingRef, ref)
                setDraggingRef(null)
                setDragOverRef(null)
              }}
              onClick={() => {
                if (ref.kind === 'note') {
                  onSelectMonsterTab(null)
                  workspace.setActiveId(ref.id)
                } else {
                  onSelectMonsterTab(ref.id)
                }
              }}
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
              {ref.kind === 'note' ? <FileIcon /> : <StatblockIcon />}
              <span>{ref.kind === 'note' ? note!.title || 'Untitled' : monster!.name}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (ref.kind === 'note') workspace.closeTab(ref.id)
                  else onCloseMonsterTab(ref.id)
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
