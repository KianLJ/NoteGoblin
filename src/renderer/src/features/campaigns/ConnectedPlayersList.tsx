import { useEffect, useState } from 'react'
import type { CharacterSheet, PresencePlayer } from '@shared/ipc'

interface ConnectedPlayersListProps {
  sessionId: string | null
  campaignId: string
  playerCharacters: Map<string, CharacterSheet>
  onSelectPlayer: (userId: string) => void
}

export function ConnectedPlayersList({
  sessionId,
  campaignId,
  playerCharacters,
  onSelectPlayer
}: ConnectedPlayersListProps): JSX.Element {
  const [players, setPlayers] = useState<PresencePlayer[]>([])

  useEffect(() => {
    if (!sessionId) {
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

  if (!sessionId) {
    return (
      <EmptyState>
        Start hosting to see who's connected — you can still work on this campaign solo either way.
      </EmptyState>
    )
  }

  if (players.length === 0) {
    return <EmptyState>No one's connected yet.</EmptyState>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {players.map((player) => {
        const character = playerCharacters.get(player.userId)
        return (
          <div
            key={player.userId}
            onClick={character ? () => onSelectPlayer(player.userId) : undefined}
            title={character ? `View ${character.name}'s sheet` : undefined}
            style={{
              padding: 'var(--space-2) var(--space-3)',
              borderBottom: '1px solid var(--border-subtle)',
              cursor: character ? 'pointer' : 'default'
            }}
            onMouseEnter={(e) => {
              if (character) e.currentTarget.style.background = 'var(--bg-surface-raised)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
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
        )
      })}
    </div>
  )
}

function EmptyState({ children }: { children: string }): JSX.Element {
  return (
    <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: 'var(--space-3)' }}>{children}</p>
  )
}
