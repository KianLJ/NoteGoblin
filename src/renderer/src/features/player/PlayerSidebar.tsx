import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ResizableSidebar } from '../../ui/ResizableSidebar'
import { ConfirmButton } from '../../ui/ConfirmButton'
import { BackArrowIcon, LockIcon, PlusIcon } from '../campaigns/icons'
import { NoteTreeSection, type ClipboardItem, type ClipboardState } from '../campaigns/NoteTreeSection'
import { getStoredFontScale } from '../../theme'
import type { Campaign, CampaignSnapshot, Folder, Note } from '@shared/ipc'
import type { PlayerTabRef } from './usePlayerWorkspace'

/** Rough "how long ago" for the offline snapshot's "as of" label — doesn't need to be precise, just orient the reader. */
function formatSyncedAt(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(ms / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

interface PlayerSidebarProps {
  activeCampaign: Campaign | null
  notes: Note[] | null
  folders: Folder[] | null
  activeTab: PlayerTabRef | null
  myUserId: string | null
  onSelectNote: (id: string) => void
  onOpenNoteInNewTab: (id: string) => void
  onCreateNote: (visibility: 'shared' | 'private', folderId: string | null) => void
  onCreateFolder: (
    visibility: 'shared' | 'private',
    name: string,
    parentFolderId: string | null
  ) => Promise<string | undefined>
  onRenameNote: (noteId: string, title: string) => void
  onDeleteNote: (noteId: string) => void
  onTogglePinNote: (noteId: string, pinned: boolean) => void
  onRenameFolder: (folderId: string, name: string) => void
  onDeleteFolder: (folderId: string) => void
  onMoveNote: (noteId: string, folderId: string | null, visibility: 'dm' | 'shared' | 'private') => void
  onMoveFolder: (folderId: string, parentFolderId: string | null, visibility: 'dm' | 'shared' | 'private') => void
  onPasteNote: (sourceNoteId: string, targetFolderId: string | null, targetVisibility: 'dm' | 'shared' | 'private') => void
  onPasteFolder: (sourceFolderId: string, targetParentId: string | null, targetVisibility: 'dm' | 'shared' | 'private') => void
  /** Whether you're connected to a session at all — connection status/resync itself now lives in the Friends menu, this just decides which empty-state hint to show. */
  connectedLabel: string | null
  /** True while browsing a cached snapshot instead of a live campaign — shows an "Offline" badge and hides create/edit affordances (the workspace itself already rejects writes; this just keeps the UI honest about it). */
  isOffline: boolean
  /** The snapshot's timestamp, for the "as of" label — null unless isOffline. */
  offlineSyncedAt: string | null
  /** Every campaign previously cached while connected — offered as a fallback when there's no live campaign to show. */
  offlineSnapshots: CampaignSnapshot[] | null
  onOpenOfflineCampaign: (campaignId: string) => void
  /** Leaves the offline snapshot currently being viewed, back to the "pick a cached campaign" list — only relevant while isOffline. */
  onCloseOfflineCampaign: () => void
  /** Forgets one cached campaign entirely — just the local read-only copy, not anything on the DM's actual host. */
  onDeleteOfflineCampaign: (campaignId: string) => void
  /** The character switcher + account settings — rendered here so they're visually part of the sidebar, not a floating overlay. */
  footer: ReactNode
}

const MIN_PANE_HEIGHT = 60

export function PlayerSidebar({
  activeCampaign,
  notes,
  folders,
  activeTab,
  myUserId,
  onSelectNote,
  onOpenNoteInNewTab,
  onCreateNote,
  onCreateFolder,
  onRenameNote,
  onTogglePinNote,
  onDeleteNote,
  onRenameFolder,
  onDeleteFolder,
  onMoveNote,
  onMoveFolder,
  onPasteNote,
  onPasteFolder,
  connectedLabel,
  isOffline,
  offlineSyncedAt,
  offlineSnapshots,
  onOpenOfflineCampaign,
  onCloseOfflineCampaign,
  onDeleteOfflineCampaign,
  footer
}: PlayerSidebarProps): JSX.Element {
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null)
  const [partyHeight, setPartyHeight] = useState(240)
  const [dragging, setDragging] = useState(false)
  const splitRef = useRef<HTMLDivElement>(null)

  // Same window-level-listener pattern as NoteSidebar's split — pointer
  // capture on a thin handle is unreliable during a fast drag.
  useEffect(() => {
    if (!dragging) return
    function handleMove(e: PointerEvent): void {
      if (!splitRef.current) return
      const rect = splitRef.current.getBoundingClientRect()
      // rect/clientY are always real screen pixels — clamp in that space,
      // then convert to the local, pre-scale unit `partyHeight` is rendered
      // in (see App.tsx's transform: scale() wrapper), or the pane would
      // resize scale× faster than the actual drag.
      const raw = e.clientY - rect.top
      const clamped = Math.min(rect.height - MIN_PANE_HEIGHT, Math.max(MIN_PANE_HEIGHT, raw))
      setPartyHeight(clamped / getStoredFontScale())
    }
    function handleUp(): void {
      setDragging(false)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [dragging])

  useEffect(() => {
    const el = splitRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      // getBoundingClientRect is real screen pixels; partyHeight (prev) is in
      // the local, pre-scale unit it's rendered in — convert before comparing.
      const height = el.getBoundingClientRect().height / getStoredFontScale()
      setPartyHeight((prev) => Math.min(prev, Math.max(MIN_PANE_HEIGHT, height - MIN_PANE_HEIGHT)))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const myNotes = notes ?? []
  const myFolders = folders ?? []

  return (
    <ResizableSidebar
      defaultWidth={220}
      collapseStorageKey="gb-sidebar-collapsed:notes"
      widthStorageKey="gb-sidebar-width:notes"
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
        ref={splitRef}
        style={{
          height: '100%',
          borderRight: '1px solid var(--border-subtle)',
          background: 'var(--bg-sunken)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden'
        }}
      >
        {activeCampaign ? (
          <>
            {isOffline && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px var(--space-3)',
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  background: 'var(--bg-surface-raised)',
                  borderBottom: '1px solid var(--border-subtle)',
                  flexShrink: 0
                }}
              >
                <button
                  type="button"
                  onClick={onCloseOfflineCampaign}
                  title="Back to other cached campaigns"
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'inherit',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <BackArrowIcon />
                </button>
                <span
                  title="Read-only — the DM isn't currently hosting. Connect to make changes."
                  style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}
                >
                  Offline{offlineSyncedAt ? ` · synced ${formatSyncedAt(offlineSyncedAt)}` : ''}
                </span>
              </div>
            )}
            <div style={{ height: partyHeight, minHeight: 0, overflowY: 'auto', flexShrink: 0 }}>
              <NoteTreeSection
                key={`${activeCampaign.id}:party`}
                title="Party Notes"
                storageKey={`${activeCampaign.id}:party`}
                visibility="shared"
                fill
                notes={myNotes.filter((n) => n.visibility === 'shared' && !n.sceneDeckId)}
                folders={myFolders.filter((f) => f.visibility === 'shared')}
                activeId={activeTab?.kind === 'note' ? activeTab.id : null}
                myUserId={myUserId}
                onSelectNote={onSelectNote}
                onOpenNoteInNewTab={onOpenNoteInNewTab}
                onCreateNote={(folderId) => onCreateNote('shared', folderId)}
                onCreateFolder={(name, parentFolderId) => onCreateFolder('shared', name, parentFolderId)}
                onRenameNote={onRenameNote}
                onTogglePinNote={onTogglePinNote}
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

            <div
              onPointerDown={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              title="Drag to resize"
              style={{ height: 6, flexShrink: 0, cursor: 'row-resize', position: 'relative' }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 2,
                  left: 0,
                  right: 0,
                  height: 1,
                  background: 'var(--border-subtle)'
                }}
              />
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <NoteTreeSection
                key={`${activeCampaign.id}:private`}
                title="Private Notes"
                headerIcon={<LockIcon />}
                storageKey={`${activeCampaign.id}:private`}
                visibility="private"
                fill
                notes={myNotes.filter((n) => n.visibility === 'private' && !n.sceneDeckId)}
                folders={myFolders.filter((f) => f.visibility === 'private')}
                activeId={activeTab?.kind === 'note' ? activeTab.id : null}
                myUserId={myUserId}
                onSelectNote={onSelectNote}
                onOpenNoteInNewTab={onOpenNoteInNewTab}
                onCreateNote={(folderId) => onCreateNote('private', folderId)}
                onCreateFolder={(name, parentFolderId) => onCreateFolder('private', name, parentFolderId)}
                onRenameNote={onRenameNote}
                onTogglePinNote={onTogglePinNote}
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
          </>
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-2) 0' }}>
            <Section title="Campaign Notes">
              <EmptyHint>
                {connectedLabel ? "Waiting for the DM's campaign" : 'Join a friend’s game from the Friends menu'}
              </EmptyHint>
            </Section>
            {offlineSnapshots && offlineSnapshots.length > 0 && (
              <Section title="Offline">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 var(--space-2)' }}>
                  {offlineSnapshots.map((snap) => (
                    <div
                      key={snap.campaign.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        borderRadius: 'var(--radius-sm)'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-surface-raised)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <button
                        type="button"
                        title={`Last synced ${formatSyncedAt(snap.syncedAt)}`}
                        onClick={() => onOpenOfflineCampaign(snap.campaign.id)}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 6,
                          padding: '6px 8px',
                          border: 'none',
                          borderRadius: 'var(--radius-sm)',
                          background: 'transparent',
                          textAlign: 'left',
                          cursor: 'pointer',
                          color: 'var(--text-primary)',
                          fontSize: 13
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {snap.campaign.name}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                          {formatSyncedAt(snap.syncedAt)}
                        </span>
                      </button>
                      <ConfirmButton
                        label="✕"
                        confirmLabel="Sure?"
                        variant="ghost"
                        danger
                        title="Remove this campaign's offline data from this device — the DM's own copy is untouched"
                        style={{ fontSize: 11, padding: '2px 6px', flexShrink: 0 }}
                        onConfirm={() => onDeleteOfflineCampaign(snap.campaign.id)}
                      />
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}
      </div>
    </ResizableSidebar>
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
