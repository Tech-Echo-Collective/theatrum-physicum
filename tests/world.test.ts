import { describe, expect, it } from 'vitest';
import {
  createWorld,
  getInteractions,
  metricDescription,
  parseFiniteNumber,
  worldReducer,
} from '@/lib/world';
import type { WorldDefinition } from '@/lib/world';
const add = (
  world: WorldDefinition,
  id = 'P1',
  kind: 'particle' | 'field' = 'particle',
) => worldReducer(world, { type: 'add', kind, id, name: id });
const charged = (world: WorldDefinition, id: string, value: number) =>
  worldReducer(world, { type: 'particle', property: 'charge', id, value });

describe('World definition', () => {
  it('Genesis creates independent empty definitions without runtime state', () => {
    const first = createWorld();
    const second = createWorld();
    first.spacetime.coordinates.space[0] = 'r';
    first.approximations.ignoredInteractions.push('gravity');
    expect(second.spacetime.coordinates.space).toEqual(['x', 'y', 'z']);
    expect(second.approximations.ignoredInteractions).toEqual([]);
    expect(second.contents).toEqual([]);
    expect(
      getInteractions(second).every((i) => i.status === 'not-applicable'),
    ).toBe(true);
    expect(second).not.toHaveProperty('simulationTime');
  });
  it('keeps geometry, dynamics and ignored choices independent', () => {
    let world = add(createWorld());
    world = worldReducer(world, {
      type: 'ignore',
      kind: 'gravity',
      ignored: true,
    });
    world = worldReducer(world, { type: 'geometry', geometry: 'minkowski' });
    expect(metricDescription(world)).toBe('diag(-1, 1, 1, 1)');
    expect(
      getInteractions(world).find((i) => i.kind === 'gravity')?.status,
    ).toBe('ignored');
  });
  it('derives source eligibility without cancelling opposite charges', () => {
    const world = charged(
      charged(add(add(createWorld()), 'P2'), 'P1', 1),
      'P2',
      -1,
    );
    expect(
      getInteractions(world).map((i) => [i.kind, i.sourceCount, i.status]),
    ).toEqual([
      ['electromagnetism', 2, 'enabled'],
      ['gravity', 2, 'enabled'],
    ]);
  });
  it('retains an approximation while its source is temporarily absent', () => {
    let world = charged(add(createWorld()), 'P1', 1);
    world = worldReducer(world, {
      type: 'ignore',
      kind: 'electromagnetism',
      ignored: true,
    });
    world = charged(world, 'P1', 0);
    expect(getInteractions(world)[0].status).toBe('not-applicable');
    world = charged(world, 'P1', 2);
    expect(getInteractions(world)[0].status).toBe('ignored');
  });
  it('handles zero mass without inventing forces or invalid numbers', () => {
    let world = charged(add(createWorld()), 'P1', -2);
    world = worldReducer(world, {
      type: 'particle',
      property: 'mass',
      id: 'P1',
      value: 0,
    });
    expect(getInteractions(world).map((i) => i.status)).toEqual([
      'enabled',
      'not-applicable',
    ]);
    expect(world.contents[0]).not.toHaveProperty('force');
  });
  it('normalizes dimensions and drops unused vector components deterministically', () => {
    let world = add(createWorld());
    world = worldReducer(world, {
      type: 'initial',
      id: 'P1',
      property: 'position',
      index: 2,
      value: 7,
    });
    world = worldReducer(world, { type: 'dimensions', space: 1, time: 0 });
    expect(world.initialConditions.particles.P1.position).toEqual([0]);
    expect(world.spacetime.coordinates).toEqual({ space: ['x'], time: [] });
    expect(metricDescription(world)).toBe('diag(1)');
    world = worldReducer(world, { type: 'dimensions', space: 3, time: 1 });
    expect(world.initialConditions.particles.P1.position).toEqual([0, 0, 0]);
    expect(world.initialConditions.particles.P1.velocity).toHaveLength(3);
    expect(worldReducer(world, { type: 'dimensions', space: 4, time: 1 })).toBe(
      world,
    );
  });
  it('uses a single time dimension for Minkowski and preserves custom metric drafts', () => {
    let world = worldReducer(createWorld(), {
      type: 'dimensions',
      space: 2,
      time: 0,
    });
    world = worldReducer(world, {
      type: 'metric',
      value: 'g_ab = arbitrary unparsed text',
    });
    world = worldReducer(world, { type: 'geometry', geometry: 'minkowski' });
    expect(world.spacetime.timeDimensions).toBe(1);
    expect(metricDescription(world)).toBe('diag(-1, 1, 1)');
    world = worldReducer(world, { type: 'geometry', geometry: 'custom' });
    expect(metricDescription(world)).toBe('g_ab = arbitrary unparsed text');
  });
  it('removes initial conditions with their particle and leaves fields unassessed', () => {
    let world = add(add(createWorld()), 'F2', 'field');
    expect(world.initialConditions.particles).not.toHaveProperty('F2');
    world = worldReducer(world, { type: 'remove', id: 'P1' });
    expect(world.initialConditions.particles).toEqual({});
    expect(getInteractions(world).every((i) => !i.applicable)).toBe(true);
    expect(world.contents[0]).toMatchObject({
      kind: 'field',
      configuration: 'undefined',
    });
  });
  it('rejects invalid numeric state and invalid vector indices', () => {
    const world = add(createWorld());
    for (const value of [NaN, Infinity, -1])
      expect(
        worldReducer(world, {
          type: 'particle',
          property: 'mass',
          id: 'P1',
          value,
        }),
      ).toBe(world);
    expect(
      worldReducer(world, {
        type: 'initial',
        id: 'P1',
        property: 'position',
        index: 0.5,
        value: 2,
      }),
    ).toBe(world);
    for (const value of ['', ' ', 'Infinity', '1e999', 'word'])
      expect(parseFiniteNumber(value)).toBeNull();
    expect(parseFiniteNumber('-1', 0)).toBeNull();
    expect(parseFiniteNumber('-1.5e-9')).toBe(-1.5e-9);
  });
  it('keeps coordinate names unique and does not mutate past definitions', () => {
    const world = add(createWorld());
    expect(
      worldReducer(world, {
        type: 'coordinate',
        axis: 'space',
        index: 0,
        value: 'y',
      }),
    ).toBe(world);
    const next = worldReducer(world, {
      type: 'initial',
      id: 'P1',
      property: 'velocity',
      index: 1,
      value: 3,
    });
    expect(world.initialConditions.particles.P1.velocity).toEqual([0, 0, 0]);
    expect(next.initialConditions.particles.P1.velocity).toEqual([0, 3, 0]);
    expect(next.contents[0]).not.toHaveProperty('velocity');
  });
  it('adds fresh coordinate names without colliding with renamed coordinates', () => {
    let world = worldReducer(createWorld(), {
      type: 'dimensions',
      space: 1,
      time: 0,
    });
    world = worldReducer(world, {
      type: 'coordinate',
      axis: 'space',
      index: 0,
      value: 'y',
    });
    world = worldReducer(world, { type: 'dimensions', space: 2, time: 0 });
    expect(new Set(world.spacetime.coordinates.space).size).toBe(2);
    world = worldReducer(world, {
      type: 'coordinate',
      axis: 'space',
      index: 0,
      value: 't',
    });
    world = worldReducer(world, { type: 'geometry', geometry: 'minkowski' });
    const names = [
      ...world.spacetime.coordinates.space,
      ...world.spacetime.coordinates.time,
    ];
    expect(new Set(names).size).toBe(names.length);
  });
});
