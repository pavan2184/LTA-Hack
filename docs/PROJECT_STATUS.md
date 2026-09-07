# Project Status

Last updated: 2026-09-07

## Ordered issue work — #4–#11 complete; #12 next

Working branch: `codex/ordered-issues`. The owner requested #4–#21 in numeric
order and then required no Docker. No GitHub issue has been closed yet.

#10 is committed as `c48974e`. #11 is complete: owner-private proposal edits,
explicit submission into the shared request review queue, immutable source and
revision evidence, and rejection-reversal/cancellation source invalidation.
Migration `20260907114117_unified_request_review.sql` is applied and immutable.

Verification: **346 tests pass, zero skips**,38 files; required DB49 rollback
and3 isolated concurrency tests pass. Lint/typecheck/build, independent backend/UI
review, migration replay and baseline parity pass. Cross-boundary tests cover
source-inert private edits/submission, exactly one approved engine revision,
immutable original evidence, and stale plans after approval, rejection reopening
and cancellation.

Production browser verification passed contractor private edit/save/explicit
submission, planner original evidence review and approval, and saved generation
with18 placements including the approved request at01:15–01:30. The original
model-attributed title stays in revision1; edited current fields show human
attribution. Owner-private lists stayed separate. Widths1280/1920 had no document
overflow and browser logs were empty. Both temporary users, both private drafts,
one submitted request and one generated plan were removed; history guards restored,
parity unchanged and preview stopped. Live model extraction remains unverified
without a key. #12 is next.

#9 is committed as `186c7a4`. #10 is implemented: owner-private transcript
proposals with bounded UTF-8 input, exact evidence, unsupported fields unset and
an explicit extract-and-save action. Migration `20260907093242_private_transcript_drafts.sql`
is applied and immutable. Model calls have a12-second timeout, no retries/tools,
strict output schema, disabled SDK logging and a private per-owner quota. Raw
transcripts are neither stored nor logged; no private draft changes planning facts.

Verification: **328 tests pass, zero skips**,33 files; required DB43 rollback tests
and3 isolated concurrency tests pass. Lint/typecheck/build, migration replay,
baseline parity and independent backend/UI/security reviews pass. Before application,
a SQL null-field guard was tightened; an initial CASE syntax failure rolled back
and was corrected before successful application. No applied migration changed.

Production browser verified separately scoped contractor/planner controlled drafts,
visible evidence and unknown fields, actual missing-key503 preserving input, and
manual intake remaining usable. The controlled stored proposals exercise display
and ownership; they are not live-provider extraction results. Widths1280/1440/1920
had no overflow and browser logs were empty. Two temporary owners and two private
drafts were removed; all8 immutable-history guards are enabled and baseline parity
still matches22 fabricated requests. Preview stopped. The model key remains absent,
so successful live-provider extraction is explicitly unverified. #11 is next.

#9 implements separate contractor proposals, organisation-scoped draft editing,
submission, information requests, rejection, explicit planner approval and
cancellation. Every change appends an immutable revision and audited actor/reason.
Only active approved revisions become planning inputs; proposed amendments retain
the previous approval until replacement or cancellation. Scheduled status derives
from the current published plan and its exact approved revision.

Migration `20260907085837_request_intake.sql` is applied and immutable. Independent
backend review resolved a baseline dependency deletion/night-move gap before
application; an assembled-instance check also fails closed on missing references.
Full **306 tests pass without skips**, across28 files. Required DB gate includes
intake and passed parity,40 rollback tests and3 isolated concurrency tests.
Lint, typecheck, production build, migration replay and independent security/code
review passed. Rollback files run sequentially to avoid shared-source lock queues;
long hosted intake journeys have a scoped20-second I/O budget after measured
network variance. Assertions and explicit concurrency tests remain intact.

Production browser UAT passed contractor save/submit, planner approval, saved
plan generation/publication, contractor published placement, revision/edit/reload,
immutable original approval and cancellation/logout. The test plan had18 placements,
including approved revision4 at01:15–01:30. SQL independently confirmed7 revisions,
original approved title unchanged, and no active approval after cancellation.
Responsive widths1280/1440/1920 had no horizontal overflow; browser logs were clean.
Temporary2-role accounts,1 request and1 published plan were removed by exact IDs;
all7 immutable-history guards are enabled. Cleanup retries rolled back until the
owner lock and deferred-FK trigger handling were correct. Final baseline parity
matches22 requests. Preview stopped; no local server is running. #10 is next.

RailPlan Dev is healthy on Supabase Free in Singapore, project
`ufcdynfjfzbjvglsdaqp`, in `pavan2184's Org`. The new empty hosted database is
the replacement for #4's local Docker reset baseline. Neither unrelated
Supabase projects nor the local NRI_Land database were modified.

#6 is committed as `c0e39ce`. #7 is complete with anonymous roles, availability
and request demand, canonical parity, bounded validation and immutable saved-plan
provenance. Migration `20260907082740_workforce_facts.sql` is applied and immutable.
The seeded workforce digest is `fnv1a:8c4a9050cfea5e8b` for 22 requests, two roles,
22 team/role availability windows and 44 demand rows. Team capacity still counts
crews; explicit role headcounts count people. No worker identities are collected.

#7 verification: six new database regressions failed before migration and passed
afterward. Full suite **259 passed, zero skipped**, 23 files. Required DB gate:
parity, **33 rollback tests**, and **3 isolated concurrency tests** passed. These
include both availability-insert/parent-night-resize orderings; the second writer
is observed waiting and rejects any resulting out-of-night window. Temporary
committed fixtures are cleaned up by exact IDs. Workforce-only edits change both
instance and saved-plan digests, stale older drafts with an audit, and preserve
old snapshots. Migration replay, lint, typecheck, production build and independent
security/code review passed. No UI changed in #7; existing dashboard tests pass.
No local preview server is running.

#8 is complete. WORKFORCE_CAPACITY is a critical shared-validator rule with exact
team/role/interval/headcount/contributor evidence. Crew concurrency remains
separate; absent supply is zero and undefined demand fails closed. Candidate
search, pins, repairs, alternatives, emergencies and independent final validation
all enforce it. Metrics include person-minute utilisation and shortage intervals
with formulas. Constraints-v3/solver-v3 provenance protects saved publication.

Verification: full **284 passed, zero skips**, 24 files; required DB **34 rollback
plus 3 isolated concurrency tests** passed, including fresh mandatory workforce
infeasibility refusing publication. Lint/typecheck/build and independent reviews
passed. Review fixed emergency alternative lookup, unsupported alternatives
claiming feasibility, and stale disruption metrics after repairs/view changes.
The last two copy corrections passed targeted UI tests and a fresh typecheck/build.
No applied migration changed; parity stays `fnv1a:8c4a9050cfea5e8b`.

Production browser UAT passed login, submitted workforce evidence and formula
(3825/13200 person-minutes), generation (17 placed, 5 deferred, zero violations
and zero workforce shortages), disruption preview, requested/planned view change,
replan and logout. Workforce utilisation changed 23.2% → 24.5% with emergency
impact and 30.3% on the requested-plan impact; the replan honestly reported
mandatory work without a slot. Widths1280/1440/1920 had no document overflow;
browser warnings/errors were empty. Browser viewport restored, temporary planner
removed, no saved UAT plans created, final database parity passed. Production
preview stopped before the final build. #9 is next.

Implemented for #4:

- Transactional migration runner with an unexposed SHA-256 migration ledger;
  repeated migrations are a no-op and edited applied migrations fail.
- Corrected PostgreSQL enum pair ordering to match TypeScript lexical ordering.
- Seeded all 22 fabricated requests and read them back through the real loader.
- Consistent repeatable-read loader transactions also fix stalling pooled reads.
- Shared content comparison reports changed sections, ignores object property
  order, and preserves meaningful request block order.
- Required db:verify/test:db commands cannot turn missing infrastructure into a
  passing gate. Ordinary tests show explicit skips only if the probe fails.
- Hosted TLS verifies Supabase's public CA and hostname; prepared statements
  are disabled for transaction pooling. Port 6543 works; 5432 times out on this
  network. Credentials are confined to ignored, owner-readable `.env.local`.
- Updated v0.4 contracts, package versions, setup and security documentation.

Verification (2026-09-07):

- Both migrations applied successfully to the empty hosted database.
- db:migrate rerun: both recorded as already applied.
- db:seed and db:verify: database/literal digest `fnv1a:fef0c4904e890f43`, 22 requests.
- npm test: **191 passed, zero skipped**, across 11 files; includes live database
  parity, rolled-back equipment drift, all public tables using RLS, and reversed
  work-class pair rejection.
- Lint, typecheck, production build and diff whitespace checks passed.
- Before database setup, db:verify correctly failed while optional tests reported
  unavailable-database skips. No browser UI behavior changed in this baseline.
- Code review passed after adding missing/edited migration-history rejection.
  The follow-up run passed 17 migration/instance tests, live migration replay,
  lint and typecheck. The prior full suite/build passed unchanged app behavior.
- No local app server started. #4 is complete under the hosted/no-Docker
  requirement; #5 authentication is next.
- npm audit has unresolved advisories; remediation remains a release gate.

Historical environment recovery: the initial Docker image pull exhausted disk
space and was stopped. The owner then selected hosted Supabase. Project build
output was deleted to recover space; no unrelated volumes or source were deleted.
Docker-backed npm commands were removed. All current database work is online.

## Issue #5 — implementation and database authorization verified

Added official Supabase SSR login/logout, server-verified identities and trusted
planner/contractor profiles. Pages gate the existing planner UI and give
contractors an honest workspace pending #9 intake. Added operator-only profile
provisioning for confirmed Auth UUIDs and a loopback-only demo auth seed that
refuses hosted databases and generates random credentials into an ignored 0600
file. No default online accounts were created.

The identity migration adds profiles, organisations, scoped RLS and a private
atomic assistant quota. Application queries set transaction-local authenticated
role and verified claims before loading profiles. Only planners manage existing
planning facts; shared action guards cover assistant, solve, approve, publish
and resource management. Later issue tables/routes are not preimplemented.

The assistant now uses server identity, typed 401/403/503, an actual streamed
64 KiB body bound, and a shared user-keyed quota. Parent applied the migration
and fixed migration-runner replay to preserve private function schema usage
while denying authenticated access to the migration ledger.

Verification: final full suite **220 passed, zero skipped** across 16 files;
required `test:db` passed 20 tests after database parity verified all 22 requests.
Lint, typecheck, production build and diff whitespace checks passed. Real
rollback database checks cover planner/contractor/anonymous/unassigned access,
organisation isolation, forged metadata, shared quota and private ledger denial.
Local auth seeder correctly refused the hosted environment; operator script
rejected missing arguments. Local auth account creation was not exercised
because no local Supabase Auth instance is running under the no-Docker direction.

Production HTTP verification passed the real login Server Action, returned
session cookies, correct planner/contractor/unassigned workspace, and logout
cookie removal for all three temporary identities. Anonymous API access returned
401; contractor and unassigned access returned 403; planner input validation
returned 400. The browser rendered the login page and its generic invalid-login
alert correctly. Temporary hosted identities and their organisation were deleted
with exact-ID cleanup after verification. No permanent demo credentials remain.

Independent security/code review passed after classifying Auth service/network
failures as 503 rather than 401, with regressions. The earlier disk error was
resolved; current production preview runs at http://127.0.0.1:3000. #5 is complete
for the hosted workflow; #6 is next. Local Auth creation remains an explicitly
unrun optional check. No GitHub issues have been closed yet.

## Issue #6 — immutable saved plans implemented

The dedicated `/plans` workspace generates server-computed durable versions from
canonical database facts, lists/reloads the latest 20 versions per night, records
planner decisions and publishes with independent validation and stale-source
protection. It displays exact placements, deferrals, calculated metrics and
provenance. The existing dashboard remains explicitly local exploration; wider
workflow integration follows #16. No #7 workforce contracts are preimplemented.

The applied migration stores private immutable runs, normalized children,
append-only decisions/publications/audits and a global source revision. Current
request, child, resource and topology changes conservatively stale all drafts.
Publication supersedes with a separate immutable link; stale rejection audits
commit before HTTP 409. Private write functions derive actor IDs from verified
claims, planner RLS denies contractor reads, and application SQL runs with actual
authenticated privileges. JSON/Origin/body/schema bounds guard all mutations.

Review found and fixed a repeatable-read publication race before migration
application: a separate lock generation now forces overlapping callers to retry
from BEGIN. The true-concurrency test observed both first-publication transactions
waiting, then proved one published version and one superseded version. Its
committed future-night/request/actor fixtures were removed by exact-ID owner
cleanup, with exclusive table locks and immutable triggers restored within one
transaction. The schema remains outside exposed Supabase Data API schemas.

Verification: `npm test` **245 passed, zero skipped**, across 20 files,
including six live rollback persistence/RLS tests and seven saved-plan UI tests.
Required `test:db` passed canonical parity for 22 requests, 26 rollback tests
and one isolated concurrency test with cleanup. Lint, typecheck, production build
and diff whitespace checks passed. Independent review passed after fixing the
concurrent-publication race, stale UI state and Next.js origin handling. The origin
guard compares the actual Host with the transport protocol, rejects malformed
origins and scheme/port mismatches, and ignores untrusted forwarded-host headers.

Production browser UAT passed sign-in, server generation, stale rejection,
fresh generation, review note, publish, full reload, a different strategy and
supersession, then logout. The reloaded balanced plan retained 17 placements and
5 deferrals. A separate SQL read confirmed committed audit counts: three create,
one decision, one stale rejection, two publish and one supersede. Browser console
reported no errors. Exact-ID cleanup removed the three temporary plans and their
Auth user; all six immutable-history guards were verified enabled afterward.
Database parity still matches the original 22 fabricated requests. The production
preview at http://127.0.0.1:3000 was stopped before the next implementation/build.
#6 is complete; #7 is next. Existing dependency advisories and broader release
accessibility checks remain #17 gates. No GitHub issue has been closed.

## Historical implementation record

The entries below describe earlier milestones. Their "not yet verified" notes
are historical; the current verification state is recorded above.

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

### The engine now reads the night it is given

This was deferred and has since landed, because it is what makes the Phase 4
gate mean anything: a validator that can only check plans built from the
literals it has compiled in is not a gate.

`PlanningWorld` derives from a `PlanningInstance` the things the rules actually
need — lookups by id, the adjacency walks, the compatibility matrix. It is
carried on `ValidationContext.world`, which was already threaded through
`validate`, `solve`, `computeMetrics`, `explainPlacement`, `findAlternatives`
and `recommendResolution`. So the engine became instance-driven with **no public
signature changes and no call-site churn**, and every existing caller keeps
working by falling back to the literal world.

Two consequences worth knowing:

- **Strategy profiles express a reserve, not a clock time.** `planningWindowEnd:
  WINDOW_END - 45` became `windowReserveMinutes: 45`. "Keep the last 45 minutes
  clear" survives a night with a different handback deadline; "stop at 03:15"
  silently means something else.
- **`inputHash` now identifies which night was planned**, not just how. It
  includes `instanceDigest`, so two solves that agree on strategy, locks and
  requests but disagree on the topology no longer collide.

Verified rather than asserted: the derived world is checked against the module
topology it replaces across every block pair, every class pair and every
request's sector label; and a separate suite hands the engine a deliberately
different night — a shortened window, a scarcer asset, a severed adjacency — and
insists the answers move.

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
- The API contract was stale at this milestone; synchronized during issue #4.

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

- `npm test` — 184 passed, 2 skipped across 11 files (the two skips are the
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
