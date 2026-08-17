import { useEffect, useState } from 'react'
import { ResizableSidebar } from '../../ui/ResizableSidebar'
import type { Note, PresencePlayer } from '@shared/ipc'

interface PartySidebarProps {
  sessionId: string | null
  campaignId: string | null
  myUserId: string | null
  /** Whichever note is currently open — when you authored it, each party member gets a checkbox to grant/revoke edit access; otherwise this is just a "who's here" list. */
  activeNote: Note | null
  onToggleEditor: (noteId: string, userId: string, grant: boolean) => void
}

/** Right-side, player-mode-only panel — mirrors the DM's RightPanel/ConnectedPlayersList, but doubles as where a note's author manages who else can edit it, since that's the author's own call to make (not the DM's). */
export function PartySidebar({ sessionId, campaignId, myUserId, activeNote, onToggleEditor }: PartySidebarProps): JSX.Element {
  const [players, setPlayers] = useState<PresencePlayer[]>([])

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
        <div
          style={{
            padding: 'var(--space-3)',
            borderBottom: '1px solid var(--border-subtle)',
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-muted)'
          }}
        >
          Party
        </div>

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
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {player.characterName ?? <em style={{ fontWeight: 400, color: 'var(--text-muted)' }}>No character selected</em>}
                    </div>
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
    </ResizableSidebar>
  )
}
