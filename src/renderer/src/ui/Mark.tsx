/** The NoteGoblin mark: a quill nib over a folded page. Used in place of an emoji/stock icon. */
export function Mark({ size = 28 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M6 5.5C6 4.67 6.67 4 7.5 4h13.6c.4 0 .78.16 1.06.44l3.4 3.4c.28.28.44.66.44 1.06V26.5c0 .83-.67 1.5-1.5 1.5h-17c-.83 0-1.5-.67-1.5-1.5v-21Z"
        fill="var(--bg-surface-raised)"
        stroke="var(--border-strong)"
        strokeWidth="1.4"
      />
      <path d="M20.9 4v4.6c0 .5.4.9.9.9h4.5" stroke="var(--border-strong)" strokeWidth="1.4" />
      <path
        d="M11 22.5c3-8.5 7.5-13 12.5-14.8"
        stroke="var(--accent)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M11 22.5c1.6-.3 3-.9 4-2-1.4-.4-2.7-.1-4 2Z"
        fill="var(--accent)"
      />
    </svg>
  )
}
