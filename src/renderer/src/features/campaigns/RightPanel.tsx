import { useState, type ReactNode } from 'react'
import { ConnectedPlayersList } from './ConnectedPlayersList'
import { InitiativeTracker } from './InitiativeTracker'
import { CalendarPanel } from './CalendarPanel'
import { ResizableSidebar } from '../../ui/ResizableSidebar'
import { PlayersIcon, DiceIcon, InitiativeIcon, CalendarIcon, SessionIcon } from './panelIcons'
import { DiceTray } from '../dice/DiceTray'
import { useDiceRollToast } from '../dice/useDiceRollToast'
import { DiceRollToast } from '../dice/DiceRollToast'
import { loadRightPanelTab, saveRightPanelTab } from './rightPanelTab'
import type { CharacterSheet, Note } from '@shared/ipc'
import type { BestiaryMonster } from '../../data/bestiary'

interface RightPanelProps {
  /** The hosted session id — null while not hosting, since there's no one to show presence for. */
  sessionId: string | null
  /** null before the DM has any campaign open — the panel still renders (Dice/Initiative work standalone; Players just shows an empty state until one exists). */
  campaignId: string | null
  playerCharacters: Map<string, CharacterSheet>
  onSelectPlayer: (userId: string) => void
  onSelectMonster: (monster: BestiaryMonster) => void
  /** For CalendarPanel's event editor — lets an event pair with an existing note. */
  notes: Note[]
}

/** DM-only bar on the right of the workspace — always visible regardless of whether a campaign is open or hosting is active, so Dice/Initiative are there from the moment the app opens, not just once something's connected. Messages moved up into the header's Messages button (see AppShell.tsx/MessagesButton.tsx) rather than living here, so this is just the tab strip now. */
export function RightPanel({ sessionId, campaignId, playerCharacters, onSelectPlayer, onSelectMonster, notes }: RightPanelProps): JSX.Element {
  const [tab, setTabState] = useState(loadRightPanelTab)
  function setTab(next: typeof tab): void {
    setTabState(next)
    saveRightPanelTab(next)
  }
  const diceToast = useDiceRollToast(tab === 'dice')

  return (
    <ResizableSidebar
      defaultWidth={240}
      handleSide="left"
      collapseStorageKey="gb-sidebar-collapsed:right-panel"
      widthStorageKey="gb-sidebar-width:right-panel"
    >
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
          <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
            <TabButton icon={<DiceIcon />} label="Dice" active={tab === 'dice'} onClick={() => setTab('dice')} />
            {diceToast && <DiceRollToast key={diceToast.id} entry={diceToast} />}
          </div>
          <TabButton icon={<InitiativeIcon />} label="Initiative" active={tab === 'initiative'} onClick={() => setTab('initiative')} />
          <TabButton icon={<CalendarIcon />} label="Calendar" active={tab === 'calendar'} onClick={() => setTab('calendar')} />
          <TabButton icon={<SessionIcon />} label="Session" disabled title="Coming soon" />
        </div>

        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {/* All three stay mounted (hidden via CSS) rather than conditionally rendered — the initiative tracker
              in particular owns its own live combat state locally, which used to reset to empty every time you
              switched away from this tab and back, since unmounting threw the whole thing away. */}
          <div style={{ display: tab === 'players' ? 'block' : 'none', height: '100%', overflowY: 'auto' }}>
            <ConnectedPlayersList sessionId={sessionId} campaignId={campaignId} playerCharacters={playerCharacters} onSelectPlayer={onSelectPlayer} />
          </div>
          <div style={{ display: tab === 'initiative' ? 'block' : 'none', height: '100%' }}>
            <InitiativeTracker sessionId={sessionId} playerCharacters={playerCharacters} onSelectMonster={onSelectMonster} />
          </div>
          <div style={{ display: tab === 'dice' ? 'block' : 'none', height: '100%' }}>
            <DiceTray sessionId={sessionId} />
          </div>
          <div style={{ display: tab === 'calendar' ? 'block' : 'none', height: '100%' }}>
            {/* Always the local/direct path, never the hosted session id — `sessionId` here means
                "the session I'm hosting" (for presence/broadcast elsewhere in this panel), not "a
                session I've joined". The DM reaching their own calendar is never a joined
                participant of their own hosted session, so passing it through would route calendar
                reads/writes over the relay and fail with "not connected to that session." Saves
                still broadcast to connected players regardless — see registerIpc.ts's calendar:save
                handler, which already checks getHostedSession() server-side. */}
            <CalendarPanel sessionId={null} campaignId={campaignId} readOnly={false} notes={notes} />
          </div>
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
