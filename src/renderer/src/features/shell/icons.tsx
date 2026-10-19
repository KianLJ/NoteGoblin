/** DM mode — a robed/armored figure, for table authority. */
/** Workshop mode — a hammer over an anvil. */
/** Crossed swords — the Combat tab. */
export function CombatModeIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M2 2l7.5 7.5M2 2h2.6l6 6M2 2v2.6l6 6" />
      <path d="M14 2L6.5 9.5M14 2h-2.6l-6 6M14 2v2.6l-6 6" />
      <path d="M4 10.6l1.4 1.4M3.3 12.7l1-1M10.6 12l1.4-1.4M11.7 11.7l1 1" />
    </svg>
  )
}

export function WorkshopModeIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M2 9.5h9.5c0 1.6-1.3 2.6-3 2.8v1.7h2v1H5v-1h2v-1.7C4.4 12 2.6 11 2 9.5z" />
      <path d="M11.5 9.5h1.8c.9 0 1.7-.6 2-1.5h-3.8" />
      <path d="M9.2 1.3l2.6 2.6-1.4 1.4-2.6-2.6z" />
      <path d="M8.5 4.2L4.6 8.1" />
    </svg>
  )
}

export function DmModeIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="8" cy="3.08" r="2.66" stroke="currentColor" strokeWidth="0.9" />
      <path
        d="M11.39,8.33c-.23-1.14-1.31-1.53-2.16-1.53h-2.46c-.85,0-1.93.4-2.16,1.53h6.78Z"
        stroke="currentColor"
        strokeWidth="0.9"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <polygon
        points="11.73 8.33 4.27 8.33 3.14 8.33 3.14 15.54 12.86 15.54 12.86 8.33 11.73 8.33"
        stroke="currentColor"
        strokeWidth="0.9"
        strokeLinejoin="bevel"
      />
      <polygon
        points=".54 14.12 3.14 15.54 3.14 8.33 .54 6.91 .54 14.12"
        stroke="currentColor"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      <polygon
        points="15.46 14.12 12.86 15.54 12.86 8.33 15.46 6.91 15.46 14.12"
        stroke="currentColor"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Player mode — a plain figure, no armor, matching DmModeIcon's silhouette. */
export function PlayerModeIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="8" cy="3.08" r="2.66" stroke="currentColor" strokeWidth="0.9" />
      <path
        d="M12.6,15.54s.12-4.12,0-5.49c-.19-2.21-1.76-2.96-2.96-2.96h-3.32c-1.2,0-2.77.74-2.96,2.96-.12,1.36,0,5.49,0,5.49h9.24Z"
        stroke="currentColor"
        strokeWidth="0.9"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function MinimizeIcon(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M1 5h8" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

export function MaximizeIcon(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="8" height="8" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

export function RestoreIcon(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <rect x="2.5" y="1" width="6.5" height="6.5" stroke="currentColor" strokeWidth="1" />
      <path d="M1 3.5V9h5.5" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

export function CloseWindowIcon(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M1 1l8 8M9 1 1 9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}

/** A double eighth note — the Goblin Bard header button. */
export function MusicNoteIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M6 11.2V3.6l7-1.6v7.6" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" strokeLinecap="round" />
      <ellipse cx="4.2" cy="11.6" rx="2.2" ry="1.8" stroke="currentColor" strokeWidth="1" />
      <ellipse cx="11.2" cy="9.6" rx="2.2" ry="1.8" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

/** An open book — the Bestiary's header button. */
export function BestiaryIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path
        d="M8 3.4C7 2.6 5.3 2.2 3.2 2.2c-.5 0-.9.4-.9.9v8.6c0 .5.4.9.9.9 1.9 0 3.7.4 4.8 1.2M8 3.4c1-.8 2.7-1.2 4.8-1.2.5 0 .9.4.9.9v8.6c0 .5-.4.9-.9.9-1.9 0-3.7.4-4.8 1.2M8 3.4v10.4"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Content Packs — a row of book spines (the Codex already has the open book). */
export function PacksIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path
        d="M2.5 2.5h2.6v11H2.5zM5.1 2.5h2.6v11H5.1zM8.4 3.3l2.5-.7 2.9 10.6-2.5.7z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path d="M2.5 5h2.6M5.1 5h2.6M2.5 11h2.6M5.1 11h2.6M9.1 5.6l2.5-.7M10.6 11.1l2.5-.7" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}
