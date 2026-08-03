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
npm install
npm run dev      # http://localhost:3000
```

No configuration required. The engine is pure TypeScript.

The planner assistant is optional. Without credentials it answers from the engine
using templates — correct, just terser. With `ANTHROPIC_API_KEY` set (or an
`ant auth login` profile), answers are written by Claude and still constrained to
figures the engine produced. See `.env.example`.

## What it actually does

Nothing on the dashboard is stored. There are no schedule fixtures in this
repository.

**Detects conflicts.** Twelve rules over atomic track blocks, crew capacities,
equipment unit counts, isolation zones, work-class compatibility, dependencies,
travel time and handback deadlines. Against the submitted times it finds 22
violations across 4 clusters. Nobody typed that list.

Two of them are worth the demo on their own:

- `M-001` covers `NS10-NS12` and `M-017` covers `NS11-NS13`. Different labels, no
  shared station in the names — and a 15-minute overlap on `NS11-NS12`. Comparing
  sector strings never finds this.
- `M-004` and `M-011` are on different lines, and their crew has two teams, so
  crew capacity is satisfied. They still cannot both run: there is one calibrated
  thermal imaging unit, and both sit inside the SS-4 traction isolation area.

**Builds a schedule.** Dependency-aware ordered insertion with bounded repair at
15-minute resolution. Roughly 20-70 ms. Reports `OPTIMAL`, `FEASIBLE` or
`INFEASIBLE` honestly, with solve time, candidate count and an input digest on
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

## The assistant

It reads engine output and nothing else. The server re-solves from the request
parameters and builds its own fact set, so nothing the browser sends can become a
fact the model repeats. Any answer containing a figure absent from that fact set
is discarded and the engine answers instead. The model never decides feasibility.

The check has already earned its keep: it caught the fact set missing the
counterfactual explanations that the templates were quoting.

## Layout

```
src/domain/            topology, crews, assets, work-class rules
src/data/              22 requests, emergency scenarios, disruptions
src/engine/            validate · solve · metrics · alternatives · explain
src/store/             Zustand: view state and solver invocation
src/components/        dashboard
src/lib/assistant/     fact set, grounding guard, templates
src/app/api/assistant/ Claude call, server side
```

`src/engine/validate.ts` is the file to read first. It is the only authority on
whether a plan is feasible, and everything else defers to it.

## Checks

```bash
npm test          # 117 tests
npm run lint
npm run typecheck
npm run build
```

The tests that matter most are the properties in `src/test/solve.test.ts`: every
strategy's output survives independent re-validation, identical inputs produce an
identical plan and hash, and pins are honoured exactly.

## Documentation

- `docs/CURRENT_IMPLEMENTATION_AUDIT.md` — what the code does, including what it
  still does not do
- `docs/ARCHITECTURE.md` — why it is shaped this way
- `docs/PROJECT_STATUS.md` — current state and what is next
- `docs/DETERMINISTIC_SCHEDULING_AND_ANALYTICS.md` — the mathematics, including
  the CP-SAT direction not yet taken
