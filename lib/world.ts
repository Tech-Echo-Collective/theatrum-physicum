export type Geometry = 'euclidean' | 'minkowski' | 'custom';
export type InteractionKind = 'electromagnetism' | 'gravity';
export type PhysicalEntity =
  | { id: string; name: string; kind: 'particle'; mass: number; charge: number }
  | { id: string; name: string; kind: 'field'; configuration: 'undefined' };
export type Particle = Extract<PhysicalEntity, { kind: 'particle' }>;
export type InitialState = { position: number[]; velocity: number[] };
export type WorldDefinition = {
  spacetime: {
    spatialDimensions: number;
    timeDimensions: number;
    geometry: Geometry;
    coordinates: { space: string[]; time: string[] };
    metric: { customDraft: string };
  };
  dynamics: 'classical-approximation';
  contents: PhysicalEntity[];
  interactions: InteractionKind[];
  approximations: { ignoredInteractions: InteractionKind[] };
  initialConditions: {
    particles: Record<string, InitialState>;
    fields: 'undefined';
    boundaries: 'undefined';
  };
};
export type InteractionView = {
  kind: InteractionKind;
  sourceCount: number;
  applicable: boolean;
  status: 'not-applicable' | 'enabled' | 'ignored';
};

export function createWorld(): WorldDefinition {
  return {
    spacetime: {
      spatialDimensions: 3,
      timeDimensions: 1,
      geometry: 'euclidean',
      coordinates: { space: ['x', 'y', 'z'], time: ['t'] },
      metric: { customDraft: '' },
    },
    dynamics: 'classical-approximation',
    contents: [],
    interactions: ['electromagnetism', 'gravity'],
    approximations: { ignoredInteractions: [] },
    initialConditions: {
      particles: {},
      fields: 'undefined',
      boundaries: 'undefined',
    },
  };
}

export function getInteractions(world: WorldDefinition): InteractionView[] {
  const particles = world.contents.filter(
    (entity): entity is Particle => entity.kind === 'particle',
  );
  return world.interactions.map((kind) => {
    const sourceCount = particles.filter((p) =>
      kind === 'gravity' ? p.mass > 0 : p.charge !== 0,
    ).length;
    const applicable = sourceCount > 0;
    return {
      kind,
      sourceCount,
      applicable,
      status: !applicable
        ? 'not-applicable'
        : world.approximations.ignoredInteractions.includes(kind)
          ? 'ignored'
          : 'enabled',
    };
  });
}

export function metricDescription(world: WorldDefinition): string {
  const { geometry, spatialDimensions, timeDimensions } = world.spacetime;
  if (geometry === 'custom') return world.spacetime.metric.customDraft;
  return `diag(${[...(geometry === 'minkowski' && timeDimensions ? [-1] : []), ...Array<number>(spatialDimensions).fill(1)].join(', ')})`;
}

export function parseFiniteNumber(
  value: string,
  min = -Infinity,
): number | null {
  if (value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min ? number : null;
}

export type WorldAction =
  | { type: 'geometry'; geometry: Geometry }
  | { type: 'dimensions'; space: number; time: number }
  | { type: 'coordinate'; axis: 'space' | 'time'; index: number; value: string }
  | { type: 'metric'; value: string }
  | { type: 'add'; kind: 'particle' | 'field'; id: string; name: string }
  | { type: 'remove'; id: string }
  | { type: 'particle'; id: string; property: 'mass' | 'charge'; value: number }
  | {
      type: 'initial';
      id: string;
      property: 'position' | 'velocity';
      index: number;
      value: number;
    }
  | { type: 'ignore'; kind: InteractionKind; ignored: boolean };

function resize<T>(values: T[], size: number, fill: (index: number) => T): T[] {
  return Array.from({ length: size }, (_, i) => values[i] ?? fill(i));
}

export function worldReducer(
  world: WorldDefinition,
  action: WorldAction,
): WorldDefinition {
  switch (action.type) {
    case 'geometry': {
      const next = {
        ...world,
        spacetime: { ...world.spacetime, geometry: action.geometry },
      };
      return action.geometry === 'minkowski' && !world.spacetime.timeDimensions
        ? worldReducer(next, {
            type: 'dimensions',
            space: next.spacetime.spatialDimensions,
            time: 1,
          })
        : next;
    }
    case 'dimensions': {
      if (
        !Number.isInteger(action.space) ||
        action.space < 1 ||
        action.space > 3 ||
        ![0, 1].includes(action.time)
      )
        return world;
      const time = world.spacetime.geometry === 'minkowski' ? 1 : action.time;
      const retained = [
        ...world.spacetime.coordinates.space.slice(0, action.space),
        ...world.spacetime.coordinates.time.slice(0, time),
      ];
      const used = new Set(retained);
      const freshCoordinate = (base: string) => {
        let name = base;
        let suffix = 2;
        while (used.has(name)) {
          name = `${base}${suffix}`;
          suffix += 1;
        }
        used.add(name);
        return name;
      };
      const coordinates = {
        space: resize(world.spacetime.coordinates.space, action.space, (i) =>
          freshCoordinate(['x', 'y', 'z'][i]),
        ),
        time: resize(world.spacetime.coordinates.time, time, () =>
          freshCoordinate('t'),
        ),
      };
      return {
        ...world,
        spacetime: {
          ...world.spacetime,
          spatialDimensions: action.space,
          timeDimensions: time,
          coordinates,
        },
        initialConditions: {
          ...world.initialConditions,
          particles: Object.fromEntries(
            Object.entries(world.initialConditions.particles).map(
              ([id, initial]) => [
                id,
                {
                  position: resize(initial.position, action.space, () => 0),
                  velocity: resize(initial.velocity, action.space, () => 0),
                },
              ],
            ),
          ),
        },
      };
    }
    case 'coordinate': {
      if (
        !world.spacetime.coordinates[action.axis][action.index] ||
        !action.value.trim()
      )
        return world;
      const value = action.value.trim().slice(0, 12);
      const others = [
        ...world.spacetime.coordinates.space,
        ...world.spacetime.coordinates.time,
      ];
      if (
        others.includes(value) &&
        world.spacetime.coordinates[action.axis][action.index] !== value
      )
        return world;
      return {
        ...world,
        spacetime: {
          ...world.spacetime,
          coordinates: {
            ...world.spacetime.coordinates,
            [action.axis]: world.spacetime.coordinates[action.axis].map(
              (v, i) => (i === action.index ? value : v),
            ),
          },
        },
      };
    }
    case 'metric':
      return {
        ...world,
        spacetime: {
          ...world.spacetime,
          metric: { customDraft: action.value },
        },
      };
    case 'add': {
      if (world.contents.some((entity) => entity.id === action.id))
        return world;
      const entity: PhysicalEntity =
        action.kind === 'particle'
          ? {
              id: action.id,
              name: action.name,
              kind: 'particle',
              mass: 1,
              charge: 0,
            }
          : {
              id: action.id,
              name: action.name,
              kind: 'field',
              configuration: 'undefined',
            };
      return {
        ...world,
        contents: [...world.contents, entity],
        initialConditions:
          entity.kind === 'particle'
            ? {
                ...world.initialConditions,
                particles: {
                  ...world.initialConditions.particles,
                  [entity.id]: {
                    position: Array<number>(
                      world.spacetime.spatialDimensions,
                    ).fill(0),
                    velocity: Array<number>(
                      world.spacetime.spatialDimensions,
                    ).fill(0),
                  },
                },
              }
            : world.initialConditions,
      };
    }
    case 'remove': {
      const particles = { ...world.initialConditions.particles };
      delete particles[action.id];
      return {
        ...world,
        contents: world.contents.filter((entity) => entity.id !== action.id),
        initialConditions: { ...world.initialConditions, particles },
      };
    }
    case 'particle': {
      if (
        !Number.isFinite(action.value) ||
        (action.property === 'mass' && action.value < 0)
      )
        return world;
      return {
        ...world,
        contents: world.contents.map((entity) =>
          entity.id === action.id && entity.kind === 'particle'
            ? { ...entity, [action.property]: action.value }
            : entity,
        ),
      };
    }
    case 'initial': {
      const initial = world.initialConditions.particles[action.id];
      if (
        !initial ||
        !Number.isFinite(action.value) ||
        !Number.isInteger(action.index) ||
        action.index < 0 ||
        action.index >= world.spacetime.spatialDimensions
      )
        return world;
      return {
        ...world,
        initialConditions: {
          ...world.initialConditions,
          particles: {
            ...world.initialConditions.particles,
            [action.id]: {
              ...initial,
              [action.property]: initial[action.property].map((value, i) =>
                i === action.index ? action.value : value,
              ),
            },
          },
        },
      };
    }
    case 'ignore':
      return {
        ...world,
        approximations: {
          ignoredInteractions: action.ignored
            ? Array.from(
                new Set([
                  ...world.approximations.ignoredInteractions,
                  action.kind,
                ]),
              )
            : world.approximations.ignoredInteractions.filter(
                (kind) => kind !== action.kind,
              ),
        },
      };
  }
}
