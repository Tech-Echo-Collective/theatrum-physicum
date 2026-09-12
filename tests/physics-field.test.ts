import { describe, expect, it } from 'vitest';
import { compileField, type FieldConfig } from '@/lib/physics/pde';
const config: FieldConfig = {
  equation: 'wave',
  length: 1,
  points: 65,
  coefficient: 1,
  boundary: 'fixed',
  displacement: 'sin(pi*x/L)',
  velocity: '0.7*sin(pi*x/L)',
};
describe('Scalar PDE evolution', () => {
  it('matches the exact discrete wave mode including nonzero initial velocity', () => {
    const dt = 0.005,
      field = compileField(config, dt),
      steps = 128;
    let state = field.initial;
    for (let i = 0; i < steps; i++) state = field.step(state);
    const theta =
      2 * Math.asin(field.ratio * Math.sin((Math.PI * field.dx) / 2));
    const amplitude =
      Math.cos(steps * theta) +
      (dt * 0.7 * Math.sin(steps * theta)) / Math.sin(theta);
    expect(
      Math.max(
        ...state.values.map((v, i) =>
          Math.abs(v - amplitude * Math.sin(Math.PI * i * field.dx)),
        ),
      ),
    ).toBeLessThan(1e-11);
    expect(state.values[0]).toBe(0);
    expect(state.values.at(-1)).toBe(0);
  });
  it('shows second-order convergence to the continuous wave solution', () => {
    const error = (intervals: number) => {
      const dt = 0.5 / intervals,
        field = compileField(
          { ...config, points: intervals + 1, velocity: '0' },
          dt,
        );
      let state = field.initial;
      for (let i = 0; i < intervals; i++) state = field.step(state);
      return Math.max(...state.values.map(Math.abs)); // exact cos(pi*.5)=0
    };
    expect(error(32) / error(64)).toBeGreaterThan(3.9);
    expect(error(32) / error(64)).toBeLessThan(4.1);
  });
  it('wraps a periodic stencil and preserves the zero mode velocity', () => {
    const field = compileField(
      {
        ...config,
        boundary: 'periodic',
        points: 64,
        displacement: '2',
        velocity: '3',
      },
      0.01,
    );
    let state = field.initial;
    for (let i = 0; i < 100; i++) state = field.step(state);
    state.values.forEach((value) => expect(value).toBeCloseTo(5, 10));
    expect(field.dx).toBe(1 / 64);
    const pulse = {
      ...field.initial,
      values: Array.from({ length: 64 }, (_, i) => (i === 0 ? 1 : 0)),
      previous: Array<number>(64).fill(0),
    };
    expect(field.step(pulse).values[63]).toBeGreaterThan(0);
  });
  it('matches the discrete heat mode and decreases its squared norm', () => {
    const field = compileField(
      { ...config, equation: 'heat', points: 65 },
      0.0001,
    );
    let state = field.initial;
    for (let i = 0; i < 100; i++) state = field.step(state);
    const amplitude =
      (1 - 4 * field.ratio * Math.sin((Math.PI * field.dx) / 2) ** 2) ** 100;
    expect(
      Math.max(
        ...state.values.map((v, i) =>
          Math.abs(v - amplitude * Math.sin(Math.PI * i * field.dx)),
        ),
      ),
    ).toBeLessThan(1e-12);
    expect(state.values.reduce((sum, v) => sum + v * v, 0)).toBeLessThan(
      field.initial.values.reduce((sum, v) => sum + v * v, 0),
    );
  });
  it('rejects unstable, incompatible and unsupported field definitions', () => {
    expect(() => compileField(config, 1)).toThrow(/CFL/);
    expect(() => compileField({ ...config, equation: 'heat' }, 0.1)).toThrow(
      /diffusion/,
    );
    expect(() => compileField({ ...config, displacement: '1' }, 0.001)).toThrow(
      /endpoints/,
    );
    expect(() =>
      compileField(
        { ...config, boundary: 'periodic', displacement: 'x' },
        0.001,
      ),
    ).toThrow(/endpoint/);
    expect(() => compileField({ ...config, points: 513 }, 0.001)).toThrow(
      /Grid/,
    );
    expect(() =>
      compileField({ ...config, boundary: 'other' as 'fixed' }, 0.001),
    ).toThrow(/Unsupported/);
  });
});
