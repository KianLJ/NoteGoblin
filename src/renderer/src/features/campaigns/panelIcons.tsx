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

export function InitiativeIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 4h8M6 8h8M6 12h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path
        d="M2 3.3v2M2 3.3l-.7.7M1.9 8h.5M2.4 8v1.6M1.5 9.6h1.8M1.8 12.1c.6-.5 1.2-.5 1.2.1s-.5.5-.7.7c-.3.3-.5.5-.5.9h1.2"
        stroke="currentColor"
        strokeWidth="0.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
