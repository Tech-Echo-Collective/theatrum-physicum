import {
  metricDescription,
  type WorldDefinition,
  type Particle,
} from '../world';
import {
  constantsVector,
  evaluate,
  parseExpression,
  validName,
} from './expression';
import { compileMetric, geodesicRhs, metricNorm } from './geometry';
import {
  finite,
  nbodyDiagnostics,
  positive,
  rk4,
  verlet,
  type Body,
} from './numerics';
import { compileField, type FieldConfig } from './pde';
export type SolverKind = 'nbody' | 'ode' | 'field' | 'geodesic';
export type SolverSettings = {
  kind: SolverKind;
  dt: string;
  softening: string;
  ode: { names: string; equations: string; initial: string };
  field: {
    equation: 'wave' | 'heat';
    length: string;
    points: string;
    coefficient: string;
    boundary: 'fixed' | 'periodic';
    displacement: string;
    velocity: string;
  };
  geodesic: { position: string; tangent: string; causal: 'timelike' | 'null' };
};
export const defaultSettings = (): SolverSettings => ({
  kind: 'nbody',
  dt: '0.01',
  softening: '0',
  ode: { names: 'q, v', equations: 'v\n-q', initial: '1, 0' },
  field: {
    equation: 'wave',
    length: '10',
    points: '128',
    coefficient: '1',
    boundary: 'fixed',
    displacement: 'sin(pi*x/L)',
    velocity: '0',
  },
  geodesic: {
    position: '0, 0, 0, 0',
    tangent: '1, 0, 0, 0',
    causal: 'timelike',
  },
});
export type State = {
  time: number;
  steps: number;
  data: number[];
  previous: number[] | null;
};
export type Observation = {
  points: { id: string; label: string; x: number; y: number }[];
  readings: { label: string; value: string }[];
  rows: { label: string; values: number[] }[];
};
export type Plan = {
  kind: SolverKind;
  label: string;
  dt: number;
  initial: State;
  notices: string[];
  xLabel: string;
  yLabel: string;
  timeLabel: string;
  step: (state: State) => State;
  observe: (state: State) => Observation;
  symbolic?: { label: string; value: string }[];
};
export const formatNumber = (value: number) =>
  Number.isFinite(value) ? Number(value.toPrecision(7)).toString() : '—';
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Physics compilation failed.';
function numeric(source: string, name: string) {
  if (!source.trim()) throw new Error(`${name} is required.`);
  const value = Number(source);
  if (!Number.isFinite(value))
    throw new Error(`${name} must be a finite number.`);
  return value;
}
function state(data: number[]): State {
  return { time: 0, steps: 0, data, previous: null };
}
function next(state: State, dt: number, data: number[]): State {
  const steps = state.steps + 1;
  if (
    !Number.isSafeInteger(steps) ||
    !Number.isFinite(steps * dt) ||
    steps * dt <= state.time
  )
    throw new Error('Simulation clock resolution exhausted.');
  return { data: finite(data), steps, time: steps * dt, previous: null };
}
function compile(world: WorldDefinition, settings: SolverSettings): Plan {
  if (!['nbody', 'ode', 'field', 'geodesic'].includes(settings.kind))
    throw new Error('Unsupported solver.');
  if (![1, 2, 3].includes(world.spacetime.spatialDimensions))
    throw new Error('Spatial dimensions must be 1–3.');
  const dt = positive(numeric(settings.dt, 'Δt'), 'Δt');
  const { spacetime } = world;
  if (spacetime.timeDimensions !== 1)
    throw new Error('Evolution requires exactly one time dimension.');
  const particles = world.contents.filter(
    (p): p is Particle => p.kind === 'particle',
  );
  const fields = world.contents.filter((p) => p.kind === 'field');
  const base = { kind: settings.kind, dt, timeLabel: 't (s)' };
  if (settings.kind === 'nbody') {
    if (spacetime.geometry !== 'euclidean')
      throw new Error(
        'Newtonian / Coulomb dynamics requires Euclidean space. Use prescribed-metric geodesics for Lorentzian geometry.',
      );
    if (fields.length)
      throw new Error(
        'N-body does not evolve fields. Remove field entries or select the scalar PDE solver.',
      );
    if (!particles.length || particles.length > 64)
      throw new Error(
        'N-body requires 1–64 particles. Add a particle to begin.',
      );
    const d = spacetime.spatialDimensions;
    const bodies: Body[] = particles.map((p) => ({
      ...p,
      ...world.initialConditions.particles[p.id],
      position: [...world.initialConditions.particles[p.id].position],
      velocity: [...world.initialConditions.particles[p.id].velocity],
    }));
    const unpack = (values: number[]) =>
      bodies.map((b, i) => ({
        ...b,
        position: values.slice(i * 2 * d, i * 2 * d + d),
        velocity: values.slice(i * 2 * d + d, (i + 1) * 2 * d),
      }));
    const pack = (list: Body[]) =>
      list.flatMap((b) => [...b.position, ...b.velocity]);
    const law = {
      gravity: !world.approximations.ignoredInteractions.includes('gravity'),
      coulomb:
        world.interactions.includes('electromagnetism') &&
        !world.approximations.ignoredInteractions.includes('electromagnetism'),
      softening: numeric(settings.softening, 'Softening'),
    };
    const initialDiagnostics = nbodyDiagnostics(bodies, law);
    return {
      ...base,
      label: 'Newtonian + electrostatic N-body · velocity Verlet',
      xLabel: `${spacetime.coordinates.space[0]} (m)`,
      yLabel: `${spacetime.coordinates.space[1] ?? 'transverse'} (m)`,
      initial: state(pack(bodies)),
      notices: [
        'SI units; instantaneous 3D inverse-square pair laws, including when trajectories are restricted to 1D/2D. No magnetic forces, radiation, collisions, or relativistic corrections.',
        `Fixed Δt. Softening ε = ${law.softening} m ${law.softening > 0 ? 'changes both potentials and forces.' : '(point-particle laws).'}`,
        'The encounter guard is a resolution check, not a guarantee of accuracy. Compare runs at Δt and Δt/2.',
      ],
      step: (s) => next(s, dt, pack(verlet(unpack(s.data), dt, law))),
      observe: (s) => {
        const b = unpack(s.data),
          diagnostic = nbodyDiagnostics(b, law);
        const drift = diagnostic.energy - initialDiagnostics.energy;
        return {
          points: b.map((body) => ({
            id: body.id,
            label: body.name,
            x: body.position[0],
            y: body.position[1] ?? 0,
          })),
          readings: [
            { label: 'Energy (J)', value: formatNumber(diagnostic.energy) },
            {
              label: initialDiagnostics.scale
                ? 'ΔE / initial energy scale'
                : 'ΔE (J)',
              value: formatNumber(
                initialDiagnostics.scale
                  ? drift / initialDiagnostics.scale
                  : drift,
              ),
            },
            {
              label: 'Total momentum (kg m/s)',
              value: diagnostic.momentum.map(formatNumber).join(', '),
            },
            {
              label: 'Minimum separation (m)',
              value: formatNumber(diagnostic.minDistance),
            },
          ],
          rows: b.flatMap((body) => [
            { label: `${body.name} position (m)`, values: body.position },
            { label: `${body.name} velocity (m/s)`, values: body.velocity },
          ]),
        };
      },
    };
  }
  if (settings.kind === 'field') {
    if (particles.length || fields.length !== 1)
      throw new Error(
        'Scalar PDE requires exactly one Field and no particles; coupled particle–field evolution is not implemented.',
      );
    if (spacetime.geometry !== 'euclidean' || spacetime.spatialDimensions !== 1)
      throw new Error('Scalar PDE requires Euclidean 1+1D spacetime.');
    const cfg: FieldConfig = {
      ...settings.field,
      length: numeric(settings.field.length, 'Domain length'),
      points: numeric(settings.field.points, 'Grid points'),
      coefficient: numeric(settings.field.coefficient, 'Coefficient'),
    };
    const field = compileField(cfg, dt);
    const isWave = cfg.equation === 'wave';
    return {
      ...base,
      label: isWave
        ? '∂²u/∂t² = c² ∂²u/∂x² · centered differences'
        : '∂u/∂t = D ∂²u/∂x² · explicit differences',
      xLabel: 'x (m)',
      yLabel: 'u (field units)',
      initial: state([...field.initial.values]),
      notices: [
        `${cfg.points} points; Δx = ${formatNumber(field.dx)} m; ${isWave ? 'CFL' : 'diffusion ratio'} = ${formatNumber(field.ratio)}.`,
        `${cfg.boundary === 'fixed' ? 'Fixed-zero endpoints' : 'Periodic sampled grid; matching endpoint values required'}; scalar ${isWave ? 'wave' : 'diffusion'} only. No Maxwell or general nonlinear PDE solver.`,
        'Initial profiles use x and L in metres; u is in user-defined field units.',
      ],
      step: (s) => {
        const result = field.step({
          values: s.data,
          previous: s.previous,
          time: s.time,
          steps: s.steps,
        });
        return { ...next(s, dt, result.values), previous: result.previous };
      },
      observe: (s) => ({
        points: s.data.map((value, i) => ({
          id: String(i),
          label: fields[0].name,
          x: i * field.dx,
          y: value,
        })),
        readings: [
          {
            label: 'max |u|',
            value: formatNumber(Math.max(...s.data.map(Math.abs))),
          },
          {
            label: 'Sample mean',
            value: formatNumber(
              s.data.reduce((sum, v) => sum + v, 0) / s.data.length,
            ),
          },
          { label: 'Grid ratio', value: formatNumber(field.ratio) },
        ],
        rows: [{ label: 'u at all stored grid points', values: s.data }],
      }),
    };
  }
  if (world.contents.length)
    throw new Error(
      'This solver uses its explicit state below. Remove particle/field entries; they are not coupled to this system.',
    );
  if (settings.kind === 'ode') {
    if (spacetime.geometry !== 'euclidean')
      throw new Error(
        'The custom ODE solver does not apply a spacetime metric. Use Euclidean geometry or select geodesics.',
      );
    const names = settings.ode.names.split(',').map((v) => v.trim());
    if (
      !names.length ||
      names.length > 12 ||
      new Set(names).size !== names.length ||
      names.some((name) => !validName(name) || name === 't')
    )
      throw new Error('Use 1–12 unique state names; t is reserved for time.');
    const lines = settings.ode.equations.split('\n').map((v) => v.trim());
    if (lines.length !== names.length)
      throw new Error(
        'Enter one right-hand side per state variable, in the same order.',
      );
    const equations = lines.map((line) =>
      parseExpression(line, ['t', ...names]),
    );
    const rhs = (t: number, values: number[]) => {
      const scope = Object.fromEntries(
        names.map((name, i) => [name, values[i]]),
      );
      scope.t = t;
      return equations.map((eq) => evaluate(eq, scope));
    };
    const initial = constantsVector(settings.ode.initial, names.length);
    rhs(0, initial);
    return {
      ...base,
      label: 'Custom first-order ODE system · RK4',
      timeLabel: 't (model units)',
      xLabel: 't (model units)',
      yLabel: 'State (model units)',
      initial: state(initial),
      notices: [
        'One right-hand side per line; explicit multiplication and consistent user-defined units.',
        'Fixed-step explicit RK4; stiff equations, DAEs, events, and dimensional analysis are not supported.',
      ],
      step: (s) => {
        const candidate = next(s, dt, rk4(s.data, s.time, dt, rhs));
        rhs(candidate.time, candidate.data);
        return candidate;
      },
      observe: (s) => ({
        points: s.data.map((value, i) => ({
          id: names[i],
          label: names[i],
          x: s.time,
          y: value,
        })),
        readings: [],
        rows: names.map((name, i) => ({ label: name, values: [s.data[i]] })),
      }),
    };
  }
  if (spacetime.geometry === 'euclidean')
    throw new Error(
      'Geodesics require Minkowski or a custom Lorentzian metric.',
    );
  const coords = [
    ...spacetime.coordinates.time,
    ...spacetime.coordinates.space,
  ];
  const metric = compileMetric(metricDescription(world), coords);
  const position = constantsVector(
    settings.geodesic.position,
    metric.dimension,
  );
  const tangent = constantsVector(settings.geodesic.tangent, metric.dimension);
  if (!tangent.some((v) => v !== 0))
    throw new Error('The tangent must be nonzero.');
  const geometry = metric.evaluateAt(position),
    initialNorm = metricNorm(geometry.g, tangent);
  const expected = settings.geodesic.causal === 'timelike' ? -1 : 0;
  if (!['timelike', 'null'].includes(settings.geodesic.causal))
    throw new Error('Unsupported causal type.');
  const tangentScale = Math.max(...tangent.map(Math.abs));
  const scaledTangent = tangent.map((v) => v / tangentScale);
  const scaledNorm = metricNorm(geometry.g, scaledTangent);
  const scaledNormScale = geometry.g.reduce(
    (sum, row, i) =>
      sum +
      row.reduce(
        (s, v, j) => s + Math.abs(v * scaledTangent[i] * scaledTangent[j]),
        0,
      ),
    0,
  );
  const invalidCausal =
    settings.geodesic.causal === 'timelike'
      ? initialNorm >= 0 || Math.abs(initialNorm + 1) > 1e-8
      : scaledNormScale === 0 || Math.abs(scaledNorm) > 1e-8 * scaledNormScale;
  if (invalidCausal)
    throw new Error(
      `Initial tangent must satisfy g(u,u) = ${expected}; current norm is ${formatNumber(initialNorm)}. Tangents are never silently normalized.`,
    );
  return {
    ...base,
    label: 'Prescribed metric · geodesic RK4 + analytic curvature',
    timeLabel: 'λ (affine)',
    xLabel: coords[1],
    yLabel: coords[2] ?? coords[0],
    initial: state([...position, ...tangent]),
    symbolic: metric.symbolic,
    notices: [
      'Signature (−,+,…); geometric units c=G=1. Coordinate order: ' +
        coords.join(', ') +
        '.',
      'Computes metric, inverse, Christoffel connection, Ricci tensor and scalar from symbolic first/second metric derivatives. R = 0 does not imply flat spacetime.',
      'Fixed background and test trajectory only. No Einstein-equation evolution, matter backreaction, or automatic coordinate-chart crossing. Domain/signature checks are pointwise.',
    ],
    step: (s) => {
      const data = rk4(s.data, s.time, dt, (_, values) =>
        geodesicRhs(metric, values),
      );
      const point = data.slice(0, metric.dimension),
        u = data.slice(metric.dimension);
      const g = metric.evaluateAt(point, false).g;
      if (
        settings.geodesic.causal === 'timelike'
          ? Math.abs(metricNorm(g, u) - initialNorm) > 1e-4
          : Math.abs(
              metricNorm(
                g,
                u.map((v) => v / tangentScale),
              ) - scaledNorm,
            ) >
            1e-4 * scaledNormScale
      )
        throw new Error(
          'Geodesic tangent norm drift exceeded 1e-4 of its initial scale. Reduce Δλ or check the coordinate domain.',
        );
      return next(s, dt, data);
    },
    observe: (s) => {
      const p = s.data.slice(0, metric.dimension),
        u = s.data.slice(metric.dimension),
        g = metric.evaluateAt(p);
      return {
        points: [{ id: 'geodesic', label: 'γ(λ)', x: p[1], y: p[2] ?? p[0] }],
        readings: [
          { label: 'g(u,u)', value: formatNumber(metricNorm(g.g, u)) },
          {
            label: 'Norm drift',
            value: formatNumber(metricNorm(g.g, u) - initialNorm),
          },
          { label: 'Ricci scalar R', value: formatNumber(g.scalar) },
        ],
        rows: [
          { label: 'Coordinates', values: p },
          { label: 'Affine tangent', values: u },
          ...g.g.map((row, i) => ({ label: `g[${i},:]`, values: row })),
          ...g.inverse.map((row, i) => ({
            label: `g inverse[${i},:]`,
            values: row,
          })),
          ...g.ricci.map((row, i) => ({ label: `Ricci[${i},:]`, values: row })),
          ...g.gamma.flatMap((layer, i) =>
            layer.map((row, j) => ({ label: `Γ[${i},${j},:]`, values: row })),
          ),
        ],
      };
    },
  };
}
/** Parse → validate compatibility → lower to an executable numerical plan. */
export function compileWorld(
  world: WorldDefinition,
  settings: SolverSettings,
): { plan: Plan; error: null } | { plan: null; error: string } {
  try {
    const plan = compile(world, settings);
    plan.observe(plan.initial);
    return { plan, error: null };
  } catch (error) {
    return { plan: null, error: errorText(error) };
  }
}
export function advance(
  plan: Plan,
  initial: State,
  count = 1,
): { state: State; error: string | null } {
  let current = initial;
  try {
    if (!Number.isInteger(count) || count < 1 || count > 128)
      throw new Error('Advance count must be 1–128.');
    for (let i = 0; i < count; i++) {
      const candidate = plan.step(current);
      plan.observe(candidate); // Commit only a fully observable finite state.
      current = candidate;
    }
    return { state: current, error: null };
  } catch (error) {
    return {
      state: current,
      error: `Stopped at ${plan.timeLabel} = ${formatNumber(current.time)}: ${errorText(error)}`,
    };
  }
}
