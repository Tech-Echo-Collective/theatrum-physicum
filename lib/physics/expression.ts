/** A closed arithmetic language. No JavaScript evaluation or property lookup. */
export type Expr =
  | { kind: 'number'; value: number }
  | { kind: 'variable'; name: string }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/' | '^'; left: Expr; right: Expr }
  | { kind: 'call'; name: 'sin' | 'cos' | 'exp' | 'log' | 'sqrt'; arg: Expr };
const functions = ['sin', 'cos', 'exp', 'log', 'sqrt'] as const;
const constants: Record<string, number> = { pi: Math.PI, e: Math.E };
const reserved = new Set([
  ...functions,
  'pi',
  'e',
  'constructor',
  '__proto__',
  'NaN',
  'Infinity',
]);
export function validName(name: string) {
  return /^[A-Za-z][A-Za-z0-9_]{0,11}$/.test(name) && !reserved.has(name);
}
const num = (value: number): Expr => ({ kind: 'number', value });
function binary(
  op: '+' | '-' | '*' | '/' | '^',
  left: Expr,
  right: Expr,
): Expr {
  if (left.kind === 'number' && right.kind === 'number') {
    const node: Expr = { kind: 'binary', op, left, right };
    return num(evaluate(node, {}));
  }
  return { kind: 'binary', op, left, right };
}
export function parseExpression(source: string, variables: string[]): Expr {
  if (!source.trim() || source.length > 2048)
    throw new Error('Expression must contain 1–2048 characters.');
  const tokens: string[] = [];
  let offset = 0;
  while (offset < source.length) {
    const match =
      /^(?:\s+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z0-9_]*|[+\-*/^()])/.exec(
        source.slice(offset),
      );
    if (!match)
      throw new Error(`Invalid expression character at ${offset + 1}.`);
    offset += match[0].length;
    if (match[0].trim()) tokens.push(match[0]);
    if (tokens.length > 256) throw new Error('Expression exceeds 256 tokens.');
  }
  let cursor = 0;
  const allowed = new Set(variables);
  function expression(min: number, depth: number): Expr {
    if (depth > 32) throw new Error('Expression nesting exceeds 32.');
    const token = tokens[cursor++];
    let left: Expr;
    if (token === '+' || token === '-') {
      const argument = expression(3, depth + 1);
      left =
        token === '+'
          ? argument
          : argument.kind === 'number'
            ? num(-argument.value)
            : binary('*', num(-1), argument);
    } else if (token === '(') {
      left = expression(0, depth + 1);
      if (tokens[cursor++] !== ')')
        throw new Error('Missing closing parenthesis.');
    } else if (functions.includes(token as (typeof functions)[number])) {
      if (tokens[cursor++] !== '(')
        throw new Error(`Use ${token}(expression).`);
      const arg = expression(0, depth + 1);
      if (tokens[cursor++] !== ')')
        throw new Error('Functions take exactly one argument.');
      const call: Expr = {
        kind: 'call',
        name: token as (typeof functions)[number],
        arg,
      };
      left = arg.kind === 'number' ? num(evaluate(call, {})) : call;
    } else if (token && /^(\d|\.)/.test(token)) {
      const value = Number(token);
      if (!Number.isFinite(value))
        throw new Error('Nonfinite numeric literal.');
      left = num(value);
    } else if (Object.hasOwn(constants, token)) {
      left = num(constants[token]);
    } else if (allowed.has(token) && validName(token)) {
      left = { kind: 'variable', name: token };
    } else
      throw new Error(
        `Unknown name or incomplete expression: ${token ?? 'end of input'}.`,
      );
    while (cursor < tokens.length) {
      const op = tokens[cursor];
      const precedence =
        op === '+' || op === '-'
          ? 1
          : op === '*' || op === '/'
            ? 2
            : op === '^'
              ? 4
              : -1;
      if (precedence < min) break;
      cursor++;
      left = binary(
        op as '+' | '-' | '*' | '/' | '^',
        left,
        expression(precedence + (op === '^' ? 0 : 1), depth + 1),
      );
    }
    return left;
  }
  const result = expression(0, 0);
  if (cursor !== tokens.length)
    throw new Error(
      `Unexpected token: ${tokens[cursor]}. Use explicit multiplication, e.g. 2*x.`,
    );
  return result;
}
export function evaluate(expr: Expr, scope: Record<string, number>): number {
  let result: number;
  switch (expr.kind) {
    case 'number':
      result = expr.value;
      break;
    case 'variable':
      result = Object.hasOwn(scope, expr.name) ? scope[expr.name] : NaN;
      break;
    case 'call': {
      const value = evaluate(expr.arg, scope);
      result = Math[expr.name](value);
      break;
    }
    case 'binary': {
      const a = evaluate(expr.left, scope),
        b = evaluate(expr.right, scope);
      result =
        expr.op === '+'
          ? a + b
          : expr.op === '-'
            ? a - b
            : expr.op === '*'
              ? a * b
              : expr.op === '/'
                ? a / b
                : a ** b;
      break;
    }
  }
  if (!Number.isFinite(result))
    throw new Error(
      'Expression left its finite real domain (division, power, log or sqrt).',
    );
  return result;
}
export function differentiate(expr: Expr, variable: string): Expr {
  let budget = 4096;
  const make = (op: '+' | '-' | '*' | '/' | '^', a: Expr, b: Expr): Expr => {
    if (--budget < 0)
      throw new Error('Symbolic derivative exceeds its complexity budget.');
    // The original expression is always evaluated before its derivatives, preserving domain checks.
    if ((op === '+' || op === '-') && b.kind === 'number' && b.value === 0)
      return a;
    if (op === '+' && a.kind === 'number' && a.value === 0) return b;
    if (
      op === '*' &&
      ((a.kind === 'number' && a.value === 0) ||
        (b.kind === 'number' && b.value === 0))
    )
      return num(0);
    if (op === '*' && a.kind === 'number' && a.value === 1) return b;
    if (op === '*' && b.kind === 'number' && b.value === 1) return a;
    return binary(op, a, b);
  };
  const call = (name: (typeof functions)[number], arg: Expr): Expr => ({
    kind: 'call',
    name,
    arg,
  });
  function derivative(node: Expr, depth: number): Expr {
    if (depth > 64 || --budget < 0)
      throw new Error('Symbolic derivative exceeds its complexity budget.');
    if (node.kind === 'number') return num(0);
    if (node.kind === 'variable') return num(node.name === variable ? 1 : 0);
    if (node.kind === 'call') {
      const d = derivative(node.arg, depth + 1);
      const outer =
        node.name === 'sin'
          ? call('cos', node.arg)
          : node.name === 'cos'
            ? make('*', num(-1), call('sin', node.arg))
            : node.name === 'exp'
              ? node
              : node.name === 'log'
                ? make('/', num(1), node.arg)
                : make('/', num(1), make('*', num(2), call('sqrt', node.arg)));
      return make('*', outer, d);
    }
    const { left: a, right: b, op } = node;
    const da = derivative(a, depth + 1),
      db = derivative(b, depth + 1);
    if (op === '+' || op === '-') return make(op, da, db);
    if (op === '*') return make('+', make('*', da, b), make('*', a, db));
    if (op === '/')
      return make(
        '/',
        make('-', make('*', da, b), make('*', a, db)),
        make('^', b, num(2)),
      );
    if (b.kind === 'number') {
      if (b.value === 0) return num(0);
      if (b.value === 1) return da;
      return make('*', make('*', b, make('^', a, num(b.value - 1))), da);
    }
    return make(
      '*',
      node,
      make('+', make('*', db, call('log', a)), make('/', make('*', b, da), a)),
    );
  }
  const result = derivative(expr, 0);
  function check(node: Expr, depth: number): void {
    if (depth > 64 || --budget < 0)
      throw new Error('Expanded derivative exceeds its complexity budget.');
    if (node.kind === 'binary') {
      check(node.left, depth + 1);
      check(node.right, depth + 1);
    }
    if (node.kind === 'call') check(node.arg, depth + 1);
  }
  check(result, 0);
  return result;
}
export function expressionText(expr: Expr): string {
  if (expr.kind === 'number') return String(expr.value);
  if (expr.kind === 'variable') return expr.name;
  if (expr.kind === 'call') return `${expr.name}(${expressionText(expr.arg)})`;
  return `(${expressionText(expr.left)}${expr.op}${expressionText(expr.right)})`;
}
export function constantsVector(source: string, size: number): number[] {
  const parts = source.split(',');
  if (parts.length !== size)
    throw new Error(`Expected ${size} comma-separated components.`);
  return parts.map((part) => evaluate(parseExpression(part.trim(), []), {}));
}
