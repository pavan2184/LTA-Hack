# Project Status

Last updated: 2026-07-15

## Current Version

v0.1.0 — presentation-ready frontend prototype

## Summary

RailPlan is a frontend-only rail maintenance control-centre dashboard that demonstrates conflict review, explainable fixture-based schedule comparison, planner control, and preconfigured emergency response.

Current release truth: no constraint engine, solver, calculated KPI layer, live map integration, backend, or external API exists.

## What Works

- 22 realistic fabricated requests, six declared original conflicts, five strategy fixtures reporting zero active conflicts, four disruptions, and four response fixtures.
- Planner-first desktop dashboard with one primary action, four decision signals, an attention-first request queue, interactive access timeline, direct conflict selection, Submitted/Recommended comparison, explanations, alternatives, approvals, locks, reset, and disruption testing.
- Progressive disclosure keeps the fixed network schematic in selected-request context and puts release readiness in the inspector; the third workspace column is reserved for extra-wide displays.
- One-second optimisation and replanning simulations with deterministic fixture changes, degraded disruption metrics, warning/impact banners, and toasts.
- Persisted strategy and locked request IDs, with exact locked placements preserved across strategy changes within the current session.
- Initial, loading, no-conflict, impossible-placement, disruption, and response states.
- TDD and automated UAT: 17 tests pass, including planner-first hierarchy and unsupported-claim regressions.
- Production build, lint, and TypeScript checks pass.
- A deterministic scheduling, mapping, and analytics proposal plus an annotated research survey now document the path from fixture-based simulation to validated conflict detection, constraint solving, graph-derived maps, calculated KPIs, and research-backed future experiments.
- A documentation index and current implementation audit now record source-of-truth precedence, every major module/flow, persistence, calculation provenance, current coverage, and known gaps.
- A teammate handoff and expanded root README provide the setup, demo path, code map, current truth, collaboration rules, and recommended next milestone for project sharing.

## Known Issues / Verification Limits

- The in-app browser runtime was unavailable, so visual UAT screenshots and measured overflow checks at 1280/1440/1920 remain unperformed.
- This prototype uses simulated schedules and is not suitable for operational decisions.
- Zero-conflict strategy values are fixture assertions; tests cover exact same-sector non-overlap but not general team, equipment, buffer, dependency, adjacency, compatibility, travel, or override feasibility.
- Every strategy retains the known `M-004`/`M-011` shared thermal-imaging-unit overlap from original conflict `C-04`; a read-only audit found additional apparent named-resource overlaps that require explicit capacity data and validation.
- Locks and alternative placements do not trigger conflict or KPI recalculation.
- Exact locked placements are not persisted across reload; only strategy and lock IDs are stored.
- KPI values, KPI delta copy, explanations, alternatives, and most disruption impacts are preconfigured and can drift from visible overrides.
- The network view is a fixed station-code schematic rather than a geographic or operational block graph.
- Export remains out of scope and no export control is shown.
- A few supplementary 10 px labels plus full keyboard/focus/contrast behaviour need visual accessibility UAT.

## Architecture

- Frontend: Next.js 16 App Router, React, TypeScript, Tailwind CSS, shadcn/Radix primitives, Lucide, Framer Motion, date-fns, and Sonner. Recharts remains installed but is not rendered.
- State: Zustand with deterministic local data and partial localStorage persistence.
- Backend/database/auth/external APIs: none.

## Verification

- `npm test` — 17/17 passed.
- `npm run lint` — passed cleanly.
- `npm run typecheck` — passed.
- `npm run build` — passed; route `/` generated statically.
- `npm audit` — 0 known vulnerabilities.
- `HEAD /` and `GET /` — HTTP 200 from the local dev server with no server-log errors.
- Starter wrappers — environment, checks, and test scripts passed; optional pre-commit and Ruff checks were not applicable.
- Documentation and UI audit — current code behaviour, proposed work, planner-first interaction hierarchy, and research rationale are cross-documented; lint, typecheck, and all 17 Vitest tests pass. Browser UAT remains pending when a browser session is available.

## Documentation

- `docs/README.md` — documentation index and source-of-truth rules.
- `docs/CURRENT_IMPLEMENTATION_AUDIT.md` — exact current code behaviour and gap inventory.
- `docs/TEAM_HANDOFF.md` — teammate setup, product tour, code map, truth boundary, and contribution workflow.
- Core planning documents — current product, architecture, data, client contract, testing, security, decisions, and status.
- `docs/DETERMINISTIC_SCHEDULING_AND_ANALYTICS.md` — proposed mathematics and implementation path.
- `docs/RAIL_SCHEDULING_RESEARCH.md` — supporting annotated research.

## Next Tasks

1. Confirm the proposed P0 decision, then implement atomic blocks, a pure conflict validator, and calculated KPIs while preserving the frontend-only architecture.
2. Run visual browser UAT at 1280×800, 1440×900, and 1920×1080 when a browser session is available.
3. Capture hackathon demo screenshots or a short walkthrough recording.
4. Benchmark a deterministic frontend scheduler against CP-SAT before approving any backend architecture change.

## Do Not Break

- Deterministic demo behaviour, six declared original conflicts, existing strategy fixture contract, in-session locked-job preservation, no external API calls, no backend, and the one-page presentation flow unless an explicit replacement decision is accepted first.
