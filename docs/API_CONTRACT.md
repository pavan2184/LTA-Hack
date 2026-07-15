# API Contract

Last updated: 2026-07-15

## Overview

RailPlan has no backend or external API. This document records the client interaction contract so a future optimisation service can replace mock modules without changing component behaviour.

Status: implemented client-state contract. Any network route described in future-planning documents is proposed only.

## Current State Contract

- Store: `useRailPlanStore` in `src/store/useRailPlanStore.ts`.
- Persistence key: `railplan-preferences`.
- Persisted fields: `selectedStrategy`, `lockedRequestIds`.
- Visible schedule: selected synchronously through `getVisibleSchedule()` from imported fixtures, then overlaid with planner locks/alternatives.
- Async behaviour: fixed client timers only; no request, retry, timeout, HTTP error, or server state exists.

## Client Actions

| Action | Input and precondition | Effect | Failure behaviour |
| --- | --- | --- | --- |
| `loadDemo()` | None | Loads original view; clears selection, disruption, replan flag, and overrides | Cannot fail |
| `selectRequest(id|null)` | Request or emergency ID expected | Coordinates queue, timeline, details, and map selection | Unknown IDs can produce no detail; no explicit error |
| `selectConflict(id|null)` | Original conflict ID expected | Selects conflict and its first affected request | Unknown ID results in null request selection |
| `changeStrategy(strategy)` | Valid `StrategyId` | Updates preferred fixture while retaining current original view until switched/optimised | TypeScript guards callers; no runtime validation |
| `optimise()` | Demo may be loaded or unloaded | Runs three 350 ms UI steps, then selects the strategy fixture | No computation or error path |
| `toggleLock(id)` | Visible job ID expected | Stores/removes in-session placement and lock ID | Unknown/non-visible ID can persist without a placement |
| `acceptRecommendation(id)` | Request ID expected | Adds accepted ID and removes rejection | No runtime ID validation |
| `rejectRecommendation(id)` | Request ID expected | Adds rejected ID and removes acceptance | No runtime ID validation |
| `applyAlternative(requestId, alternativeId)` | Visible job and option required | Creates a local job interval override | Silently no-ops when either record is absent; no feasibility validation |
| `triggerDisruption(id)` | Valid scenario ID | Shows disrupted state and selects first affected request | Silently no-ops for unknown ID |
| `replan()` | Active disruption required | Waits 850 ms, then selects matching response fixture | Silently returns without a disruption; no solver error path |
| `resetDemo()` | None | Returns to unloaded state and clears session decisions/overrides while retaining strategy and lock-ID preferences | Cannot fail |
| `getVisibleSchedule()` | Current store state | Selects fixture, applies limited disruption metrics, then lock/alternative overlays | Always returns a schedule fixture |

## Current Interaction Invariants

- Original view uses `originalSchedule` regardless of selected strategy.
- Optimised view uses the selected entry in `scheduleVariants`.
- Replanned disrupted view uses the matching `disruptionResponseSchedules` entry.
- Unreplanned disruption keeps the base jobs and changes only selected metrics/highlighting.
- Locks and alternatives are merged after fixture selection.
- The merge does not recalculate conflicts, metrics, explanations, or unscheduled IDs.
- Accept/reject records do not alter a schedule.
- Export is not a store action and no export control is shown in the current interface.

## Authentication and Errors

No authentication, authorisation, headers, HTTP status codes, error schema, rate limits, retries, or network timeouts exist. Current invalid IDs generally no-op or lead to absent details instead of returning a typed error.

## Future Boundary

A future service may accept requests, constraints, strategy, and locked IDs and return a `ScheduleVariant`. No such route exists in this prototype, and no authentication headers or error format are required.

The proposed richer solver result in `DETERMINISTIC_SCHEDULING_AND_ANALYTICS.md` adds model/constraint versions, input hash, solve status, objective vector, bound/gap, jobs, deferred reasons, conflicts, metrics, alternatives, and structured explanation facts. That JSON is a design example, not an implemented endpoint contract.

Before a backend is added, this document must define:

- route and version;
- request/response models;
- validation and error envelope;
- solver status semantics and timeout behaviour;
- authentication/authorisation;
- idempotency and input hashing;
- stale-data and constraint-version handling;
- operational-data classification, retention, and audit requirements.
