import { useState, type ReactNode } from 'react'
import { ConnectedPlayersList } from './ConnectedPlayersList'
import { ResizableSidebar } from '../../ui/ResizableSidebar'
import { PlayersIcon, DiceIcon, InitiativeIcon } from './panelIcons'
import type { CharacterSheet } from '@shared/ipc'

// Extend this union as new tools land — dice roller, initiative tracker, etc.
// The tab strip below already renders disabled placeholders for what's next.
type RightPanelTab = 'players'

interface RightPanelProps {
  /** The hosted session id — null while not hosting, since there's no one to show presence for. */
  sessionId: string | null
  campaignId: string
  playerCharacters: Map<string, CharacterSheet>
  onSelectPlayer: (character: CharacterSheet) => void
}

/** DM-only bar on the right of the workspace — starts with live connected players, designed to grow more tabs (dice roller, initiative tracker) without restructuring. */
export function RightPanel({ sessionId, campaignId, playerCharacters, onSelectPlayer }: RightPanelProps): JSX.Element {
  const [tab, setTab] = useState<RightPanelTab>('players')

  return (
    <ResizableSidebar defaultWidth={240} handleSide="left">
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
          <TabButton icon={<PlayersIcon />} label="Players" active={tab === 'players'} onClick={() => setTab('players')} />
          <TabButton icon={<DiceIcon />} label="Dice" disabled title="Coming soon" />
          <TabButton icon={<InitiativeIcon />} label="Initiative" disabled title="Coming soon" />
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {tab === 'players' && (
            <ConnectedPlayersList
              sessionId={sessionId}
              campaignId={campaignId}
              playerCharacters={playerCharacters}
              onSelectPlayer={onSelectPlayer}
            />
          )}
        </div>
      </div>
    </ResizableSidebar>
  )
}

function TabButton({
  icon,
  label,
  active,
  disabled,
  title,
  onClick
}: {
  icon: ReactNode
  label: string
  active?: boolean
  disabled?: boolean
  title?: string
  onClick?: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title ?? label}
      onClick={onClick}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '9px 4px',
        border: 'none',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        background: 'transparent',
        color: disabled ? 'var(--text-muted)' : active ? 'var(--text-primary)' : 'var(--text-secondary)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1
      }}
    >
      {icon}
    </button>
  )
}
