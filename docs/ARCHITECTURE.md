# Architecture

Last updated: 2026-07-15

## Overview

RailPlan is a static Next.js App Router application. The root server component renders one client dashboard. Deterministic data modules contain all requests, conflicts, strategy schedules, metrics, and disruption responses. A persisted Zustand store owns demo state and delegates derived schedule resolution to pure utilities.

Status: implemented current architecture. The constraint engine, graph model, calculated statistics, and solver in `DETERMINISTIC_SCHEDULING_AND_ANALYTICS.md` are proposals and are not part of this architecture.

## Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS.
- UI: shadcn-style Radix primitives, Lucide icons, Framer Motion, date-fns, and Sonner notifications. Recharts remains installed but is no longer rendered.
- State: Zustand with localStorage persistence limited to strategy and locked IDs.
- Tests: Vitest, Testing Library, user-event, jsdom.
- Backend/database/auth/deployment API: none.

## Folder Structure

```text
src/
  app/                 App Router entry and global styles
  components/          layout, metrics, controls, requests, schedule, insights, network, disruption, ui
  data/                deterministic requests and schedule variants
  store/               Zustand store
  types/               domain interfaces
  utils/               time, schedule, and class helpers
  test/                test setup and focused component/store tests
docs/
  README.md            documentation index and source-of-truth rules
  CURRENT_IMPLEMENTATION_AUDIT.md
                       exact code behaviour and known gaps
  DETERMINISTIC_SCHEDULING_AND_ANALYTICS.md
                       proposed mathematical evolution
  RAIL_SCHEDULING_RESEARCH.md
                       annotated research evidence
```

## Core Flows

1. `loadDemo` selects the original schedule and its six conflicts.
2. `optimise` shows progress copy, then selects the active strategy schedule after a fixed delay.
3. Strategy changes replace only unlocked placements and metrics.
4. Disruption activation overlays an event and degraded metrics; replanning loads a deterministic response schedule.
5. Alternative choices and recommendation actions update local overrides.

The words “optimise” and “replan” describe UI flows. No optimisation or replanning algorithm runs in v0.1.0.

## Data Flow and Boundaries

UI events call store actions. Selectors combine store state with imported immutable datasets. Components receive domain objects and emit explicit callbacks. No network calls occur, and the interface does not expose an export action.

```text
immutable TypeScript fixtures
          ↓
Zustand state + schedule selector
          ↓
planner lock/alternative overlays
          ↓
attention queue · timeline · request inspector/schematic · decision signals
```

Conflict records, metrics, explanations, alternatives, and disruption impacts are parallel fixture data. They are not recalculated after planner overlays, which means the visible placement and displayed KPIs can diverge.

## Presentation Hierarchy

- The command bar has one primary action for the current state: resolve conflicts, rebuild a recommendation, or replan affected work.
- The four headline signals are jobs placed, critical work, declared conflicts, and engineering-window load.
- The request queue defaults to work needing attention; individual conflicts are directly selectable.
- Submitted and Recommended are the two explicit plan views.
- The fixed network schematic appears only in selected-request context.
- The inspector ends with a release-readiness checklist. It does not present the fixture robustness score as a validated operational measure.

## State and Persistence Boundary

- Zustand owns view, strategy, selection, lock IDs/placements, accept/reject state, disruptions, loading state, and alternatives.
- localStorage persists only `selectedStrategy` and `lockedRequestIds` under `railplan-preferences`.
- Exact `lockedPlacements` do not persist across reload, so only in-session placement preservation is guaranteed.
- No server state, remote cache, or database exists.

## Current Validation Boundary

- Data tests validate counts, references, time bounds, and exact same-sector non-overlap for strategy fixtures.
- There is no reusable validator for team, equipment, skills, work compatibility, dependencies, safety zones, adjacent track blocks, travel, or planner overrides.
- A strategy reporting `activeConflicts: 0` is a fixture assertion rather than a general feasibility proof.
- All five strategy fixtures retain the `M-004`/`M-011` thermal imaging unit overlap described by original conflict `C-04`; exact-sector tests do not see cross-sector resource conflicts.
- See `CURRENT_IMPLEMENTATION_AUDIT.md` for the complete constraint and metric gap inventory.

## Deployment Assumptions and Tradeoffs

- Any Node host capable of building Next.js can serve the prototype.
- Precomputed schedules guarantee a reliable demo but are not operationally valid solutions.
- The custom Gantt timeline prioritises visual control and low dependency weight over drag-and-drop editing.

## Proposed Evolution Boundary

The proposed frontend-only P0 adds atomic blocks, a pure TypeScript validator, and calculated KPIs. A CP-SAT or MILP service would introduce a backend and requires an explicit accepted decision plus coordinated changes to architecture, data, API, testing, security, and deployment documentation.
