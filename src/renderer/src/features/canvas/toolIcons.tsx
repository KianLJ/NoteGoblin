import type { ReactNode } from 'react'
import { CalendarIcon, InitiativeIcon, PlayersIcon, SessionIcon } from '../campaigns/panelIcons'
import { FolderIcon } from '../campaigns/icons'
import { BestiaryIcon, MusicNoteIcon } from '../shell/icons'
import { SoundBoardIcon } from '../audio/SoundBoardPanel'
import { UserIcon } from '../player/icons'
import type { ToolKind } from '@shared/canvasTools'
import { TimerIcon } from './SessionTimer'

export const TOOL_ICONS: Record<ToolKind, ReactNode> = {
  notes: <FolderIcon />,
  players: <PlayersIcon />,
  party: <PlayersIcon />,
  initiative: <InitiativeIcon />,
  // Crossed swords: the saved encounters.
  encounters: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2.5 2.5l8 8M13.5 2.5l-8 8M9.5 11.5l2 2M6.5 11.5l-2 2M10.5 12.5l2-2M5.5 12.5l-2-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  calendar: <CalendarIcon />,
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
  friends: <UserIcon />
}
