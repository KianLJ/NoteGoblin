/** Icons for the right panel's tab strip — extend this set as dice roller / initiative tracker land for real. */

export function PlayersIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="5.5" cy="5" r="2.1" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="11" cy="5.5" r="1.8" stroke="currentColor" strokeWidth="1.1" />
      <path d="M1.6 13.2c.5-2.6 2.2-4 3.9-4s3.2 1.2 3.7 3.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M8.7 9.7c1.4.1 2.9 1.1 3.3 3.1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}

export function DiceIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="5.5" cy="5.5" r="0.9" fill="currentColor" />
      <circle cx="10.5" cy="5.5" r="0.9" fill="currentColor" />
      <circle cx="8" cy="8" r="0.9" fill="currentColor" />
      <circle cx="5.5" cy="10.5" r="0.9" fill="currentColor" />
      <circle cx="10.5" cy="10.5" r="0.9" fill="currentColor" />
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
