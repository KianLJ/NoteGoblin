/** Small monoline icons for the notes workspace — inherit color via currentColor, matching the Mark wordmark's style rather than an emoji/stock icon set. */

export function FileIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path
        d="M4 1.5h5l3 3v10a.5.5 0 0 1-.5.5h-7.5a.5.5 0 0 1-.5-.5v-12a.5.5 0 0 1 .5-.5Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M9 1.5V4a1 1 0 0 0 1 1h2.3" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  )
}

export function LockIcon(): JSX.Element {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.1" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  )
}

export function PlusIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function CloseIcon(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 3l10 10M13 3 3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function FolderIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path
        d="M1.8 4.2a1 1 0 0 1 1-1h3l1.3 1.6h5.1a1 1 0 0 1 1 1v6.4a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1V4.2Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function FolderOpenIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path
        d="M1.8 4.2a1 1 0 0 1 1-1h3l1.3 1.6h5.1a1 1 0 0 1 1 1v.7H3.6a1 1 0 0 0-.96.73l-1.4 5a.4.4 0 0 1-.4.27"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M1.8 11.9 3.05 7.4a1 1 0 0 1 .96-.73h9.2a.6.6 0 0 1 .58.76l-1.24 4.5a1 1 0 0 1-.96.73H2.4a.6.6 0 0 1-.6-.76Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ChevronRightIcon(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M5 3l6 5-6 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function NewNoteIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 1.5h4.5l3 3V9.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M4 1.5a.5.5 0 0 0-.5.5v12a.5.5 0 0 0 .5.5h3.5" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M8.5 1.5V4a1 1 0 0 0 1 1h2.3" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M12 9.5v4.5M9.75 11.75h4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function NewFolderIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M1.5 4a1 1 0 0 1 1-1h2.7l1.2 1.5h4.6a1 1 0 0 1 1 1v1.6"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M1.5 4v7.8a1 1 0 0 0 1 1h4.7"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M12.2 9v4.5M9.95 11.25h4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function SortIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 3v10M4 3 1.8 5.2M4 3l2.2 2.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 13V3M12 13l2.2-2.2M12 13l-2.2-2.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function CollapseAllIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
      <path d="M5.5 8h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function ExpandAllIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
      <path d="M8 5.5v5M5.5 8h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function LocateIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M8 1.5v2.2M8 12.3v2.2M14.5 8h-2.2M3.7 8H1.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}
