import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { getStoredFontScale } from '../theme'
import { useMountAnimation } from './useMountAnimation'
import { createPortal } from 'react-dom'
import { popupLayer } from './popupLayer'

export interface ContextMenuItem {
  label: string
  icon?: ReactNode
  /** What picking it does — not needed for an item that opens a submenu. */
  onSelect?: () => void
  /** A menu that opens beside this item (on hover or click), e.g. Add ▸. */
  submenu?: ContextMenuItem[]
  danger?: boolean
  /** Draws a divider above this item, starting a new group. */
  separatorBefore?: boolean
}

export interface ContextMenuState {
  x: number
  y: number
  items: ContextMenuItem[]
}

/** Keeps the menu this far (in its own units) inside the window's edges. */
const EDGE = 8

/** Right-click menu positioned at the cursor, clamped inside the viewport. Closes on outside click, Escape, or picking an item. */
export function ContextMenu({
  state,
  onClose
}: {
  state: ContextMenuState | null
  onClose: () => void
}): JSX.Element | null {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const { rendered, closing } = useMountAnimation(state !== null)
  // `state` itself goes null the instant the caller closes it — during the
  // closing beat (see useMountAnimation) there'd be nothing left to render
  // (position, items) without remembering the last real one.
  const lastStateRef = useRef<ContextMenuState | null>(null)
  if (state) lastStateRef.current = state
  const shown = state ?? lastStateRef.current

  // Before paint, once the menu is actually in the DOM: it fades in a beat after `state` is set (see
  // useMountAnimation), and measuring before then left it unclamped at the cursor, past the window's edge.
  // Deliberately doesn't reset `pos` when `state` goes null — the menu stays where it was through the closing
  // beat, and only leaves the DOM once `rendered` flips false.
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!state || !el) return
    // The menu's own left/top are in the app's pre-font-scale units (its `position: fixed` is anchored to App.tsx's
    // scale() wrapper), while the click and the window are in screen pixels — so everything is worked out in the
    // menu's units. offsetWidth/Height are its laid-out size there.
    const scale = getStoredFontScale()
    const viewW = window.innerWidth / scale
    const viewH = window.innerHeight / scale
    // A menu taller than the window is capped (and scrolls, see maxHeight below), so it always fits.
    const height = Math.min(el.offsetHeight, viewH - EDGE * 2)
    const x = Math.min(state.x / scale, viewW - el.offsetWidth - EDGE)
    const y = Math.min(state.y / scale, viewH - height - EDGE)
    setPos({ x: Math.max(EDGE, x), y: Math.max(EDGE, y) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, rendered])

  useEffect(() => {
    if (!state) return
    function handlePointerDown(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [state, onClose])

  // Keyboard focus goes to the first item once the menu is placed, and back to where it was when the menu closes.
  useEffect(() => {
    if (!state || !pos) return
    const before = document.activeElement as HTMLElement | null
    menuItems(menuRef.current)[0]?.focus()
    return () => {
      if (before && document.contains(before) && menuRef.current?.contains(document.activeElement)) before.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, !!pos])

  if (!rendered || !shown) return null

  return createPortal(
    <div
      ref={menuRef}
      data-menu-panel
      role="menu"
      className={closing ? 'gb-card gb-pop-out' : 'gb-card'}
      style={{
        position: 'fixed',
        top: pos?.y ?? shown.y,
        left: pos?.x ?? shown.x,
        visibility: pos ? 'visible' : 'hidden',
        maxHeight: window.innerHeight / getStoredFontScale() - EDGE * 2,
        overflowY: 'auto',
        padding: 'var(--space-1)',
        minWidth: 160,
        zIndex: 100,
        boxShadow: 'var(--shadow-lg)'
      }}
      onKeyDown={moveFocus}
    >
      <ItemList items={shown.items} onDone={onClose} />
    </div>,
    popupLayer()
  )
}

/** A panel's own items (not its open submenu's), in order. */
function menuItems(panel: HTMLElement | null): HTMLElement[] {
  return panel ? [...panel.querySelectorAll<HTMLElement>(':scope > [role="menuitem"]')] : []
}

/** Up/Down (wrapping), Home and End move between a panel's items; Enter and Space press them, as buttons do anyway. */
function moveFocus(e: ReactKeyboardEvent<HTMLDivElement>): void {
  const items = menuItems(e.currentTarget)
  const at = items.indexOf(document.activeElement as HTMLElement)
  const next =
    e.key === 'ArrowDown' ? (at + 1) % items.length
    : e.key === 'ArrowUp' ? (at <= 0 ? items.length - 1 : at - 1)
    : e.key === 'Home' ? 0
    : e.key === 'End' ? items.length - 1
    : null
  if (next === null || items.length === 0) return
  e.preventDefault()
  e.stopPropagation()
  items[next].focus()
}

const itemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  textAlign: 'left',
  padding: '6px var(--space-3)',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  background: 'transparent',
  fontSize: 13,
  cursor: 'pointer'
} as const

/** A menu's items; an item with a submenu opens it beside itself (on hover or click), keeping the rest open. */
function ItemList({ items, onDone }: { items: ContextMenuItem[]; onDone: () => void }): JSX.Element {
  const [open, setOpen] = useState<number | null>(null)
  // Whether the open submenu was opened from the keyboard (Right arrow) — then its first item takes focus.
  const [byKey, setByKey] = useState(false)
  const anchors = useRef<(HTMLButtonElement | null)[]>([])
  const sub = open !== null ? items[open]?.submenu : undefined
  return (
    <>
      {items.map((item, i) => [
        item.separatorBefore && i > 0 && <div key={`sep-${i}`} style={{ height: 1, margin: '4px 6px', background: 'var(--border-subtle)' }} />,
        <button
          key={i}
          ref={(el) => {
            anchors.current[i] = el
          }}
          type="button"
          role="menuitem"
          aria-haspopup={item.submenu ? 'menu' : undefined}
          aria-expanded={item.submenu ? open === i : undefined}
          onClick={() => {
            if (item.submenu) {
              setByKey(false)
              return setOpen(open === i ? null : i)
            }
            item.onSelect?.()
            onDone()
          }}
          onKeyDown={(e) => {
            if (item.submenu && (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault()
              setByKey(true)
              setOpen(i)
            }
          }}
          onFocus={(e) => {
            e.currentTarget.style.background = 'var(--bg-sunken)'
          }}
          onBlur={(e) => {
            if (open !== i) e.currentTarget.style.background = 'transparent'
          }}
          style={{
            ...itemStyle,
            color: item.danger ? 'var(--danger)' : 'var(--text-primary)',
            background: open === i ? 'var(--bg-sunken)' : 'transparent'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-sunken)'
            setOpen(item.submenu ? i : null)
          }}
          onMouseLeave={(e) => {
            if (!item.submenu) e.currentTarget.style.background = 'transparent'
          }}
        >
          {item.icon}
          {item.label}
          {item.submenu && (
            <span aria-hidden="true" style={{ marginLeft: 'auto', paddingLeft: 12, color: 'var(--text-muted)' }}>
              ›
            </span>
          )}
        </button>
      ])}
      {sub && open !== null && anchors.current[open] && (
        <SubMenu
          anchor={anchors.current[open]!}
          items={sub}
          onDone={onDone}
          focusFirst={byKey}
          onBack={() => {
            const anchor = anchors.current[open]
            setOpen(null)
            anchor?.focus()
          }}
        />
      )}
    </>
  )
}

/** A submenu: beside its item — to the right, or the left when there's no room — and kept inside the window. */
function SubMenu({
  anchor,
  items,
  onDone,
  focusFirst,
  onBack
}: {
  anchor: HTMLElement
  items: ContextMenuItem[]
  onDone: () => void
  /** Opened with the keyboard: its first item takes focus once it's placed. */
  focusFirst: boolean
  /** Left arrow: closes it, back to its item in the menu it came from. */
  onBack: () => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    if (pos && focusFirst) menuItems(ref.current)[0]?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!pos, focusFirst])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // Same units as the main menu (see ContextMenu above): screen pixels divided by the font scale.
    const scale = getStoredFontScale()
    const viewW = window.innerWidth / scale
    const viewH = window.innerHeight / scale
    const item = anchor.getBoundingClientRect()
    const panel = (anchor.closest('[data-menu-panel]') ?? anchor).getBoundingClientRect()
    const w = el.offsetWidth
    const h = Math.min(el.offsetHeight, viewH - EDGE * 2)
    const right = panel.right / scale - 2
    const x = right + w <= viewW - EDGE ? right : Math.max(EDGE, panel.left / scale - w + 2)
    const y = Math.max(EDGE, Math.min(item.top / scale - 4, viewH - h - EDGE))
    setPos({ x, y })
  }, [anchor, items])
  return (
    <div
      ref={ref}
      data-menu-panel
      role="menu"
      className="gb-card"
      style={{
        position: 'fixed',
        top: pos?.y ?? 0,
        left: pos?.x ?? 0,
        visibility: pos ? 'visible' : 'hidden',
        maxHeight: window.innerHeight / getStoredFontScale() - EDGE * 2,
        overflowY: 'auto',
        padding: 'var(--space-1)',
        minWidth: 180,
        zIndex: 101,
        boxShadow: 'var(--shadow-lg)'
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          e.stopPropagation()
          onBack()
          return
        }
        moveFocus(e)
        // Its own keys stay its own — the menu it sits inside (in the DOM) mustn't also act on them.
        if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') e.stopPropagation()
      }}
    >
      <ItemList items={items} onDone={onDone} />
    </div>
  )
}
