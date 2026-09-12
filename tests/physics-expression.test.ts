import { describe, expect, it } from 'vitest';
import {
  differentiate,
  evaluate,
  parseExpression,
} from '@/lib/physics/expression';
const value = (source: string, x = 0) =>
  evaluate(parseExpression(source, ['x']), { x });
describe('Closed arithmetic language and symbolic derivatives', () => {
  it('uses mathematical unary and right-associative power precedence', () => {
    expect(value('-2^2')).toBe(-4);
    expect(value('2^3^2')).toBe(512);
    expect(value('2^-2')).toBe(0.25);
    expect(value('sin(pi/2)+exp(0)+sqrt(4)')).toBe(4);
  });
  it.each([
    'window',
    'globalThis',
    'constructor',
    '__proto__',
    'Math.sin(x)',
    'x[0]',
    'sin(x,2)',
    'x=1',
    '1;2',
    '2x',
    '1e309',
    'NaN',
    'Infinity',
    'x ? 1 : 0',
    '1//2',
    '1 2',
    'sin(',
    '',
    '('.repeat(34) + '1' + ')'.repeat(34),
    'x+'.repeat(200) + 'x',
  ])('rejects unsafe, malformed or over-budget input: %s', (source) => {
    expect(() => value(source)).toThrow();
  });
  it.each(['1/x', 'log(x)', 'sqrt(-1)', 'exp(1000)'])(
    'rejects nonfinite or invalid-domain arithmetic: %s',
    (source) => expect(() => value(source)).toThrow(),
  );
  it.each(['x^2', 'x^(1+1)', 'x^sqrt(4)'])(
    'differentiates constant powers at zero without a false singularity: %s',
    (source) => {
      const f = parseExpression(source, ['x']),
        d = differentiate(f, 'x');
      expect(evaluate(d, { x: 0 })).toBe(0);
      expect(evaluate(d, { x: -3 })).toBe(-6);
      expect(evaluate(differentiate(d, 'x'), { x: 0 })).toBe(2);
    },
  );
  it('differentiates mixed transcendental functions twice', () => {
    const f = parseExpression('sin(x)*exp(x)', ['x']);
    const second = differentiate(differentiate(f, 'x'), 'x');
    expect(evaluate(second, { x: 0.3 })).toBeCloseTo(
      2 * Math.exp(0.3) * Math.cos(0.3),
      12,
    );
    expect(
      evaluate(differentiate(parseExpression('x^(2-1)', ['x']), 'x'), { x: 0 }),
    ).toBe(1);
  });
});
