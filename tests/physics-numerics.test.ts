import { describe, expect, it } from 'vitest';
import {
  forces,
  G,
  KE,
  nbodyDiagnostics,
  rk4,
  verlet,
  type Body,
} from '@/lib/physics/numerics';
const body = (
  name: string,
  mass: number,
  charge: number,
  position: number[],
  velocity = position.map(() => 0),
): Body => ({ id: name, name, mass, charge, position, velocity });
const gravity = { gravity: true, coulomb: false, softening: 0 };
describe('Real particle forces and numerical integration', () => {
  it('implements force signs, magnitudes and pair antisymmetry in SI units', () => {
    const pair = [body('a', 2, 1e-6, [0]), body('b', 3, -2e-6, [2])];
    const g = forces(pair, gravity);
    expect(g.acceleration[0][0] * 2).toBeCloseTo(1.001145e-10, 22);
    expect(g.potential).toBeCloseTo(-2.00229e-10, 22);
    const e = forces(pair, { ...gravity, gravity: false, coulomb: true });
    expect(e.acceleration[0][0] * 2).toBeCloseTo(0.004493775893085, 14);
    expect(e.acceleration[0][0] * 2 + e.acceleration[1][0] * 3).toBeCloseTo(
      0,
      15,
    );
    pair[1].charge *= -1;
    expect(
      forces(pair, { ...gravity, gravity: false, coulomb: true })
        .acceleration[0][0],
    ).toBeLessThan(0);
  });
  it('derives softened force from the same potential', () => {
    const pair = [body('a', 2, 1e-6, [0]), body('b', 3, 2e-6, [2])];
    const law = { gravity: true, coulomb: true, softening: 1 },
      h = 1e-5;
    const potential = (x: number) =>
      forces([{ ...pair[0], position: [x] }, pair[1]], law).potential;
    const gradient = -(potential(h) - potential(-h)) / (2 * h);
    expect(forces(pair, law).acceleration[0][0] * 2).toBeCloseTo(gradient, 12);
  });
  it('free-drifts without self-interaction', () => {
    let bodies = [body('a', 1, 1, [1, -2], [3, 4])];
    for (let i = 0; i < 1000; i++)
      bodies = verlet(bodies, 0.01, { ...gravity, coulomb: true });
    expect(bodies[0].position[0]).toBeCloseTo(31, 10);
    expect(bodies[0].position[1]).toBeCloseTo(38, 10);
    expect(bodies[0].velocity).toEqual([3, 4]);
  });
  it('converges quadratically on a circular two-body orbit and conserves momentum', () => {
    const run = (steps: number) => {
      let bodies = [
        body('a', 1 / (2 * G), 0, [-0.5, 0], [0, -0.5]),
        body('b', 1 / (2 * G), 0, [0.5, 0], [0, 0.5]),
      ];
      const initial = nbodyDiagnostics(bodies, gravity);
      for (let i = 0; i < steps; i++)
        bodies = verlet(bodies, (2 * Math.PI) / steps, gravity);
      const result = nbodyDiagnostics(bodies, gravity);
      expect(
        Math.abs((result.energy - initial.energy) / initial.scale),
      ).toBeLessThan(1e-7);
      expect(result.momentum).toEqual([0, 0]);
      return Math.hypot(bodies[0].position[0] + 0.5, bodies[0].position[1]);
    };
    const coarse = run(1000),
      fine = run(2000);
    expect(coarse).toBeLessThan(5e-5);
    expect(coarse / fine).toBeGreaterThan(3.8);
    expect(coarse / fine).toBeLessThan(4.2);
  });
  it('matches the analytic Coulomb repulsion endpoint', () => {
    const q = Math.sqrt(1 / (2 * KE));
    let bodies = [body('a', 1, q, [-0.5]), body('b', 1, q, [0.5])];
    const t = 1 + Math.asinh(1) / Math.sqrt(2);
    for (let i = 0; i < 10000; i++)
      bodies = verlet(bodies, t / 10000, {
        gravity: false,
        coulomb: true,
        softening: 0,
      });
    expect(bodies[1].position[0]).toBeCloseTo(1, 7);
    expect(bodies[1].velocity[0]).toBeCloseTo(0.5, 7);
  });
  it('rejects singular, invalid and unresolved particle states', () => {
    expect(() =>
      forces([body('a', 1, 0, [0]), body('b', 1, 0, [0])], gravity),
    ).toThrow(/singularity/);
    expect(() => forces([body('a', 0, 0, [0])], gravity)).toThrow(/mass/);
    expect(() => verlet([body('a', 1, 0, [0])], 0, gravity)).toThrow(
      /Timestep/,
    );
    expect(() =>
      verlet([body('a', 1, 0, [0], [10]), body('b', 1, 0, [1])], 1, gravity),
    ).toThrow(/unresolved/);
  });
  it('has fourth-order RK4 convergence and correct nonautonomous stage times', () => {
    const error = (h: number) => {
      let y = [1];
      for (let i = 0; i < Math.round(1 / h); i++)
        y = rk4(y, i * h, h, (_, v) => v);
      return Math.abs(y[0] - Math.E);
    };
    expect(error(0.1) / error(0.05)).toBeGreaterThan(15);
    expect(error(0.1) / error(0.05)).toBeLessThan(17);
    let y = [0];
    for (let i = 0; i < 10; i++) y = rk4(y, i / 10, 0.1, (t) => [t]);
    expect(y[0]).toBeCloseTo(0.5, 12);
  });
});
