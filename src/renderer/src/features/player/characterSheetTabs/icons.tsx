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

/** A wilting/drooping flame — used for Exhaustion, whose hover tooltip explains what the character's current level does (see OverviewTab.tsx). */
export function ExhaustionIcon({ size = 18, style }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" style={style}>
      <path
        d="M8 1.6c1 1.8 2.6 3.1 2.6 5.2A2.6 2.6 0 0 1 8 9.4a2.6 2.6 0 0 1-2.6-2.6c0-.9.4-1.6.9-2.3-.1.9.2 1.5.7 1.8-.3-1.7.4-3 1-4.7Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M5.5 13.4h5M6.3 11.6h3.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

export function StarIcon({ size = 20, style, filled }: IconProps & { filled?: boolean }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill={filled ? 'currentColor' : 'none'} aria-hidden="true" style={style}>
      <path
        d="M8 1.6 9.85 5.9l4.65.4-3.53 3.06 1.06 4.54L8 11.53l-4.03 2.37 1.06-4.54L1.5 6.3l4.65-.4L8 1.6Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** The app's one d20 icon — a wireframe die (outer silhouette, front face, and the three edges running back from each front-face corner), used everywhere a d20 needs representing: roll buttons next to ability/save/skill/attack bonuses (OverviewTab.tsx/CombatTab.tsx), the initiative dice pill (InitiativeTracker.tsx), and (drawn larger, with its own fill colors) the roll animation overlay/force-roll dialog. */
export function DiceIcon({ size = 14, style }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      <path d="M12 1.5 L21.09 6.75 L21.09 17.25 L12 22.5 L2.91 17.25 L2.91 6.75 Z" />
      <path d="M12 5.51 L17.62 15.25 L6.38 15.25 Z" />
      <path d="M12 5.51 L12 1.5 M12 5.51 L21.09 6.75 M12 5.51 L2.91 6.75" />
      <path d="M17.62 15.25 L21.09 6.75 M17.62 15.25 L21.09 17.25 M17.62 15.25 L12 22.5" />
      <path d="M6.38 15.25 L12 22.5 M6.38 15.25 L2.91 17.25 M6.38 15.25 L2.91 6.75" />
    </svg>
  )
}

/** The same d20 wireframe as DiceIcon, but as raw path data (no outer <svg>) so callers that need custom per-path fills — the roll animation overlay's dark die body plus a faint front-face highlight, colored by roll outcome — can compose it inside their own <svg> instead of being stuck with DiceIcon's single currentColor stroke. `bodyFill`/`stroke` cover the silhouette + wireframe edges; the front face is always a faint white highlight, matching the die's subtle top-face sheen regardless of outcome color. */
export function D20FacePaths({ stroke, bodyFill, strokeWidth = 0.7 }: { stroke: string; bodyFill: string; strokeWidth?: number }): JSX.Element {
  return (
    <>
      <path d="M12 1.5 L21.09 6.75 L21.09 17.25 L12 22.5 L2.91 17.25 L2.91 6.75 Z" fill={bodyFill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <path d="M12 5.51 L17.62 15.25 L6.38 15.25 Z" fill="rgba(255,255,255,0.06)" stroke={stroke} strokeWidth={strokeWidth * 0.6} strokeLinejoin="round" />
      <path
        d="M12 5.51 L12 1.5 M12 5.51 L21.09 6.75 M12 5.51 L2.91 6.75 M17.62 15.25 L21.09 6.75 M17.62 15.25 L21.09 17.25 M17.62 15.25 L12 22.5 M6.38 15.25 L12 22.5 M6.38 15.25 L2.91 17.25 M6.38 15.25 L2.91 6.75"
        stroke={stroke}
        strokeWidth={strokeWidth * 0.6}
        strokeLinecap="round"
        fill="none"
      />
    </>
  )
}

export function D12FacePaths({ stroke, bodyFill, strokeWidth = 0.7 }: { stroke: string; bodyFill: string; strokeWidth?: number }): JSX.Element {
  return (
    <>
      <path d="M12 1.5 L18.17 3.51 L21.99 8.76 L21.99 15.24 L18.17 20.49 L12 22.5 L5.83 20.49 L2.01 15.24 L2.01 8.76 L5.83 3.51 Z" fill={bodyFill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <path d="M12 5.51 L18.17 9.99 L15.81 17.25 L8.19 17.25 L5.83 9.99 Z" fill="rgba(255,255,255,0.06)" stroke={stroke} strokeWidth={strokeWidth * 0.6} strokeLinejoin="round" />
      <path d="M12 5.51 V1.5 M18.17 9.99 L21.99 8.76 M15.81 17.25 L18.17 20.49 M8.19 17.25 L5.83 20.49 M5.83 9.99 L2.01 8.76" stroke={stroke} strokeWidth={strokeWidth * 0.6} strokeLinecap="round" fill="none" />
    </>
  )
}

export function D10FacePaths({ stroke, bodyFill, strokeWidth = 0.7 }: { stroke: string; bodyFill: string; strokeWidth?: number }): JSX.Element {
  return (
    <>
      <path d="M21.5 9.6 L18.6 18.6 L12 22.2 L5.4 18.6 L2.5 9.6" fill={bodyFill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <path d="M12 1.8 L21.5 9.6 L12 15 L2.5 9.6 Z" fill="rgba(255,255,255,0.06)" stroke={stroke} strokeWidth={strokeWidth * 0.6} strokeLinejoin="round" />
      <path d="M12 15 V22.2" stroke={stroke} strokeWidth={strokeWidth * 0.6} strokeLinecap="round" fill="none" />
    </>
  )
}

export function D8FacePaths({ stroke, bodyFill, strokeWidth = 0.7 }: { stroke: string; bodyFill: string; strokeWidth?: number }): JSX.Element {
  return (
    <>
      <path d="M12 1.5 L21.09 6.75 L21.09 17.25 L12 22.5 L2.91 17.25 L2.91 6.75 Z" fill={bodyFill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <path d="M12 1.5 L21.09 17.25 L2.91 17.25 Z" fill="rgba(255,255,255,0.06)" stroke={stroke} strokeWidth={strokeWidth * 0.6} strokeLinejoin="round" />
    </>
  )
}

export function D6FacePaths({ stroke, bodyFill, strokeWidth = 0.7 }: { stroke: string; bodyFill: string; strokeWidth?: number }): JSX.Element {
  return (
    <>
      <path d="M3.5 7.5 H17.5 V21.5 H3.5 Z" fill={bodyFill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <path d="M3.5 7.5 L7 4 H21 L17.5 7.5" fill="rgba(255,255,255,0.06)" stroke={stroke} strokeWidth={strokeWidth * 0.6} strokeLinejoin="round" />
      <path d="M17.5 21.5 L21 18 V4" stroke={stroke} strokeWidth={strokeWidth * 0.6} strokeLinecap="round" fill="none" />
    </>
  )
}

export function D4FacePaths({ stroke, bodyFill, strokeWidth = 0.7 }: { stroke: string; bodyFill: string; strokeWidth?: number }): JSX.Element {
  return (
    <>
      <path d="M12 2 L21.4 18.3 L2.6 18.3 Z" fill={bodyFill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <path d="M2.6 18.3 L12 15 L21.4 18.3" fill="rgba(255,255,255,0.06)" stroke={stroke} strokeWidth={strokeWidth * 0.6} strokeLinejoin="round" />
    </>
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
      d="M8 13.2 2.8 8.7C1.6 7.6 1.6 5.7 2.9 4.6a3 3 0 0 1 4-.1L8 5.4l1.1-.9a3 3 0 0 1 4 .1c1.3 1.1 1.3 3 .1 4.1L8 13.2Z"
      stroke="currentColor"
      strokeWidth="1.1"
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
