import type { LayoutPreset } from './canvasLayout'

export type CanvasMode = 'dm' | 'player'

/** Every fixed tool a canvas can hold. Which ones a mode offers is TOOLS_BY_MODE. */
export type ToolKind =
  | 'notes'
  | 'players'
  | 'party'
  | 'initiative'
  | 'encounters'
  | 'calendar'
  | 'sessions'
  | 'codex'
  | 'timer'
  | 'whatsnew'
  | 'music'
  | 'soundboard'
  | 'friends'

export const TOOL_META: Record<ToolKind, { title: string; w: number; h: number }> = {
  notes: { title: 'Notes', w: 272, h: 640 },
  players: { title: 'Players', w: 320, h: 480 },
  party: { title: 'Party', w: 320, h: 480 },
  initiative: { title: 'Initiative', w: 400, h: 480 },
  encounters: { title: 'Encounters', w: 380, h: 520 },
  calendar: { title: 'Calendar', w: 352, h: 512 },
  sessions: { title: 'Sessions', w: 880, h: 640 },
  codex: { title: 'Codex', w: 800, h: 640 },
  timer: { title: 'Session Timer', w: 320, h: 272 },
  whatsnew: { title: 'What’s New', w: 760, h: 720 },
  music: { title: 'Music', w: 384, h: 512 },
  soundboard: { title: 'Sound Board', w: 352, h: 512 },
  friends: { title: 'Friends', w: 320, h: 432 }
}

export const TOOLS_BY_MODE: Record<CanvasMode, ToolKind[]> = {
  dm: ['notes', 'players', 'initiative', 'encounters', 'calendar', 'sessions', 'timer', 'codex', 'music', 'soundboard', 'friends', 'whatsnew'],
  player: ['notes', 'party', 'initiative', 'calendar', 'sessions', 'codex', 'friends', 'whatsnew']
}

/**
 * Tools that minimize to a small view of their own (what's playing, the time,
 * whose turn it is) instead of the plain tile: its size, title bar included,
 * in whole tiles (MINI_SIZE).
 */
export const TOOL_MINI: Partial<Record<ToolKind, { w: number; h: number }>> = {
  music: { w: 256, h: 160 },
  soundboard: { w: 288, h: 192 },
  initiative: { w: 192, h: 192 },
  timer: { w: 288, h: 96 },
  calendar: { w: 192, h: 96 },
  players: { w: 192, h: 96 },
  party: { w: 192, h: 96 },
  sessions: { w: 288, h: 128 }
}

/** Tools opened from the app's header (the Codex button, the version's What's New) rather than the canvas's bottom bar. */
export const HEADER_TOOLS: ToolKind[] = ['codex', 'whatsnew']

/**
 * The smallest box each tool's contents can be shown in (excluding the title
 * bar). A box resized below this shows its title and asks to be made bigger,
 * rather than squashing the tool. By tool kind, or an open-many kind.
 */
export const MIN_CONTENT: Record<string, { w: number; h: number }> = {
  notes: { w: 200, h: 200 },
  players: { w: 220, h: 160 },
  party: { w: 220, h: 160 },
  initiative: { w: 300, h: 260 },
  encounters: { w: 260, h: 220 },
  calendar: { w: 260, h: 300 },
  sessions: { w: 320, h: 280 },
  codex: { w: 360, h: 300 },
  timer: { w: 180, h: 140 },
  whatsnew: { w: 340, h: 260 },
  music: { w: 260, h: 260 },
  soundboard: { w: 240, h: 200 },
  friends: { w: 240, h: 200 },
  note: { w: 280, h: 200 },
  character: { w: 520, h: 360 },
  partySheet: { w: 520, h: 360 },
  playerSheet: { w: 520, h: 360 },
  monster: { w: 240, h: 200 },
  entry: { w: 240, h: 160 },
  sticky: { w: 96, h: 40 },
  image: { w: 96, h: 64 }
}

/** Sizes for the things you open many of (see layout.ts's id conventions). */
export const DYNAMIC_SIZE: Record<string, { w: number; h: number }> = {
  note: { w: 720, h: 720 },
  character: { w: 960, h: 768 },
  partySheet: { w: 960, h: 768 },
  playerSheet: { w: 960, h: 768 },
  monster: { w: 560, h: 640 },
  entry: { w: 420, h: 520 },
  sticky: { w: 224, h: 192 },
  collection: { w: 96, h: 96 },
  image: { w: 400, h: 332 }
}

export function dynamicKind(id: string): string {
  return id.split(':')[0]
}

/** Ids a saved layout may hold for this mode: its tools, plus any open-many kind. */
export function isKnownId(mode: CanvasMode, id: string): boolean {
  if ((TOOLS_BY_MODE[mode] as string[]).includes(id)) return true
  const kind = id.startsWith('slot:') ? id.slice(5) : id.includes(':') ? dynamicKind(id) : null
  return kind !== null && kind in DYNAMIC_SIZE
}

// Laid out for a roughly 1600×900 window; Fit all scales them to whatever window you have.
export const PRESETS: Record<CanvasMode, LayoutPreset[]> = {
  dm: [
    {
      id: 'table',
      label: 'At the table',
      nodes: [
        { id: 'notes', x: 16, y: 16, w: 272, h: 800 },
        { id: 'slot:note', x: 304, y: 16, w: 720, h: 800 },
        { id: 'players', x: 1040, y: 16, w: 320, h: 800 },
        { id: 'soundboard', x: 1376, y: 16, w: 320, h: 400 },
        { id: 'music', x: 1376, y: 432, w: 352, h: 384 }
      ]
    },
    {
      id: 'prep',
      label: 'Prep',
      nodes: [
        { id: 'notes', x: 16, y: 16, w: 272, h: 800 },
        { id: 'slot:note', x: 304, y: 16, w: 800, h: 800 },
        { id: 'calendar', x: 1120, y: 16, w: 352, h: 400 },
        { id: 'sessions', x: 1120, y: 432, w: 352, h: 384 },
        { id: 'players', x: 1488, y: 16, w: 320, h: 400 }
      ]
    }
  ],
  player: [
    {
      id: 'play',
      label: 'Play',
      nodes: [
        { id: 'notes', x: 16, y: 16, w: 272, h: 800 },
        { id: 'slot:character', x: 304, y: 16, w: 960, h: 800 },
        { id: 'slot:note', x: 1280, y: 432, w: 656, h: 384 },
        { id: 'party', x: 1280, y: 16, w: 320, h: 400 },
        { id: 'initiative', x: 1952, y: 16, w: 352, h: 800 }
      ]
    }
  ]
}
