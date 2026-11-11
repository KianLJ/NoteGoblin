import { describe, expect, it } from 'vitest'
import { deleteColumn, deleteRow, insertColumn, insertRow, parseTable, serializeTable, setCell } from '../src/renderer/src/markdownTable'

const TABLE = ['| Name | HP | Notes |', '| :--- | :-: | ---: |', '| Goblin | 7 | sneaky \\| fast |', '| Ogre | 59 |'].join('\n')

describe('markdown tables', () => {
  it('reads the header, alignments and rows, filling short rows and keeping escaped pipes', () => {
    expect(parseTable(TABLE)).toEqual({
      header: ['Name', 'HP', 'Notes'],
      align: ['left', 'center', 'right'],
      rows: [
        ['Goblin', '7', 'sneaky | fast'],
        ['Ogre', '59', '']
      ]
    })
  })

  it('is not a table without the dashes row', () => {
    expect(parseTable('| a | b |\n| c | d |')).toBeNull()
    expect(parseTable('just text')).toBeNull()
  })

  it('writes back what it read, padded and with alignments and pipes intact', () => {
    const out = serializeTable(parseTable(TABLE)!)
    expect(out.split('\n')[1]).toMatch(/^\| :-+ \| :-+: \| -+: \|$/)
    expect(parseTable(out)).toEqual(parseTable(TABLE))
  })

  it('edits cells and adds and removes rows and columns', () => {
    let t = parseTable(TABLE)!
    t = setCell(t, -1, 0, 'Creature')
    t = setCell(t, 1, 2, 'big\nslow')
    t = insertRow(t, 1)
    t = insertColumn(t, 1)
    expect(t.header).toEqual(['Creature', 'Column 4', 'HP', 'Notes'])
    expect(t.rows.map((r) => r.length)).toEqual([4, 4, 4])
    expect(t.rows[1]).toEqual(['', '', '', ''])
    t = deleteRow(t, 1)
    t = deleteColumn(t, 1)
    // A line break in a cell becomes a space, so the table stays one row per line.
    expect(parseTable(serializeTable(t))!.rows[1]).toEqual(['Ogre', '59', 'big slow'])
  })

  it('never deletes the last column', () => {
    const one = parseTable('| a |\n| --- |\n| b |')!
    expect(deleteColumn(one, 0)).toBe(one)
  })
})

describe('more table edits', () => {
  it('sets alignment and moves rows and columns', async () => {
    const { setAlign, moveRow, moveColumn } = await import('../src/renderer/src/markdownTable')
    const t = parseTable(TABLE)!
    expect(setAlign(t, 0, 'right').align).toEqual(['right', 'center', 'right'])
    expect(moveRow(t, 0, 1).rows.map((r) => r[0])).toEqual(['Ogre', 'Goblin'])
    const m = moveColumn(t, 2, 0)
    expect(m.header).toEqual(['Notes', 'Name', 'HP'])
    expect(m.align).toEqual(['right', 'left', 'center'])
    expect(m.rows[0]).toEqual(['sneaky | fast', 'Goblin', '7'])
  })

  it('turns cells copied from a spreadsheet into a table', async () => {
    const { tableFromTsv } = await import('../src/renderer/src/markdownTable')
    expect(tableFromTsv('Name\tHP\r\nGoblin\t7\r\nOgre\t59\r\n')).toEqual({ header: ['Name', 'HP'], align: [null, null], rows: [['Goblin', '7'], ['Ogre', '59']] })
    expect(tableFromTsv('one line\twith a tab')).toBeNull()
    expect(tableFromTsv('two\nplain lines')).toBeNull()
    expect(tableFromTsv('if (x) {\n\treturn y\n\t}')).toBeNull()
  })

  it('knows a roll table, and which row a roll lands on', async () => {
    const { rollTable, rollTableRow } = await import('../src/renderer/src/markdownTable')
    const d6 = rollTable(parseTable('| d6 | Result |\n| - | - |\n| 1-2 | Rats |\n| 3–5 | Goblins |\n| 6 | Ogre |')!)!
    expect(d6.sides).toBe(6)
    expect([1, 3, 6].map((v) => rollTableRow(d6.ranges, v))).toEqual([0, 1, 2])
    expect(rollTable(parseTable('| # | Result |\n| - | - |\n| 1-50 | Rain |\n| 51-00 | Sun |')!)!.sides).toBe(100)
    expect(rollTable(parseTable(TABLE)!)).toBeNull()
  })
})
