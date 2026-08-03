# Project Status

Last updated: 2026-08-03

## Current version

v0.3.1 — v0.3.0's engine and interface, with the one server-side route hardened.

## v0.3.1 — the assistant route made defensible (Phase 0 of the backend plan)

The engine was never the weak point; the single route in front of it was. This
session fixed live defects in `src/app/api/assistant/route.ts` and added the HTTP
primitives the later phases build on. Nothing about the engine, the solver or the
dashboard changed.

Defects fixed, each with a test:

1. **An unvalidated `strategy` was an unhandled 500.** `solve()` ran outside the
   route's try/catch and `strategyProfiles[unknown]` is `undefined`, so the
   solver dereferenced it and threw. Now a 400 with a typed envelope.
2. **`locked` was unbounded client-controlled CPU.** Every entry is re-validated
   at every candidate start inside the solver, and `buildFactSet` ran five more
   complete solves per request on top. Now capped at one pin per plannable
   request, with each `requestId` and time checked, behind a 64 KB body guard.
3. **No timeout on the model call.** The SDK retries timeouts, so a bare timeout
   is not a bound — `{ timeout: 12_000, maxRetries: 1 }` is, under a
   `maxDuration` of 30.
4. **`stop_reason: "max_tokens"` was unhandled.** Adaptive thinking is on by
   default on this model and `max_tokens` caps thinking and reply together, so a
   truncated answer was possible — and a half-sentence containing only real
   figures passes the grounding check. Truncation now falls back to the engine.
5. **The client could forge assistant turns.** `history` accepted
   `role: "assistant"` entries and replayed them into the prompt. The guard
   catches invented numbers, not injected instructions, so the route now accepts
   only the planner's own questions.
6. Added: per-request id echoed to the client, `pino` structured logging with
   token counts and a cost estimate, and a provisional in-memory rate limit.

**Six solves per question became one.** `comparisonTable()` takes no arguments
and solves the unmodified request set, so it is constant for the life of the
process and is now computed once. The rest of the fact sheet is cached on
`inputHash`, with the *measured* solve time assembled per call and never cached —
a cached sheet quoting a previous run's timing would be a figure the engine
produced, but not one describing the run in front of the planner.

### Known limits of this phase

- **The rate limit is per-instance and provisional.** It lives in one server's
  memory, so on a multi-instance host it limits per instance and resets on a cold
  start. It is replaced by a Postgres token bucket keyed on the authenticated
  user in Phase 2. The input bounds, not the limiter, are what removed the
  amplification that made a flood dangerous.
- `docs/API_CONTRACT.md` still describes the v0.1.0 store and states the project
  has no backend. It is stale and is rewritten in Phase 6.

## Summary

RailPlan takes 22 overnight maintenance requests, detects every constraint
violation in them, builds a schedule that satisfies those constraints, and
verifies its own answer before showing it.

The headline change from v0.1.0: **nothing is a fixture any more.** The five
hand-authored schedule files are deleted. The six hand-typed conflicts are
deleted. Every conflict, placement, KPI, alternative and explanation is computed
from the request data at run time.

## What works

- **Conflict detection.** Twelve rules over 12 atomic track blocks, crew
  capacities, equipment unit counts, isolation zones, work-class compatibility,
  dependencies, travel and handback. Run against the submitted times it finds 22
  violations across 4 clusters — including a shared block between `NS10-NS12`
  and `NS11-NS13`, which no amount of string comparison would catch.
- **Scheduling.** Dependency-aware ordered insertion with bounded repair, at
  15-minute resolution. Solves in roughly 20-70 ms and reports `OPTIMAL`,
  `FEASIBLE` or `INFEASIBLE` honestly, with solve time, candidate count and an
  input digest on screen.
- **Independent verification.** Every plan the solver produces is handed back to
  the validator before display. A plan that fails is reported infeasible, not shipped.
- **Five objectives, one solver.** Balanced, maximum completion, minimum risk,
  minimum changes and emergency reserve are objective profiles. They produce
  measurably different plans: emergency reserve reaches 100% emergency capacity
  against 25% for balanced, and minimum changes holds movement well below
  maximum completion.
- **Calculated metrics.** Eleven figures, each exposing its formula, numerator
  and denominator behind an `fx` control. Emergency capacity is measured by
  actually inserting each scenario and re-validating.
- **Explanations by counterfactual.** "Why did M-014 move?" is answered by
  replaying it at 01:00 and reporting what breaks, in the rules' own numbers.
- **Planner control that counts.** Pinning a placement enters it as a hard
  constraint and re-solves; the plan and every metric move with the decision.
- **Validated alternatives.** Generated by re-solving, shown by default with why
  each works and what it costs. Slots that fail, or that push a conflict onto
  another request, are not offered.
- **Disruptions that change the inputs.** A scenario rewrites the request set or
  the validation context; the plan is re-checked, then solved again.
- **A grounded assistant.** Reads engine output only. Any answer containing a
  figure the engine did not produce is discarded and the engine answers instead.

## What this session changed

The engine was already right; the interface was describing the tool rather than
the job. This session reframed it around what a scheduler actually does.

- **Three named steps** replace the "as submitted / as planned" toggle:
  *Requested plan → Conflicts → Optimised schedule*, each a control, each
  showing its own state. "Solve" is now "Generate optimal schedule".
- **Conflicts have a kind.** Six planner-facing categories — sector overlap,
  engineer availability, incompatible work, equipment, sequencing, engineering
  hours — projected from the twelve rule ids in `engine/conflicts.ts`. The
  projection is total and exclusive, and a test asserts both.
- **Conflicts have an interval.** `Violation.window` carries the exact minutes a
  rule is broken in, so the chart shades the 15 minutes at fault rather than
  condemning two 60-minute jobs.
- **The chart stacks what shares a block.** Jobs on one block are packed into
  sub-lanes, because drawing two overlapping possessions at the same height hid
  the collision the chart exists to show. Bars carry the assigned team.
- **Suggested fixes, applied.** `engine/resolutions.ts` searches every candidate
  start for every request in a conflict, re-validates each, and offers the
  cheapest move that clears it — or reports that no single move does.
  "Apply suggested fixes" runs that greedily over the whole list: 22 conflicts
  to 6 in 8 moves on this dataset, with what it could not fix left named.
- **Accepted suggestions edit the requested plan**, not the solver output
  (`overrides` in the store), so a planner can fix conflicts one at a time and
  watch the count fall before the solver is involved at all.
- **Figures follow the step.** Before scheduling: requests, conflicting
  requests, unresolved conflicts, engineer and engineering-hours utilisation.
  After: conflicts against the submitted baseline, requests scheduled, mandatory
  work, movement, and estimated planner time saved.
- **Scenario testing demoted** from a headline figure and a primary button to a
  quiet strip below the workspace. It is a good demo; it is not the problem.

### The one assumption, declared

"Planner time saved" is the only figure on the dashboard that is not arithmetic
over the plan. It multiplies conflicts resolved by
`ASSUMED_MINUTES_PER_MANUAL_CONFLICT` (12), a named constant in `engine/metrics.ts`.
The figure is labelled *estimated*, its `fx` panel says "assumption, not a
measurement", and its baseline is the conflict count in the requests **as
submitted** — not the count after the tool's own fixes, which would let the tool
quietly lower the bar it is judged against. A test asserts that baseline.

## Verification

- `npm test` — 158 passed across 8 files (138 engine tests unchanged, plus 20
  covering the hardened boundary and the fact-set cache).
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npm run build` — succeeds; `/` static, `/api/assistant` dynamic.
- Manual browser pass at 1512 px: load, review conflicts, apply one suggestion,
  apply all, generate the schedule, inspect, pin, disrupt, re-solve.

## What this session fixed

Four defects found by testing rather than by reading:

1. A Zustand selector returning a freshly-built array on every call, which put
   the dashboard into an infinite render loop and left the page blank.
2. An unlayered `button { color: inherit }` in `globals.css` outranking Tailwind's
   layered utilities, making every dark button render its label invisible.
   `@layer base` does not survive the CSS minifier; the reset was removed instead.
3. The work-overrun disruption never actually extending the job, and the impact
   check appending a duplicate placement that collided with itself.
4. Explanations naming the subject request among its own conflict partners.

## Known limits

Recorded in full in `CURRENT_IMPLEMENTATION_AUDIT.md`. In brief: the solver is a
heuristic and says so; crews are not reassigned; travel is enforced only for
single-crew teams; the topology is invented; there is no export; a full
screen-reader pass has not been done.

## Next

1. Benchmark the heuristic against an OR-Tools CP-SAT model on the same
   instance set, and compare feasibility, plan quality and solve time before
   deciding whether a backend is worth its failure modes.
2. Export the plan as JSON and CSV — the artefact is real now.
3. Crew reassignment, once qualification data exists to justify it.
4. Screen-reader pass and a responsive check at 1280 and 1920.

## Do not break

- The validator is the only authority on feasibility. Nothing may assert a plan
  is safe without running it.
- Every displayed figure keeps its formula, numerator and denominator.
- The assistant never introduces a number the engine did not produce.
- Solver status stays honest: no `OPTIMAL` without grounds, no hiding a deferred
  mandatory job behind a clean violation count.
- A suggestion is offered only after it has been inserted and re-validated. The
  panel says "no single move fixes this" when that is the answer.
- Conflict categories stay a projection of the rule ids, never a second opinion
  about them.
