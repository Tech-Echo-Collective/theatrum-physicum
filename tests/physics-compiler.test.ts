import { describe, expect, it } from 'vitest';
import {
  advance,
  compileWorld,
  defaultSettings,
  type Plan,
} from '@/lib/physics/compiler';
import { createWorld, worldReducer } from '@/lib/world';
const particleWorld = () =>
  worldReducer(createWorld(), {
    type: 'add',
    kind: 'particle',
    id: 'P1',
    name: 'P1',
  });
function requirePlan(result: ReturnType<typeof compileWorld>): Plan {
  if (!result.plan) throw new Error(result.error);
  return result.plan;
}
describe('World compiler and transactional runtime', () => {
  it('rejects unsupported combinations instead of silently dropping entities or geometry', () => {
    const settings = defaultSettings();
    expect(compileWorld(createWorld(), settings).error).toMatch(/requires 1/);
    expect(
      compileWorld(
        worldReducer(particleWorld(), {
          type: 'geometry',
          geometry: 'minkowski',
        }),
        settings,
      ).error,
    ).toMatch(/Euclidean/);
    const withField = worldReducer(particleWorld(), {
      type: 'add',
      kind: 'field',
      id: 'F',
      name: 'F',
    });
    expect(compileWorld(withField, settings).error).toMatch(
      /does not evolve fields/,
    );
    settings.kind = 'field';
    expect(compileWorld(withField, settings).error).toMatch(/no particles/);
    settings.kind = 'ode';
    expect(compileWorld(particleWorld(), settings).error).toMatch(
      /Remove particle/,
    );
    settings.kind = 'other' as 'nbody';
    expect(compileWorld(createWorld(), settings).error).toMatch(/Unsupported/);
  });
  it('compiles a real particle world and leaves its definition unchanged', () => {
    const world = worldReducer(particleWorld(), {
      type: 'initial',
      id: 'P1',
      property: 'velocity',
      index: 0,
      value: 2,
    });
    const snapshot = JSON.stringify(world),
      settings = defaultSettings();
    const plan = requirePlan(compileWorld(world, settings));
    const result = advance(plan, plan.initial, 100);
    expect(result.error).toBeNull();
    expect(result.state.time).toBe(1);
    expect(plan.observe(result.state).points[0].x).toBeCloseTo(2, 12);
    expect(JSON.stringify(world)).toBe(snapshot);
    expect(plan.initial.data[0]).toBe(0);
  });
  it('compiles a field definition to a populated grid and evolves it', () => {
    const settings = defaultSettings();
    settings.kind = 'field';
    const world = worldReducer(
      worldReducer(createWorld(), { type: 'dimensions', space: 1, time: 1 }),
      { type: 'add', kind: 'field', id: 'F', name: 'F' },
    );
    const plan = requirePlan(compileWorld(world, settings));
    const result = advance(plan, plan.initial, 10);
    expect(result.error).toBeNull();
    expect(result.state.data).toHaveLength(128);
    expect(result.state.data[64]).toBeLessThan(plan.initial.data[64]);
  });
  it('rolls back when the final RK4 weighted state crosses an equation domain', () => {
    const settings = defaultSettings();
    settings.kind = 'ode';
    settings.dt = '.7';
    settings.ode = { names: 'q', equations: '-1/sqrt(q)', initial: '1' };
    const plan = requirePlan(compileWorld(createWorld(), settings));
    const result = advance(plan, plan.initial);
    expect(result.error).toMatch(/domain/);
    expect(result.state).toBe(plan.initial);
  });
  it('retains the last valid state when a later step fails and bounds work', () => {
    const settings = defaultSettings();
    settings.kind = 'ode';
    settings.dt = '.05';
    settings.ode = { names: 'q', equations: '-1/sqrt(q)', initial: '1' };
    const plan = requirePlan(compileWorld(createWorld(), settings));
    const result = advance(plan, plan.initial, 100);
    expect(result.error).not.toBeNull();
    expect(result.state.steps).toBeGreaterThan(0);
    expect(result.state.data[0]).toBeGreaterThan(0);
    expect(advance(plan, plan.initial, 129).state).toBe(plan.initial);
  });
  it('rejects incompatible causal data independent of tangent scale', () => {
    const settings = defaultSettings();
    settings.kind = 'geodesic';
    settings.geodesic.causal = 'null';
    const world = worldReducer(createWorld(), {
      type: 'geometry',
      geometry: 'minkowski',
    });
    for (const tangent of ['1e-6,0,0,0', '0,1e-6,0,0', '0,0,0,0']) {
      settings.geodesic.tangent = tangent;
      expect(compileWorld(world, settings).plan).toBeNull();
    }
    settings.geodesic.tangent = '1e-100,1e-100,0,0';
    expect(compileWorld(world, settings).error).toBeNull();
    settings.geodesic.causal = 'timelike';
    settings.geodesic.tangent = '1e8,1e8,0,0';
    expect(compileWorld(world, settings).plan).toBeNull();
    settings.geodesic.tangent = 'sqrt(2),1,0,0';
    const plan = requirePlan(compileWorld(world, settings));
    expect(advance(plan, plan.initial, 100).state.data[1]).toBeCloseTo(1, 12);
  });
});
