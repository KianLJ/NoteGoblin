/** Icons for the right panel's tab strip — extend this set as dice roller / initiative tracker land for real. */

export function PlayersIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M9.9,15.54s.12-4.12,0-5.49c-.19-2.21-1.76-2.96-2.96-2.96h-3.32c-1.2,0-2.77.74-2.96,2.96-.12,1.36,0,5.49,0,5.49h9.24Z"
        stroke="currentColor"
        strokeWidth="0.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="5.3" cy="3.08" r="2.66" stroke="currentColor" strokeWidth="0.7" />
      <circle cx="11.76" cy="5.45" r="2.08" stroke="currentColor" strokeWidth="0.7" />
      <path
        d="M15.36,11.25c-.15-1.73-1.38-2.31-2.31-2.31h-2.59c-.24,0-.51.04-.77.13.1.29.18.61.22.98.12,1.37,0,5.49,0,5.49h5.46s.09-3.22,0-4.29Z"
        stroke="currentColor"
        strokeWidth="0.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function DiceIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <polygon points="8 .45 1.46 11.76 14.54 11.76 8 .45" stroke="currentColor" strokeWidth="0.42" strokeLinejoin="round" />
      <polygon points="8 11.84 11.33 6.08 4.67 6.08 8 11.84" stroke="currentColor" strokeWidth="0.5" strokeLinejoin="round" />
      <line x1="1.35" y1="4.16" x2="4.67" y2="6.08" stroke="currentColor" strokeWidth="0.42" strokeLinejoin="round" />
      <line x1="14.65" y1="4.16" x2="11.33" y2="6.08" stroke="currentColor" strokeWidth="0.42" strokeLinejoin="round" />
      <line x1="8" y1="11.84" x2="8" y2="15.67" stroke="currentColor" strokeWidth="0.42" strokeLinejoin="round" />
      <polygon
        points="1.35 4.16 1.35 11.84 8 15.67 14.65 11.84 14.65 4.16 8 .33 1.35 4.16"
        stroke="currentColor"
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ChatIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2 3.6c0-.88.72-1.6 1.6-1.6h8.8c.88 0 1.6.72 1.6 1.6v6.2c0 .88-.72 1.6-1.6 1.6H6.4l-2.9 2.4v-2.4H3.6c-.88 0-1.6-.72-1.6-1.6V3.6Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <line x1="4.6" y1="5.4" x2="11.4" y2="5.4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <line x1="4.6" y1="7.9" x2="9.2" y2="7.9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}

export function CalendarIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.8" y="2.9" width="12.4" height="11.2" rx="1.3" stroke="currentColor" strokeWidth="1.1" />
      <line x1="1.8" y1="6.1" x2="14.2" y2="6.1" stroke="currentColor" strokeWidth="1.1" />
      <line x1="4.6" y1="1.4" x2="4.6" y2="4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <line x1="11.4" y1="1.4" x2="11.4" y2="4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="5.4" cy="9" r="0.8" fill="currentColor" />
      <circle cx="8" cy="9" r="0.8" fill="currentColor" />
      <circle cx="10.6" cy="9" r="0.8" fill="currentColor" />
    </svg>
  )
}

/** Broadcast-style arcs, for "session" (hosting/connection) management. */
export function SessionIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="9.4" r="1.4" fill="currentColor" />
      <path d="M5.4 7.2a3.6 3.6 0 0 1 5.2 0" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M3.2 4.9a6.8 6.8 0 0 1 9.6 0" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}

/** An order list — one bold, filled row (the active turn) and three lighter ones (everyone else waiting their turn). */
export function InitiativeIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <line x1="5.15" y1="1.92" x2="14.71" y2="1.92" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" opacity="0.5" />
      <circle cx="1.88" cy="1.92" r="0.28" fill="currentColor" stroke="currentColor" strokeWidth="1.25" opacity="0.5" />
      <line x1="5.51" y1="6.19" x2="14.36" y2="6.19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="1.88" cy="6.19" r="1.15" fill="currentColor" stroke="currentColor" strokeLinejoin="round" />
      <line x1="5.15" y1="10.47" x2="14.71" y2="10.47" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" opacity="0.5" />
      <circle cx="1.88" cy="10.47" r="0.28" fill="currentColor" stroke="currentColor" strokeWidth="1.25" opacity="0.5" />
      <line x1="5.15" y1="14.08" x2="14.71" y2="14.08" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" opacity="0.5" />
      <circle cx="1.88" cy="14.08" r="0.28" fill="currentColor" stroke="currentColor" strokeWidth="1.25" opacity="0.5" />
    </svg>
  )
}
