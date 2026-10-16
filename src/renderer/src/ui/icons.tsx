import type { CSSProperties, ReactNode } from 'react'
import { DiceIcon, PencilIcon, SunIcon } from '../features/player/characterSheetTabs/icons'

// App-wide button/label icons — the app uses SVG icons, never emoji or
// symbol glyphs (crosses, pencils, dice, arrows typed as text), so they all
// render the same everywhere and follow the theme's currentColor. Feature-specific icons live in each
// feature's own icons.tsx; these are the generic ones many places share.

export { DiceIcon, PencilIcon, SunIcon }

interface IconProps {
  size?: number
  style?: CSSProperties
}

function Svg({ size = 14, style, children }: IconProps & { children: ReactNode }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0, ...style }}
    >
      {children}
    </svg>
  )
}

/** Remove / delete / close a row. */
export function XIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Svg>
  )
}

export function PlusIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M8 3v10M3 8h10" />
    </Svg>
  )
}

export function MinusIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M3 8h10" />
    </Svg>
  )
}

/** A sound cue — the note widget's "play this sound" button. */
export function SpeakerIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M2.5 6.2h2.3L8 3.5v9L4.8 9.8H2.5z" />
      <path d="M10.6 5.8a3 3 0 0 1 0 4.4M12.3 4.2a5.3 5.3 0 0 1 0 7.6" />
    </Svg>
  )
}

export function ArrowLeftIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M13 8H3M7 4L3 8l4 4" />
    </Svg>
  )
}

export function ArrowRightIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </Svg>
  )
}

export function ArrowUpIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M8 13V3M4 7l4-4 4 4" />
    </Svg>
  )
}

export function ArrowDownIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M8 3v10M4 9l4 4 4-4" />
    </Svg>
  )
}

/** Undo the last action. */
export function UndoIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M5.5 3.5L2.5 6.5l3 3" />
      <path d="M2.5 6.5h7a4 4 0 0 1 0 8H7" />
    </Svg>
  )
}

/** An icon and a label side by side, vertically centred — for buttons like "Roll All" or "Next". */
export function IconLabel({ icon, children, iconAfter }: { icon: ReactNode; children: ReactNode; iconAfter?: boolean }): JSX.Element {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      {!iconAfter && icon}
      {children}
      {iconAfter && icon}
    </span>
  )
}
