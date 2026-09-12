import { describe, expect, it } from 'vitest';
import { compileMetric, geodesicRhs, metricNorm } from '@/lib/physics/geometry';
import { rk4 } from '@/lib/physics/numerics';
describe('Metric evaluation, analytic tensors, and geodesics', () => {
  it('evaluates Minkowski space and exact inertial geodesics', () => {
    const metric = compileMetric('diag(-1,1,1,1)', ['t', 'x', 'y', 'z']);
    const g = metric.evaluateAt([0, 0, 0, 0]);
    expect(g.gamma.flat(2).every((v) => v === 0)).toBe(true);
    expect(g.scalar).toBe(0);
    let state = [0, 0, 0, 0, Math.sqrt(2), 1, 0, 0];
    for (let i = 0; i < 100; i++)
      state = rk4(state, i * 0.01, 0.01, (_, y) => geodesicRhs(metric, y));
    expect(state[0]).toBeCloseTo(Math.sqrt(2), 12);
    expect(state[1]).toBeCloseTo(1, 12);
    expect(metricNorm(g.g, state.slice(4))).toBeCloseTo(-1, 12);
  });
  it('counts Lorentz inertia, including off-diagonal charts', () => {
    expect(compileMetric('0,1;1,0', ['t', 'x']).evaluateAt([0, 0]).scalar).toBe(
      0,
    );
    expect(() =>
      compileMetric('diag(-1,-1,-1,1)', ['t', 'x', 'y', 'z']).evaluateAt([
        0, 0, 0, 0,
      ]),
    ).toThrow(/signature/);
    expect(() =>
      compileMetric('diag(-1,0)', ['t', 'x']).evaluateAt([0, 0]),
    ).toThrow(/singular/);
    expect(() => compileMetric('-1,t;0,1', ['t', 'x'])).toThrow(/Symmetric/);
  });
  it('handles flat time-dependent coordinates even with positive g00', () => {
    const metric = compileMetric('-1+4*t^2,2*t;2*t,1', ['t', 'x']);
    const g = metric.evaluateAt([0.8, -0.64]);
    expect(g.gamma[1][0][0]).toBeCloseTo(2, 12);
    expect(g.scalar).toBeCloseTo(0, 12);
    let state = [0, 0, 1, 0];
    for (let i = 0; i < 100; i++)
      state = rk4(state, i / 100, 0.01, (_, y) => geodesicRhs(metric, y));
    expect(state[1]).toBeCloseTo(-1, 11);
    expect(state[3]).toBeCloseTo(-2, 11);
  });
  it('converges at fourth order on a flat-polar Cartesian straight path', () => {
    const metric = compileMetric('diag(-1,1,r^2)', ['t', 'r', 'phi']);
    const g = metric.evaluateAt([0, 2, 0.3]);
    expect(g.gamma[1][2][2]).toBe(-2);
    expect(g.gamma[2][1][2]).toBe(0.5);
    expect(g.scalar).toBeCloseTo(0, 12);
    const error = (h: number) => {
      let state = [0, 1, 0, Math.sqrt(2), 0, 1];
      for (let i = 0; i < Math.round(1 / h); i++)
        state = rk4(state, i * h, h, (_, y) => geodesicRhs(metric, y));
      return Math.hypot(
        state[1] * Math.cos(state[2]) - 1,
        state[1] * Math.sin(state[2]) - 1,
      );
    };
    expect(error(0.1) / error(0.05)).toBeGreaterThan(15);
    expect(error(0.1) / error(0.05)).toBeLessThan(17);
  });
  it('gets the sphere curvature sign and a nontrivial conformal scalar', () => {
    const sphere = compileMetric('diag(-1,4,4*sin(theta)^2)', [
      't',
      'theta',
      'phi',
    ]).evaluateAt([0, 0.7, 0]);
    expect(sphere.ricci[1][1]).toBeCloseTo(1, 12);
    expect(sphere.ricci[2][2]).toBeCloseTo(Math.sin(0.7) ** 2, 12);
    expect(sphere.scalar).toBeCloseTo(0.5, 12);
    const conformal = compileMetric(
      'diag(-exp(2*(t^2+2*x^2)),exp(2*(t^2+2*x^2)))',
      ['t', 'x'],
    ).evaluateAt([0.3, 0.4]);
    expect(conformal.scalar).toBeCloseTo(
      -4 * Math.exp(-2 * (0.3 ** 2 + 2 * 0.4 ** 2)),
      12,
    );
  });
  it('computes Schwarzschild vacuum curvature and circular motion in its exterior', () => {
    const metric = compileMetric(
      'diag(-(1-2/r),1/(1-2/r),r^2,r^2*sin(theta)^2)',
      ['t', 'r', 'theta', 'phi'],
    );
    const g = metric.evaluateAt([0, 10, Math.PI / 2, 0]);
    expect(Math.max(...g.ricci.flat().map(Math.abs))).toBeLessThan(1e-12);
    const ut = 1 / Math.sqrt(0.7),
      uphi = Math.sqrt(0.001) * ut;
    let state = [0, 10, Math.PI / 2, 0, ut, 0, 0, uphi];
    for (let i = 0; i < 100; i++)
      state = rk4(state, i * 0.05, 0.05, (_, y) => geodesicRhs(metric, y));
    expect(state[1]).toBeCloseTo(10, 10);
    expect(0.8 * state[4]).toBeCloseTo(0.8 * ut, 10);
    expect(100 * state[7]).toBeCloseTo(100 * uphi, 10);
    expect(() => metric.evaluateAt([0, 2, Math.PI / 2, 0])).toThrow();
  });
});
