import { useEffect, useState, type ReactNode } from 'react'
import { ResizableSidebar } from '../../ui/ResizableSidebar'
import { PlayersIcon, InitiativeIcon } from '../campaigns/panelIcons'
import { PlayerInitiativeView } from './PlayerInitiativeView'
import type { Note, PresencePlayer } from '@shared/ipc'

interface PartySidebarProps {
  sessionId: string | null
  campaignId: string | null
  myUserId: string | null
  /** Whichever note is currently open — when you authored it, each party member gets a checkbox to grant/revoke edit access; otherwise this is just a "who's here" list. */
  activeNote: Note | null
  onToggleEditor: (noteId: string, userId: string, grant: boolean) => void
  /** Opens a party member's currently-selected character as a read-only sheet — omitted (no button shown) for a player with no character selected, since there'd be nothing to open. */
  onViewCharacter: (userId: string) => void
}

/** Right-side, player-mode-only panel — mirrors the DM's RightPanel/ConnectedPlayersList (including the ability to open a party member's sheet, read-only), but doubles as where a note's author manages who else can edit it, since that's the author's own call to make (not the DM's). */
export function PartySidebar({ sessionId, campaignId, myUserId, activeNote, onToggleEditor, onViewCharacter }: PartySidebarProps): JSX.Element {
  const [players, setPlayers] = useState<PresencePlayer[]>([])
  const [tab, setTab] = useState<'party' | 'initiative'>('party')

  useEffect(() => {
    if (!sessionId || !campaignId) {
      setPlayers([])
      return
    }
    window.goblin.presence.subscribe(sessionId, campaignId)
    return window.goblin.presence.onUpdate((update) => {
      if (update.sessionId === sessionId && update.campaignId === campaignId) {
        setPlayers(update.players.filter((p) => p.userId !== myUserId))
      }
    })
  }, [sessionId, campaignId, myUserId])

  // Private notes never appear in anyone else's list regardless of editorUserIds
  // (see noteRepo.listVisibleTo), so granting access to one would be a no-op —
  // don't offer the control at all.
  const canManage = !!activeNote && activeNote.authorUserId === myUserId && activeNote.visibility !== 'private'

  return (
    <ResizableSidebar defaultWidth={220} handleSide="left">
      <div
        style={{
          height: '100%',
          borderLeft: '1px solid var(--border-subtle)',
          background: 'var(--bg-sunken)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)' }}>
          <PartyTabButton icon={<PlayersIcon />} label="Party" active={tab === 'party'} onClick={() => setTab('party')} />
          <PartyTabButton icon={<InitiativeIcon />} label="Initiative" active={tab === 'initiative'} onClick={() => setTab('initiative')} />
        </div>

        {/* Both stay mounted (hidden via CSS) rather than conditionally rendered — PlayerInitiativeView only
            accumulates its state from live pushes (no fetch-on-mount), so unmounting it on every tab switch
            used to throw away whatever it had seen until the DM's next edit pushed a fresh copy. */}
        <div style={{ display: tab === 'initiative' ? 'block' : 'none', flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <PlayerInitiativeView sessionId={sessionId} />
        </div>
        <div style={{ display: tab === 'initiative' ? 'none' : 'contents' }}>
            {canManage && (
              <p style={{ fontSize: 11, color: 'var(--text-muted)', padding: 'var(--space-2) var(--space-3) 0' }}>
                Grant edit access to "{activeNote!.title || 'Untitled'}"
              </p>
            )}

            {players.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: 'var(--space-3)' }}>No one else is here yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
            {players.map((player) => {
              const hasAccess = !!activeNote && activeNote.editorUserIds.includes(player.userId)
              return (
                <div
                  key={player.userId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6,
                    padding: 'var(--space-2) var(--space-3)',
                    borderBottom: '1px solid var(--border-subtle)'
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {player.characterName ? (
                      <button
                        type="button"
                        onClick={() => onViewCharacter(player.userId)}
                        title="View this character's sheet (read only)"
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          fontSize: 14,
                          fontWeight: 600,
                          color: 'var(--accent)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {player.characterName}
                      </button>
                    ) : (
                      <div style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <em>No character selected</em>
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{player.displayName}</div>
                  </div>
                  {canManage && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={hasAccess}
                        onChange={(e) => onToggleEditor(activeNote!.id, player.userId, e.target.checked)}
                      />
                      Edit
                    </label>
                  )}
                </div>
              )
            })}
              </div>
            )}
        </div>
      </div>
    </ResizableSidebar>
  )
}

function PartyTabButton({
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
      title={label}
      onClick={onClick}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '9px 4px',
        border: 'none',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        background: 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        cursor: 'pointer'
      }}
    >
      {icon}
    </button>
  )
}
