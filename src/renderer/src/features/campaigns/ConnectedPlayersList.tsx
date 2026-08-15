import { useEffect, useState } from 'react'
import type { PresencePlayer } from '@shared/ipc'

interface ConnectedPlayersListProps {
  address: string | null
  campaignId: string
}

export function ConnectedPlayersList({ address, campaignId }: ConnectedPlayersListProps): JSX.Element {
  const [players, setPlayers] = useState<PresencePlayer[]>([])

  useEffect(() => {
    if (!address) {
      setPlayers([])
      return
    }
    window.goblin.presence.subscribe(address, campaignId)
    return window.goblin.presence.onUpdate((update) => {
      if (update.address === address && update.campaignId === campaignId) {
        setPlayers(update.players)
      }
    })
  }, [address, campaignId])

  if (!address) {
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
      {players.map((player) => (
        <div
          key={player.userId}
          style={{
            padding: 'var(--space-2) var(--space-3)',
            borderBottom: '1px solid var(--border-subtle)'
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
      ))}
    </div>
  )
}

function EmptyState({ children }: { children: string }): JSX.Element {
  return (
    <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: 'var(--space-3)' }}>{children}</p>
  )
}
