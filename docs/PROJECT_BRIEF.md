# Project Brief

Last updated: 2026-07-15

## One-Line Description

RailPlan is a presentation-ready, frontend-only control-centre dashboard that helps rail maintenance planners detect conflicts, compare explainable schedule strategies, retain human control, and respond to disruptions.

## Problem and Users

Rail work requests compete for track access, teams, equipment, safety buffers, and short engineering windows. Primary users are maintenance planners and operations controllers; secondary users are engineering leads and hackathon evaluators. This prototype is not for passengers and does not execute real operational decisions.

## Core User Journeys

1. Load an original plan, inspect six conflicts, select a request, and understand why its placement is invalid.
2. optimise the plan, observe jobs move, compare metrics, and inspect the explanation for each recommendation.
3. Switch strategies to trade completion, risk, schedule stability, and emergency capacity.
4. Trigger a disruption, inspect affected work, replan, and review the impact summary.
5. Lock, accept, reject, or place work in an alternative slot to demonstrate planner control.

## MVP Scope

- One desktop-first App Router dashboard with 22 deterministic requests.
- Original, five optimised strategies, disruption, and response schedules.
- Request filtering/search, selection, network highlighting, timeline interactions, explanations, alternatives, and locks.
- Animated metrics, optimisation/replanning loading states, toasts, comparisons, and reset.
- Browser-local persistence for strategy and locked work only.

## Non-MVP Scope

- Backend, authentication, database, external APIs, real optimisation, live railway feeds, file generation, and production deployment.

## Success Metrics

- Complete the scripted two-minute demo without refresh or dead controls.
- No horizontal page overflow at 1280, 1440, or 1920 px.
- Tests cover state transitions and metric changes; lint, typecheck, tests, build, and UAT pass.

## Key Risks

- Dense timeline becoming unreadable at 1280 px; mitigated with a fixed sector column and compact grid.
- Mock variants drifting from metrics; mitigated with central schedule definitions and store tests.
- Client hydration/persistence mismatch; mitigated by a mounted state and partial persistence.
- Motion obscuring the demo; transitions remain brief and deterministic.
