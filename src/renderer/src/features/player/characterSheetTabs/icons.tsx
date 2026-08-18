import type { CSSProperties } from 'react'

interface IconProps {
  size?: number
  style?: CSSProperties
}

/** Small monoline icons matching features/player/icons.tsx's UserIcon style (currentColor strokes, ~1.1-1.3 width) — used to give the Overview header's vitals and ability score cards some visual identity instead of plain text labels. */

export function ShieldIcon({ size = 20, style }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" style={style}>
      <path
        d="M8 1.6 13.4 3.4v4.1c0 3.4-2.3 5.9-5.4 7-3.1-1.1-5.4-3.6-5.4-7V3.4L8 1.6Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function HeartIcon({ size = 20, style }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" style={style}>
      <path
        d="M8 13.6S1.8 9.8 1.8 5.7c0-2 1.6-3.3 3.3-3.3 1.2 0 2.3.6 2.9 1.7.6-1.1 1.7-1.7 2.9-1.7 1.7 0 3.3 1.3 3.3 3.3 0 4.1-6.2 7.9-6.2 7.9Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function PencilIcon({ size = 14, style }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" style={style}>
      <path
        d="M11.3 2.3a1.4 1.4 0 0 1 2 0l0.4.4a1.4 1.4 0 0 1 0 2L5.6 12.8l-3 .7.7-3L11.3 2.3Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function InitiativeIcon({ size = 18, style }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" style={style}>
      <path d="M8 1v3M8 12v3M2.5 8h3M10.5 8h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M8 4.5 10 8l-2 3.5L6 8Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  )
}

export function SpeedIcon({ size = 18, style }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" style={style}>
      <path d="M2 9.5 5 4l2.2 3.4L9.5 4 14 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 12.5h12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

export function HitDiceIcon({ size = 18, style }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" style={style}>
      <path d="M8 1.4 14 5v6l-6 3.6L2 11V5l6-3.6Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M2 5l6 3.6L14 5M8 8.6V15" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  )
}

const ABILITY_ICON_PATHS: Record<string, JSX.Element> = {
  str: (
    <path
      d="M2.5 6.5V5a1 1 0 0 1 2 0v.5M4.5 6V5a1 1 0 0 1 2 0v1M11.5 6.5V5a1 1 0 0 1 2 0v1.5M9.5 6V5a1 1 0 0 1 2 0v1M4.5 6.5h7v1.8c0 2.4-1.6 4.2-3.5 4.9-1.9-.7-3.5-2.5-3.5-4.9V6.5Z"
      stroke="currentColor"
      strokeWidth="1.05"
      strokeLinejoin="round"
    />
  ),
  dex: <path d="M3 13 12 4M12 4H7M12 4v5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />,
  con: (
    <path
      d="M8 2.2c1.8 2.4 3.6 4.5 3.6 6.9a3.6 3.6 0 0 1-7.2 0c0-2.4 1.8-4.5 3.6-6.9Z"
      stroke="currentColor"
      strokeWidth="1.15"
      strokeLinejoin="round"
    />
  ),
  int: (
    <path
      d="M8 2c-2.2 0-3.6 1.6-3.6 3.4 0 1.3.7 2 1.3 2.7.4.5.7.9.7 1.5v.8h3.2v-.8c0-.6.3-1 .7-1.5.6-.7 1.3-1.4 1.3-2.7C11.6 3.6 10.2 2 8 2Z M6.6 12.2h2.8"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinejoin="round"
    />
  ),
  wis: (
    <>
      <path d="M1.8 8c1.4-2.8 3.7-4.3 6.2-4.3S13 5.2 14.4 8c-1.4 2.8-3.7 4.3-6.2 4.3S3.2 10.8 1.8 8Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.1" />
    </>
  ),
  cha: (
    <path
      d="M8 13.2 2.8 8.7C1.6 7.6 1.6 5.7 2.9 4.6a3 3 0 0 1 4-.1L8 5.4l1.1-.9a3 3 0 0 1 4 .1c1.3 1.1 1.3 3 .1 4.1L8 13.2Z"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinejoin="round"
    />
  )
}

export function SunIcon({ size = 14, style }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" style={style}>
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M8 1.2v1.6M8 13.2v1.6M14.8 8h-1.6M2.8 8H1.2M12.7 3.3l-1.1 1.1M4.4 11.6l-1.1 1.1M12.7 12.7l-1.1-1.1M4.4 4.4 3.3 3.3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function MoonIcon({ size = 14, style }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" style={style}>
      <path
        d="M13.2 9.4A5.6 5.6 0 0 1 6.6 2.8 5.6 5.6 0 1 0 13.2 9.4Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function AbilityIcon({ ability, size = 16, style }: { ability: string; size?: number; style?: CSSProperties }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" style={style}>
      {ABILITY_ICON_PATHS[ability] ?? null}
    </svg>
  )
}
