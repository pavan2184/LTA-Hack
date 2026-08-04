# Project Status

Last updated: 2026-08-04

## Current version

v0.4.0 — the engine extracted into a package, and the planning facts given a
contract and a schema. The engine itself is unchanged.

## v0.4.0 — packages/core and the planning facts (Phase 1 of the backend plan)

**`packages/core` is now a workspace package** holding `domain`, `data`,
`engine` and `types`, consumed by the web app and the API route through
subpath imports (`@railplan/core/engine/solve`). Inside the package imports are
relative; there is no `@/` alias there on purpose, because an alias meaning one
thing in the app and another in the engine is a trap for whoever moves a file
next. The 77 engine tests moved with it and pass with no assertion changes.

`docs/ARCHITECTURE.md` has claimed since v0.2.0 that the engine knows nothing
about the interface. That held by discipline alone. An ESLint rule now fails the
build if anything under `packages/core` imports from the web app, from React, or
from Next — which also matters because the package is about to be consumed by
something that is not a Next app.

**`PlanningInstance` is the contract for a night's facts** — stations, blocks,
adjacency, zones, teams, equipment, incompatible work classes, requests, and the
window — as one serialisable value with a canonical ordering and a content
digest. It exists because those facts are about to have three readers: this
package's literals, Postgres, and a Python CP-SAT service. Three readers of the
same facts is exactly where they quietly stop being the same facts, so
`instanceDigest` is the check that says whether two sources agree.

**The schema is authored** in `supabase/migrations/`: 16 tables with the
constraints in the database rather than only in the application, because the
application is about to stop being the only writer. `mandatory` is a generated
column (`priority = 'critical'`) rather than a stored one; the incompatible-pair
table has a `check (class_a < class_b)` so the same rule cannot be stored twice
in opposite orders; `request_blocks` holds atomic block ids and a position,
never a sector label. Every table has row-level security enabled with no
policies, which denies everything by default until Phase 2 defines who may read
what.

### Not yet verified

**The migration has never been applied and the seed has never run.** The Docker
daemon became unresponsive while pulling the Supabase images, so the round trip
is written but unproven. What *is* verified: the migration parses under the real
Postgres parser (`libpg-query`) as 2 enums, 16 tables, 3 indexes and 16 RLS
statements, all 16 tables have RLS enabled, and all 18 foreign keys target
tables defined in the same migration.

To finish it:

```
npm run db:start   # supabase start
npm run db:seed    # writes the literals, reads them back, compares digests
```

The seed exits non-zero on a digest mismatch and names the section that differs.
`src/test/instance.test.ts` runs the same comparison and skips when no database
is reachable, so `npm test` stays green on a clone without Docker.

### Deferred, deliberately

The engine still reads its facts from module literals rather than taking a
`PlanningInstance` parameter. Threading one through `validate`, `solve`,
`computeMetrics`, `explainPlacement` and `findAlternatives` changes every public
signature the web app and the 77 engine tests call, and Phase 3 has not yet
settled how an instance is fetched per request — doing it now risks doing it
twice. **The consequence is worth stating plainly: until that lands, the gate
validates a proposal against the literals, not against whatever is in Postgres.
That is only safe while Postgres is seeded from those literals**, which the
digest check enforces.

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

- `npm test` — 165 passed, 2 skipped across 9 files (the two skips are the
  database round trip, which needs a running Postgres).
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
