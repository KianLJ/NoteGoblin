import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '../../ui/Button'
import { ResizableSidebar } from '../../ui/ResizableSidebar'
import { PlusIcon } from '../campaigns/icons'
import { NoteTreeSection, type ClipboardItem, type ClipboardState } from '../campaigns/NoteTreeSection'
import { UserIcon } from './icons'
import { JoinCampaignPanel } from '../connect/JoinCampaignPanel'
import type { Campaign, CharacterSheet, Folder, Note } from '@shared/ipc'
import type { PlayerTabRef } from './usePlayerWorkspace'

interface PlayerSidebarProps {
  characters: CharacterSheet[]
  campaigns: Campaign[] | null
  activeCampaign: Campaign | null
  notes: Note[] | null
  folders: Folder[] | null
  activeTab: PlayerTabRef | null
  myDisplayName: string
  onSelectCharacter: (id: string) => void
  onSelectNote: (id: string) => void
  onCreateCharacter: () => void
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
  onJoinCampaign: (campaignId: string) => void
  onSelectCampaign: (campaign: Campaign) => void
  connectedLabel: string | null
  onConnected: (address: string, label: string) => void
  /** The character switcher + account settings — rendered here so they're visually part of the sidebar, not a floating overlay. */
  footer: ReactNode
}

export function PlayerSidebar({
  characters,
  campaigns,
  activeCampaign,
  notes,
  folders,
  activeTab,
  myDisplayName,
  onSelectCharacter,
  onSelectNote,
  onCreateCharacter,
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
  onJoinCampaign,
  onSelectCampaign,
  connectedLabel,
  onConnected,
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
        <TableBar
          campaigns={campaigns}
          activeCampaign={activeCampaign}
          onJoinCampaign={onJoinCampaign}
          onSelectCampaign={onSelectCampaign}
          connectedLabel={connectedLabel}
          onConnected={onConnected}
        />

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div style={{ flexShrink: 0, overflowY: 'auto', padding: 'var(--space-2) 0' }}>
            <Section title="My Characters" onCreate={onCreateCharacter}>
              {characters.map((character) => {
                const active = activeTab?.kind === 'character' && activeTab.id === character.id
                return (
                  <Row
                    key={character.id}
                    icon={<UserIcon />}
                    label={character.name || 'Untitled'}
                    active={active}
                    onClick={() => onSelectCharacter(character.id)}
                  />
                )
              })}
              {characters.length === 0 && <EmptyHint>No characters yet</EmptyHint>}
            </Section>
          </div>

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
                myDisplayName={myDisplayName}
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
            <div style={{ overflowY: 'auto', padding: 'var(--space-2) 0' }}>
              <Section title="Campaign Notes">
                <EmptyHint>{connectedLabel ? 'Pick a campaign above' : 'Connect to a table above'}</EmptyHint>
              </Section>
            </div>
          )}
        </div>
      </div>
    </ResizableSidebar>
  )
}

/** Connection/campaign context — deliberately separate from the note/character "file" sections below, since it's not a file, it's the table you're sitting at. */
function TableBar({
  campaigns,
  activeCampaign,
  onJoinCampaign,
  onSelectCampaign,
  connectedLabel,
  onConnected
}: {
  campaigns: Campaign[] | null
  activeCampaign: Campaign | null
  onJoinCampaign: (campaignId: string) => void
  onSelectCampaign: (campaign: Campaign) => void
  connectedLabel: string | null
  onConnected: (address: string, label: string) => void
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
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
            {connectedLabel ? `Connected: ${connectedLabel}` : 'Not connected'}
          </div>

          {connectedLabel && campaigns && campaigns.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 'var(--space-3)' }}>
              {campaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (campaign.myRole) {
                        onSelectCampaign(campaign)
                        setOpen(false)
                      }
                    }}
                    style={{
                      flex: 1,
                      textAlign: 'left',
                      background: activeCampaign?.id === campaign.id ? 'var(--accent-subtle)' : 'transparent',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      padding: '4px 6px',
                      cursor: campaign.myRole ? 'pointer' : 'default',
                      fontSize: 13,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {campaign.name}
                  </button>
                  {!campaign.myRole && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        onJoinCampaign(campaign.id)
                        setOpen(false)
                      }}
                      style={{ fontSize: 11, padding: '2px 8px', flexShrink: 0 }}
                    >
                      Join
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          <JoinCampaignPanel
            onConnected={(address, label) => {
              onConnected(address, label)
              setOpen(false)
            }}
          />
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

function Row({
  icon,
  label,
  active,
  onClick
}: {
  icon: ReactNode
  label: string
  active: boolean
  onClick: () => void
}): JSX.Element {
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
      {icon}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  )
}

function EmptyHint({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div style={{ padding: '4px var(--space-3)', fontSize: 12, color: 'var(--text-muted)' }}>
      {children}
    </div>
  )
}
