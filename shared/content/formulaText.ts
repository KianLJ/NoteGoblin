// A formula read back in plain English for the Workshop — "floor(@cha.mod
// / 2)" → "half your Charisma modifier, rounded down" — so authors can check
// a formula says what they meant without knowing the syntax.

import { parseFormula, type FormulaNode } from './formula'

const ABILITY: Record<string, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }

/** Optional names for pack things: `name('stat', 'output')` → "Channel Power". */
export type NameLookup = (kind: 'stat' | 'counter' | 'alias' | 'resource' | 'class' | 'skill' | 'column', id: string) => string | undefined

function refText(path: string[], name: NameLookup): string {
  const [head, a, b] = path
  const n = (kind: Parameters<NameLookup>[0], id: string): string => name(kind, id) ?? id
  if (path.length === 1) {
    switch (head) {
      case 'level':
        return 'your level'
      case 'prof':
        return 'your proficiency bonus'
      case 'classLevel':
        return 'your level in this class'
      case 'highestClassLevel':
        return 'your highest class level'
      case 'archetypeLevel':
        return "this archetype's level"
      case 'spent':
        return 'the amount spent'
      case 'slotLevel':
        return 'the spell slot level'
      case 'value':
        return 'the current value'
      case 'initiative':
        return 'your initiative'
      case 'ac':
        return 'your AC'
      case 'reactions':
        return 'your reactions'
    }
  }
  if (ABILITY[head]) return path.length === 2 && a === 'mod' ? `your ${ABILITY[head]} modifier` : `your ${ABILITY[head]} score`
  if (head === 'self' && ABILITY[a]) return b === 'mod' ? `its ${ABILITY[a]} modifier` : `its ${ABILITY[a]} score`
  if (head === 'table' && a) return `the ${n('column', a)} column`
  if (head === 'stat' && a) return n('stat', a)
  if (head === 'counter' && a) return n('counter', a)
  if (head === 'alias' && a) return b === 'mod' ? `your ${n('alias', a)} modifier` : `your ${n('alias', a)} score`
  if (head === 'resource' && a) return b === 'remaining' ? `${n('resource', a)} left` : b === 'used' ? `${n('resource', a)} spent` : `your ${n('resource', a)} maximum`
  if (head === 'class' && a && b === 'level') return `your ${n('class', a)} level`
  if (head === 'class' && a && b === 'table') return `the ${n('class', a)} ${path[3] ?? ''} column`.replace(/\s+/g, ' ')
  if (head === 'hp' && a === 'max') return 'your max HP'
  if (head === 'hp' && a === 'current') return 'your current HP'
  if (head === 'spell' && a === 'dc') return 'your spell save DC'
  if (head === 'spell' && a === 'attack') return 'your spell attack bonus'
  if (head === 'spell' && a === 'mod') return 'your spellcasting modifier'
  if (head === 'skill' && a) return `your ${n('skill', a)} bonus`
  if (head === 'save' && ABILITY[a]) return `your ${ABILITY[a]} save`
  if (head === 'speed' && a) return `your ${a === 'walk' ? 'walking' : a} speed`
  if (head === 'condition' && a) return `the ${a} level`
  return `@${path.join('.')}`
}

const isNum = (node: FormulaNode, v?: number): boolean => node.type === 'num' && (v === undefined || node.value === v)

function text(node: FormulaNode, name: NameLookup, top = false): string {
  switch (node.type) {
    case 'num':
      return String(node.value)
    case 'ref':
      return refText(node.path, name)
    case 'unary':
      return node.op === '-' ? `minus ${text(node.operand, name)}` : `not ${text(node.operand, name)}`
    case 'dice': {
      const sides = text(node.sides, name)
      if (isNum(node.count)) return `${text(node.count, name)}d${sides}`
      return `a d${sides} for each point of ${text(node.count, name)}`.replace('of the amount spent', 'spent')
    }
    case 'cond':
      return `${text(node.then, name)} if ${text(node.test, name)}, otherwise ${text(node.else, name)}`
    case 'call': {
      const [x, y] = node.args
      if ((node.fn === 'floor' || node.fn === 'ceil') && x?.type === 'binary' && x.op === '/' && isNum(x.right, 2)) {
        return `half ${text(x.left, name)}, rounded ${node.fn === 'floor' ? 'down' : 'up'}`
      }
      if ((node.fn === 'floor' || node.fn === 'ceil') && x?.type === 'binary' && x.op === '/' && x.right.type === 'num') {
        return `${text(x.left, name)} divided by ${x.right.value}, rounded ${node.fn === 'floor' ? 'down' : 'up'}`
      }
      if (node.fn === 'floor') return `${text(x, name)}, rounded down`
      if (node.fn === 'ceil') return `${text(x, name)}, rounded up`
      if (node.fn === 'round') return `${text(x, name)}, rounded`
      if (node.fn === 'abs') return `the size of ${text(x, name)}`
      if (node.fn === 'max' && node.args.length === 2 && x.type === 'num') return `${text(y, name)} (at least ${x.value})`
      if (node.fn === 'max' && node.args.length === 2 && y.type === 'num') return `${text(x, name)} (at least ${y.value})`
      if (node.fn === 'min' && node.args.length === 2 && x.type === 'num') return `${text(y, name)} (at most ${x.value})`
      if (node.fn === 'min' && node.args.length === 2 && y.type === 'num') return `${text(x, name)} (at most ${y.value})`
      if (node.fn === 'max') return `the highest of ${list(node.args.map((a) => text(a, name)))}`
      if (node.fn === 'min') return `the lowest of ${list(node.args.map((a) => text(a, name)))}`
      if (node.fn === 'clamp') return `${text(x, name)}, kept between ${text(y, name)} and ${text(node.args[2], name)}`
      return `${node.fn}(${node.args.map((a) => text(a, name)).join(', ')})`
    }
    case 'binary': {
      const l = text(node.left, name)
      const r = text(node.right, name)
      let out: string
      switch (node.op) {
        case '+':
          out = `${l} + ${r}`
          break
        case '-':
          out = `${l} − ${r}`
          break
        case '*':
          out = isNum(node.left) ? `${node.left.type === 'num' ? node.left.value : l} × ${r}` : `${l} × ${r}`
          break
        case '/':
          out = isNum(node.right, 2) ? `half ${l}` : `${l} ÷ ${r}`
          break
        case '%':
          out = `the remainder of ${l} ÷ ${r}`
          break
        case '>=':
          out = `${l} is at least ${r}`
          break
        case '>':
          out = `${l} is more than ${r}`
          break
        case '<=':
          out = `${l} is at most ${r}`
          break
        case '<':
          out = `${l} is less than ${r}`
          break
        case '==':
          out = `${l} is ${r}`
          break
        case '!=':
          out = `${l} isn't ${r}`
          break
        case '&&':
          out = `${l} and ${r}`
          break
        case '||':
          out = `${l} or ${r}`
          break
      }
      // Group a sub-sum inside a product so "(a + b) × 2" doesn't read as "a + b × 2".
      return !top && (node.op === '+' || node.op === '-') ? `(${out})` : out
    }
  }
}

function list(items: string[]): string {
  return items.length <= 2 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** The formula in plain English, or null when it's a plain number or doesn't parse. */
export function describeFormula(src: string, name: NameLookup = () => undefined): string | null {
  if (!src.trim() || /^\s*-?\d+(\.\d+)?\s*$/.test(src)) return null
  try {
    const node = parseFormula(src)
    const out = text(node, name, true)
    return out.charAt(0).toUpperCase() + out.slice(1)
  } catch {
    return null
  }
}
