/**
 * A GFM table as data — its header, each column's alignment and its rows — read from the markdown and written back.
 * The note editor's table (MarkdownLiveEditor's TableWidget) edits a cell or adds a row through this, then puts the
 * table back as markdown, so the note stays a plain markdown string.
 */
export type Align = 'left' | 'center' | 'right' | null

export interface MdTable {
  header: string[]
  align: Align[]
  rows: string[][]
}

/** A row's cells: split on pipes that aren't escaped (`\|`), without the outer pipes, trimmed. */
function splitRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1)
  const cells: string[] = []
  let cell = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      cell += '\\|'
      i++
    } else if (s[i] === '|') {
      cells.push(cell)
      cell = ''
    } else cell += s[i]
  }
  cells.push(cell)
  return cells.map((c) => c.trim().replace(/\\\|/g, '|'))
}

/** The table in some markdown, or null if it isn't one (a header, a `---` row, then any rows). */
export function parseTable(markdown: string): MdTable | null {
  const lines = markdown.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return null
  const header = splitRow(lines[0])
  const seps = splitRow(lines[1])
  if (!seps.every((c) => /^:?-+:?$/.test(c))) return null
  const width = header.length
  const align = Array.from({ length: width }, (_, i): Align => {
    const c = seps[i] ?? ''
    return c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : null
  })
  const rows = lines.slice(2).map((l) => {
    const cells = splitRow(l)
    return Array.from({ length: width }, (_, i) => cells[i] ?? '')
  })
  return { header, align, rows }
}

/** A cell's text made safe for one table cell: no line breaks, pipes escaped. */
function cellText(value: string): string {
  return value.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim()
}

/** The table as markdown, columns padded so it reads as a table in plain text too. */
export function serializeTable(t: MdTable): string {
  const width = t.header.length
  const all = [t.header, ...t.rows].map((r) => Array.from({ length: width }, (_, i) => cellText(r[i] ?? '')))
  const widths = Array.from({ length: width }, (_, i) => Math.max(3, ...all.map((r) => r[i].length)))
  const line = (cells: string[]): string => `| ${cells.map((c, i) => c.padEnd(widths[i])).join(' | ')} |`
  const sep = `| ${t.align
    .slice(0, width)
    .map((a, i) => {
      const dashes = '-'.repeat(Math.max(3, widths[i] - (a === 'center' ? 2 : a ? 1 : 0)))
      return a === 'center' ? `:${dashes}:` : a === 'right' ? `${dashes}:` : a === 'left' ? `:${dashes}` : dashes
    })
    .join(' | ')} |`
  return [line(all[0]), sep, ...all.slice(1).map(line)].join('\n')
}

/** Sets one cell — row -1 is the header. */
export function setCell(t: MdTable, row: number, col: number, value: string): MdTable {
  if (row < 0) return { ...t, header: t.header.map((c, i) => (i === col ? value : c)) }
  return { ...t, rows: t.rows.map((r, ri) => (ri === row ? r.map((c, i) => (i === col ? value : c)) : r)) }
}

/** A blank row at `at` (0 = first body row). */
export function insertRow(t: MdTable, at: number): MdTable {
  const rows = [...t.rows]
  rows.splice(Math.max(0, Math.min(at, rows.length)), 0, t.header.map(() => ''))
  return { ...t, rows }
}

export function deleteRow(t: MdTable, at: number): MdTable {
  return { ...t, rows: t.rows.filter((_, i) => i !== at) }
}

/** A blank column at `at` (0 = first column), headed "Column N". */
export function insertColumn(t: MdTable, at: number): MdTable {
  const i = Math.max(0, Math.min(at, t.header.length))
  const put = <T>(list: T[], v: T): T[] => [...list.slice(0, i), v, ...list.slice(i)]
  return { header: put(t.header, `Column ${t.header.length + 1}`), align: put<Align>(t.align, null), rows: t.rows.map((r) => put(r, '')) }
}

/** Removes a column — but never the last one. */
export function deleteColumn(t: MdTable, at: number): MdTable {
  if (t.header.length <= 1) return t
  const drop = <T>(list: T[]): T[] => list.filter((_, i) => i !== at)
  return { header: drop(t.header), align: drop(t.align), rows: t.rows.map(drop) }
}

/** Sets a column's alignment. */
export function setAlign(t: MdTable, col: number, align: Align): MdTable {
  return { ...t, align: t.header.map((_, i) => (i === col ? align : (t.align[i] ?? null))) }
}

/** Moves body row `from` to sit at `to` (both 0-based, `to` counted before the move). */
export function moveRow(t: MdTable, from: number, to: number): MdTable {
  const rows = [...t.rows]
  const [row] = rows.splice(from, 1)
  if (!row) return t
  rows.splice(Math.max(0, Math.min(to, rows.length)), 0, row)
  return { ...t, rows }
}

/** Moves column `from` to sit at `to`, cells and alignment with it. */
export function moveColumn(t: MdTable, from: number, to: number): MdTable {
  const move = <T>(list: T[]): T[] => {
    const next = [...list]
    const [item] = next.splice(from, 1)
    next.splice(Math.max(0, Math.min(to, next.length)), 0, item)
    return next
  }
  if (from < 0 || from >= t.header.length) return t
  return { header: move(t.header), align: move(t.align), rows: t.rows.map(move) }
}

/**
 * Cells copied from a spreadsheet (Excel, Google Sheets, Numbers) arrive as tab-separated lines — that, as a table
 * with the first line as its header. Null for anything else (no tabs, a single line, or lines of different widths).
 */
export function tableFromTsv(text: string): MdTable | null {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n')
  if (lines.length < 2 || !lines.every((l) => l.includes('\t'))) return null
  const cells = lines.map((l) => l.split('\t').map((c) => c.trim()))
  // A spreadsheet gives every line the same number of cells; tab-indented code doesn't.
  const width = cells[0].length
  if (cells.some((r) => r.length !== width)) return null
  return { header: cells[0], align: Array<Align>(width).fill(null), rows: cells.slice(1) }
}

/** A roll-table cell's range: `3`, `2-4`, `5–6`, `00` (100). */
function dieRange(cell: string): [number, number] | null {
  const m = /^\s*(\d+)\s*(?:[-–—]|to)?\s*(\d+)?\s*$/.exec(cell.replace(/\+$/, ''))
  if (!m) return null
  const n = (s: string): number => (/^0+$/.test(s) ? 10 ** s.length : Number(s))
  const lo = n(m[1])
  const hi = m[2] === undefined ? lo : n(m[2])
  return lo <= hi ? [lo, hi] : null
}

/**
 * A roll table — its first column a die (`d6`, `1d20`) heading, or every row's first cell a number or range — as
 * the die's size and each row's range. Null if it isn't one.
 */
export function rollTable(t: MdTable): { sides: number; ranges: Array<[number, number] | null> } | null {
  if (t.rows.length < 2) return null
  const headed = /^\s*1?d(\d+)\s*$/i.exec(t.header[0] ?? '')
  const ranges = t.rows.map((r) => dieRange(r[0] ?? ''))
  if (!headed && ranges.some((r) => !r)) return null
  if (ranges.every((r) => !r)) return null
  const sides = headed ? Number(headed[1]) : Math.max(...ranges.map((r) => r![1]))
  return sides >= 2 ? { sides, ranges } : null
}

/** The row a roll of `value` lands on, or -1. */
export function rollTableRow(ranges: Array<[number, number] | null>, value: number): number {
  return ranges.findIndex((r) => !!r && value >= r[0] && value <= r[1])
}
