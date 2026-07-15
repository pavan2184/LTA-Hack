# Data Model

Last updated: 2026-07-15

## Overview

All domain data is fabricated TypeScript fixture data. Request IDs link requests, scheduled jobs, conflicts, explanations, alternatives, and disruption impacts. Scheduling times are `HH:mm` strings in a fixed 00:00–04:00 planning window; the current model does not attach a date or timezone to a placement.

Status: implemented current data model. Proposed atomic blocks, resources, historical observations, and solver records are documented in `DETERMINISTIC_SCHEDULING_AND_ANALYTICS.md` but do not yet exist.

## Entities

- `MaintenanceRequest`: ID, work labels, sector string, duration, priority, named team, equipment names, preferred/permitted times, fixture status, conflict IDs, dependency IDs, and description.
- `ScheduledJob`: request ID, sector, start/end, preferred start, named team, status, in-memory lock flag, explanation, alternatives, and optional moved minutes.
- `AlternativeSlot`: ID, start/end, label, static impact copy, and recommended flag.
- `Conflict`: ID, typed rule label, request IDs, title, explanation, and severity. It has no calculated overlap/shortfall fields.
- `ScheduleMetrics`: fixture counts, utilisation, robustness, and four robustness display dimensions.
- `ScheduleVariant`: ID/name/description, job placements, fixture metrics, unscheduled IDs, and explanation.
- `DisruptionScenario`: event window, optional sector/team/request target, affected request IDs, degraded robustness, and warning.
- `DisruptionResponse`: scenario ID, replacement schedule fixture, moved/deferred ID arrays, and impact bullets.

## Type Enumerations

- Priority: `low | medium | high | critical`.
- Request/job status: `scheduled | conflicted | unscheduled | locked | moved | emergency`.
- Strategy: `balanced | max-completion | min-risk | min-changes | emergency-buffer`.
- Conflict type: `track | team | equipment | safety-buffer | dependency | time-window`.
- Conflict severity: `warning | critical`.

## Relationships

- One request can appear in one job per schedule variant.
- A conflict connects one or more requests through `requestIds`; each request redundantly stores `conflictIds` for the original fixture.
- A job owns zero or more alternative slots.
- A schedule variant owns jobs, metrics, and unscheduled request IDs.
- One disruption scenario selects one response through the `disruptionResponseSchedules` record.
- The emergency request `EM-001` is stored separately from the 22-request `requestById` index and is handled explicitly by timeline/detail components.

There is no database relationship, migration, foreign key, or index. Object lookup maps such as `requestById` and `disruptionById` are built in memory.

## Integrity Rules

- Every normal scheduled job and conflict request ID must exist in `requests`; response-only emergency job `EM-001` is the documented exception.
- Times remain within 00:00–04:00 except explicitly deferred alternatives.
- Original has six active conflicts; optimised strategies have zero.
- Locked IDs preserve their current visible placement across strategy changes and disruption response.
- No generated or random data is allowed.

Only some rules are enforced by current tests. In particular:

- request count/uniqueness and schedule request references are tested;
- strategy job bounds and exact same-sector non-overlap are tested;
- the six-conflict and zero-conflict values are asserted as metadata;
- team, equipment, buffer, compatibility, dependency, adjacent-sector, and travel feasibility are not generally derived or proven;
- alternative and lock overrides are not revalidated;
- disruption moved/deferred metadata is not cross-checked against job differences.

“Original has six” and “optimised has zero” therefore describe the demo contract, not a full operational validation result.

The strategy fixtures do not currently satisfy their own capacity-one resource implication. In particular, `M-004` and `M-011` overlap from 00:00–01:00 in every strategy while sharing the team and the only calibrated thermal imaging unit identified by conflict `C-04`.

## Time Representation

- `timeToMinutes("02:30")` converts to 150 minutes from midnight.
- `minutesToTime(150)` returns `02:30`.
- `job()` calculates end time and movement from request duration/preferred start.
- Times after midnight are not associated with an engineering date.
- The current model cannot represent multi-night work, daylight crossing, timezones, daylight-saving changes, or an alternative on a different date.

## Example Current Request

```json
{
  "id": "M-014",
  "title": "Signalling Equipment Inspection",
  "sector": "NS12–NS14",
  "durationMinutes": 90,
  "priority": "critical",
  "team": "Team Alpha",
  "equipment": ["Signal testing kit"],
  "preferredStart": "01:00",
  "earliestStart": "00:30",
  "latestEnd": "04:00",
  "conflictIds": ["C-02", "C-03"]
}
```

## Example Current Job

```json
{
  "requestId": "M-014",
  "sector": "NS12–NS14",
  "startTime": "02:30",
  "endTime": "04:00",
  "originalStartTime": "01:00",
  "team": "Team Alpha",
  "status": "moved",
  "locked": false,
  "movedMinutes": 90
}
```

## Persistence

Only `selectedStrategy` and `lockedRequestIds` are stored in localStorage. No personal, sensitive, or operational data is persisted.

Exact locked placements, schedule overrides, accept/reject decisions, active disruptions, and selections are session-only. After reload, a persisted lock ID may fall back to the original-plan placement; exact optimised placement persistence is not guaranteed.

## Proposed Additions — Not Implemented

- Stations, atomic track blocks, conflict zones, graph adjacency, and geometry.
- Resource capacities, individual qualifications, availability, bases, travel, setup, and rest rules.
- Work compatibility, isolation, buffer, dependency-lag, mandatory, splittable, and multi-night fields.
- Historical planned/actual observations and duration percentiles.
- Solver input hashes, constraint/model versions, status, bounds, objective vectors, validation results, and structured explanations.

Adopting these additions requires an accepted decision and coordinated type, fixture, persistence, API, and test changes.
