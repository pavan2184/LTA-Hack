# RailPlan

Overnight rail maintenance planning. 22 competing work requests, one four-hour
engineering window, 12 atomic track blocks.

RailPlan reads the requests as submitted, runs every operating constraint against
them, and reports what collides. It then builds a schedule that satisfies those
constraints, and checks its own answer before showing it to you.

The data is fabricated. It encodes no LTA operating rule and must not be used for
an operational decision.

## Run it

```bash
npm ci
npm run dev      # http://localhost:3000
```

Configure the existing `.env.example` variables in ignored `.env.local`, using
the hosted Supabase project and a confirmed, provisioned planner or contractor
account. See [Teammate handoff](docs/TEAM_HANDOFF.md). No Docker is used.

The planner assistant is optional. Without credentials it answers from the engine
using templates — correct, just terser. With `ANTHROPIC_API_KEY` set (or an
`ant auth login` profile), answers are written by Claude and still constrained to
figures the engine produced. See `.env.example`.

## What it actually does

Contractors submit work for planner review. Approved revisions become inputs to
immutable saved plans, with publication, scoped delivery status and JSON/CSV
exports. Planners land in Saved plans; `/sandbox` retains the interactive
fabricated conflict-repair demo. Saved views use their exact original facts.

**Detects conflicts.** Thirteen rules over atomic track blocks, crew capacities,
equipment unit counts, isolation zones, work-class compatibility, dependencies,
travel time and handback deadlines. Workforce role counts are checked independently of crew concurrency. Conflict
counts and intervals are computed from the current inputs.

Two of them are worth the demo on their own:

- `M-001` covers `NS10-NS12` and `M-017` covers `NS11-NS13`. Different labels, no
  shared station in the names — and a 15-minute overlap on `NS11-NS12`. Comparing
  sector strings never finds this.
- `M-004` and `M-011` are on different lines, and their crew has two teams, so
  crew capacity is satisfied. They still cannot both run: there is one calibrated
  thermal imaging unit, and both sit inside the SS-4 traction isolation area.

**Builds a schedule.** Dependency-aware ordered insertion with bounded repair at
15-minute resolution. Roughly 20-70 ms. Reports `FEASIBLE` or `INFEASIBLE` without claiming global optimality, with solve time, candidate count and an input digest on
screen.

**Checks its own work.** Every plan is handed back to the validator from scratch
before display. The interface says "re-validated after solving: 0 violations", or
it reports the plan infeasible. A test asserts this as a property across all five
objectives.

**Explains by counterfactual.** "Why did M-014 move?" is answered by replaying it
at the time its requester asked for and reporting what breaks, in the rules' own
numbers — not by looking up a sentence someone wrote.

**Shows its arithmetic.** Every figure has an `fx` control exposing its formula,
numerator and denominator. Emergency capacity is not a score: each scenario in a
versioned set is actually inserted into the plan and re-validated.

**Lets planner decisions count.** Pinning a placement enters it as a hard
constraint and re-solves the night around it. The plan and every metric move with
the decision — or the tool reports that the decision cannot be honoured.

**Takes disruptions seriously.** A scenario changes the solver's inputs, the plan
is re-checked so you see what breaks, and only then is it solved again. The
emergency-insertion scenario comes back infeasible and names the mandatory job
that has nowhere to go. That is the correct answer, not a failure.

## How the rule-based scheduler works

The current scheduler is a deterministic, dependency-aware greedy insertion
heuristic with bounded repair (`railplan-greedy-repair-v3`). It is implemented in
pure TypeScript in `packages/core/src/engine/solve.ts`; it is not CP-SAT, MILP, or
an exhaustive search. `packages/core/src/engine/validate.ts` is deliberately
separate and is the only authority on whether a plan is feasible.

The scheduling flow is:

1. Build a `PlanningWorld` from the planning instance: requests, atomic track
   blocks, graph adjacency, conflict zones, team and equipment capacities, and
   the engineering window. The same world is passed to every validation call.
2. Insert planner-pinned placements first as hard constraints and remove those
   requests from the scheduling queue.
3. Order the remaining requests using the selected objective profile, while
   ensuring every predecessor appears before work that depends on it. Request ID
   is the final tie-break, so identical inputs always produce the same order.
4. Generate every permitted start at 15-minute intervals. A candidate must fit
   the request's earliest start, latest end, clearance time, and the effective
   handback deadline. Candidates are then ranked according to the objective.
5. Insert one candidate into the partial plan and run the complete validator.
   The candidate is accepted only when it creates no critical violation for the
   request being placed. Strategy recovery gaps are applied after the hard rules:
   Balanced may relax its 15-minute preference when necessary; Minimum risk does
   not relax its 30-minute gap.
6. If mandatory work remains unplaced, run up to four repair rounds. Each round
   defers the lowest-priority eligible non-mandatory placement (preferring a
   longer job when priorities tie) and rebuilds the plan from scratch. Re-solving
   avoids making the result depend on the history of earlier mutations.
7. Validate the complete plan again against the real engineering window. A
   critical violation or deferred mandatory request makes the result
   `INFEASIBLE`; otherwise it is `FEASIBLE`. The narrower `OPTIMAL` label is used
   only when every request is placed at its first-choice candidate with no
   deferrals. The result also reports candidates examined, solve time, solver and
   constraint versions, and a deterministic input digest.

### Hard rules

Every trial placement and completed plan is checked against the same 12-rule
catalogue (`constraints-v2`):

| Rule | What it checks |
| --- | --- |
| `BLOCK_CAPACITY` | Work plus clearance does not exceed an atomic block's concurrent capacity; a closed block has capacity zero. |
| `CONFLICT_ZONE` | Only one applicable job holds a fabricated isolation or crossover zone at a time. |
| `ADJACENT_WORK` | Work classes whose hazard extends beyond a block do not overlap on neighbouring blocks. |
| `TEAM_CAPACITY` | Concurrent assignments do not exceed the number of crews rostered for the named team. |
| `EQUIPMENT_CAPACITY` | Concurrent equipment demand, including turnaround time, does not exceed serviceable units. |
| `SKILL_COVERAGE` | The assigned team exists and holds every skill required by the request. |
| `WORK_COMPATIBILITY` | Incompatible work classes do not overlap on a block that permits concurrent occupation. |
| `DEPENDENCY_ORDER` | A successor starts only after its predecessor's work, clearance, and dependency lag. |
| `TIME_WINDOW` | Work stays inside the request's permitted start and finish bounds and the planning window. |
| `HANDBACK` | Work plus clearance finishes before the engineering-window deadline. |
| `TRAVEL_TIME` | A single-crew team has enough time to travel between consecutive jobs. |
| `SHIFT_AVAILABILITY` | Work stays inside the assigned team's shift and avoids disruption withdrawals. |

Capacity breaches use a sweep-line calculation rather than pairwise comparisons,
so three simultaneous demands against capacity two are detected even when no
individual pair is independently over capacity. Violations are deduplicated by
rule and request set, retain the exact offending interval, and are grouped into
connected clusters for the planner.

### Objective profiles

All five strategies use the same hard rules and placement algorithm. They change
only request order, candidate ranking, recovery-gap preference, and end-of-window
reserve:

| Strategy | Scheduling preference |
| --- | --- |
| Balanced | Prioritise higher-value work, stay near requested times, and prefer a 15-minute block recovery gap that may be relaxed. |
| Maximum completion | Rank work by priority value per minute and pack it as early as possible with no extra gap. |
| Minimum risk | Prefer early finishes and enforce a non-relaxable 30-minute recovery gap. |
| Minimum changes | Penalise priority-weighted movement from requested times and favour schedule stability. |
| Emergency reserve | Plan against a deadline 45 minutes early, leaving the tail of the window available for urgent work. |

Suggested conflict fixes and alternative slots do not bypass these rules. Each
candidate move is inserted into the real plan and re-validated before it is
shown. Locks likewise re-enter the next solve as hard constraints.

### Current limits

The scheduler can find a feasible plan quickly for this 22-request prototype,
but bounded greedy search can miss a better feasible schedule. It therefore does
not claim a general optimality bound. It moves requests in time but does not
reassign crews; travel is checked only for teams with one crew because a
multi-crew plan does not identify which crew performs each job. All topology,
capacities, travel estimates, work rules, and requests are fabricated.

## The assistant

It reads engine output and nothing else. The server re-solves from the request
parameters and builds its own fact set, so nothing the browser sends can become a
fact the model repeats. Any answer containing a figure absent from that fact set
is discarded and the engine answers instead. The model never decides feasibility.

The check has already earned its keep: it caught the fact set missing the
counterfactual explanations that the templates were quoting.

## Layout

```
packages/core/src/domain/  topology, crews, assets, work-class rules
packages/core/src/data/    22 requests, emergency scenarios, disruptions
packages/core/src/engine/  validate · solve · metrics · alternatives · explain
packages/core/src/types/   planning inputs and result contracts
src/store/                 Zustand: view state and solver invocation
src/components/            dashboard
src/lib/assistant/         fact set, grounding guard, templates
src/app/api/assistant/     Claude call, server side
```

`packages/core/src/engine/validate.ts` is the file to read first. It is the only
authority on whether a plan is feasible, and everything else defers to it.

## Checks

```bash
npm test          # engine, API, and UI tests
npm run lint
npm run typecheck
npm run build
```

The tests that matter most are the properties in
`packages/core/src/test/solve.test.ts`: every strategy's output survives
independent re-validation, identical inputs produce an identical plan and hash,
and pins are honoured exactly.

## Documentation

- `docs/CURRENT_IMPLEMENTATION_AUDIT.md` — what the code does, including what it
  still does not do
- `docs/ARCHITECTURE.md` — why it is shaped this way
- `docs/PROJECT_STATUS.md` — current state and what is next
- `docs/DETERMINISTIC_SCHEDULING_AND_ANALYTICS.md` — the mathematics, including
  the CP-SAT direction not yet taken
