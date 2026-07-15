# Current Implementation Audit

Last updated: 2026-07-15

Status: Current code truth for RailPlan v0.1.0.

## Executive Summary

RailPlan is a polished frontend-only simulation of rail maintenance scheduling. It demonstrates the intended planner workflow, but it does not yet calculate conflicts, solve schedules, validate alternatives, recompute metrics, use live map data, or export a file.

The current implementation is deterministic because it selects immutable fixtures and uses fixed timers. “Optimisation” and “replanning” are presentation states, not computational jobs.

## Runtime and Tooling

- Next.js 16 App Router and React 19.
- TypeScript 6 and Tailwind CSS 4.
- Zustand 5 for client state and partial localStorage persistence.
- Radix Dialog, Lucide icons, Framer Motion, date-fns, and Sonner. Recharts remains installed but is no longer rendered.
- Vitest, Testing Library, user-event, and jsdom for automated tests.
- No backend, database, authentication, solver, map SDK, LLM, file generation, or runtime external API.
- No environment variables are required; `.env.example` documents the frontend-only state.

## Repository Map

| Area | Files | Current responsibility |
| --- | --- | --- |
| App entry | `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css` | Metadata, root page, global styling, and timeline patterns. |
| Dashboard composition | `src/components/layout/DashboardShell.tsx` | Initial state, planner workspace, metrics, disruption banner, loading overlays, and footer disclaimer. |
| Navigation | `src/components/layout/TopNavigation.tsx` | Compact branding, planning-window context, status, and reset. |
| Planner controls | `src/components/controls/StrategyControls.tsx` | Five planning objectives, Submitted/Recommended comparison, disruption modal, and the state-specific primary action. |
| Request queue | `src/components/requests/RequestQueue.tsx` | Attention-first filtering, search, displayed request status, and request selection. |
| Timeline | `src/components/schedule/ScheduleTimeline.tsx` | Fixed 00:00–04:00 Gantt-style view across six demo sectors. |
| Inspector | `src/components/insights/DetailsPanel.tsx` | Direct conflict selection, submitted/recommended comparison, explanations, locks, accept/reject state, alternatives, selected-request map, and release readiness. |
| Network schematic | `src/components/network/RailNetworkMap.tsx` | Selected-request fixed NS/EW/CC station-code schematic and exact-sector nearby-job count. |
| Disruption UI | `src/components/disruption/DisruptionModal.tsx` | Selection of four preconfigured disruption scenarios. |
| Metrics | `src/components/metrics/*` | Four planner decision signals and a concise release-readiness checklist. |
| UI primitives | `src/components/ui/*`, `src/components/shared/*` | Buttons, badges, cards, dialog, loading, and status elements. |
| Domain types | `src/types/railplan.ts` | Request, job, conflict, metric, strategy, and disruption interfaces. |
| Fixture data | `src/data/*` | 22 requests, six declared conflicts, five strategies, four disruptions, and four response plans. |
| State | `src/store/useRailPlanStore.ts` | All view, selection, strategy, planner-control, loading, and persistence state. |
| Utilities | `src/utils/time.ts`, `src/lib/utils.ts` | `HH:mm`/minute conversion, duration formatting, and class merging. |
| Tests | `src/test/*` | Data, store, component, and scripted demo coverage. |

## Current Domain Data

### Requests

- `src/data/requests.ts` contains exactly 22 fabricated maintenance requests.
- Request IDs run from `M-001` to `M-022`.
- The demo covers six string-labelled sectors on the North–South, East–West, and Circle lines.
- Times are plain `HH:mm` strings, not ISO timestamps.
- The default planning window is `00:00`–`04:00`.
- Teams and equipment are names, not capacity or availability records.
- Priority is one of `low`, `medium`, `high`, or `critical`.

### Original plan

- `src/data/originalSchedule.ts` contains 18 placed jobs and four unscheduled request IDs.
- It declares six conflict objects: two track-related records, two team records, one equipment record, and one safety-buffer record.
- Conflict records and conflicted job statuses are authored manually; they are not derived from intervals or resource capacities.

### Strategy schedules

- Five modules contain the Balanced, Maximum Work Completion, Minimum Operational Risk, Minimum Schedule Changes, and Maximum Emergency Buffer variants.
- Each module independently declares placements, unscheduled IDs, metrics, and explanatory copy.
- The variants report zero active conflicts, but no general constraint engine proves that claim.
- The existing automated data test verifies permitted 00:00–04:00 bounds and non-overlap only among jobs with the exact same sector string.

A read-only resource-overlap audit found apparent named-team/equipment conflicts in all five strategy fixtures when each shared name is treated as capacity one:

| Strategy | Overlapping resource pairs found |
| --- | ---: |
| Balanced | 5 |
| Maximum Work Completion | 5 |
| Minimum Operational Risk | 5 |
| Minimum Schedule Changes | 6 |
| Maximum Emergency Buffer | 4 |

The clearest confirmed inconsistency is `M-004` with `M-011`: every strategy places both at 00:00–01:00 with `Power Systems Unit` and `Thermal imaging unit`, while original conflict `C-04` states that the only calibrated thermal imaging unit cannot serve both jobs. Other overlaps require explicit capacity data before they can be classified definitively, but they demonstrate why string names and fixture metrics are insufficient.

### Disruptions

- Four scenarios model a track fault, unavailable engineer/team, work overrun, and shortened window.
- Four preconfigured response plans are selected after an 850 ms timer.
- Before response, disruption metrics modify only active-conflict count, robustness, and emergency capacity on top of the selected strategy fixture.
- Response metadata can drift from job data because both are authored separately. For example, the track-fault response lists `M-005` as moved although its job placement is unchanged.

## State and Client Actions

The Zustand store is the runtime source of UI state.

| Action | Current effect |
| --- | --- |
| `loadDemo()` | Shows the original fixture and clears selection, active disruption, response state, and schedule overrides. |
| `selectRequest(id)` | Selects a request; clearing selection also clears selected conflict. |
| `selectConflict(id)` | Selects the conflict and its first request. |
| `changeStrategy(strategy)` | Changes the preferred strategy; original view remains original until optimised view is selected. |
| `optimise()` | Advances through three 350 ms loading steps, then selects the chosen fixture. |
| `toggleLock(id)` | Stores the current in-memory placement and preserves it across later fixture changes in that session. |
| `acceptRecommendation(id)` | Records an in-memory accepted ID and removes a rejection. |
| `rejectRecommendation(id)` | Records an in-memory rejected ID and removes an acceptance. |
| `applyAlternative(requestId, alternativeId)` | Replaces the visible job interval locally without revalidating conflicts or recalculating metrics. |
| `triggerDisruption(id)` | Selects a disruption, selects its first affected request, and overlays degraded metadata. |
| `replan()` | Waits 850 ms and then selects the matching preconfigured response. |
| `resetDemo()` | Returns to the unloaded view, clears session decisions/overrides, and retains persisted strategy/lock-ID preferences. |
| `getVisibleSchedule()` | Selects a fixture, overlays limited disruption metrics, then merges overrides and in-memory lock placements. |

## Persistence

- localStorage key: `railplan-preferences`.
- Persisted fields: `selectedStrategy` and `lockedRequestIds` only.
- Not persisted: selected request/conflict, accepted/rejected decisions, disruption, replanned state, overrides, or `lockedPlacements`.
- A lock ID can survive reload while its exact chosen placement does not. The merge logic may fall back to the original-plan placement when possible, so the documentation must not claim that an optimised locked placement always survives a page reload.
- No personal or operational data is stored.

## Current Calculations

| Output | Current source | Actually calculated? |
| --- | --- | --- |
| Job end time | Preferred/selected start plus request duration | Yes |
| Moved minutes | Start minus preferred start | Yes for fixture construction |
| Timeline left/width | Start/end minutes divided by 240 | Yes |
| Search/filter status | Visible fixture plus request metadata | Yes |
| Nearby job count | Jobs with the exact same sector string | Yes, simplified |
| Scheduled jobs | `ScheduleMetrics` fixture | No |
| Active conflicts | Fixture or limited disruption overlay | No general validation |
| Utilisation | `ScheduleMetrics` fixture | No |
| Robustness and sub-scores | `ScheduleMetrics` fixture retained but not rendered as a headline | No |
| Release-readiness rows | Fixture metrics plus visible moved/deferred counts | Partly; no independent feasibility validation |
| Alternative impact | Static option copy | No |
| Conflict explanations | Static conflict/job copy | No rule provenance |

## User-Visible Flows

### Initial load

The initial card explains that the data is deterministic and simulated. One `Load sample requests` action opens the submitted-plan workspace.

### Conflict review

The request queue defaults to `Attention`, showing conflicted or unscheduled work first. Every declared conflict is directly selectable by title and focuses its first request. Request selection synchronises the queue, timeline, schematic, and inspector.

### Optimisation

The UI presents three loading messages over 1.05 seconds and then switches to the chosen fixture. The success toast reports the selected fixture's placed-job count; it does not claim independent conflict resolution or safety validation.

### Planner control

Accept/reject is acknowledgement state only. Locking affects later fixture selection within the session. Applying an alternative mutates the displayed interval but does not run feasibility checks, update unscheduled IDs, or recompute metrics.

### Disruption and response

The selected scenario highlights affected work and alters a small subset of displayed metrics. Replan selects a fixed response. No algorithm responds to current overrides, accepted decisions, or resource feasibility.

### Release readiness

The inspector summarises critical-work placement, declared conflict count, plan changes, and window reserve. Its disclaimer states that the indicators are simulated and fixture conflicts are not independently validated. There is no export control.

## Existing Automated Verification

- 5 data tests.
- 6 store tests.
- 5 dashboard tests.
- 1 scripted end-to-end component UAT test.
- Total: 17 passing tests in the last recorded run.

The suite covers fixture counts/references, same-sector non-overlap, state transitions, in-session lock preservation, selected UI interactions, and the main demo sequence.

It does not currently prove:

- team, named engineer, skill, or equipment feasibility across sectors;
- work compatibility, safety zones, adjacent blocks, setup, travel, or every dependency;
- alternative or manual-override feasibility;
- metric formula correctness, because metrics are fixtures;
- disruption response consistency;
- persistence rehydration of exact lock placement;
- visual layout at the three required browser widths.

## Known Correctness and Presentation Gaps

### High priority

1. There is no independent constraint validator or solver.
2. “Zero conflicts” relies on fixture metadata and a limited same-sector overlap test; every strategy retains at least the known `M-004`/`M-011` thermal-unit conflict.
3. Locks and alternatives can invalidate a schedule without changing conflicts or metrics.
4. Team/equipment availability is represented as names, so shared-resource feasibility is not generally enforced.
5. Robustness, utilisation, emergency capacity, and flexibility have no implemented formulas.

### Medium priority

1. A sector is a string rather than a list of atomic track blocks; partial overlap and adjacency cannot be calculated.
2. The map is a fixed schematic and uses exact sector-string matching.
3. Alternative Option C is labelled as the next engineering night but the model has no night/date field for that placement.
4. Strategy explanations and some fixture-derived readiness fields can drift from the visible plan after local overrides.
5. Disruption impact arrays, job changes, explanations, and metrics can drift independently.
6. Only lock IDs persist; exact in-session lock placements do not.
7. File export is not implemented and is intentionally not presented as an available action.

### UI verification and accessibility

1. Responsive visual UAT at 1280×800, 1440×900, and 1920×1080 has not been completed.
2. Core planner text was raised to readable sizes; a few supplementary 10 px labels should still be reviewed visually.
3. The application uses status icons and copy as well as colour in many places, but full keyboard/focus/contrast UAT remains outstanding.

## Operational Boundary

The prototype must not be used for actual maintenance, possession, staff, equipment, or safety decisions. It uses fabricated data and does not encode LTA operating rules. It has no authoritative track topology, availability source, competency data, audit log, approval workflow, or operational integration.

## Documented Evolution Path

- [`DETERMINISTIC_SCHEDULING_AND_ANALYTICS.md`](DETERMINISTIC_SCHEDULING_AND_ANALYTICS.md) defines the proposed constraint, solver, graph, statistic, API, UI, and verification direction.
- [`RAIL_SCHEDULING_RESEARCH.md`](RAIL_SCHEDULING_RESEARCH.md) links that proposal to original railway scheduling research.
- [`DECISIONS.md`](DECISIONS.md) records that these remain proposals and do not replace the accepted frontend simulation yet.

The recommended first implementation milestone is a frontend-only atomic-block graph, independent TypeScript constraint validator, and calculated KPI layer. A backend or CP-SAT service requires a separate accepted decision.
