import { useEffect, useState } from 'react'
import type { Note, PresencePlayer } from '@shared/ipc'

interface PartyListProps {
  sessionId: string | null
  campaignId: string | null
  myUserId: string | null
  /** Whichever note is currently open — when you authored it, each party member gets a checkbox to grant/revoke edit access; otherwise this is just a "who's here" list. */
  activeNote: Note | null
  onToggleEditor: (noteId: string, userId: string, grant: boolean) => void
  /** Opens a party member's currently-selected character as a read-only sheet — omitted (no button shown) for a player with no character selected, since there'd be nothing to open. */
  onViewCharacter: (userId: string) => void
}

/** Who's at the table right now (live presence), for a player in a session — empty otherwise. */
export function usePartyPresence(sessionId: string | null, campaignId: string | null): PresencePlayer[] {
  const [players, setPlayers] = useState<PresencePlayer[]>([])
  useEffect(() => {
    if (!sessionId || !campaignId) {
      setPlayers([])
      return
    }
    window.goblin.presence.subscribe(sessionId, campaignId)
    return window.goblin.presence.onUpdate((update) => {
      if (update.sessionId === sessionId && update.campaignId === campaignId) {
        setPlayers(update.players)
      }
    })
  }, [sessionId, campaignId])
  return players
}

/** Player-mode Party tool — who's at the table (mirroring the DM's ConnectedPlayersList, including opening a party member's sheet, read-only), and where a note's author manages who else can edit it, since that's the author's own call to make (not the DM's). */
export function PartyList({ sessionId, campaignId, myUserId, activeNote, onToggleEditor, onViewCharacter }: PartyListProps): JSX.Element {
  const players = usePartyPresence(sessionId, campaignId)

  // Private notes never appear in anyone else's list regardless of editorUserIds
  // (see noteRepo.listVisibleTo), so granting access to one would be a no-op —
  // don't offer the control at all.
  const canManage = !!activeNote && activeNote.authorUserId === myUserId && activeNote.visibility !== 'private'

  return (
    <div style={{ overflowY: 'auto' }}>
                {canManage && (
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', padding: 'var(--space-2) var(--space-3) 0' }}>
                    Grant edit access to "{activeNote!.title || 'Untitled'}"
                  </p>
                )}

                {players.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: 'var(--space-3)' }}>No one's connected yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {players.map((player) => {
                      const isSelf = player.userId === myUserId
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
                              isSelf ? (
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
                                  {player.characterName}
                                </div>
                              ) : (
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
                              )
                            ) : (
                              <div style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                <em>No character selected</em>
                              </div>
                            )}
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {player.displayName}
                              {isSelf && ' (You)'}
                            </div>
                          </div>
                          {canManage && !isSelf && (
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
  )
}
