import { WidgetType, type EditorView } from '@codemirror/view'
import type { ContextMenuItem, ContextMenuState } from '../../ui/ContextMenu'
import { DICE_ICON_SVG } from '../../ui/iconMarkup'
import {
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  moveColumn,
  moveRow,
  parseTable,
  rollTable,
  rollTableRow,
  serializeTable,
  setAlign,
  setCell,
  type Align,
  type MdTable
} from '../../markdownTable'

/**
 * A markdown table in the note editor, shown as a table you edit in place — it never turns back into raw
 * `| a | b |` text. Click a cell to type in it (Tab / Shift+Tab move along, Enter goes down a row and adds one
 * at the end, Escape cancels); the + strips add a row or a column; right-click a cell to insert or delete rows
 * and columns, or the table; drag a grip to move a row or a column. A roll table (a `d6` first column, or ranges
 * like `1-2`) gets a die that rolls it and lights up the row it lands on, in read-only notes too. Every change is written back as markdown (markdownTable.ts), so the note stays plain
 * text underneath. Read-only notes show the table without any of that.
 */

/** A cell to open once the table's been redrawn after a change — matched by where the table starts. */
let pendingFocus: { from: number; row: number; col: number } | null = null

export class TableWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly html: string,
    readonly canEdit: boolean,
    readonly onMenu: { current: (menu: ContextMenuState | null) => void }
  ) {
    super()
  }

  eq(other: TableWidget): boolean {
    return other.text === this.text && other.html === this.html && other.canEdit === this.canEdit
  }

  // The editor leaves clicks and keys in the table to the table — except on a link, a dice roll or a sound,
  // which it handles as it does anywhere else in the note.
  ignoreEvent(event: Event): boolean {
    const target = event.target as HTMLElement | null
    return !target?.closest?.('[data-wikilink], [data-dice-roll], [data-oneshot-cue]')
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'gb-markdown cm-live-block gb-table-edit'
    wrap.innerHTML = this.html
    const model = parseTable(this.text)
    const table = wrap.querySelector('table')
    if (!model || !table) return wrap
    addRollButton(table, model)
    if (!this.canEdit) return wrap
    const cellAt = (row: number, col: number): HTMLElement | null =>
      row < 0 ? table.querySelectorAll<HTMLElement>('thead th')[col] ?? null : (table.querySelectorAll('tbody tr')[row]?.querySelectorAll<HTMLElement>('td')[col] ?? null)
    table.querySelectorAll<HTMLElement>('thead th').forEach((th, c) => Object.assign(th.dataset, { r: '-1', c: String(c) }))
    table.querySelectorAll('tbody tr').forEach((tr, r) => tr.querySelectorAll<HTMLElement>('td').forEach((td, c) => Object.assign(td.dataset, { r: String(r), c: String(c) })))

    /** Where this table starts in the note now — or null if the note changed under it. */
    const locate = (): number | null => {
      try {
        const from = view.posAtDOM(wrap)
        return view.state.doc.sliceString(from, from + this.text.length) === this.text ? from : null
      } catch {
        return null
      }
    }

    /** Writes the table back; `focus` opens that cell in the redrawn table. */
    const apply = (next: MdTable | null, focus?: { row: number; col: number }): void => {
      const from = locate()
      if (from === null) return
      pendingFocus = focus ? { from, ...focus } : null
      if (next) view.dispatch({ changes: { from, to: from + this.text.length, insert: serializeTable(next) } })
      else {
        // The whole table, and the blank line it leaves.
        const end = Math.min(view.state.doc.length, from + this.text.length + 1)
        view.dispatch({ changes: { from, to: end, insert: '' } })
        view.focus()
      }
    }

    const valueOf = (row: number, col: number): string => (row < 0 ? model.header[col] : model.rows[row]?.[col]) ?? ''
    let editing: HTMLElement | null = null

    const open = (row: number, col: number): void => {
      const cell = cellAt(row, col)
      if (!cell || editing === cell) return
      const shown = [...cell.childNodes] // nodes, not HTML: the grip and die keep their listeners
      editing = cell
      const input = document.createElement('input')
      input.className = 'gb-table-input'
      input.value = valueOf(row, col)
      input.setAttribute('aria-label', row < 0 ? `Column ${col + 1} heading` : `Row ${row + 1}, column ${col + 1}`)
      cell.textContent = ''
      cell.classList.add('gb-tcell--editing')
      cell.appendChild(input)
      input.focus()
      input.select()
      let done = false
      const finish = (move?: { row: number; col: number }): void => {
        if (done) return
        done = true
        editing = null
        const value = input.value
        if (value === valueOf(row, col)) {
          cell.classList.remove('gb-tcell--editing')
          cell.replaceChildren(...shown)
          if (move) {
            if (move.row >= model.rows.length) apply(insertRow(model, model.rows.length), move)
            else open(move.row, move.col)
          }
          return
        }
        let next = setCell(model, row, col, value)
        if (move && move.row >= next.rows.length) next = insertRow(next, next.rows.length)
        apply(next, move)
      }
      const width = model.header.length
      input.addEventListener('keydown', (e) => {
        e.stopPropagation()
        if (e.key === 'Escape') {
          e.preventDefault()
          done = true
          editing = null
          cell.classList.remove('gb-tcell--editing')
          cell.replaceChildren(...shown)
          view.focus()
        } else if (e.key === 'Enter') {
          e.preventDefault()
          finish({ row: row + 1, col })
        } else if (e.key === 'Tab') {
          e.preventDefault()
          const index = (row + 1) * width + col + (e.shiftKey ? -1 : 1)
          if (index < 0) return finish()
          finish({ row: Math.floor(index / width) - 1, col: index % width })
        }
      })
      input.addEventListener('blur', () => finish())
    }

    wrap.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      if (target.closest('[data-wikilink], [data-dice-roll], [data-oneshot-cue], input, button, .gb-table-grip')) return
      const cell = target.closest<HTMLElement>('[data-r]')
      if (!cell) return
      e.preventDefault()
      open(Number(cell.dataset.r), Number(cell.dataset.c))
    })

    wrap.addEventListener('contextmenu', (e) => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-r]')
      if (!cell) return
      e.preventDefault()
      e.stopPropagation()
      const row = Number(cell.dataset.r)
      const col = Number(cell.dataset.c)
      const align = (label: string, a: Align): ContextMenuItem => ({
        label: (model.align[col] ?? null) === a ? `✓ ${label}` : label,
        onSelect: () => apply(setAlign(model, col, a))
      })
      const last = model.header.length - 1
      const moves: ContextMenuItem[] = [
        ...(row > 0 ? [{ label: 'Row up', onSelect: () => apply(moveRow(model, row, row - 1)) }] : []),
        ...(row >= 0 && row < model.rows.length - 1 ? [{ label: 'Row down', onSelect: () => apply(moveRow(model, row, row + 1)) }] : []),
        ...(col > 0 ? [{ label: 'Column left', onSelect: () => apply(moveColumn(model, col, col - 1)) }] : []),
        ...(col < last ? [{ label: 'Column right', onSelect: () => apply(moveColumn(model, col, col + 1)) }] : [])
      ]
      const items: ContextMenuItem[] = [
        ...(row >= 0 ? [{ label: 'Insert row above', onSelect: () => apply(insertRow(model, row)) }] : []),
        { label: 'Insert row below', onSelect: () => apply(insertRow(model, row + 1)) },
        { label: 'Insert column left', onSelect: () => apply(insertColumn(model, col)), separatorBefore: true },
        { label: 'Insert column right', onSelect: () => apply(insertColumn(model, col + 1)) },
        ...(moves.length ? [{ label: 'Move', separatorBefore: true, submenu: moves }] : []),
        { label: 'Align column', separatorBefore: !moves.length, submenu: [align('Default', null), align('Left', 'left'), align('Centre', 'center'), align('Right', 'right')] },
        ...(row >= 0 ? [{ label: 'Delete row', danger: true, separatorBefore: true, onSelect: () => apply(deleteRow(model, row)) }] : []),
        ...(model.header.length > 1 ? [{ label: 'Delete column', danger: true, separatorBefore: row < 0, onSelect: () => apply(deleteColumn(model, col)) }] : []),
        { label: 'Delete table', danger: true, separatorBefore: true, onSelect: () => apply(null) }
      ]
      this.onMenu.current({ x: e.clientX, y: e.clientY, items })
    })

    const addRow = document.createElement('button')
    addRow.type = 'button'
    addRow.className = 'gb-table-add gb-table-add--row'
    addRow.title = 'Add a row'
    addRow.setAttribute('aria-label', 'Add a row')
    addRow.textContent = '+'
    addRow.addEventListener('mousedown', (e) => e.preventDefault())
    addRow.addEventListener('click', () => apply(insertRow(model, model.rows.length), { row: model.rows.length, col: 0 }))

    const addCol = document.createElement('button')
    addCol.type = 'button'
    addCol.className = 'gb-table-add gb-table-add--col'
    addCol.title = 'Add a column'
    addCol.setAttribute('aria-label', 'Add a column')
    addCol.textContent = '+'
    addCol.addEventListener('mousedown', (e) => e.preventDefault())
    addCol.addEventListener('click', () => apply(insertColumn(model, model.header.length), { row: -1, col: model.header.length }))

    addDragGrips(table, (kind, from, to) => apply(kind === 'row' ? moveRow(model, from, to) : moveColumn(model, from, to)))

    const scroll = wrap.querySelector('.gb-table-scroll') ?? wrap
    scroll.appendChild(addCol)
    wrap.appendChild(addRow)

    // Redrawn after a change that asked for a cell (Tab, Enter, a new row or column): open it.
    // (A timeout, not an animation frame: those pause while the window's hidden. The table's in the page by then.)
    setTimeout(() => {
      if (!pendingFocus || !wrap.isConnected) return
      const from = locate()
      if (from !== pendingFocus.from) return
      const { row, col } = pendingFocus
      pendingFocus = null
      open(row, col)
    })
    return wrap
  }
}

/** A die in a roll table's first heading: rolls it, shows the number and lights up the row it lands on. */
function addRollButton(table: HTMLTableElement, model: MdTable): void {
  const roll = rollTable(model)
  const first = table.querySelector('thead th')
  if (!roll || !first) return
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'gb-table-roll'
  button.title = `Roll a d${roll.sides} on this table`
  button.setAttribute('aria-label', button.title)
  button.innerHTML = DICE_ICON_SVG
  const result = document.createElement('span')
  result.className = 'gb-table-roll-result'
  result.setAttribute('aria-live', 'polite')
  button.appendChild(result)
  button.addEventListener('mousedown', (e) => e.preventDefault())
  button.addEventListener('click', (e) => {
    e.stopPropagation()
    const value = 1 + Math.floor(Math.random() * roll.sides)
    const rows = table.querySelectorAll<HTMLElement>('tbody tr')
    rows.forEach((tr) => tr.classList.remove('gb-trow--rolled'))
    const hit = rows[rollTableRow(roll.ranges, value)]
    result.textContent = String(value)
    if (hit) {
      // Reflowed between, so landing on the same row twice still flashes.
      void hit.offsetWidth
      hit.classList.add('gb-trow--rolled')
      hit.scrollIntoView({ block: 'nearest' })
    }
  })
  first.prepend(button)
}

/**
 * Grips on each row (in its first cell) and each column (in its heading): drag one onto another row or column to
 * move it there. Pointer events rather than HTML drag and drop, which the editor around the table would fight over.
 */
const DROP_MARKS = ['above', 'below', 'left', 'right'].map((side) => `gb-tcell--drop-${side}`)

function addDragGrips(table: HTMLTableElement, move: (kind: 'row' | 'col', from: number, to: number) => void): void {
  const clearMarks = (): void =>
    table.querySelectorAll('[class*="gb-tcell--drop-"]').forEach((c) => c.classList.remove(...DROP_MARKS))
  const grip = (kind: 'row' | 'col', index: number): HTMLElement => {
    const el = document.createElement('span')
    el.className = `gb-table-grip gb-table-grip--${kind}`
    el.title = kind === 'row' ? 'Drag to move this row' : 'Drag to move this column'
    el.addEventListener('mousedown', (e) => e.preventDefault())
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      el.setPointerCapture(e.pointerId)
      table.classList.add('gb-table--dragging')
      let target = index
      const onMove = (ev: PointerEvent): void => {
        const cell = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-r]')
        if (!cell || !table.contains(cell)) return
        const at = Number(kind === 'row' ? cell.dataset.r : cell.dataset.c)
        if ((kind === 'row' && at < 0) || at === target) return
        target = at
        clearMarks()
        if (target === index) return
        const side = `gb-tcell--drop-${kind === 'row' ? (target < index ? 'above' : 'below') : target < index ? 'left' : 'right'}`
        const cells = kind === 'row' ? table.querySelectorAll(`tbody tr:nth-child(${target + 1}) td`) : table.querySelectorAll(`tr > :nth-child(${target + 1})`)
        cells.forEach((c) => c.classList.add(side))
      }
      const onUp = (): void => {
        el.removeEventListener('pointermove', onMove)
        el.removeEventListener('pointerup', onUp)
        el.removeEventListener('pointercancel', onUp)
        table.classList.remove('gb-table--dragging')
        clearMarks()
        if (target !== index) move(kind, index, target)
      }
      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerup', onUp)
      el.addEventListener('pointercancel', onUp)
    })
    return el
  }
  table.querySelectorAll('tbody tr').forEach((tr, r) => tr.querySelector('td')?.prepend(grip('row', r)))
  table.querySelectorAll('thead th').forEach((th, c) => th.append(grip('col', c)))
}
