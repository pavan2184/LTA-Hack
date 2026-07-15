# Decisions

Last updated: 2026-07-15

## Log

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

Status: Proposed

- Add atomic track blocks, a pure TypeScript constraint validator, and calculated KPIs while retaining the frontend-only architecture.
- Independently validate all current fixtures, locks, alternatives, and disruption responses.
- This is the recommended next implementation milestone but has not been implemented.

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
