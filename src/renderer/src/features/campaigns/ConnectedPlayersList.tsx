import { useEffect, useState, type MouseEvent } from 'react'
import type { CharacterSheet, ForceRollRequest, PresencePlayer } from '@shared/ipc'
import { ContextMenu, type ContextMenuState } from '../../ui/ContextMenu'
import { ForceRollDialog } from './ForceRollDialog'
import { DiceIcon } from '../player/characterSheetTabs/icons'

interface ConnectedPlayersListProps {
  sessionId: string | null
  /** null before the DM has any campaign open — there's no membership to show presence for yet. */
  campaignId: string | null
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
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [forceRollTarget, setForceRollTarget] = useState<PresencePlayer | null>(null)
  const [myName, setMyName] = useState('The DM')

  useEffect(() => {
    window.goblin.identity.getCurrent().then((identity) => {
      if (identity) setMyName(identity.displayName)
    })
  }, [])

  function openMenu(e: MouseEvent, player: PresencePlayer): void {
    e.preventDefault()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [{ label: 'Force a roll…', icon: <DiceIcon size={13} />, onSelect: () => setForceRollTarget(player) }]
    })
  }

  function sendForceRoll(player: PresencePlayer, request: ForceRollRequest): void {
    if (!sessionId) return
    void window.goblin.dice.forceRoll(sessionId, player.userId, request)
  }

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

  if (!campaignId) {
    return <EmptyState>Open or create a campaign to see connected players.</EmptyState>
  }

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
            onContextMenu={(e) => openMenu(e, player)}
            title={character ? `View ${character.name}'s sheet — right-click to force a roll` : 'Right-click to force a roll'}
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

      <ContextMenu state={menu} onClose={() => setMenu(null)} />
      {forceRollTarget && (
        <ForceRollDialog
          playerName={forceRollTarget.displayName}
          fromDisplayName={myName}
          onClose={() => setForceRollTarget(null)}
          onSend={(request) => sendForceRoll(forceRollTarget, request)}
        />
      )}
    </div>
  )
}

function EmptyState({ children }: { children: string }): JSX.Element {
  return (
    <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: 'var(--space-3)' }}>{children}</p>
  )
}
