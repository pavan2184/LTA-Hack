# Testing Plan

Last updated: 2026-07-15

## Philosophy

Use TDD for pure schedule selection and central state transitions, then add component interaction tests around critical planner controls. Browser UAT validates layout, motion endpoints, visible copy, and the complete demo sequence.

Current tests verify the deterministic simulation contract. They do not constitute operational schedule validation.

## Automated Tests

- Data integrity: 5 tests for 22 unique requests, six declared conflicts, schedule references, five zero-conflict fixture metrics, time bounds, and exact same-sector non-overlap.
- Store: 6 tests for load/selection, strategy/lock state, in-session locked-placement preservation, optimisation, disruption/replanning, and reset preference retention.
- Components: 5 tests for the one-action initial state, attention-first queue, direct conflict access, four-signal hierarchy, fixture-based recommendation transition, unsupported-claim removal, and locking.
- Scripted UAT: 1 component test for the two-minute strategy/disruption/replan/lock flow.
- Total at the last recorded run: 17 tests.

## Planner-First UI Regression Requirements

- The initial state has one clear `Load sample requests` action.
- The command bar exposes `Planning objective`, `Submitted`, `Recommended`, `Test disruption`, and `Resolve conflicts` language.
- The four primary signals are jobs placed, critical work, declared conflicts, and window load.
- The default work-request filter is `Attention`.
- Individual conflict titles are directly selectable instead of being hidden behind category-only summaries.
- The selected-request inspector shows submitted/recommended timing, decision reason, affected corridor, and planner controls.
- A release-readiness checklist replaces the robustness radar and labels its indicators as simulated/not independently validated.
- The non-functional export control and unsupported safety-validation claims are absent.

## Current Coverage Boundary

Covered:

- fixture counts and request references;
- state transitions and fixed timers;
- selected planner interactions;
- exact same-sector track non-overlap for strategy fixtures;
- in-session lock preservation across strategy change;
- main demo text and metric transitions.

Not covered or not yet implementable:

- a general interval/resource constraint validator;
- partial-sector overlap, adjacent blocks, or conflict zones;
- team, skill, individual engineer, equipment-capacity, setup, travel, rest, and compatibility rules;
- full dependency and safety-buffer validation;
- feasibility and KPI recalculation after locks/alternatives;
- exact locked-placement behaviour after localStorage rehydration;
- consistency between disruption job changes, moved/deferred IDs, metrics, and copy;
- KPI formula correctness because values are fixture data;
- actual export generation;
- browser-measured overflow, keyboard navigation, focus, contrast, and essential text readability.

A documentation-time read-only audit found that all five strategy fixtures retain apparent named-resource overlaps. At minimum, `M-004` and `M-011` preserve the original `C-04` conflict in every strategy. The present suite does not detect it because those jobs use different sector strings.

## TDD Sequence

1. Write failing schedule/store tests from the client action contract.
2. Add minimum types and deterministic fixtures to pass data tests.
3. Implement state transitions until store tests pass.
4. Write interaction tests before wiring the corresponding dashboard controls.
5. Refactor only while the suite stays green.

## Required Tests for Deterministic P0

Before claiming calculated conflict detection:

1. Unit-test half-open interval overlap and touching boundaries.
2. Expand sector ranges into atomic blocks and test partial/adjacent overlap.
3. Validate team/equipment capacity, buffers, dependencies, windows, setup, and travel.
4. Run the validator against original, every strategy, every response, and every alternative.
5. Property-test that any accepted plan has zero hard violations.
6. Recalculate metrics after lock and alternative changes.
7. Cross-check conflict records and explanations against rule provenance.
8. Add fixture-consistency tests for moved/deferred IDs and actual job deltas.

## Required Tests Before a Solver Claim

- Same input, strategy, constraint version, and locks produce the same canonical answer.
- Solver status distinguishes optimal, feasible, infeasible, and time-limited outcomes.
- Every returned schedule passes the independent validator.
- Locked jobs are honoured or infeasibility is reported.
- Deferred requests have structured reasons.
- Alternatives are feasible, distinct, and correctly ranked.
- Objective components and KPI numerators/denominators match independent calculations.
- Performance is measured on representative 22-job and larger instances.

## Browser UAT

- Run the 14-step demonstration flow without refresh.
- Validate initial/loading/optimised/no-conflict/disruption/replanned states.
- Inspect console and server output for React, hydration, runtime, or asset errors.
- Test 1280×800, 1440×900, and 1920×1080; assert the page does not horizontally overflow.
- Check keyboard operation, visible focus, contrast, non-colour conflict indicators, and essential text size.
- Verify that simulated/fixture status and non-operational disclaimer remain visible.

## Commands

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

## Verification Record — 2026-07-15

- `npm test`: 17 tests passed across data integrity, store transitions, planner-first component interactions, restrained information hierarchy, and the complete demo UAT flow.
- `npm run lint`: passed with no warnings.
- `npm run typecheck`: passed.
- `npm run build`: passed; `/` is statically generated by Next.js.
- `npm audit`: 0 known vulnerabilities after pinning the patched PostCSS override.
- Runtime HTTP probe: `HEAD /` and `GET /` returned 200; the dev server logged no compile or request errors.
- Responsive browser inspection at 1280, 1440, and 1920 px was not available because the in-app browser runtime exposed no browser session. The layout uses `minmax(0, 1fr)`, breakpoint-specific columns, and global horizontal overflow protection, but visual width verification remains a manual follow-up.

## Documentation Audit — 2026-07-15

- Audited the current code, state actions, fixture calculations, persistence, tests, and UI claims.
- Added `docs/README.md` and `docs/CURRENT_IMPLEMENTATION_AUDIT.md`.
- Synchronized current-versus-proposed terminology across the project documents.
- `bash scripts/validate_env.sh`: passed; no `.env` exists and `.env.example` is present.
- `bash scripts/run_checks.sh`: lint and TypeScript checks passed; optional pre-commit and Ruff checks were skipped because the tools are not installed/applicable.
- `bash scripts/run_tests.sh`: the earlier documentation audit recorded 16/16 tests; the current direct Vitest run passes 17/17 after adding planner-first regressions. No separate root `tests/` directory exists.
- After the planner-first UI pass, the production build was rerun successfully and fresh `HEAD /` and `GET /` probes returned 200 from the restarted dev server. Responsive browser UAT remains outstanding because no in-app browser session was available.
