import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { popupLayer } from '../../ui/popupLayer'
import { getStoredFontScale } from '../../theme'
import type { BestiaryMonster } from '../../data/bestiary'
import { formatCr } from '../../data/bestiary'
import { isCustomMonster } from '../../data/customBestiary'
import { HoverDetailCard } from '../player/HoverDetailCard'
import { renderStatblockHtml } from '../../statblock'
import { PlusIcon } from '../../ui/icons'
import { rankByName } from '@shared/rankByName'

const SHOWN = 30

/**
 * A search box for picking a monster: type to narrow the list, hover one for
 * its statblock, click it or press Enter (arrow keys move) to pick. Stays open
 * after a pick so several can be added in a row; Escape or a click elsewhere
 * closes it.
 */
export function MonsterPicker({
  monsters,
  onPick,
  placeholder = 'Add an enemy…'
}: {
  monsters: BestiaryMonster[]
  onPick: (monster: BestiaryMonster) => void
  placeholder?: string
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  // Where the list sits on screen, under the box. It's drawn in the pop-up layer, outside the zoomed canvas, so its
  // text stays sharp at any zoom and a box's edge can't cut it off.
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null)
  const ranked = useMemo(() => rankByName(monsters, query), [monsters, query])
  const shown = ranked.slice(0, SHOWN)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      const target = e.target as Node
      if (!wrapRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  // Follows the box while open (the canvas can pan or zoom under it). In the pop-up layer's units, which are the
  // screen's divided by the app's font scale.
  useEffect(() => {
    if (!open) return
    let frame = 0
    const follow = (): void => {
      const r = wrapRef.current?.getBoundingClientRect()
      if (r) {
        const scale = getStoredFontScale()
        const next = { left: r.left / scale, top: (r.bottom + 4) / scale, width: Math.max(220, r.width / scale) }
        setPos((p) => (p && p.left === next.left && p.top === next.top && p.width === next.width ? p : next))
      }
      frame = requestAnimationFrame(follow)
    }
    follow()
    return () => cancelAnimationFrame(frame)
  }, [open])
  useEffect(() => setActive(0), [query])
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function pick(monster: BestiaryMonster): void {
    onPick(monster)
    setQuery('')
  }

  return (
    <div ref={wrapRef} className="mp">
      <input
        className="gb-input mp-input"
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setActive((a) => Math.min(a + 1, shown.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, 0))
          } else if (e.key === 'Enter' && shown[active]) {
            e.preventDefault()
            pick(shown[active])
          } else if (e.key === 'Escape') {
            setOpen(false)
            e.currentTarget.blur()
          }
        }}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={placeholder}
      />
      {open &&
        pos &&
        createPortal(
          <div ref={listRef} id={listId} className="mp-list" role="listbox" style={{ left: pos.left, top: pos.top, width: pos.width }}>
            {shown.length === 0 ? (
              <div className="mp-none">No monsters match “{query}”</div>
            ) : (
              <>
                {shown.map((m, i) => (
                  <HoverDetailCard key={m.index} bodyHtml={renderStatblockHtml(m)} width={460} interceptWheel={false}>
                    <button
                      type="button"
                      data-i={i}
                      role="option"
                      aria-selected={i === active}
                      className={`mp-item${i === active ? ' mp-item--active' : ''}`}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => pick(m)}
                    >
                      <PlusIcon size={11} />
                      <span className="mp-name">
                        {m.name}
                        {isCustomMonster(m.index) && <small> · custom</small>}
                        {'packName' in m && typeof m.packName === 'string' && <small> · {m.packName}</small>}
                      </span>
                      <span className="mp-cr">CR {formatCr(m.crNumeric)}</span>
                    </button>
                  </HoverDetailCard>
                ))}
                {ranked.length > SHOWN && <div className="mp-none">{ranked.length - SHOWN} more: keep typing to narrow it down</div>}
              </>
            )}
          </div>,
          popupLayer()
        )}
    </div>
  )
}
