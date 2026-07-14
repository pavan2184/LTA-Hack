# API Contract

Last updated: 2026-07-15

## Overview

RailPlan has no backend or external API. This document records the client interaction contract so a future optimisation service can replace mock modules without changing component behaviour.

## Client Actions

- `loadDemo()` resets to the loaded original view.
- `selectRequest(id|null)` and `selectConflict(id|null)` coordinate timeline, queue, detail, and network focus.
- `changeStrategy(strategy)` updates the optimised variant while preserving locks.
- `optimise()` transitions original/disrupted to the selected optimised variant after a fixed delay.
- `toggleLock(id)`, `acceptRecommendation(id)`, and `rejectRecommendation(id)` retain planner decisions locally.
- `applyAlternative(requestId, alternativeId)` creates a local placement override.
- `triggerDisruption(id)` overlays deterministic disruption state.
- `replan()` applies the matching response variant after a fixed delay.
- `resetDemo()` returns to the unloaded initial state while preserving persisted preferences.

## Future Boundary

A future service may accept requests, constraints, strategy, and locked IDs and return a `ScheduleVariant`. No such route exists in this prototype, and no authentication headers or error format are required.
