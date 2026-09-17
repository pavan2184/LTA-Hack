# CP-SAT reference benchmark

This is an offline comparison, not a production solver or service. RailPlan's
TypeScript `validate()` remains the constraint authority. The Python master
chooses one 15-minute candidate slot (or deferral) per request; it never
re-models a track, crew, equipment, workforce or dependency rule. The harness
derives single-placement and relevant pair cuts through the validator first; any
remaining invalid CP-SAT incumbent produces lazy no-good cuts until the best
remaining solution validates, or the model is proven infeasible. Deferral choices
are included in those cuts, so dependency cuts reject only the invalid
placement/deferral combination rather than banning the dependent request outright.

## Why Python is not a second validator

Re-expressing the rules in Python would create a second opinion that could
disagree with `validate()` in a way nothing detects. Instead the boundary is
checked on every call:

- **Instance-digest handshake.** Each payload carries `instanceDigest` — the
  digest of the `PlanningInstance` the candidates were built from — plus the
  `constraintVersion` they were cut against and the fixture name. Python echoes
  all three verbatim; the harness rejects any result whose echo differs. A stale
  solver process answering about a different night fails instead of being
  averaged into a result.
- **Schema drift fails fast.** Python validates the payload shape before
  building a model: wrong `schemaVersion`, missing keys, unknown keys or a
  malformed `provenance` block all raise `SchemaDrift` and exit non-zero.
- **Every reported plan is re-validated.** A CP-SAT plan that comes back with
  critical violations aborts the run rather than being reported.

Payload schema `railplan-cp-sat-payload-v2`, result schema
`railplan-cp-sat-result-v2`. Bump both together when the contract changes.

## Fixtures

Seven instances, covering the classes issue #20 asks for:

| Fixture | Class | What it stresses |
| --- | --- | --- |
| `baseline-feasible` | seeded | The fabricated 22-request night as-is. |
| `mandatory-blocks-closed-infeasible` | infeasible | Every block a mandatory request needs is closed. Both methods must prove infeasibility. |
| `shortened-window-disruption` | disruption | Handback pulled to minute 210. |
| `team-unavailable-disruption` | disruption | Power Systems Unit unavailable from minute 120. |
| `locked-planner-pins` | locked | Three validated pins entered as hard constraints. |
| `larger-cloned-night` | larger | 33 requests: the night plus a non-mandatory clone of every second request, offset 30 minutes, with its own workforce demand rows. |
| `adversarial-tight-windows` | adversarial | Permitted windows squeezed to a 60-minute band, so most requests have few legal starts. A 30-minute band was tried first and proved genuinely infeasible, duplicating the closed-block fixture. |

Clones carry their own `workforceDemand` rows deliberately. Without them every
clone trips `WORKFORCE_CAPACITY` as undefined staffing, and the fixture would
measure a data omission instead of scale.

Only every second request is cloned. Cloning all 22 gave a 44-request night that
neither method could satisfy — the heuristic returned `INFEASIBLE` with 4 of 5
mandatory requests placed, and CP-SAT exhausted a five-minute budget over 35 cut
rounds and 14,001 cuts without resolving it — which conflates "does not scale"
with "is not solvable". At 33 the instance stays feasible, so the fixture
measures scale on its own.

## Termination

The run is bounded three ways, and each bound reports rather than throwing, so
one hard fixture cannot discard the others' numbers:

| Status | Meaning |
| --- | --- |
| `SOLVER_TIMEOUT` | One Python call exceeded 90 s. `timeLimitSeconds` bounds CP-SAT's search, not model construction, and with thousands of cuts the build dominates. |
| `BUDGET_EXCEEDED` | The cut loop passed five minutes of wall clock for this fixture. |
| `CUT_LIMIT` | The loop hit 200 rounds without the incumbent validating. |

All three are findings about the instance, not harness failures. A CP-SAT plan
that comes back with critical violations still aborts the run — that one is a
harness failure.

## Running it

Install the pinned dependency into an isolated environment (`.venv-cpsat/` is
git-ignored), then pass that environment's Python executable:

```sh
python3 -m venv .venv-cpsat
.venv-cpsat/bin/python -m pip install -r scripts/benchmark/requirements.txt
npm exec -- tsx scripts/benchmark/cp-sat.ts .venv-cpsat/bin/python
```

On Windows use `.venv-cpsat\Scripts\python.exe`. Add fixture names after the
interpreter to run a subset:

```sh
npm exec -- tsx scripts/benchmark/cp-sat.ts .venv-cpsat/bin/python baseline-feasible
```

The run prints one JSON document to stdout. It records the host CPU, core count,
memory, Node/Python/OR-Tools versions, time limit, random seed and search-worker
count, because those are what make a number reproducible or explain why it
differs. Per fixture it reports placed/deferred counts, mandatory coverage,
priority-weighted completion, movement minutes, emergency capacity, critical
violations, solver status, objective value and bound, candidate and cut counts,
and end-to-end elapsed time.

**Determinism is checked, not asserted.** The heuristic is solved twice and must
return an identical `inputHash` and placement set. CP-SAT re-solves its *final*
cut set and must return the same status and placement set — replaying the whole
lazy-cut loop would only re-time the validator, and on the larger fixture it
doubled a five-minute budget for no extra information. A proved-infeasible
fixture has no plan to compare, so there the check is that the status agrees.
The `deterministic` flag is that comparison, not a claim; it is `null` when no
comparison was possible.

## Reading the results

Do not infer production superiority from one fabricated night. "More placed work"
is not free — check movement minutes and emergency capacity alongside it.

The CP-SAT objective is a lexicographic encoding of `max-completion`'s own
declared objectives: priority-weighted completion, then job count, then earlier
start. That strategy states "Movement from requested times is not penalised" and
ranks candidates by `start` alone, so the encoding is faithful and the movement
difference in the results is a real consequence of placing more work, not a proxy
artifact. That does **not** hold for the other four strategies: `balanced` and
`min-risk` both penalise movement in `candidateCost` and are not benchmarked
here, so these numbers say nothing about how the two methods would compare under
them.

Retain the TypeScript heuristic unless repeated representative instances show a
material benefit worth a Python service and its failure modes. The accepted
decision drawn from this evidence is in `docs/DECISIONS.md`.
