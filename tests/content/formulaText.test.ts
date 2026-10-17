import { describe, expect, it } from 'vitest'
import { describeFormula } from '@shared/content/formulaText'

describe('formulas in plain English', () => {
  const names = (kind: string, id: string): string | undefined =>
    (({ 'stat:output': 'Channel Power', 'alias:ce': 'Mana', 'resource:mana': 'Mana', 'column:manaPool': 'Mana' }) as Record<string, string>)[`${kind}:${id}`]

  it.each([
    ['floor(@cha.mod / 2)', 'Half your Charisma modifier, rounded down'],
    ['@prof + @wis.mod', 'Your proficiency bonus + your Wisdom modifier'],
    ['max(1, @alias.ce.mod)', 'Your Mana modifier (at least 1)'],
    ['@table.manaPool + @alias.ce.mod', 'The Mana column + your Mana modifier'],
    ['2d6 + @str.mod', '2d6 + your Strength modifier'],
    ['(@spent)d8', 'A d8 for each point spent'],
    ['@level >= 5 ? 2 : 1', '2 if your level is at least 5, otherwise 1'],
    ['10 * @spent', '10 × the amount spent'],
    ['(@classLevel + 1) * 2', '(your level in this class + 1) × 2'],
    ['@stat.output', 'Channel Power'],
    ['@resource.mana.remaining', 'Mana left']
  ])('%s', (src, expected) => {
    expect(describeFormula(src, names as never)).toBe(expected)
  })

  it('leaves plain numbers and broken formulas alone', () => {
    expect(describeFormula('3')).toBeNull()
    expect(describeFormula('1 +')).toBeNull()
    expect(describeFormula('')).toBeNull()
  })
})
