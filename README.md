# Theatrum Physicum

**Construct. Evolve. Observe.**

Part of Tech Echo Physica, a Tech Echo Collective project family for exploring physics through research mapping, knowledge structures, and interactive physical systems.

Theatrum Physicum now compiles bounded mathematical world definitions into numerical evolution. Genesis still begins with an empty world: define spacetime, introduce contents, select a dynamical model, set initial conditions, compile, evolve and observe. The original minimal landing page, amphitheatre identity, two-column workspace and English/Chinese controls remain. Solver diagnostics and mathematical reference text are currently in English.

## Implemented physics

| Model                  | Actual computation                                                                                                                                     | Limits                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| N-body                 | Pairwise Newtonian gravity and electrostatic Coulomb forces; velocity Verlet; energy and momentum diagnostics                                          | 1–64 positive-mass particles, Euclidean space, SI units; 1D/2D trajectories still use the ordinary 3D inverse-square laws |
| Custom ODE             | Parse a first-order system `dy/dt = f(t,y)` and integrate with RK4                                                                                     | 1–12 state variables; fixed-step explicit solver; user supplies consistent units                                          |
| Scalar PDE             | 1D wave `u_tt = c² u_xx` and diffusion `u_t = D u_xx`; centered spatial differences; real field samples                                                | One scalar field, 8–512 grid points, fixed-zero or periodic boundaries; no particles coupled to it                        |
| Prescribed metric / GR | Symbolic first and second metric derivatives; metric and inverse; Christoffel connection; Ricci tensor and scalar; timelike or null geodesics with RK4 | 2–4 spacetime coordinates, Lorentz signature (−,+,…), fixed background, geometric units c=G=1                             |

These are working numerical modules, not visual animation presets. This is **not** a universal physics compiler or a full general-relativistic field solver. In particular, it does not evolve the Einstein equations, implement matter backreaction, propagate Maxwell fields, solve arbitrary nonlinear PDEs, perform general tensor-index algebra, or handle collisions. Coordinate charts do not change automatically. Stiff ODEs, DAEs, event location and adaptive error control are not implemented.

## Use the runtime

Click **Genesis**, select the **Dynamical model** under Interactions, configure its state under **Operations**, then select **Compile world → Run**. **Step** advances one numerical step; **Pause** stops scheduling steps; **Reset** restores the compiled initial state and diagnostic baseline. Editing the definition or solver settings invalidates the compiled runtime, including incomplete numeric drafts. A compile error leaves Run disabled. An evolution error pauses and retains the last valid state.

For a first equation-driven run, choose **ODE · RK4** in an empty Euclidean world. The editable initial system is `q' = v`, `v' = -q`, with state `(1,0)` and Δt = 0.01. Compile and run to see numerical oscillation. This is an explicit editable equation definition, not a simulation gallery.

For particles, add Particle entries and edit mass, charge, position and velocity. Interacting point particles need distinct initial positions. At least one positive mass makes gravity eligible; at least one charge makes electrostatics eligible. Forces are evaluated only between pairs, never as self-forces. Applicable interactions default to enabled, and ignored choices survive removing/reintroducing sources. Fields do not inherit these pair-force switches. Zero-mass particle entries can be edited but cannot compile under N-body.

For a field, select **Scalar PDE · 1D**, set Euclidean **1+1D**, add exactly one Field and remove particles. Set the equation, length, grid, coefficient, boundary and initial profile in Operations. Wave inputs are displacement and its initial time derivative; heat needs only displacement. Profiles may use `x` and `L`. The default wave profile `sin(pi*x/L)` has fixed-zero endpoints. Heat often requires a smaller Δt; compilation reports the permitted value.

For a geodesic, use an empty Minkowski or Custom world and select **GR · Prescribed metric**. Event and tangent components include time first, using the coordinate labels set in Spacetime. The metric editor accepts `diag(-1,1,1,1)` or a matrix with comma-separated entries and semicolon-separated rows. Matching off-diagonal entries must use the same expression. The tangent must satisfy `g(u,u) = -1` for normalized timelike motion or `0` for a nonzero null direction; it is never silently normalized. λ is affine, and equals proper time only for normalized timelike trajectories. Future direction is not inferred from the sign of the first component in an arbitrary chart.

### Schwarzschild verification setup

With Custom geometry in 3+1D, use coordinates `t, r, theta, phi` and

```text
diag(-(1-2/r),1/(1-2/r),r^2,r^2*sin(theta)^2)
```

This fixes mass M=1 in geometric units. Initial event `0,10,pi/2,0` and tangent `1/sqrt(0.7),0,0,sqrt(0.001)/sqrt(0.7)` describe a circular timelike test trajectory; try Δλ = 0.01. This chart is singular at r=2 and the polar axes. The implementation checks finite values, matrix conditioning and signature at every integration stage; it does not prove validity over an entire chart or perform horizon crossing. A zero Ricci scalar does **not** establish flatness: the Schwarzschild exterior is curved and Ricci-flat.

## Compiler, mathematics and runtime contract

```text
WorldDefinition + SolverSettings
→ expression AST and compatibility validation
→ executable numerical plan and initial state
→ checked solver steps
→ numerical state, diagnostics, coordinate plots
```

`lib/world.ts` remains the immutable geometric/entity editor. `SolverSettings` in `lib/physics/compiler.ts` is the authoritative dynamical specification: solver kind, timestep, softening, ODE equations, field/boundary data and geodesic initial data. The former constant classical-dynamics label has been removed from the world model. Geometry does not silently choose a theory. The compiler rejects unsupported combinations; it never silently drops particle or field contents. Field entries are unresolved declarations until compiled with their scalar PDE configuration.

The language in `lib/physics/expression.ts` accepts finite numeric literals, declared variables, `+ - * / ^`, `sin`, `cos`, `exp`, `log`, `sqrt`, and constants `pi`, `e`. Multiplication must be explicit. Powers associate rightwards and bind more tightly than unary minus: `-2^2 = -4`. There is no `eval`, `Function`, JavaScript, property access, assignment or implicit identifier lookup. Each expression is limited to 2,048 characters, 256 tokens and nesting depth 32. Symbolic derivative expansion has a 4,096-node budget and depth 64. The original metric expression is evaluated before simplified derivatives, preserving its domain checks. Differentiability remains necessary for curvature.

`lib/physics/numerics.ts` uses G = 6.67430×10⁻¹¹ and k_e = 8.98755178617×10⁹ in SI. For displacement d = x_j − x_i and s² = |d|² + ε²:

```text
F_i←j = (G m_i m_j − k_e q_i q_j) d / s³
U_ij  = (−G m_i m_j + k_e q_i q_j) / s
```

The equal/opposite force is accumulated once per pair. Positive ε is an explicit change to the force law and potential, not a hidden collision clamp. An encounter-resolution guard rejects a step when relative estimated displacement exceeds 20% of softened separation. It is a heuristic, not an accuracy guarantee. Energy drift is normalized by initial kinetic energy plus absolute pair potentials, avoiding division by a possibly zero total energy; when that scale is zero, absolute drift is shown.

`lib/physics/pde.ts` implements the wave initial step with the required initial-velocity and half-Laplacian terms. Subsequent wave steps use centered differences in time. Diffusion uses forward Euler. The enforced conservative stability bounds are cΔt/Δx ≤ 0.95 and DΔt/Δx² ≤ 0.45. Periodic grids store N distinct points with Δx=L/N; fixed grids include both endpoints with Δx=L/(N−1). Endpoint values are checked with tolerance 10⁻¹⁰ times max(1, profile scale); fixed endpoints are then snapped to zero. Periodic endpoint values must agree, but smooth periodic derivatives are not enforced. Grid and timestep refinement are still needed to assess accuracy.

`lib/physics/geometry.ts` differentiates the metric analytically, obtains inverse-metric derivatives from ∂g⁻¹ = −g⁻¹(∂g)g⁻¹, and uses the convention

```text
Γᵃ_bc = ½ gᵃᵈ (∂b g_dc + ∂c g_db − ∂d g_bc)
R_ab  = ∂c Γᶜ_ab − ∂b Γᶜ_ac + Γᶜ_ab Γᵈ_cd − Γᵈ_ac Γᶜ_bd
x'ᵃ   = uᵃ
u'ᵃ   = −Γᵃ_bc uᵇ uᶜ
```

Signature is checked using symmetric Jacobi eigenvalues, including off-diagonal time charts. Singular/poorly conditioned matrices are rejected relative to their coefficient scale. Norm drift exceeding 10⁻⁴ of the relevant initial tangent scale stops geodesic integration. This check does not bound trajectory error.

The browser runtime uses float64 arithmetic, immutable candidate states and fixed timesteps. Each rendered frame starts at most 16 steps and observes an 8 ms cooperative work budget; an individual step cannot be preempted and may exceed that budget. It reports achieved model-time per wall second and never advances simulated time without integrating. Traces retain the last 300 displayed samples. Axes scale independently; plots are coordinate projections, not invariant distances or faithful orbit aspect ratios. Full coordinate, field and tensor values remain inspectable. Runtime state is in memory only and is lost on reload.

## Validation and development

Requires Node.js 22.13+ and npm:

```sh
npm ci
npm run dev
npm run verify
```

`verify` checks formatting, application lint, TypeScript, Vitest and the production build. Tests cover closed-parser rejection, derivatives at polynomial zeros, Newton/Coulomb signs and softened potential gradients, free drift, circular-orbit second-order convergence, an analytic Coulomb endpoint, RK4 fourth-order convergence and time-dependent forcing, wave/heat Fourier modes, wave refinement, boundary/CFL rejection, Lorentz signature edge cases, flat moving/polar charts, sphere and conformal curvature, Schwarzschild vacuum/circular motion, causal classification, domain rollback and Run/Pause/Step/Reset/invalidation. UI tests use jsdom, not a browser rendering engine.

The existing React/Vinext/Sites stack, fonts, border language and dark presentation are retained. No new numerical dependency, database, account system, AI generation, collaboration system or example gallery was added. The existing Sites project and audience are preserved through `.openai/hosting.json`; credentials are never stored in the repository.

### Mathematical references

- [NIST CODATA constants](https://physics.nist.gov/cuu/pdf/all.pdf).
- [GROMACS velocity Verlet integration](https://manual.gromacs.org/documentation/2021-current/reference-manual/algorithms/molecular-dynamics.html).
- [LAMMPS Coulomb potential](https://docs.lammps.org/stable/pair_coul.html).
- [MIT finite-difference wave equation notes](https://ocw.mit.edu/courses/18-086-mathematical-methods-for-engineers-ii-spring-2006/8eaa23367474c809cc0816f24fdacc7f_am53.pdf) and [heat equation notes](https://math.mit.edu/classes/18.086/2006/am54.pdf).
- [David Tong: differential geometry and curvature](https://www.damtp.cam.ac.uk/user/tong/gr/grhtml/S3.html), [geodesics](https://www.damtp.cam.ac.uk/user/tong/gr/grhtml/S1.html), and [Schwarzschild geometry](https://www.damtp.cam.ac.uk/user/tong/gr/grhtml/S6.html).

## Tech Echo Physica

The family brings together distinct projects: [Atlas Physicus](https://github.com/Tech-Echo-Collective/atlas-physicus) for research mapping, [Illuminatio Physica](https://github.com/Tech-Echo-Collective/illuminatio-physica) for knowledge structures, and [Theatrum Physicum](https://github.com/Tech-Echo-Collective/theatrum-physicum) for physical dynamics and interactive evolution. Visit [Tech Echo](https://techecho.org/).

## License

Apache License 2.0. Copyright 2026 Tech Echo Collective. See [LICENSE](LICENSE). IBM Plex font licensing is preserved in `public/assets/fonts/LICENSE-IBM-Plex.txt`.
