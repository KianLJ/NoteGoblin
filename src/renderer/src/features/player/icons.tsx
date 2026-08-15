/** Small monoline character icon — distinguishes character rows from note rows in the sidebar. */
export function UserIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="8" cy="5.3" r="2.6" stroke="currentColor" strokeWidth="1.1" />
      <path d="M2.8 14c.6-3 2.8-4.6 5.2-4.6s4.6 1.6 5.2 4.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}
