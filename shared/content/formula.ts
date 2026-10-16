// The formula language packs use for every number: resource maxima, AC
// formulas, damage dice, prepared-spell limits, custom stats. Parsed into a
// small AST by hand — never eval'd — so an imported pack can't run code.
//
// Grammar (lowest to highest precedence):
//   cond ? a : b
//   a || b            a && b
//   == != < <= > >=
//   + -               * / %
//   unary - !
//   NdM dice          (count and sides may be any primary, e.g. 1d@table.martialArts, (2*@level)d6)
//   primary: number | true | false | @ref.path | @ref.path[expr] | fn(args) | ( expr )
//
// Functions: floor ceil round abs min max clamp(x, lo, hi) sign.
// Booleans are numbers (true = 1, false = 0), and any nonzero value is truthy.
//
// References start with @ and are dot-separated segments; a segment may
// contain letters, digits, _ and - (a "-" only counts as part of the name
// when a letter follows it, so "@str.mod-1" is subtraction). The engine
// supplies their values — see engine.ts's resolveRef.

export type FormulaNode =
  | { type: 'num'; value: number }
  | { type: 'ref'; path: string[]; index?: FormulaNode }
  | { type: 'unary'; op: '-' | '!'; operand: FormulaNode }
  | { type: 'binary'; op: BinaryOp; left: FormulaNode; right: FormulaNode }
  | { type: 'cond'; test: FormulaNode; then: FormulaNode; else: FormulaNode }
  | { type: 'call'; fn: FunctionName; args: FormulaNode[] }
  | { type: 'dice'; count: FormulaNode; sides: FormulaNode }

type BinaryOp = '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '<' | '<=' | '>' | '>=' | '&&' | '||'

const FUNCTIONS = {
  floor: { arity: [1, 1] },
  ceil: { arity: [1, 1] },
  round: { arity: [1, 1] },
  abs: { arity: [1, 1] },
  sign: { arity: [1, 1] },
  min: { arity: [1, Infinity] },
  max: { arity: [1, Infinity] },
  clamp: { arity: [3, 3] }
} as const
type FunctionName = keyof typeof FUNCTIONS

export class FormulaError extends Error {
  constructor(
    message: string,
    /** 0-based character offset into the formula, when known. */
    readonly position?: number
  ) {
    super(position !== undefined ? `${message} (at character ${position + 1})` : message)
    this.name = 'FormulaError'
  }
}

// ---------------------------------------------------------------------------
// Tokenizer

type Token =
  | { kind: 'num'; value: number; pos: number }
  | { kind: 'ref'; path: string[]; pos: number }
  | { kind: 'ident'; name: string; pos: number }
  | { kind: 'dice'; pos: number }
  | { kind: 'op'; op: string; pos: number }
  | { kind: 'eof'; pos: number }

const OPERATORS = ['==', '!=', '<=', '>=', '&&', '||', '+', '-', '*', '/', '%', '<', '>', '!', '?', ':', '(', ')', '[', ']', ',']

function isDigit(c: string): boolean {
  return c >= '0' && c <= '9'
}
function isLetter(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_'
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++
      continue
    }
    const start = i
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] ?? ''))) {
      while (i < src.length && (isDigit(src[i]) || src[i] === '.')) i++
      const text = src.slice(start, i)
      const value = Number(text)
      if (!Number.isFinite(value)) throw new FormulaError(`Invalid number "${text}"`, start)
      tokens.push({ kind: 'num', value, pos: start })
      // "2d6": a 'd' directly after a number is the dice operator.
      if (src[i] === 'd' && !isLetter(src[i + 1] ?? '')) {
        tokens.push({ kind: 'dice', pos: i })
        i++
      }
      continue
    }
    if (c === '@') {
      i++
      const path: string[] = []
      for (;;) {
        const segStart = i
        while (i < src.length) {
          const ch = src[i]
          if (isLetter(ch) || isDigit(ch)) i++
          else if (ch === '-' && isLetter(src[i + 1] ?? '') && i > segStart) i++
          else break
        }
        if (i === segStart) throw new FormulaError('Expected a name after "@" or "."', segStart)
        path.push(src.slice(segStart, i))
        if (src[i] === '.' && (isLetter(src[i + 1] ?? '') || isDigit(src[i + 1] ?? ''))) {
          i++
          continue
        }
        break
      }
      tokens.push({ kind: 'ref', path, pos: start })
      continue
    }
    if (isLetter(c)) {
      while (i < src.length && (isLetter(src[i]) || isDigit(src[i]))) i++
      const name = src.slice(start, i)
      // A bare "d" (e.g. "d20", or ")d6") is the dice operator with an implied count of 1 / the preceding group.
      if (name === 'd' || /^d\d+$/.test(name)) {
        tokens.push({ kind: 'dice', pos: start })
        i = start + 1
        continue
      }
      tokens.push({ kind: 'ident', name, pos: start })
      continue
    }
    const op = OPERATORS.find((o) => src.startsWith(o, i))
    if (!op) throw new FormulaError(`Unexpected character "${c}"`, i)
    tokens.push({ kind: 'op', op, pos: i })
    i += op.length
  }
  tokens.push({ kind: 'eof', pos: src.length })
  return tokens
}

// ---------------------------------------------------------------------------
// Parser (precedence climbing)

const BINARY_PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6
}

class Parser {
  private i = 0
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.i]
  }
  private next(): Token {
    return this.tokens[this.i++]
  }
  private isOp(op: string): boolean {
    const t = this.peek()
    return t.kind === 'op' && t.op === op
  }
  private expectOp(op: string): void {
    const t = this.next()
    if (t.kind !== 'op' || t.op !== op) throw new FormulaError(`Expected "${op}"`, t.pos)
  }

  parse(): FormulaNode {
    const node = this.parseConditional()
    const t = this.peek()
    if (t.kind !== 'eof') throw new FormulaError('Unexpected input', t.pos)
    return node
  }

  private parseConditional(): FormulaNode {
    const test = this.parseBinary(1)
    if (!this.isOp('?')) return test
    this.next()
    const then = this.parseConditional()
    this.expectOp(':')
    const otherwise = this.parseConditional()
    return { type: 'cond', test, then, else: otherwise }
  }

  private parseBinary(minPrecedence: number): FormulaNode {
    let left = this.parseUnary()
    for (;;) {
      const t = this.peek()
      if (t.kind !== 'op') break
      const precedence = BINARY_PRECEDENCE[t.op]
      if (precedence === undefined || precedence < minPrecedence) break
      this.next()
      const right = this.parseBinary(precedence + 1)
      left = { type: 'binary', op: t.op as BinaryOp, left, right }
    }
    return left
  }

  private parseUnary(): FormulaNode {
    if (this.isOp('-') || this.isOp('!')) {
      const op = (this.next() as { op: '-' | '!' }).op
      return { type: 'unary', op, operand: this.parseUnary() }
    }
    if (this.isOp('+')) {
      this.next()
      return this.parseUnary()
    }
    return this.parseDice()
  }

  /** Dice bind tighter than * and unary minus: "-2d6" is -(2d6), "2d6*2" is (2d6)*2. */
  private parseDice(): FormulaNode {
    if (this.peek().kind === 'dice') {
      this.next()
      return { type: 'dice', count: { type: 'num', value: 1 }, sides: this.parsePrimary() }
    }
    const count = this.parsePrimary()
    if (this.peek().kind === 'dice') {
      this.next()
      return { type: 'dice', count, sides: this.parsePrimary() }
    }
    return count
  }

  private parsePrimary(): FormulaNode {
    const t = this.next()
    switch (t.kind) {
      case 'num':
        return { type: 'num', value: t.value }
      case 'ref': {
        if (this.isOp('[')) {
          this.next()
          const index = this.parseConditional()
          this.expectOp(']')
          return { type: 'ref', path: t.path, index }
        }
        return { type: 'ref', path: t.path }
      }
      case 'ident': {
        if (t.name === 'true') return { type: 'num', value: 1 }
        if (t.name === 'false') return { type: 'num', value: 0 }
        if (!(t.name in FUNCTIONS)) throw new FormulaError(`Unknown function or name "${t.name}" (references start with @)`, t.pos)
        const fn = t.name as FunctionName
        this.expectOp('(')
        const args: FormulaNode[] = []
        if (!this.isOp(')')) {
          args.push(this.parseConditional())
          while (this.isOp(',')) {
            this.next()
            args.push(this.parseConditional())
          }
        }
        this.expectOp(')')
        const [lo, hi] = FUNCTIONS[fn].arity
        if (args.length < lo || args.length > hi) throw new FormulaError(`${fn}() takes ${lo === hi ? lo : `${lo}+`} argument${lo === 1 && hi === 1 ? '' : 's'}`, t.pos)
        return { type: 'call', fn, args }
      }
      case 'op':
        if (t.op === '(') {
          const inner = this.parseConditional()
          this.expectOp(')')
          return inner
        }
        throw new FormulaError(`Unexpected "${t.op}"`, t.pos)
      case 'dice':
        throw new FormulaError('Unexpected "d"', t.pos)
      case 'eof':
        throw new FormulaError('Formula ended early', t.pos)
    }
  }
}

const parseCache = new Map<string, FormulaNode>()

/** Parses (and caches) a formula. Throws FormulaError on a syntax error. */
export function parseFormula(src: string): FormulaNode {
  const cached = parseCache.get(src)
  if (cached) return cached
  if (!src.trim()) throw new FormulaError('Formula is empty')
  const node = new Parser(tokenize(src)).parse()
  if (parseCache.size > 5000) parseCache.clear()
  parseCache.set(src, node)
  return node
}

/** Syntax check only — null when the formula parses, otherwise the error message. */
export function formulaSyntaxError(src: string): string | null {
  try {
    parseFormula(src)
    return null
  } catch (e) {
    return e instanceof FormulaError ? e.message : String(e)
  }
}

/** Every @reference the formula reads, for validation and dependency tracking. */
export function formulaReferences(src: string): string[][] {
  const refs: string[][] = []
  const walk = (n: FormulaNode): void => {
    switch (n.type) {
      case 'ref':
        refs.push(n.path)
        if (n.index) walk(n.index)
        break
      case 'unary':
        walk(n.operand)
        break
      case 'binary':
        walk(n.left)
        walk(n.right)
        break
      case 'cond':
        walk(n.test)
        walk(n.then)
        walk(n.else)
        break
      case 'call':
        n.args.forEach(walk)
        break
      case 'dice':
        walk(n.count)
        walk(n.sides)
        break
    }
  }
  walk(parseFormula(src))
  return refs
}

// ---------------------------------------------------------------------------
// Evaluation

/** Supplies @reference values. `index` is the evaluated [..] subscript, if any. Throw FormulaError for an unknown reference. */
export type RefResolver = (path: string[], index: number | undefined) => number

/** A dice expression after evaluation: a sum of dice groups plus a flat modifier. */
export interface DiceValue {
  dice: { count: number; sides: number }[]
  flat: number
}

type Value = number | DiceValue

function isDice(v: Value): v is DiceValue {
  return typeof v !== 'number'
}

function toNumber(v: Value, context: string): number {
  if (isDice(v)) {
    if (v.dice.length === 0) return v.flat
    throw new FormulaError(`Dice can't be used in ${context}`)
  }
  return v
}

function addValues(a: Value, b: Value, sign: 1 | -1): Value {
  if (!isDice(a) && !isDice(b)) return a + sign * b
  const da: DiceValue = isDice(a) ? a : { dice: [], flat: a }
  const db: DiceValue = isDice(b) ? b : { dice: [], flat: b }
  if (sign === -1 && db.dice.length > 0) throw new FormulaError('Subtracting dice is not supported')
  return { dice: [...da.dice, ...db.dice], flat: da.flat + sign * db.flat }
}

function evaluateNode(n: FormulaNode, resolve: RefResolver): Value {
  switch (n.type) {
    case 'num':
      return n.value
    case 'ref': {
      const index = n.index ? toNumber(evaluateNode(n.index, resolve), 'an index') : undefined
      const value = resolve(n.path, index)
      if (!Number.isFinite(value)) throw new FormulaError(`@${n.path.join('.')} is not a number`)
      return value
    }
    case 'unary': {
      const v = evaluateNode(n.operand, resolve)
      if (n.op === '!') return toNumber(v, '"!"') ? 0 : 1
      if (isDice(v)) throw new FormulaError('Negating dice is not supported')
      return -v
    }
    case 'binary': {
      if (n.op === '&&') return toNumber(evaluateNode(n.left, resolve), '"&&"') && toNumber(evaluateNode(n.right, resolve), '"&&"') ? 1 : 0
      if (n.op === '||') return toNumber(evaluateNode(n.left, resolve), '"||"') || toNumber(evaluateNode(n.right, resolve), '"||"') ? 1 : 0
      const left = evaluateNode(n.left, resolve)
      const right = evaluateNode(n.right, resolve)
      if (n.op === '+') return addValues(left, right, 1)
      if (n.op === '-') return addValues(left, right, -1)
      if (n.op === '*' && (isDice(left) || isDice(right))) {
        // Scaling dice by a whole number multiplies the dice count: (1d6)*3 = 3d6.
        const dice = isDice(left) ? left : (right as DiceValue)
        const factor = toNumber(isDice(left) ? right : left, 'a dice multiplier')
        if (!Number.isInteger(factor) || factor < 0) throw new FormulaError('Dice can only be multiplied by a whole number')
        return { dice: dice.dice.map((d) => ({ ...d, count: d.count * factor })), flat: dice.flat * factor }
      }
      const a = toNumber(left, `"${n.op}"`)
      const b = toNumber(right, `"${n.op}"`)
      switch (n.op) {
        case '*':
          return a * b
        case '/':
          if (b === 0) throw new FormulaError('Division by zero')
          return a / b
        case '%':
          if (b === 0) throw new FormulaError('Division by zero')
          return a % b
        case '==':
          return a === b ? 1 : 0
        case '!=':
          return a !== b ? 1 : 0
        case '<':
          return a < b ? 1 : 0
        case '<=':
          return a <= b ? 1 : 0
        case '>':
          return a > b ? 1 : 0
        case '>=':
          return a >= b ? 1 : 0
      }
      throw new FormulaError(`Unknown operator ${n.op}`)
    }
    case 'cond':
      return toNumber(evaluateNode(n.test, resolve), 'a condition') ? evaluateNode(n.then, resolve) : evaluateNode(n.else, resolve)
    case 'call': {
      const args = n.args.map((a) => toNumber(evaluateNode(a, resolve), `${n.fn}()`))
      switch (n.fn) {
        case 'floor':
          return Math.floor(args[0])
        case 'ceil':
          return Math.ceil(args[0])
        case 'round':
          return Math.round(args[0])
        case 'abs':
          return Math.abs(args[0])
        case 'sign':
          return Math.sign(args[0])
        case 'min':
          return Math.min(...args)
        case 'max':
          return Math.max(...args)
        case 'clamp':
          return Math.min(Math.max(args[0], args[1]), args[2])
      }
      throw new FormulaError(`Unknown function ${n.fn}`)
    }
    case 'dice': {
      const count = toNumber(evaluateNode(n.count, resolve), 'a dice count')
      const sides = toNumber(evaluateNode(n.sides, resolve), 'dice sides')
      if (!Number.isInteger(count) || count < 0) throw new FormulaError('Dice count must be a whole number')
      if (!Number.isInteger(sides) || sides < 1) throw new FormulaError('Dice sides must be a positive whole number')
      return count === 0 ? { dice: [], flat: 0 } : { dice: [{ count, sides }], flat: 0 }
    }
  }
}

/** Evaluates a formula that must produce a plain number (throws FormulaError if it contains dice). */
export function evaluateNumber(src: string, resolve: RefResolver): number {
  return toNumber(evaluateNode(parseFormula(src), resolve), 'this formula')
}

/** Evaluates a formula that may contain dice (damage, healing), merging same-sided groups. */
export function evaluateDice(src: string, resolve: RefResolver): DiceValue {
  const v = evaluateNode(parseFormula(src), resolve)
  if (!isDice(v)) return { dice: [], flat: v }
  const merged = new Map<number, number>()
  for (const d of v.dice) merged.set(d.sides, (merged.get(d.sides) ?? 0) + d.count)
  return {
    dice: [...merged.entries()].sort((a, b) => b[0] - a[0]).map(([sides, count]) => ({ count, sides })),
    flat: v.flat
  }
}

/** "2d6 + 1d4 + 3", "1d8 - 1", "4" — the display form used on the sheet and by the dice roller. */
export function formatDice(v: DiceValue): string {
  const parts = v.dice.map((d) => `${d.count}d${d.sides}`)
  if (parts.length === 0) return String(v.flat)
  if (v.flat > 0) return `${parts.join(' + ')} + ${v.flat}`
  if (v.flat < 0) return `${parts.join(' + ')} - ${-v.flat}`
  return parts.join(' + ')
}
