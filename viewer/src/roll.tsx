import { useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { DIE_SIDES, type AdvantageMode, type DiceGroup, type DieSides } from '@shared/dice'
import { queuePendingCheck, queuePendingDamage } from '@renderer/features/dice/rollAnimationStore'
import { ContextMenu, type ContextMenuState } from '@renderer/ui/ContextMenu'

/**
 * The viewer's equivalent of the desktop's useSheetRoller — queues a
 * *pending* roll for the shared roll popup (RollAnimationOverlay.tsx, used
 * as-is), whose own die then needs its own tap to actually roll. No session:
 * a phone roll is between you and the popup.
 */
export function rollCheck(
  rollerName: string,
  label: string,
  modifier: number,
  options?: { advantage?: AdvantageMode; critOn?: number }
): void {
  queuePendingCheck({
    label,
    modifier,
    advantage: options?.advantage ?? 'normal',
    dc: null,
    critOn: options?.critOn,
    sessionId: null,
    rollerId: 'viewer',
    rollerName
  })
}

export function rollDamage(rollerName: string, groups: DiceGroup[], modifier: number, label: string): void {
  queuePendingDamage({ label, groups, modifier, sessionId: null, rollerId: 'viewer', rollerName })
}

/** "8d6", "3d10 + 4" — one kind of standard die plus a flat amount, the only shape the desktop's damage buttons roll; null otherwise. */
export function damageRoll(dice: string): { group: DiceGroup; flat: number } | null {
  const m = /^\s*(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?\s*$/.exec(dice)
  if (!m) return null
  const sides = Number(m[2])
  if (!(DIE_SIDES as readonly number[]).includes(sides)) return null
  return { group: { count: Number(m[1]), sides: sides as DieSides }, flat: m[3] ? (m[3] === '-' ? -1 : 1) * Number(m[4]) : 0 }
}

/** The desktop sheet's advantage/disadvantage marker (see sheet/sheetBits.tsx's AdvantageTag). */
export function AdvantageTag({ kind, label }: { kind?: 'advantage' | 'disadvantage'; label: string }): JSX.Element | null {
  if (!kind) return null
  return (
    <span
      className={`v-adv-tag v-adv-tag--${kind}`}
      title={kind === 'advantage' ? `Advantage on ${label}` : `Disadvantage on ${label}`}
      aria-label={kind === 'advantage' ? `Advantage on ${label}` : `Disadvantage on ${label}`}
    >
      {kind === 'advantage' ? 'A' : 'D'}
    </span>
  )
}

const LONG_PRESS_MS = 450

/**
 * A tappable roll value. With `onRollWith`, it behaves like the desktop's
 * RollButton: a tap rolls with the sheet's own advantage, and a long press
 * (or right-click) opens Roll normally / with Advantage / with
 * Disadvantage. Stops the tap reaching a surrounding <details> summary, so
 * rolling never also expands the row.
 */
export function RollChip({
  children,
  onRoll,
  onRollWith,
  title
}: {
  children: ReactNode
  onRoll?: () => void
  onRollWith?: (advantage: AdvantageMode) => void
  title?: string
}): JSX.Element {
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const longPressed = useRef(false)

  function openMenu(x: number, y: number): void {
    if (!onRollWith) return
    longPressed.current = true
    setMenu({
      x,
      y,
      items: [
        { label: 'Roll normally', onSelect: () => onRollWith('normal') },
        { label: 'Roll with Advantage', onSelect: () => onRollWith('advantage') },
        { label: 'Roll with Disadvantage', onSelect: () => onRollWith('disadvantage') }
      ]
    })
  }

  function onPointerDown(e: PointerEvent<HTMLButtonElement>): void {
    longPressed.current = false
    if (!onRollWith || e.pointerType === 'mouse') return
    const { clientX, clientY } = e
    timer.current = setTimeout(() => openMenu(clientX, clientY), LONG_PRESS_MS)
  }

  function cancelPress(): void {
    clearTimeout(timer.current)
  }

  function onClick(e: MouseEvent<HTMLButtonElement>): void {
    e.preventDefault()
    e.stopPropagation()
    if (longPressed.current) {
      longPressed.current = false
      return
    }
    if (onRollWith) onRollWith('normal')
    else onRoll?.()
  }

  return (
    <>
      <button
        type="button"
        className="v-roll"
        title={title ?? (onRollWith ? 'Tap to roll — hold for advantage/disadvantage' : 'Tap to roll')}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        onContextMenu={(e) => {
          e.preventDefault()
          cancelPress()
          openMenu(e.clientX, e.clientY)
        }}
      >
        {children}
      </button>
      {onRollWith && <ContextMenu state={menu} onClose={() => setMenu(null)} />}
    </>
  )
}
