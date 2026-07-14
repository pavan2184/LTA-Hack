# Data Model

Last updated: 2026-07-15

## Overview

All data is immutable TypeScript mock data. Request IDs link requests, scheduled jobs, conflicts, explanations, alternatives, and disruption impacts. Times are ISO strings on the fixed planning night of 2026-09-16 so date-fns can format them reliably.

## Entities

- `MaintenanceRequest`: identity, work details, sector, duration, priority, team/equipment requirements, permitted window, status, conflicts, dependencies, and description.
- `ScheduledJob`: request placement, original placement, team, state, lock, explanation, alternatives, and optional movement label.
- `AlternativeSlot`: deterministic replacement placement and impact.
- `Conflict`: typed constraint violation connecting one or more requests.
- `ScheduleMetrics`: counts, utilisation, robustness, and four robustness dimensions.
- `ScheduleVariant`: strategy metadata, jobs, metrics, explanation, and unscheduled IDs.
- `DisruptionScenario`: event window, affected sector/team/request, warning, degraded metrics, and response ID.
- `DisruptionResponse`: replacement jobs, metrics, moved/deferred IDs, and impact bullets.

## Integrity Rules

- Every scheduled job and conflict request ID must exist in `requests`.
- Times remain within 00:00–04:00 except explicitly deferred alternatives.
- Original has six active conflicts; optimised strategies have zero.
- Locked IDs preserve their current visible placement across strategy changes and disruption response.
- No generated or random data is allowed.

## Persistence

Only `selectedStrategy` and `lockedRequestIds` are stored in localStorage. No personal, sensitive, or operational data is persisted.
