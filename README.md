# RailPlan

RailPlan is a planner-first rail maintenance scheduling prototype for the LTA hackathon challenge. It demonstrates how an overnight planning team could review competing work, understand declared conflicts, compare recommended placements, retain human control, and respond to disruptions.

The current version does not run a solver or independently validate every planning constraint. Its six conflicts, five strategy schedules, metrics, alternatives, and disruption responses are preconfigured for a reliable hackathon demonstration.

## What teammates can try

- Start with an attention-first queue of 22 fabricated work requests.
- Inspect six declared track, team, equipment, and safety-buffer conflicts.
- Compare the Submitted plan with five deterministic Recommended strategy fixtures.
- Review jobs placed, critical-work coverage, declared conflicts, and engineering-window load.
- Inspect the affected corridor, placement explanation, alternatives, and release-readiness summary.
- Accept or retain a placement, lock work, and test four disruption-response scenarios.

## Quick start

Requirements: Node.js 22 and npm. No environment variables, backend, database, or external service are required.

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), select **Load sample requests**, and follow the demo flow below.

## Two-minute demo flow

1. Review the six declared conflicts and open an individual issue.
2. Select a planning objective and choose **Resolve conflicts**.
3. Compare **Submitted** and **Recommended** placements.
4. Select a request to inspect its timing, reason, corridor, and planner controls.
5. Choose **Test disruption**, apply a scenario, and replan affected work.
6. Review the prepared response and release-readiness indicators.

## Quality checks

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

The current verified baseline is 17 passing tests plus clean lint, typecheck, and production build. CI runs the same checks on pushes and pull requests.

## Current architecture

```text
deterministic TypeScript fixtures
            ↓
Zustand state and visible-schedule selector
            ↓
planner locks and alternative overlays
            ↓
attention queue · access timeline · request inspector · decision signals
```

The app uses Next.js 16, React 19, TypeScript, Tailwind CSS, Zustand, Radix primitives, Framer Motion, Vitest, and Testing Library. See [Architecture](docs/ARCHITECTURE.md) and the [current implementation audit](docs/CURRENT_IMPLEMENTATION_AUDIT.md) before changing behaviour.

## Product truth

- Implemented: planner-first UI, fixture comparison, selection, locks, alternatives, disruption simulations, persistence of strategy/lock IDs, and automated UI/state tests.
- Simulated: optimisation, conflict counts, KPIs, explanations, alternatives, and disruption response schedules.
- Not implemented: general constraint validation, a solver, authoritative track topology, live MRT data, backend APIs, authentication, audit logs, or file export.
- Operational boundary: fabricated data only; do not use the prototype for real maintenance or safety decisions.

## Documentation

Start with the [documentation index](docs/README.md). It separates current implementation truth, accepted decisions, and proposed future work.

- [Teammate handoff](docs/TEAM_HANDOFF.md)
- [Current implementation audit](docs/CURRENT_IMPLEMENTATION_AUDIT.md)
- [Project status](docs/PROJECT_STATUS.md)
- [Deterministic scheduling and analytics proposal](docs/DETERMINISTIC_SCHEDULING_AND_ANALYTICS.md)
- [Rail scheduling research survey](docs/RAIL_SCHEDULING_RESEARCH.md)

The proposed path replaces fixture-declared truth with atomic track blocks, a deterministic constraint validator, calculated KPIs, graph-aware mapping, and—only after an explicit architecture decision—a real optimisation solver.

## Contributing

Read [AGENTS.md](AGENTS.md) and the [documentation index](docs/README.md) before implementation. Keep changes small, update the relevant planning documents, and run all four quality commands before opening a pull request. The repository is private, so teammates need collaborator access from the owner.
