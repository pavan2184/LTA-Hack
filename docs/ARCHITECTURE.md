# Architecture

Last updated: 2026-09-07

## Shape

A static Next.js App Router page over a pure TypeScript planning engine, plus
one dynamic route for the assistant. Postgres planning-facts migrations and a
seed/loader exist; the dashboard still consumes literals. No auth or live feed
yet. The owner requires database development without Docker.

```
packages/core/src/domain/     network topology, crews, assets, work-class rules   (facts)
packages/core/src/data/       22 requests, emergency scenarios, disruptions       (inputs)
packages/core/src/engine/     intervals, validate, solve, metrics,                (computation)
                alternatives, explain, strategies, hash
src/store/      Zustand: view state + solver invocation             (orchestration)
src/components/ dashboard                                           (presentation)
src/lib/assistant/ fact set, grounding guard, templates             (language layer)
src/app/api/assistant/ Claude call, server-side                     (model boundary)
```

The dependency arrow points one way. `domain` knows nothing about `engine`;
`engine` knows nothing about `components`; `components` never compute a planning
result, they render one.

## The central rule

**`validate()` is the only authority on whether a plan is feasible.**

The solver calls it while building. It calls it again on the finished plan, from
scratch, before returning. The alternatives generator calls it on every candidate.
The explanation engine calls it on counterfactuals. The tests call it on solver
output as a property. Nothing anywhere is allowed to assert that a plan is
acceptable without going through it.

This is what makes the difference between a tool that shows a schedule and a tool
whose schedule means something. A solver that only trusts its own incremental
checks will eventually ship a plan that violates a rule it stopped looking at.

## Why atomic blocks

A request arrives labelled `NS10-NS12`. Another arrives labelled `NS11-NS13`.
Compared as strings they are unrelated; on the ground they share `NS11-NS12`.

So a sector label is display only. `expandSector` turns it into block ids at
module load, and every rule, the solver, the timeline and the corridor map all
work on those ids. The timeline draws one row per block rather than per request
for the same reason: a chart keyed on the requested sector would hide precisely
the collision the tool exists to find.

## Why capacities, not names

v0.1.0 modelled equipment as a string. Two jobs both listing "Thermal imaging
unit" looked like a coincidence. Modelled as a count — one calibrated unit — it
is a constraint the validator finds without a human noticing.

The same dataset shows why this matters more than crew headcount: Power Systems
has two crews, so `TEAM_CAPACITY` is satisfied for M-004 and M-011 running
together. They still cannot both run, because there is one thermal imaging unit
and one SS-4 isolation. Three rules, one answer, none of them typed in.

## Strategies are objectives, not schedules

A strategy is three deterministic levers over one solver: the order requests are
considered in, how candidate start times are ranked, and how much separation or
reserve the profile insists on. Nothing is stored. Two profiles running the same
constraints differ only by those numbers, which is what makes the comparison
meaningful rather than decorative.

## Planner decisions re-enter the solve

Pinning a placement is not an overlay. It becomes a hard constraint and the night
is solved around it. This is the difference between an interface that lets a
planner move a bar and one where moving the bar means something: the KPIs, the
violations and the rest of the schedule all move with the decision, or the tool
reports that the decision cannot be honoured.

## Disruptions change inputs

Each scenario translates into solver inputs — a mandatory emergency job pinned to
its window, a crew marked unavailable, a job stretched by its overrun, an earlier
handback deadline. Then the ordinary solver runs. Nothing is precomputed, which
is why a scenario is allowed to come back infeasible.

## The model boundary

The assistant is a presentation layer over solver output and is constrained
structurally rather than by instruction alone:

1. The browser sends the question and the parameters identifying the plan — never
   the plan. The server re-solves and builds its own fact set, so nothing the
   client sends can become a fact the model repeats.
2. The fact set is serialised into the prompt *and* reused as the allow-list for
   the grounding check, so the two cannot drift.
3. Any answer containing a numeric token absent from that fact set is discarded.
4. On rejection, refusal, missing credentials or network failure, templates over
   the same engine output answer instead, and the interface says which happened.

The assistant can rephrase, summarise and prioritise. It cannot introduce a
quantity, and it never decides feasibility.

## Determinism

Same inputs, same plan. Guaranteed by fixed request ordering with `id` as final
tie-break, integer minutes throughout, candidate starts generated in a fixed
order, and a repair loop that re-solves from scratch rather than mutating in
place — so the result is a function of its inputs and not of the order repairs
happened in. `inputHash` makes it checkable, and a test asserts it.

## Performance

22 requests solve in 20-70 ms, so solving runs inline. A Web Worker would add
failure modes without removing a visible stall. The progress strip shows three
real phases rather than a fake timer. That trade changes if the dataset grows.

## Deployment

Any Node host that can build Next.js. `/` is static; `/api/assistant` needs a
server. Without `ANTHROPIC_API_KEY` the assistant degrades to templates and the
rest of the application is unaffected.

## Database boundary (v0.4.0)

`PlanningInstance` is the serializable contract shared by literals and the
Postgres loader. Canonical ordering and section-level digest comparison detect
source drift. `PlanningWorld` derives the lookups carried through engine context.
The core package cannot import web, React or Next code; ESLint enforces this.
`supabase/migrations` stores schema history, `scripts/db/seed.ts` writes demo
facts, and `scripts/db/verify.ts` is the required non-skipping parity gate.
The hosted RailPlan Dev project passes migration, seed and literal/database parity
verification. The loader uses a repeatable-read transaction for a consistent
snapshot and transaction-pooler compatibility. Plans and audits are not persisted yet.
