import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '../../ui/Button'
import { ResizableSidebar } from '../../ui/ResizableSidebar'
import { PlusIcon } from '../campaigns/icons'
import { NoteTreeSection, type ClipboardItem, type ClipboardState } from '../campaigns/NoteTreeSection'
import type { Campaign, Folder, Note } from '@shared/ipc'
import type { PlayerTabRef } from './usePlayerWorkspace'

interface PlayerSidebarProps {
  activeCampaign: Campaign | null
  notes: Note[] | null
  folders: Folder[] | null
  activeTab: PlayerTabRef | null
  myUserId: string | null
  onSelectNote: (id: string) => void
  onCreateNote: (folderId: string | null) => void
  onCreateFolder: (name: string, parentFolderId: string | null) => Promise<string | undefined>
  onRenameNote: (noteId: string, title: string) => void
  onDeleteNote: (noteId: string) => void
  onRenameFolder: (folderId: string, name: string) => void
  onDeleteFolder: (folderId: string) => void
  onMoveNote: (noteId: string, folderId: string | null, visibility: 'dm' | 'shared') => void
  onMoveFolder: (folderId: string, parentFolderId: string | null, visibility: 'dm' | 'shared') => void
  onPasteNote: (sourceNoteId: string, targetFolderId: string | null, targetVisibility: 'dm' | 'shared') => void
  onPasteFolder: (sourceFolderId: string, targetParentId: string | null, targetVisibility: 'dm' | 'shared') => void
  /** Re-fetches the DM's active campaign — the closest thing to "catch up" if they switched tables after you connected, since there's no live push for that yet. */
  onResync: () => void
  connectedLabel: string | null
  /** The character switcher + account settings — rendered here so they're visually part of the sidebar, not a floating overlay. */
  footer: ReactNode
}

export function PlayerSidebar({
  activeCampaign,
  notes,
  folders,
  activeTab,
  myUserId,
  onSelectNote,
  onCreateNote,
  onCreateFolder,
  onRenameNote,
  onDeleteNote,
  onRenameFolder,
  onDeleteFolder,
  onMoveNote,
  onMoveFolder,
  onPasteNote,
  onPasteFolder,
  onResync,
  connectedLabel,
  footer
}: PlayerSidebarProps): JSX.Element {
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null)

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
            flexShrink: 0,
            minWidth: 0
          }}
        >
          {footer}
        </div>
      }
    >
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid var(--border-subtle)',
          background: 'var(--bg-sunken)'
        }}
      >
        <TableBar activeCampaign={activeCampaign} onResync={onResync} connectedLabel={connectedLabel} />

        {activeCampaign ? (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <NoteTreeSection
              title="Campaign Notes"
              storageKey={`${activeCampaign.id}:player`}
              visibility="shared"
              fill
              notes={notes ?? []}
              folders={folders ?? []}
              activeId={activeTab?.kind === 'note' ? activeTab.id : null}
              myUserId={myUserId}
              onSelectNote={onSelectNote}
              onCreateNote={onCreateNote}
              onCreateFolder={onCreateFolder}
              onRenameNote={onRenameNote}
              onDeleteNote={onDeleteNote}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              onMoveNote={onMoveNote}
              onMoveFolder={onMoveFolder}
              onPasteNote={onPasteNote}
              onPasteFolder={onPasteFolder}
              clipboard={clipboard}
              onSetClipboard={(items: ClipboardItem[], mode) => setClipboard({ items, mode })}
              onClearClipboard={() => setClipboard(null)}
            />
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-2) 0' }}>
            <Section title="Campaign Notes">
              <EmptyHint>
                {connectedLabel ? 'Pick a campaign above' : 'Join a friend’s game from the Friends menu'}
              </EmptyHint>
            </Section>
          </div>
        )}
      </div>
    </ResizableSidebar>
  )
}

/** Connection context — deliberately separate from the note/character "file" sections below, since it's not a file, it's the table you're sitting at. Which campaign you're in is entirely the DM's call (see the active-campaign auto-join in usePlayerWorkspace) — this just shows where you landed, with a manual re-sync in case the DM switches tables after you've connected. */
function TableBar({
  activeCampaign,
  onResync,
  connectedLabel
}: {
  activeCampaign: Campaign | null
  onResync: () => void
  connectedLabel: string | null
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', borderBottom: '1px solid var(--border-subtle)', padding: 'var(--space-2)' }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          width: '100%',
          background: 'var(--bg-surface-raised)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: '6px 8px',
          cursor: 'pointer',
          textAlign: 'left'
        }}
      >
        <span
          style={{
            fontSize: 12,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: connectedLabel ? 'var(--text-primary)' : 'var(--text-muted)'
          }}
        >
          {activeCampaign ? activeCampaign.name : connectedLabel ? connectedLabel : 'Not connected'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>▾</span>
      </button>

      {open && (
        <div
          className="gb-card"
          style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 'var(--space-2)', width: 300, zIndex: 20 }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            {connectedLabel ? `Connected: ${connectedLabel}` : 'Not connected'}
          </div>

          {connectedLabel && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 6,
                marginBottom: 'var(--space-3)'
              }}
            >
              <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeCampaign ? (
                  <>
                    Playing <strong>{activeCampaign.name}</strong>
                  </>
                ) : (
                  "The DM hasn't started a session yet"
                )}
              </span>
              <Button
                variant="secondary"
                onClick={onResync}
                title="Catch up if the DM switched campaigns"
                style={{ fontSize: 11, padding: '2px 8px', flexShrink: 0 }}
              >
                Sync
              </Button>
            </div>
          )}

          {!connectedLabel && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              Join a friend's game from the Friends menu in the top-right corner.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  onCreate,
  children
}: {
  title: string
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
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-muted)'
          }}
        >
          {title}
        </span>
        {onCreate && (
          <button
            type="button"
            onClick={onCreate}
            title="New"
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

function EmptyHint({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div style={{ padding: '4px var(--space-3)', fontSize: 12, color: 'var(--text-muted)' }}>
      {children}
    </div>
  )
}
