# Project Brief

Last updated: 2026-07-15

## One-Line Description

RailPlan is a presentation-ready, frontend-only control-centre simulation that demonstrates how rail maintenance planners could review conflicts, compare explainable schedule strategies, retain human control, and respond to disruptions.

## Problem Statement Alignment

The challenge is to automate maintenance scheduling when track requests compete for short engineering windows, sector access, compatible work, engineers, and equipment. A complete solution must detect conflicts, flag them clearly, suggest alternatives, and automate rescheduling.

RailPlan v0.1.0 demonstrates the intended user workflow and presentation. It does not yet fulfil the mathematical automation claim because schedules and conflicts are preconfigured. The proposed deterministic path is documented in `DETERMINISTIC_SCHEDULING_AND_ANALYTICS.md` and supported by the annotated papers in `RAIL_SCHEDULING_RESEARCH.md`.

## Problem and Users

Rail work requests compete for track access, teams, equipment, safety buffers, and short engineering windows. Primary users are maintenance planners and operations controllers; secondary users are engineering leads and hackathon evaluators. This prototype is not for passengers and does not execute real operational decisions.

## Core User Journeys

1. Load submitted requests, see the work needing attention first, and inspect the exact track/resource reason for a conflict.
2. Resolve declared conflicts, compare Submitted and Recommended plans, and review critical-work coverage and plan changes.
3. Switch planning objectives to trade completion, risk, schedule stability, and emergency capacity.
4. Trigger a disruption, inspect affected work, replan, and review the impact summary.
5. Accept a change, retain the submitted placement, lock work, or inspect alternatives to demonstrate planner control.

## MVP Scope

- One desktop-first App Router dashboard with 22 deterministic requests.
- Original, five optimised strategies, disruption, and response schedules.
- Request filtering/search, selection, network highlighting, timeline interactions, explanations, alternatives, and locks.
- Animated metrics, optimisation/replanning loading states, toasts, comparisons, and reset.
- Browser-local persistence for strategy and locked work only.
- Planner-first information hierarchy with attention filtering, declared-conflict language, critical-work coverage, and a release-readiness checklist.

## Current Product Truth

- Requests, conflicts, schedules, metrics, alternatives, and response plans are deterministic TypeScript fixtures.
- “Optimise” and “replan” select fixtures after fixed loading timers.
- The map is a fixed rail-line schematic, not a geographic or operational track-block model.
- Planner locks and alternative overrides affect visible placements but are not revalidated and do not recalculate KPIs.
- Export/file generation is unavailable and is not presented as a working control.
- The prototype is not suitable for operational decisions.

## Non-MVP Scope

- Backend, authentication, database, external APIs, real optimisation, live railway feeds, file generation, and production deployment.

The mathematical validator, calculated KPIs, public-map snapshot, and solver described in the proposal are roadmap items, not v0.1.0 scope.

## Success Metrics

- Complete the scripted two-minute demo without refresh or dead controls.
- No horizontal page overflow at 1280, 1440, or 1920 px.
- Tests cover state transitions and metric changes; lint, typecheck, tests, build, and UAT pass.

## Key Risks

- Dense timeline becoming unreadable at 1280 px; mitigated with a fixed sector column and compact grid.
- Mock variants drifting from metrics; mitigated with central schedule definitions and store tests.
- Client hydration/persistence mismatch; mitigated by a mounted state and partial persistence.
- Motion obscuring the demo; transitions remain brief and deterministic.
- Fixture metadata being mistaken for independently validated feasibility; mitigated through explicit simulation labels and the current implementation audit.
- Planner overrides making the displayed plan inconsistent with unchanged metrics; this remains a known implementation gap.
- Strategy fixtures reporting zero conflicts while retaining at least one known shared-resource collision; the deterministic P0 validator is required before making feasibility claims.

## Documentation

- `README.md` in this directory is the documentation index and source-of-truth guide.
- `CURRENT_IMPLEMENTATION_AUDIT.md` records exact current behaviour and gaps.
- `DETERMINISTIC_SCHEDULING_AND_ANALYTICS.md` is a proposed future direction.
- `RAIL_SCHEDULING_RESEARCH.md` is supporting research, not an accepted architecture decision.
