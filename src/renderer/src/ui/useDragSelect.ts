import { useEffect, useRef, type RefObject } from 'react'

/**
 * Drag-select for a list or grid: press on empty space inside `container`
 * and drag, and a box follows the pointer; every item (an element with a
 * `data-select-id`) the box touches is selected as it goes. Holding Ctrl or
 * Shift adds to what was already selected. A drag that ends doesn't also
 * count as a click.
 */
export function useDragSelect(container: RefObject<HTMLElement>, onSelect: (ids: string[], additive: boolean) => void, enabled = true): void {
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    const root = container.current
    if (!root || !enabled) return
    let start: { x: number; y: number; additive: boolean } | null = null
    let box: HTMLDivElement | null = null

    const down = (e: PointerEvent): void => {
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      // Only from empty space: not on an item, a control or something being typed in.
      if (target.closest('[data-select-id], button, input, textarea, select, a, [contenteditable="true"], [draggable="true"]')) return
      start = { x: e.clientX, y: e.clientY, additive: e.ctrlKey || e.metaKey || e.shiftKey }
    }
    const move = (e: PointerEvent): void => {
      if (!start) return
      const x0 = Math.min(start.x, e.clientX)
      const y0 = Math.min(start.y, e.clientY)
      const x1 = Math.max(start.x, e.clientX)
      const y1 = Math.max(start.y, e.clientY)
      if (!box) {
        if (x1 - x0 < 4 && y1 - y0 < 4) return
        box = document.createElement('div')
        box.className = 'gb-drag-select'
        document.body.appendChild(box)
        document.body.style.userSelect = 'none'
      }
      Object.assign(box.style, { left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` })
      const ids: string[] = []
      for (const el of root.querySelectorAll<HTMLElement>('[data-select-id]')) {
        const r = el.getBoundingClientRect()
        if (r.right >= x0 && r.left <= x1 && r.bottom >= y0 && r.top <= y1) ids.push(el.dataset.selectId!)
      }
      onSelectRef.current(ids, start.additive)
    }
    const up = (): void => {
      if (box) {
        box.remove()
        box = null
        document.body.style.userSelect = ''
        // The click that follows a drag-select isn't a click on what's under the pointer.
        window.addEventListener('click', swallow, { capture: true, once: true })
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
      }
      start = null
    }
    const swallow = (e: MouseEvent): void => {
      e.stopPropagation()
      e.preventDefault()
    }
    root.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      root.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      box?.remove()
    }
  }, [container, enabled])
}
