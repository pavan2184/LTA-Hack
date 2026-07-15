# Teammate Handoff

Last updated: 2026-07-15

## Snapshot

RailPlan v0.1.0 is a frontend-only, presentation-ready simulation for the LTA smarter-maintenance-planning challenge. The product workflow is implemented and tested; the scheduling mathematics are researched and designed but not yet implemented as a validator or solver.

Use this document for a fast project orientation. For exact code truth, read `CURRENT_IMPLEMENTATION_AUDIT.md`; for current priorities and limitations, read `PROJECT_STATUS.md`.

## Get Running

Requirements: Node.js 22 and npm.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. No `.env` file or external service is required.

Before sharing a change, run:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Current verified baseline: 17/17 Vitest tests, clean lint and typecheck, successful static production build, and HTTP 200 from the local frontend. Responsive visual browser UAT remains outstanding because no browser session was available during the last verification.

## Five-Minute Product Tour

1. Select `Load sample requests`.
2. The `Attention` filter shows conflicted or unscheduled work first.
3. Open a conflict to inspect the affected request and declared reason.
4. Choose a `Planning objective`, then select `Resolve conflicts`.
5. Compare `Submitted` and `Recommended` plans and inspect changed timing.
6. Review the affected corridor, placement reason, alternatives, and release readiness.
7. Select `Test disruption`, apply a scenario, and replan affected work.

## What Is Real Versus Simulated

| Area | Current status |
| --- | --- |
| Planner interface and interactions | Implemented |
| Requests, conflict records, strategy plans, KPIs, and responses | Deterministic TypeScript fixtures |
| Optimisation and replanning | Fixed UI timers that select fixtures |
| Conflict validation | Limited tests only; no general validator |
| Network view | Fixed station-code schematic |
| Persistence | Selected strategy and locked request IDs in localStorage |
| Backend, auth, database, live feeds, export | Not implemented |

Important: a strategy displaying zero declared conflicts is not proof of feasibility. All strategy fixtures retain at least the known `M-004`/`M-011` shared thermal-imaging-unit overlap. Never describe the current recommendation as independently validated or operationally safe.

## Code Map

| Area | Location |
| --- | --- |
| Page composition and top-level states | `src/components/layout/DashboardShell.tsx` |
| Planning objective and primary actions | `src/components/controls/StrategyControls.tsx` |
| Request triage | `src/components/requests/RequestQueue.tsx` |
| Access timeline | `src/components/schedule/ScheduleTimeline.tsx` |
| Conflict/request inspector and readiness | `src/components/insights/DetailsPanel.tsx`, `src/components/metrics/PlanReadinessCard.tsx` |
| State transitions and visible schedule | `src/store/useRailPlanStore.ts` |
| Requests and schedule fixtures | `src/data/` |
| Domain contracts | `src/types/railplan.ts` |
| Automated tests | `src/test/` |

## Documentation Reading Order

1. `PROJECT_BRIEF.md`
2. `ARCHITECTURE.md`
3. `DATA_MODEL.md`
4. `API_CONTRACT.md`
5. `TESTING.md`
6. `SECURITY_REVIEW.md`
7. `DECISIONS.md`
8. `PROJECT_STATUS.md`
9. `CURRENT_IMPLEMENTATION_AUDIT.md`

The mathematical design is in `DETERMINISTIC_SCHEDULING_AND_ANALYTICS.md`. Supporting papers and feature mappings are in `RAIL_SCHEDULING_RESEARCH.md`. Both are proposals/research, not implemented product claims.

## Recommended Next Milestone

Implement the proposed frontend-only deterministic P0 before introducing AI or a backend solver:

1. Represent sectors as atomic track blocks.
2. Add a pure TypeScript conflict validator for windows, blocks, shared teams/equipment, buffers, dependencies, and compatibility.
3. Run it against original, strategy, disruption, lock, and alternative placements.
4. Replace fixture KPI claims with calculated values and structured provenance.
5. Keep the existing planner-first UI and expose exact constraint reasons.

Acceptance should require every displayed recommendation to pass the independent validator, or to show an explicit infeasible/partially validated state.

## Collaboration Rules

- Branch from `main`; use a focused feature branch and pull request.
- Read `AGENTS.md` and the required project documents before code changes.
- Update `PROJECT_STATUS.md` after meaningful work and `DECISIONS.md` after product/architecture decisions.
- Update `DATA_MODEL.md`, `API_CONTRACT.md`, `TESTING.md`, or `SECURITY_REVIEW.md` when their contracts change.
- Never delete tests to make CI pass or present fixture metadata as calculated safety assurance.
- Preserve the deterministic demo until a replacement decision is accepted and documented.

## Sharing and Access

The GitHub repository is private. The owner must grant each teammate collaborator or organisation access. Teammates should clone the repository, run `npm ci`, and use pull requests so CI and review history remain visible.
