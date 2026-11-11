import { EditorSelection, type EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { NPC_NAME_RACES, generateNpcName } from '../../data/npcNames'
import { serializeTable, tableFromTsv } from '../../markdownTable'

/**
 * The note editor's own right-click menu, like a word processor's: cut, copy and paste; formatting (bold,
 * headings, lists…), each written as the markdown the note is made of; and things to insert. MarkdownLiveEditor
 * shows it, with the Hide options on top when they apply.
 */

/** A menu entry — the same shape as the app's ContextMenuItem (ui/ContextMenu.tsx), kept here so this file stays plain TypeScript. */
export interface ContextMenuItem {
  label: string
  onSelect?: () => void
  submenu?: ContextMenuItem[]
  danger?: boolean
  separatorBefore?: boolean
}

/** Wraps each selection in `mark` (`**`, `*`…) — or unwraps it if it's wrapped already. An empty selection gets the marks with the cursor between. */
export function toggleWrap(view: EditorView, mark: string): boolean {
  const { state } = view
  view.dispatch(
    state.changeByRange((range) => {
      const before = state.sliceDoc(range.from - mark.length, range.from)
      const after = state.sliceDoc(range.to, range.to + mark.length)
      if (before === mark && after === mark) {
        return {
          changes: [
            { from: range.from - mark.length, to: range.from },
            { from: range.to, to: range.to + mark.length }
          ],
          range: EditorSelection.range(range.from - mark.length, range.to - mark.length)
        }
      }
      return {
        changes: [
          { from: range.from, insert: mark },
          { from: range.to, insert: mark }
        ],
        range: EditorSelection.range(range.from + mark.length, range.to + mark.length)
      }
    })
  )
  view.focus()
  return true
}

const LINE_PREFIXES = /^(#{1,6} |> |- \[[ x]\] |- |\d+\. )/

/** The lines a selection touches. */
function selectedLines(state: EditorState): number[] {
  const lines = new Set<number>()
  for (const r of state.selection.ranges) {
    for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) lines.add(n)
  }
  return [...lines].sort((a, b) => a - b)
}

/**
 * Starts each selected line with `prefix` (`# `, `- `, `> `…), replacing whatever heading/list/quote marker it had —
 * or takes it off if every line already has it. A numbered list counts up.
 */
export function setLinePrefix(view: EditorView, prefix: string): void {
  const { state } = view
  const lines = selectedLines(state)
  const numbered = prefix === '1. '
  const has = (text: string): boolean => (numbered ? /^\d+\. /.test(text) : text.startsWith(prefix))
  const allHave = lines.every((n) => has(state.doc.line(n).text))
  const changes = lines.map((n, i) => {
    const line = state.doc.line(n)
    const existing = LINE_PREFIXES.exec(line.text)?.[0] ?? ''
    const insert = allHave ? '' : numbered ? `${i + 1}. ` : prefix
    return { from: line.from, to: line.from + existing.length, insert }
  })
  view.dispatch({ changes })
  view.focus()
}

/**
 * Puts `text` where the cursor is (or over the selection). A `block` (a table, a divider) never splits a line: it
 * goes on the cursor's line if that's empty, else on new lines after it, with a blank line between.
 */
export function insertAtCursor(view: EditorView, text: string, block = false): void {
  const { state } = view
  if (!block) {
    const { from, to } = state.selection.main
    view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } })
    view.focus()
    return
  }
  const line = state.doc.lineAt(state.selection.main.head)
  const empty = !line.text.trim()
  const at = empty ? line.from : line.to
  // Straight under a line of text, `---` would turn that text into a heading — so there's always a blank line above.
  const above = empty && line.number > 1 && state.doc.line(line.number - 1).text.trim() !== ''
  const insert = `${empty ? (above ? '\n' : '') : '\n\n'}${text}\n`
  view.dispatch({ changes: { from: at, to: empty ? line.to : at, insert }, selection: { anchor: at + insert.length } })
  view.focus()
}

/** Cells copied from a spreadsheet, put in as a table. False (nothing done) if the text isn't that. */
export function pasteSpreadsheet(view: EditorView, text: string): boolean {
  const table = tableFromTsv(text)
  if (!table) return false
  insertAtCursor(view, serializeTable(table), true)
  return true
}

async function paste(view: EditorView): Promise<void> {
  try {
    const text = await navigator.clipboard.readText()
    if (text && !pasteSpreadsheet(view, text)) view.dispatch(view.state.replaceSelection(text))
  } catch {
    /* clipboard unavailable: Ctrl+V still works */
  }
  view.focus()
}

async function copy(view: EditorView, cut: boolean): Promise<void> {
  const { state } = view
  const text = state.selection.ranges.map((r) => state.sliceDoc(r.from, r.to)).join('\n')
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    if (cut) view.dispatch(state.replaceSelection(''))
  } catch {
    /* clipboard unavailable: Ctrl+C / Ctrl+X still work */
  }
  view.focus()
}

const TABLE = '| Column 1 | Column 2 |\n| -------- | -------- |\n|          |          |'
const ROLL_TABLE = '| d6  | Result |\n| --- | ------ |\n| 1   |        |\n| 2   |        |\n| 3   |        |\n| 4   |        |\n| 5   |        |\n| 6   |        |'

/**
 * The menu. `insert` adds the note's own inserts (an image, a link to a note, a statblock from the Codex) to the
 * Insert submenu; `top` goes above everything (the Hide options).
 */
export function noteEditorMenu(view: EditorView, opts: { editable: boolean; insert: ContextMenuItem[]; top: ContextMenuItem[] }): ContextMenuItem[] {
  const hasSelection = view.state.selection.ranges.some((r) => !r.empty)
  const selectAll: ContextMenuItem = {
    label: 'Select all',
    onSelect: () => {
      view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } })
      view.focus()
    }
  }
  if (!opts.editable) return [...(hasSelection ? [{ label: 'Copy', onSelect: () => void copy(view, false) }] : []), selectAll]

  const format: ContextMenuItem[] = [
    { label: 'Bold  (Ctrl+B)', onSelect: () => toggleWrap(view, '**') },
    { label: 'Italic  (Ctrl+I)', onSelect: () => toggleWrap(view, '*') },
    { label: 'Strikethrough', onSelect: () => toggleWrap(view, '~~') },
    { label: 'Code', onSelect: () => toggleWrap(view, '`') },
    { label: 'Heading 1', separatorBefore: true, onSelect: () => setLinePrefix(view, '# ') },
    { label: 'Heading 2', onSelect: () => setLinePrefix(view, '## ') },
    { label: 'Heading 3', onSelect: () => setLinePrefix(view, '### ') },
    { label: 'Bulleted list', separatorBefore: true, onSelect: () => setLinePrefix(view, '- ') },
    { label: 'Numbered list', onSelect: () => setLinePrefix(view, '1. ') },
    { label: 'Checklist', onSelect: () => setLinePrefix(view, '- [ ] ') },
    { label: 'Quote', onSelect: () => setLinePrefix(view, '> ') }
  ]
  const insert: ContextMenuItem[] = [
    ...opts.insert,
    { label: 'Table', separatorBefore: opts.insert.length > 0, onSelect: () => insertAtCursor(view, TABLE, true) },
    { label: 'Dice roll', onSelect: () => insertAtCursor(view, '`dice: 1d20`') },
    { label: 'Roll table', onSelect: () => insertAtCursor(view, ROLL_TABLE, true) },
    { label: 'NPC name', submenu: NPC_NAME_RACES.map((race) => ({ label: race, onSelect: () => insertAtCursor(view, generateNpcName(race)) })) },
    { label: 'Divider', onSelect: () => insertAtCursor(view, '---', true) }
  ]
  // Cut and Copy only with something selected; the first of these starts its group.
  const edit: ContextMenuItem[] = [
    ...(hasSelection
      ? [
          { label: 'Cut', onSelect: () => void copy(view, true) },
          { label: 'Copy', onSelect: () => void copy(view, false) }
        ]
      : []),
    { label: 'Paste', onSelect: () => void paste(view) }
  ]
  edit[0] = { ...edit[0], separatorBefore: opts.top.length > 0 }
  return [...opts.top, ...edit, { label: 'Format', separatorBefore: true, submenu: format }, { label: 'Insert', submenu: insert }, { ...selectAll, separatorBefore: true }]
}
