import { CloseIcon, FileIcon } from '../campaigns/icons'
import { UserIcon } from './icons'
import type { PlayerWorkspace } from './usePlayerWorkspace'

interface PlayerWorkspaceHeaderBarProps {
  workspace: PlayerWorkspace
}

/** Renders inline with the mode toggle in AppShell's header — mixes character and note tabs in one strip, same as the DM's WorkspaceHeaderBar. */
export function PlayerWorkspaceHeaderBar({ workspace }: PlayerWorkspaceHeaderBarProps): JSX.Element {
  if (workspace.tabItems.length === 0) return <></>

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, overflowX: 'auto', minWidth: 0 }}>
      {workspace.tabItems.map(({ ref, title }) => {
        const active =
          workspace.activeTab?.kind === ref.kind && workspace.activeTab.id === ref.id
        return (
          <div
            key={`${ref.kind}:${ref.id}`}
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
              background: active ? 'var(--bg-surface-raised)' : 'transparent',
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
    </div>
  )
}
