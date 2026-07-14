# Architecture

Last updated: 2026-07-15

## Overview

RailPlan is a static Next.js App Router application. The root server component renders one client dashboard. Deterministic data modules contain all requests, conflicts, strategy schedules, metrics, and disruption responses. A persisted Zustand store owns demo state and delegates derived schedule resolution to pure utilities.

## Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS.
- UI: shadcn-style Radix primitives, Lucide icons, Recharts, Framer Motion, date-fns.
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
```

## Core Flows

1. `loadDemo` selects the original schedule and its six conflicts.
2. `optimise` shows progress copy, then selects the active strategy schedule after a fixed delay.
3. Strategy changes replace only unlocked placements and metrics.
4. Disruption activation overlays an event and degraded metrics; replanning loads a deterministic response schedule.
5. Alternative choices and recommendation actions update local overrides.

## Data Flow and Boundaries

UI events call store actions. Selectors combine store state with imported immutable datasets. Components receive domain objects and emit explicit callbacks. No network calls occur. Export is a success toast only.

## Deployment Assumptions and Tradeoffs

- Any Node host capable of building Next.js can serve the prototype.
- Precomputed schedules guarantee a reliable demo but are not operationally valid solutions.
- The custom Gantt timeline prioritises visual control and low dependency weight over drag-and-drop editing.
