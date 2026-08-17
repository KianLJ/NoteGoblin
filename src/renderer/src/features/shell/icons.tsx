/** DM mode — a robed/armored figure, for table authority. */
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
