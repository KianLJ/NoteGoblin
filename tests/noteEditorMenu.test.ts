import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { insertAtCursor, pasteSpreadsheet, setLinePrefix, toggleWrap } from '../src/renderer/src/features/campaigns/noteEditorMenu'

/** Just enough of an EditorView for the menu's actions: its state, and dispatch applying to it. */
function fakeView(doc: string, anchor: number, head = anchor) {
  const view = {
    state: EditorState.create({ doc, selection: { anchor, head } }),
    dispatch(spec: Parameters<EditorState['update']>[0]) {
      view.state = view.state.update(spec).state
    },
    focus() {}
  }
  return view as unknown as import('@codemirror/view').EditorView & { state: EditorState }
}

describe('the note editor menu', () => {
  it('bolds a selection, and unbolds it again', () => {
    const v = fakeView('the ogre woke', 4, 8)
    toggleWrap(v, '**')
    expect(v.state.doc.toString()).toBe('the **ogre** woke')
    toggleWrap(v, '**')
    expect(v.state.doc.toString()).toBe('the ogre woke')
  })

  it('makes lines a heading or a list, swapping one for another, and takes it off again', () => {
    const v = fakeView('one\ntwo', 0, 7)
    setLinePrefix(v, '- ')
    expect(v.state.doc.toString()).toBe('- one\n- two')
    setLinePrefix(v, '1. ')
    expect(v.state.doc.toString()).toBe('1. one\n2. two')
    setLinePrefix(v, '1. ')
    expect(v.state.doc.toString()).toBe('one\ntwo')
    const h = fakeView('# Title', 3)
    setLinePrefix(h, '## ')
    expect(h.state.doc.toString()).toBe('## Title')
  })

  it('puts a table or divider after the line, never splitting it', () => {
    const v = fakeView('Then the ogre woke up.', 5)
    insertAtCursor(v, '---', true)
    expect(v.state.doc.toString()).toBe('Then the ogre woke up.\n\n---\n')
    const empty = fakeView('Above\n\nBelow', 6)
    insertAtCursor(empty, '---', true)
    expect(empty.state.doc.toString()).toBe('Above\n\n---\n\nBelow')
  })

  it('pastes spreadsheet cells as a table, and leaves other text alone', () => {
    const v = fakeView('Loot', 4)
    expect(pasteSpreadsheet(v, 'Item\tGold\nRuby\t50')).toBe(true)
    expect(v.state.doc.toString()).toBe('Loot\n\n| Item | Gold |\n| ---- | ---- |\n| Ruby | 50   |\n')
    expect(pasteSpreadsheet(v, 'just words')).toBe(false)
  })

  it('puts inline things right at the cursor', () => {
    const v = fakeView('Roll  now', 5)
    insertAtCursor(v, '`dice: 1d20`')
    expect(v.state.doc.toString()).toBe('Roll `dice: 1d20` now')
  })
})
