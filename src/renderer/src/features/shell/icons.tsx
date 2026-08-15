/** DM mode — a crown, for table authority. */
export function CrownIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.5 12.5h11M2.7 12 2 6.2l2.8 2.1L8 4.3l3.2 4 2.8-2.1-.7 5.8Z"
        stroke="currentColor"
        strokeWidth="1.2"
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
