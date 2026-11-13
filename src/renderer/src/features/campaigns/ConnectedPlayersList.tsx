import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { CharacterSheet, ForceRollRequest, PresencePlayer } from '@shared/ipc'
import { ContextMenu, type ContextMenuState } from '../../ui/ContextMenu'
import { ForceRollDialog } from './ForceRollDialog'
import { useLastTruthy } from '../../ui/useLastTruthy'
import { DiceIcon } from '../player/characterSheetTabs/icons'
import { playSfx } from '../audio/soundEffects'
import { Modal } from '../../ui/Modal'
import { Button } from '../../ui/Button'
import { XIcon } from '../../ui/icons'

function SheetIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="1.5" width="10" height="13" rx="1.2" />
      <path d="M5.5 5h5M5.5 8h5M5.5 11h3" />
    </svg>
  )
}

function CopyIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="5" width="8.5" height="9" rx="1.2" />
      <path d="M3 10.5V3a1 1 0 0 1 1-1h6.5" />
    </svg>
  )
}

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
  const [kickTarget, setKickTarget] = useState<PresencePlayer | null>(null)
  const lastKickTarget = useLastTruthy(kickTarget)
  const lastForceRollTarget = useLastTruthy(forceRollTarget)
  const [myName, setMyName] = useState('The DM')
  const [disconnectToast, setDisconnectToast] = useState<string | null>(null)
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    window.goblin.identity.getCurrent().then((identity) => {
      if (identity) setMyName(identity.displayName)
    })
  }, [])

  function openMenu(e: MouseEvent, player: PresencePlayer): void {
    e.preventDefault()
    const character = playerCharacters.get(player.userId)
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        ...(character ? [{ label: `Open ${character.name}’s sheet`, icon: <SheetIcon />, onSelect: () => onSelectPlayer(player.userId) }] : []),
        { label: 'Force a roll…', icon: <DiceIcon size={13} />, onSelect: () => setForceRollTarget(player) },
        { label: `Copy ${player.displayName}’s name`, icon: <CopyIcon />, onSelect: () => void navigator.clipboard.writeText(player.displayName) },
        { label: 'Remove from the table…', icon: <XIcon size={12} />, danger: true, separatorBefore: true, onSelect: () => setKickTarget(player) }
      ]
    })
  }

  async function kick(player: PresencePlayer): Promise<void> {
    setKickTarget(null)
    const result = await window.goblin.sessions.kick(player.userId)
    setDisconnectToast(result.ok ? `${player.displayName} was removed from the table.` : result.error)
    clearTimeout(disconnectTimerRef.current)
    disconnectTimerRef.current = setTimeout(() => setDisconnectToast(null), 4000)
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
    // Skips the join sound/toast on the very first update after subscribing
    // (everyone already at the table when the DM opens this panel) — only
    // an actual arrival after that counts as "joined."
    let receivedFirstUpdate = false
    window.goblin.presence.subscribe(sessionId, campaignId)
    return window.goblin.presence.onUpdate((update) => {
      if (update.sessionId === sessionId && update.campaignId === campaignId) {
        // Every update is the full current roster, not a join/leave event —
        // diffing against what we had a moment ago is the only way to tell
        // someone just joined or dropped, rather than the DM having to
        // notice a name quietly appearing/missing from the list.
        setPlayers((prev) => {
          const wasHere = new Set(prev.map((p) => p.userId))
          const stillHere = new Set(update.players.map((p) => p.userId))
          const left = prev.find((p) => !stillHere.has(p.userId))
          const joined = receivedFirstUpdate ? update.players.find((p) => !wasHere.has(p.userId)) : undefined
          receivedFirstUpdate = true
          if (left) {
            playSfx('playerDisconnected')
            setDisconnectToast(`${left.displayName} disconnected.`)
            clearTimeout(disconnectTimerRef.current)
            disconnectTimerRef.current = setTimeout(() => setDisconnectToast(null), 5000)
          }
          if (joined) playSfx('playerJoined')
          return update.players
        })
      }
    })
  }, [sessionId, campaignId])

  const toast = disconnectToast && (
    <p key={disconnectToast} className="gb-toast-fade" style={{ fontSize: 12, color: 'var(--text-muted)', padding: 'var(--space-2) var(--space-3) 0' }}>
      {disconnectToast}
    </p>
  )

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
    return (
      <>
        {toast}
        <EmptyState>No one's connected yet.</EmptyState>
      </>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {toast}
      {players.map((player) => {
        const character = playerCharacters.get(player.userId)
        return (
          <div
            key={player.userId}
            onClick={character ? () => onSelectPlayer(player.userId) : undefined}
            onContextMenu={(e) => openMenu(e, player)}
            title={character ? `View ${character.name}'s sheet — right-click for more` : 'Right-click for more'}
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
      <Modal open={kickTarget !== null} onClose={() => setKickTarget(null)} width={360}>
        <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: '0 0 var(--space-4)' }}>
          Remove {lastKickTarget?.displayName} from the table? They’re disconnected now, and need inviting again to come back. Their notes and character stay.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <Button variant="secondary" onClick={() => setKickTarget(null)}>
            Cancel
          </Button>
          <Button variant="primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => kickTarget && void kick(kickTarget)}>
            Remove
          </Button>
        </div>
      </Modal>
      {lastForceRollTarget && (
        <ForceRollDialog
          key={lastForceRollTarget.userId}
          open={forceRollTarget !== null}
          playerName={lastForceRollTarget.displayName}
          fromDisplayName={myName}
          onClose={() => setForceRollTarget(null)}
          onSend={(request) => forceRollTarget && sendForceRoll(forceRollTarget, request)}
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
