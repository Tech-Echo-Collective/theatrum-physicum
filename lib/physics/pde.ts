import { evaluate, parseExpression } from './expression';
import { finite, positive } from './numerics';
export type FieldConfig = {
  equation: 'wave' | 'heat';
  length: number;
  points: number;
  coefficient: number;
  boundary: 'fixed' | 'periodic';
  displacement: string;
  velocity: string;
};
export type FieldState = {
  values: number[];
  previous: number[] | null;
  time: number;
  steps: number;
};
export function compileField(config: FieldConfig, dt: number) {
  const { equation, length, points, coefficient, boundary } = config;
  if (
    !['wave', 'heat'].includes(equation) ||
    !['fixed', 'periodic'].includes(boundary)
  )
    throw new Error('Unsupported field equation or boundary condition.');
  positive(length, 'Domain length');
  positive(coefficient, equation === 'wave' ? 'Wave speed' : 'Diffusivity');
  positive(dt, 'Timestep');
  if (!Number.isInteger(points) || points < 8 || points > 512)
    throw new Error('Grid points must be an integer from 8 to 512.');
  const dx = length / (boundary === 'periodic' ? points : points - 1);
  const ratio =
    equation === 'wave'
      ? (coefficient * dt) / dx
      : (coefficient * dt) / dx ** 2;
  const limit = equation === 'wave' ? 0.95 : 0.45;
  if (!Number.isFinite(ratio) || ratio > limit)
    throw new Error(
      `${equation === 'wave' ? 'Wave CFL' : 'Heat diffusion ratio'} ${ratio.toPrecision(4)} exceeds ${limit}. Set Δt ≤ ${(equation === 'wave' ? (limit * dx) / coefficient : (limit * dx ** 2) / coefficient).toPrecision(5)}.`,
    );
  const displacement = parseExpression(config.displacement, ['x', 'L']);
  const velocity = parseExpression(
    equation === 'wave' ? config.velocity : '0',
    ['x', 'L'],
  );
  const sample = (x: number, rate = false) =>
    evaluate(rate ? velocity : displacement, { x, L: length });
  const values = Array.from({ length: points }, (_, i) => sample(i * dx));
  const rates = Array.from({ length: points }, (_, i) => sample(i * dx, true));
  for (const rate of [false, true]) {
    const left = sample(0, rate),
      right = sample(length, rate);
    const tolerance =
      1e-10 * Math.max(1, ...(rate ? rates : values).map(Math.abs));
    if (
      boundary === 'fixed'
        ? Math.max(Math.abs(left), Math.abs(right)) > tolerance
        : Math.abs(left - right) > tolerance
    )
      throw new Error(
        `Initial ${rate ? 'velocity' : 'field'} does not match the ${boundary === 'fixed' ? 'fixed-zero endpoints' : 'periodic endpoint values'}.`,
      );
  }
  if (boundary === 'fixed') {
    values[0] = values[points - 1] = 0;
    rates[0] = rates[points - 1] = 0;
  }
  const initial: FieldState = { values, previous: null, time: 0, steps: 0 };
  function step(state: FieldState): FieldState {
    const next = state.values.map((value, i) => {
      if (boundary === 'fixed' && (i === 0 || i === points - 1)) return 0;
      const laplacian =
        state.values[(i + 1) % points] -
        2 * value +
        state.values[(i - 1 + points) % points];
      if (equation === 'heat') return value + ratio * laplacian;
      return state.previous
        ? 2 * value - state.previous[i] + ratio ** 2 * laplacian
        : value + dt * rates[i] + (ratio ** 2 * laplacian) / 2;
    });
    const steps = state.steps + 1;
    return {
      values: finite(next, 'Field'),
      previous: state.values,
      time: steps * dt,
      steps,
    };
  }
  return { config, dx, ratio, initial, step };
}
