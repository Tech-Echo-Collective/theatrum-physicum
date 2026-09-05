# Theatrum Physicum

**Construct. Evolve. Observe.**

Part of Tech Echo Physica, a Tech Echo Collective project family for exploring physics through research mapping, knowledge structures, and interactive physical systems.

Theatrum Physicum is an interactive physics environment for defining physical worlds and, eventually, evolving them from their mathematical definitions. It begins with a world, rather than a catalogue of simulations.

## Current status: Genesis foundation

The first product shell includes a minimal Genesis landing page, a world-definition workspace, editable particles, field placeholders, property-based interaction applicability, approximation choices, a live configuration summary and a static coordinate stage. English and Chinese are supported; the browser language sets the initial language, and the builder offers a language selector.

**There is no physics engine or evolving runtime.** Run, Pause and Reset are disabled. Particle positions are projected directly from the initial conditions; the application does not animate them or calculate forces. Definitions exist only in React memory and are lost on reload. No accounts, database or browser persistence are added.

## Genesis flow

```text
Genesis → Spacetime → Physical Contents → Interactions → Initial Conditions
                                                    → Evolution → Observation
                                                      (future)
```

Genesis instantiates an empty Euclidean 3+1D definition with an independent classical dynamics approximation. The workspace keeps definition controls on the left and the current world/stage on the right. On smaller screens the summary and stage remain together above the controls.

The future execution pipeline remains deferred:

```text
World Definition → Physics Compiler → Equations of Motion → Solver → Runtime → Visualization
```

## World model

`lib/world.ts` contains a small immutable reducer and the `WorldDefinition` type:

- `spacetime`: dimensions, geometry, coordinate names and an unevaluated custom-metric draft.
- `dynamics`: the explicitly labelled classical approximation, independent of geometry.
- `contents`: particle definitions (identity, mass and charge) or undefined field entries.
- `interactions`: the recognized interaction kinds, electromagnetism and gravity.
- `approximations`: the user's ignored interaction kinds.
- `initialConditions`: particle position/velocity vectors, plus reserved field and boundary configuration states.

Position and velocity have one authoritative home in `initialConditions`; particle cards, the initial-state ledger and the stage all use it. Reducing spatial dimensions removes unused vector components; expanding adds zeros and collision-free coordinate labels. Deleting a particle removes its initial conditions. SI labels apply to particle inputs (kg, C, m, m/s).

The initial editor supports 1–3 spatial dimensions and 0–1 time dimensions. Euclidean means a spatial identity metric with an independent time parameter, when present. Minkowski uses one time dimension with the time-first negative signature; selecting it does not change the dynamics approximation or interaction preferences. Custom metric text is stored without parsing, validation or execution.

## Interactions and approximations

Applicability is derived from particle properties on every change. At least one positive-mass particle makes gravity eligible; at least one particle with nonzero charge makes electromagnetism eligible. Opposite charges do not cancel applicability. This is source eligibility, not a force calculation, pairwise solver or claim of self-force.

Each interaction is displayed as **Not applicable**, **Enabled** or **Ignored**. Applicable interactions default to enabled. An explicit ignored preference survives the temporary removal of eligible sources. Undefined field entries are not assessed for interaction applicability and do not create an operational field. Zero mass can be recorded, but massless dynamics are not implemented.

## Development and validation

Requires Node.js 22.13 or newer and npm.

```sh
npm ci
npm run dev
npm run verify
```

`verify` checks formatting, application lint, TypeScript, domain/component regressions and the production build. Lint excludes unchanged generated UI primitives; they remain covered by TypeScript and the component tests. The inline SVG stage deliberately uses accessible image semantics, and the small local SVG identity uses a native image without an optimization service. Component tests use jsdom; they do not constitute browser or visual testing. The application uses React, TypeScript, Vinext and the Sites starter's accessible UI primitives. Fonts, restrained colors, borders and the Roman amphitheatre icon follow the Tech Echo website. The existing dark presentation is retained without a new theme system.

The Sites project is recorded in `.openai/hosting.json`. No database, object storage or application-authentication binding is requested. Source credentials are never stored in the repository. Publish only the exact validated build through the existing Sites project.

## Deferred

Physics compilation, arbitrary equation parsing, numerical/ODE/PDE solvers, Newtonian N-body dynamics, field evolution and propagation, general relativity, symbolic tensor algebra, custom-metric evaluation, a WebGL physics engine and all real runtime operations remain unimplemented. AI generation, collaboration, persistence, accounts and template/example galleries are also outside this foundation.

## Tech Echo Physica

The family brings together three distinct projects: [Atlas Physicus](https://atlas.techecho.org/) for the research landscape, [Illuminatio Physica](https://illuminatio.techecho.org/) for knowledge structure, and Theatrum Physicum for physical dynamics and interactive evolution.

Project repositories: [Atlas Physicus](https://github.com/Tech-Echo-Collective/atlas-physicus), [Illuminatio Physica](https://github.com/Tech-Echo-Collective/illuminatio-physica), and [Theatrum Physicum](https://github.com/Tech-Echo-Collective/theatrum-physicum).

Visit [Tech Echo](https://techecho.org/).

## License

Apache License 2.0. Copyright 2026 Tech Echo Collective. See [LICENSE](LICENSE). IBM Plex font licensing is preserved in `public/assets/fonts/LICENSE-IBM-Plex.txt`.
