import { describe, expect, it } from 'vitest'
import {
  FormulaError,
  evaluateDice,
  evaluateNumber,
  formatDice,
  formulaReferences,
  formulaSyntaxError,
  type RefResolver
} from '@shared/content/formula'

const refs: Record<string, number> = {
  'str.mod': 3,
  'dex.mod': 2,
  level: 7,
  prof: 3,
  'class.open-hand.level': 5,
  'table.martialArts': 8
}
const resolve: RefResolver = (path, index) => {
  const key = path.join('.')
  if (key === 'table.rage') return [2, 2, 3, 3, 4][index ?? 0] ?? 0
  if (!(key in refs)) throw new FormulaError(`Unknown reference @${key}`)
  return refs[key]
}
const num = (src: string): number => evaluateNumber(src, resolve)
const dice = (src: string): string => formatDice(evaluateDice(src, resolve))

describe('formula numbers', () => {
  it('follows arithmetic precedence', () => {
    expect(num('2 + 3 * 4')).toBe(14)
    expect(num('(2 + 3) * 4')).toBe(20)
    expect(num('10 - 4 - 3')).toBe(3)
    expect(num('-2 * 3')).toBe(-6)
    expect(num('7 % 4')).toBe(3)
    expect(num('9 / 2')).toBe(4.5)
  })

  it('reads references, including dashed segments and subtraction right after a name', () => {
    expect(num('@str.mod + @prof')).toBe(6)
    expect(num('@class.open-hand.level')).toBe(5)
    expect(num('@str.mod-1')).toBe(2)
    expect(num('@level-@prof')).toBe(4)
  })

  it('supports indexed references', () => {
    expect(num('@table.rage[2]')).toBe(3)
    expect(num('@table.rage[@prof - 1]')).toBe(3)
  })

  it('supports functions', () => {
    expect(num('floor(@level / 2)')).toBe(3)
    expect(num('ceil(@level / 2)')).toBe(4)
    expect(num('max(1, @str.mod - 5)')).toBe(1)
    expect(num('min(@str.mod, @dex.mod, 9)')).toBe(2)
    expect(num('clamp(@level * 3, 0, 20)')).toBe(20)
    expect(num('abs(-4) + sign(-9) + round(2.5)')).toBe(6)
  })

  it('supports comparisons, logic and conditionals as 1/0 numbers', () => {
    expect(num('@level >= 5')).toBe(1)
    expect(num('@level >= 5 && @prof > 3')).toBe(0)
    expect(num('@level >= 5 || @prof > 3')).toBe(1)
    expect(num('!0 + !5')).toBe(1)
    expect(num('@level >= 17 ? 4 : @level >= 9 ? 3 : 2')).toBe(2)
    expect(num('true + true')).toBe(2)
  })

  it('rejects dice where a plain number is required', () => {
    expect(() => num('1d6 + 2')).toThrow(FormulaError)
  })

  it('reports unknown references and division by zero', () => {
    expect(() => num('@nope')).toThrow(/Unknown reference @nope/)
    expect(() => num('4 / 0')).toThrow(/Division by zero/)
  })
})

describe('formula dice', () => {
  it('evaluates and formats dice with flat modifiers', () => {
    expect(dice('2d6 + @str.mod')).toBe('2d6 + 3')
    expect(dice('1d8 - 1')).toBe('1d8 - 1')
    expect(dice('d20')).toBe('1d20')
    expect(dice('4')).toBe('4')
  })

  it('allows formula-driven counts and sides', () => {
    expect(dice('1d@table.martialArts + @dex.mod')).toBe('1d8 + 2')
    expect(dice('(floor(@level / 2))d6')).toBe('3d6')
    expect(dice('@prof d4')).toBe('3d4')
  })

  it('merges same-sided groups and sorts largest die first', () => {
    expect(dice('1d6 + 1d8 + 2d6')).toBe('1d8 + 3d6')
  })

  it('scales dice by whole numbers', () => {
    expect(dice('1d6 * 3')).toBe('3d6')
    expect(() => dice('1d6 * 1.5')).toThrow(FormulaError)
  })

  it('treats zero dice as nothing', () => {
    expect(dice('0d6 + 2')).toBe('2')
  })
})

describe('formula syntax', () => {
  it('reports syntax errors with positions', () => {
    expect(formulaSyntaxError('@str.mod +')).toMatch(/ended early/)
    expect(formulaSyntaxError('2 ** 3')).toMatch(/Unexpected "\*"/)
    expect(formulaSyntaxError('foo(1)')).toMatch(/Unknown function or name "foo"/)
    expect(formulaSyntaxError('max()')).toMatch(/takes 1\+ arguments/)
    expect(formulaSyntaxError('clamp(1, 2)')).toMatch(/takes 3 arguments/)
    expect(formulaSyntaxError('(1 + 2')).toMatch(/Expected "\)"/)
    expect(formulaSyntaxError('1 $ 2')).toMatch(/Unexpected character "\$" \(at character 3\)/)
    expect(formulaSyntaxError('')).toMatch(/empty/)
    expect(formulaSyntaxError('@str.mod + floor(@level / 2)')).toBeNull()
  })

  it('lists every reference a formula reads', () => {
    expect(formulaReferences('@a.b + max(@c, @table.x[@d])')).toEqual([['a', 'b'], ['c'], ['table', 'x'], ['d']])
  })
})
