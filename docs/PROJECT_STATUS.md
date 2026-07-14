# Project Status

Last updated: 2026-07-15

## Current Version

v0.1.0 — presentation-ready frontend prototype

## Summary

RailPlan is a frontend-only rail maintenance control-centre dashboard that demonstrates deterministic conflict detection, explainable schedule optimisation, strategy comparison, planner control, and emergency replanning.

## What Works

- 22 realistic requests, six original conflicts, five conflict-free strategy schedules, four disruptions, and four response plans.
- Desktop-first operational dashboard with metrics, request search/filters, interactive timeline, conflict focus, rail network schematic, explanations, alternatives, approvals, locks, view comparison, reset, export toast, and robustness radar.
- One-second optimisation and replanning simulations with deterministic job motion, degraded disruption metrics, warning/impact banners, and toasts.
- Persisted strategy and locked request IDs, with locked placements preserved across strategy changes.
- Initial, loading, no-conflict, impossible-placement, disruption, and response states.
- TDD and automated UAT: 15 tests pass.
- Production build, lint, and TypeScript checks pass.

## Known Issues / Verification Limits

- The in-app browser runtime was unavailable, so visual UAT screenshots and measured overflow checks at 1280/1440/1920 remain unperformed.
- This prototype uses simulated schedules and is not suitable for operational decisions.

## Architecture

- Frontend: Next.js 16 App Router, React, TypeScript, Tailwind CSS, shadcn/Radix primitives, Lucide, Recharts, Framer Motion, and date-fns.
- State: Zustand with deterministic local data and partial localStorage persistence.
- Backend/database/auth/external APIs: none.

## Verification

- `npm test` — 15/15 passed.
- `npm run lint` — passed cleanly.
- `npm run typecheck` — passed.
- `npm run build` — passed; route `/` generated statically.
- `npm audit` — 0 known vulnerabilities.
- `HEAD /` and `GET /` — HTTP 200 from the local dev server with no server-log errors.
- Starter wrappers — environment, checks, and test scripts passed; optional pre-commit and Ruff checks were not applicable.

## Next Tasks

1. Run visual browser UAT at 1280×800, 1440×900, and 1920×1080 when a browser session is available.
2. Capture hackathon demo screenshots or a short walkthrough recording.
3. Connect a real optimisation API only in a future backend phase.

## Do Not Break

- Deterministic demo behaviour, six original conflicts, zero optimised conflicts, locked-job preservation, no external API calls, no backend, and the one-page presentation flow.
