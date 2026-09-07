# Decisions

Last updated: 2026-09-07

## Log

### 2026-09-07 — Issue #5 trusted profiles and application RLS

Use official Supabase SSR email/password sessions and verify users server-side.
Assign roles only through operator-controlled profiles, with no role selected
from user metadata or signup input. A verified identity enters a transaction with
`SET LOCAL ROLE authenticated` and minimal JWT claims, so the owner DB connection
cannot silently bypass application RLS. Planner-only action guards are shared for
future solve/approve/publish/resource routes; runtime policy tests for later
issue tables wait for those tables to exist.

Use a private atomic DB token bucket for assistant cost control. The narrow
security-definer function is necessary to prevent users granting themselves
quota; it accepts no identity or rate input and rechecks the planner profile.
There are no default online accounts or automatic role promotions.


### 2026-09-07 — Hosted RailPlan Dev baseline

Status: Accepted by the owner choosing and creating the online project.

Use project ufcdynfjfzbjvglsdaqp in pavan2184's Org, Singapore. The clean hosted
project replaces the local Docker reset baseline. Connect via Supavisor on 6543
because 5432 is unreachable from this network; validate the official CA and
hostname and disable prepared statements. Load each PlanningInstance inside a
repeatable-read transaction: this both fixes pooled multi-query reads stalling
and prevents mixed input snapshots. Apply migrations transactionally with a
private checksum ledger; do not reset managed hosted schemas.

### 2026-09-07 — Ordered delivery and no Docker

Status: Accepted by the owner's task and follow-up instruction.

Implement GitHub issues #4–#21 in numeric order. Each prerequisite must pass its
acceptance checks before dependent feature work. The owner's no-Docker direction
supersedes #4's local Supabase CLI reset requirement. The owner selected a new
hosted Supabase project; document the equivalent migration,
seed, read-back and failure checks. Do not reuse unrelated projects or databases.

### 2026-09-07 — Document the existing v0.4 package and database boundary

Status: Accepted; records the architecture already implemented.

The shared core package owns instance data, canonicalization, world derivation
and all scheduling logic. Postgres stores inputs; dashboard outputs remain
computed in memory. Explicit database verification fails on unavailable or
mismatched data. Optional test-suite skips never substitute for that gate.

Historical v0.1 decisions below are superseded where the 2026-08-02 engine
replacement or v0.4 database boundary changed them.


### 2026-08-02 — Replace the fixtures with a real engine

Status: Accepted. Supersedes the v0.1.0 decision to "preserve the existing
fixture-based state architecture".

The earlier decision protected a demo that could not survive scrutiny: six
conflicts typed by hand, five hand-authored schedules, KPIs stored as literals,
and an `optimise()` that waited 1.05 seconds before swapping one object for
another. Two clicks of the same button produced an identical plan in an identical
time. That is not a scheduling tool; it is a slideshow with a cursor.

Accepted:

- Delete all five `*Schedule.ts` files and the hand-typed conflict list. No
  schedule fixture remains in the repository.
- Model sectors as atomic track blocks. String comparison cannot see that
  `NS10-NS12` and `NS11-NS13` share `NS11-NS12`.
- Model crews and equipment as capacities rather than names. One calibrated
  thermal imaging unit is a constraint; "Thermal imaging unit" is a label.
- Make `validate()` the single authority on feasibility, and require the solver
  to submit its own output to it before returning.
- Express the five strategies as objective profiles over one solver.
- Give every metric a formula, numerator and denominator, exposed in the UI.
- Enter planner pins as hard constraints before the solve, not as an overlay
  afterwards, so a decision moves the plan and the numbers with it.
- Report solver status honestly, including `INFEASIBLE`, and name the mandatory
  work that could not be placed rather than showing a status code.

Rejected, with reasons:

- **A CP-SAT backend.** 22 requests solve in tens of milliseconds in the browser.
  A solver service would add a deploy, a network hop and a live failure mode to
  buy optimality bounds we cannot yet demonstrate a need for. Benchmark first.
- **A Web Worker.** Same reasoning: at 20-70 ms there is no stall to remove, and
  a worker adds bundling failure modes to a demo.
- **Letting the model decide anything.** The assistant reads engine output and is
  blocked structurally from introducing a figure the engine did not produce.

### 2026-08-02 — Design register: operational, not product-marketing

Status: Accepted. Revised the same day after the first palette read as dull.

Colour comes from the domain rather than from a UI kit. The three corridor
colours are the **actual Singapore MRT line colours** — North-South red,
East-West green, Circle orange. A planner already reads the network in those
colours, so they carry meaning before anyone learns a legend, and they are the
one thing a generic dashboard palette could never have produced.

- Corridor colour is IDENTITY: a solid chip on the group band, a tinted gutter
  and lane behind each block row, and a 3px cap on the leading edge of every
  clean bar. Twelve rows read as three corridors without a legend.
- Status is a separate family and never borrows a line colour's job: red for a
  broken rule, amber for deferred, green for clear, blue for anything the
  planner touched. Nothing else on the page is allowed to be coloured.
- Warm paper ground under cool near-black ink. The slight temperature
  disagreement is what stops a light UI reading as flat grey card soup.
- Borders rather than shadows; 2-4px radii; tabular lining numerals throughout.
- State is carried by a left rule, a stripe pattern and text as well as colour,
  so it survives greyscale and colour-vision deficiency.
- Copy states numbers and consequences. No dot-separated microcopy chains, no
  triadic marketing constructions, no claims the engine cannot support.

### 2026-08-02 — Typeface: IBM Plex Sans and IBM Plex Mono

Status: Accepted.

Rejected **Inter** and **Geist**. Both are excellent and both are now the
default of every AI-generated dashboard, which is precisely the look this
project is trying not to have.

Plex earns the slot on merit rather than novelty: it was drawn for interfaces
where misreading a character has consequences, so 1/l/I and 0/O are
unmistakable at 11px, and it ships true tabular figures. Its typewriter
inheritance gives it visible engineering character where Inter is deliberately
characterless. Plex Mono is the matching companion, used for request ids, block
ids, clock times and the input digest — anything compared down a column.

Loaded through `next/font/google`, so it is self-hosted at build time and there
is no runtime request to a font CDN. The cost is a network dependency during
`next build`; Next caches the files under `.next/cache` after the first fetch.

### 2026-07-15 — Planner-first exception and release hierarchy

Status: Accepted

- Make exceptions, critical-work coverage, declared conflicts, and engineering-window load the four primary signals.
- Use one primary action per state: resolve conflicts, review a recommendation, or replan affected work.
- Rename technical/demo language to planner decisions: Submitted versus Recommended, Planning objective, Needs action, and Ready for review.
- Replace the decorative robustness radar with a concise release-readiness checklist and an explicit simulated/not-independently-validated note.
- Keep the request queue focused on work needing attention by default and move the small network schematic into the selected-request inspector.
- Remove the non-functional export control rather than presenting a success toast for an artefact that does not exist.
- Preserve the existing fixture-based state architecture and clearly label zero conflicts as declared fixture metadata.

### 2026-07-15 — Separate current truth from proposed optimisation

Status: Accepted

- Keep v0.1.0 documented as a frontend-only, fixture-based simulation.
- Use `docs/README.md` and `docs/CURRENT_IMPLEMENTATION_AUDIT.md` to distinguish implemented behaviour from roadmap and research.
- Treat `docs/DETERMINISTIC_SCHEDULING_AND_ANALYTICS.md` and `docs/RAIL_SCHEDULING_RESEARCH.md` as proposals/evidence, not proof that a solver, validator, calculated KPI layer, or map integration exists.
- Do not change the accepted no-backend/no-external-API architecture without a later explicit decision.

### 2026-07-15 — Deterministic frontend simulation

Status: Accepted

- Use immutable preconfigured schedule variants and timed client transitions rather than a solver or API.
- This guarantees repeatable presentation behaviour; it does not claim operational feasibility.

### 2026-07-15 — Zustand as the single demo-state owner

Status: Accepted

- Centralise view, strategy, selection, locks, approvals, disruptions, overrides, and loading phases in one store.
- Persist only strategy and locked IDs to minimise hydration and privacy risk.

### 2026-07-15 — Custom CSS-grid timeline

Status: Accepted

- Use a fixed 00:00–04:00 grid with absolute job placements instead of a scheduling library.
- This keeps the visual dense, responsive, and fully controlled at the cost of general calendar support.

### 2026-07-15 — Tests and UAT as release gates

Status: Accepted

- Vitest/Testing Library cover domain transitions; browser UAT at three laptop widths covers the scripted demo and page overflow.

### 2026-07-15 — Progressive disclosure for dashboard density

Status: Accepted

- Lead with the plan title and decision controls, then show four essential KPIs rather than five equal-weight cards.
- Keep network and conflict details available on selection while using compact summaries in the default view.
- Use the three-column workspace only at extra-wide widths; details move below the timeline on normal laptops.

## Proposals Awaiting Decision

### Deterministic P0 validation layer

Status: Implemented and superseded by the 2026-08-02 decision (historical proposal)

- Add atomic track blocks, a pure TypeScript constraint validator, and calculated KPIs while retaining the frontend-only architecture.
- Independently validate all current fixtures, locks, alternatives, and disruption responses.
- Implemented in the shared TypeScript engine; further work follows numbered GitHub issues.

### Real optimisation solver

Status: Proposed

- Benchmark a deterministic frontend heuristic against CP-SAT and, if useful, MILP.
- A FastAPI/OR-Tools service is a strong future option but would replace the accepted frontend-only boundary.
- Approval would require updates to architecture, API, data, testing, security, deployment, and operational status documentation before code changes.

### Public rail geography and historical statistics

Status: Proposed

- Use an attributed, versioned public station/rail geometry snapshot for presentation while keeping operational block/safety data separate.
- Add historical planned/actual data only after provenance, data-quality, privacy, and security requirements are approved.
- Public station coordinates must not be treated as authoritative operational topology.
