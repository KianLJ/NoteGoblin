import type { ReactNode } from 'react'
import { CalendarIcon, InitiativeIcon, PlayersIcon, SessionIcon } from '../campaigns/panelIcons'
import { FolderIcon } from '../campaigns/icons'
import { BestiaryIcon, MusicNoteIcon } from '../shell/icons'
import { SoundBoardIcon } from '../audio/SoundBoardPanel'
import { UserIcon } from '../player/icons'
import type { ToolKind } from '@shared/canvasTools'
import { TimerIcon } from './SessionTimer'
import { BrowserIcon } from '../browser/BrowserPanel'

export const TOOL_ICONS: Record<ToolKind, ReactNode> = {
  notes: <FolderIcon />,
  players: <PlayersIcon />,
  party: <PlayersIcon />,
  initiative: <InitiativeIcon />,
  calendar: <CalendarIcon />,
  // A scroll with a seal: the quest log.
  quests: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 2.5h7.5a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 12.5V4a1.5 1.5 0 0 1 1-1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  sessions: <SessionIcon />,
  codex: <BestiaryIcon />,
  timer: <TimerIcon />,
  whatsnew: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.5l1.6 4.1 4.4.3-3.4 2.8 1.1 4.3L8 10.6l-3.7 2.4 1.1-4.3L2 5.9l4.4-.3L8 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  ),
  music: <MusicNoteIcon />,
  soundboard: <SoundBoardIcon />,
  friends: <UserIcon />,
  browser: <BrowserIcon />,
  // A folded map.
  worldmap: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1.5 3.5 5.5 2l5 1.5 4-1.5v10.5l-4 1.5-5-1.5-4 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M5.5 2v10.5M10.5 3.5V14" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  // Two hands meeting: where the party stands with someone.
  reputation: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3.2 5.3 1.9a1.6 1.6 0 0 0-1.6.1L1.5 3.6v5.2l4.7 4.4a1.2 1.2 0 0 0 1.7-1.7l.4.4a1.2 1.2 0 0 0 1.7-1.7l.3.3a1.2 1.2 0 0 0 1.7-1.7L14.5 8.6V3.6l-2.2-1.6a1.6 1.6 0 0 0-1.6-.1Z" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
      <path d="M8 3.2 6.2 5a1.1 1.1 0 0 0 1.6 1.6L9.4 5l2.6 2.6" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
