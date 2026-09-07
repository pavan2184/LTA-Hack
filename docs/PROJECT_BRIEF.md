# Project Brief

Last updated: 2026-09-07 · RailPlan v0.4.0

RailPlan is a non-operational rail-maintenance planning prototype. It evaluates
22 fabricated requests across 12 atomic track blocks in a four-hour engineering
window, calculates conflicts, proposes placements and independently validates
its results. Users are maintenance planners and operations controllers.

## Implemented journeys

1. Load the requested plan and inspect exact conflict rules and intervals.
2. Apply validated repairs or generate a schedule with one of five deterministic
   objective profiles.
3. Inspect calculated metrics, formulas, counterfactual explanations and feasible
   alternatives; pin work and re-solve around those hard constraints.
4. Apply an emergency, crew outage, overrun or early handback and replan.
5. Ask the optional assistant about server-computed facts; use deterministic
   answers when credentials or grounded model output are unavailable.

## Current product boundary

The Next.js dashboard uses the pure TypeScript `@railplan/core` engine. Schedules,
conflicts, metrics, alternatives and disruption responses are computed at runtime.
Input data and operational topology are fabricated. The map is a schematic.
No real LTA rules, live feeds or operational safety certification are represented.

Postgres planning-input migrations and a TypeScript seed/loader are authored;
verification status is in `PROJECT_STATUS.md`. The dashboard still reads literals.
Strategy and exact pinned placements persist locally. The dedicated `/plans` workflow generates durable server-computed versions from database facts, reloads their exact output, records decisions and publishes with stale-source protection and audit history. The dashboard remains a labelled local exploratory workflow; wider integration follows #16. Supabase identity and organisation
isolation gate planner and contractor workspaces. The app runs directly in Node.js.
The owner requires a database workflow without Docker (2026-09-07).

Anonymous workforce role catalogs, people availability windows and per-request
role demand now round-trip through the shared instance and database. They are
independent of team crew capacity. Workforce constraint enforcement follows #8;
no individual workers, leave records or personal locations are collected.

## Ordered delivery scope

GitHub issues #4–#21 define the authorized roadmap: database baseline,
authentication, versioned plans, aggregate workforce supply/demand and constraints,
request intake and transcript proposals, planner approval, workforce/geographic
views, Telegram publication, exports, product integration and release verification.
Later work covers voice, scoped provider imports, a CP-SAT benchmark and a
separate named-crew go/no-go decision. Follow numeric order and dependency gates.

## Success criteria and limits

Every feasibility claim passes the shared validator; every metric exposes its
calculation. Lint, typecheck, tests and production build must pass. Database gates
must fail on drift rather than silently skip. Product UAT covers the workflow
and widths 1280, 1440 and 1920 pixels.

The heuristic does not prove global optimality. Crew reassignment, individual
qualifications, authenticated collaboration, durable exports and notifications
remain pending their respective issues. Keep fabricated-data and non-operational
labels visible throughout.
