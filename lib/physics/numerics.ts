export function finite(values: number[], label = 'Numerical state'): number[] {
  if (!values.every(Number.isFinite))
    throw new Error(
      `${label} is nonfinite; reduce the timestep or check the model domain.`,
    );
  return values;
}
export function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`${label} must be finite and positive.`);
  return value;
}
export function rk4(
  y: number[],
  t: number,
  h: number,
  rhs: (t: number, y: number[]) => number[],
): number[] {
  positive(h, 'Timestep');
  const stage = (time: number, state: number[]) => {
    const d = finite(rhs(time, finite(state)), 'Derivative');
    if (d.length !== y.length)
      throw new Error('Derivative dimension mismatch.');
    return d;
  };
  const k1 = stage(t, y);
  const k2 = stage(
    t + h / 2,
    y.map((v, i) => v + (h * k1[i]) / 2),
  );
  const k3 = stage(
    t + h / 2,
    y.map((v, i) => v + (h * k2[i]) / 2),
  );
  const k4 = stage(
    t + h,
    y.map((v, i) => v + h * k3[i]),
  );
  return finite(
    y.map((v, i) => v + (h * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])) / 6),
  );
}
export const G = 6.6743e-11;
export const KE = 8.98755178617e9;
export type Body = {
  id: string;
  name: string;
  mass: number;
  charge: number;
  position: number[];
  velocity: number[];
};
export type ForceLaw = {
  gravity: boolean;
  coulomb: boolean;
  softening: number;
};
export function forces(bodies: Body[], law: ForceLaw) {
  if (!Number.isFinite(law.softening) || law.softening < 0)
    throw new Error('Softening must be finite and nonnegative.');
  const dimension = bodies[0]?.position.length ?? 1;
  for (const body of bodies) {
    positive(body.mass, `${body.name} mass`);
    finite([...body.position, ...body.velocity, body.charge]);
    if (
      body.position.length !== dimension ||
      body.velocity.length !== dimension
    )
      throw new Error('Particle dimension mismatch.');
  }
  const acceleration = bodies.map(() => Array<number>(dimension).fill(0));
  let potential = 0,
    potentialScale = 0,
    minDistance = Infinity;
  for (let i = 0; i < bodies.length; i++)
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i],
        b = bodies[j];
      const d = b.position.map((x, k) => x - a.position[k]);
      const distance = Math.hypot(...d),
        s = Math.hypot(distance, law.softening);
      minDistance = Math.min(minDistance, distance);
      const grav = law.gravity ? G * a.mass * b.mass : 0;
      const electric = law.coulomb ? KE * a.charge * b.charge : 0;
      if (grav === 0 && electric === 0) continue;
      if (s === 0)
        throw new Error(
          `Point-particle singularity: ${a.name} and ${b.name} coincide. Set distinct positions or explicit softening.`,
        );
      const coefficient = grav - electric;
      for (let k = 0; k < dimension; k++) {
        const force = (coefficient * (d[k] / s)) / s / s;
        acceleration[i][k] += force / a.mass;
        acceleration[j][k] -= force / b.mass;
      }
      potential += -coefficient / s;
      potentialScale += (Math.abs(grav) + Math.abs(electric)) / s;
    }
  acceleration.forEach((a) => finite(a, 'Acceleration'));
  finite([potential, potentialScale], 'Potential');
  return { acceleration, potential, potentialScale, minDistance };
}
export function nbodyDiagnostics(bodies: Body[], law: ForceLaw) {
  const force = forces(bodies, law);
  const kinetic = bodies.reduce(
    (sum, b) => sum + (b.mass * b.velocity.reduce((v, x) => v + x * x, 0)) / 2,
    0,
  );
  const momentum = bodies[0].velocity.map((_, k) =>
    bodies.reduce((sum, b) => sum + b.mass * b.velocity[k], 0),
  );
  finite([kinetic, kinetic + force.potential, ...momentum], 'Diagnostics');
  return {
    energy: kinetic + force.potential,
    scale: kinetic + force.potentialScale,
    momentum,
    minDistance: force.minDistance,
  };
}
export function verlet(bodies: Body[], h: number, law: ForceLaw): Body[] {
  positive(h, 'Timestep');
  const initial = forces(bodies, law);
  // Refuse grossly unresolved encounters; this is a resolution guard, not an error estimate.
  for (let i = 0; i < bodies.length; i++)
    for (let j = i + 1; j < bodies.length; j++) {
      if (
        !law.gravity &&
        (!law.coulomb || bodies[i].charge * bodies[j].charge === 0)
      )
        continue;
      const scale = Math.hypot(
        ...bodies[i].position.map((x, k) => x - bodies[j].position[k]),
        law.softening,
      );
      const travel =
        h *
          Math.hypot(
            ...bodies[i].velocity.map((v, k) => v - bodies[j].velocity[k]),
          ) +
        (h *
          h *
          Math.hypot(
            ...initial.acceleration[i].map(
              (a, k) => a - initial.acceleration[j][k],
            ),
          )) /
          2;
      if (travel > 0.2 * scale)
        throw new Error(
          'Encounter is unresolved at this timestep. Reduce Δt or review explicit softening.',
        );
    }
  const half = bodies.map((b, i) => ({
    ...b,
    position: finite(
      b.position.map(
        (x, k) =>
          x + h * b.velocity[k] + (h * h * initial.acceleration[i][k]) / 2,
      ),
    ),
    velocity: finite(
      b.velocity.map((v, k) => v + (h * initial.acceleration[i][k]) / 2),
    ),
  }));
  const next = forces(half, law);
  return half.map((b, i) => ({
    ...b,
    velocity: finite(
      b.velocity.map((v, k) => v + (h * next.acceleration[i][k]) / 2),
    ),
  }));
}
