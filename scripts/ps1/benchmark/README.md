# PS1 optimisation benchmark

The application now uses native CP-SAT as its server solver, warm-started by the
TypeScript hybrid. It is not the organiser's reference solver. All current
comparisons use the corrected per-activity scorer, `ps1-objective-v2`.

## 60-second cloud comparison

The measured local matrix is in [cloud-results.json](cloud-results.json), with
interpretation and primary research in
[PS1_NATIVE_SOLVER_RESEARCH.md](../../../docs/PS1_NATIVE_SOLVER_RESEARCH.md).
It is pinned to snapshot `d1e0a8f`. The later ECLO-construction merge is checked
separately in [post-merge-hybrid-results.json](post-merge-hybrid-results.json):
all 39 baseline and extended cases pass, capacity-pressure C improves to 1105.5,
and other scores are unchanged. Native models/checker are unchanged; native
timings were not rerun after that merge.
At eight workers on an M3 Pro, CP-SAT and SCIP tie all 39 final scores and improve
the same four hybrid cases. CP-SAT proves 37 optima and SCIP 38; neither proves
priority-contention C. Extended TypeScript repair improves none. This supports
deploying the integrated CP-SAT service while retaining SCIP as a serious
challenger; it does not establish a unique algorithm winner or cloud performance.

```sh
# Sequential comparison, 60s search PER scenario/run, default 16 workers.
npm run ps1:benchmark:cloud -- --python .venv-cpsat/bin/python --output output/cloud-coverage --variants cpsat-warm
# Focus on the difficult C cases and repeat on the actual 32-vCPU machine.
npm run ps1:benchmark:cloud -- --python .venv-cpsat/bin/python --output output/cloud-workers --datasets public,05-capacity-pressure,11-priority-contention,12-mixed-240 --scenarios C --variants cpsat-warm --workers 8,16,32 --seeds 1,2,3
# Distinct engines and search approaches; cold means no incumbent hints.
npm run ps1:benchmark:cloud -- --python .venv-cpsat/bin/python --output output/cloud-challengers --datasets public,05-capacity-pressure,11-priority-contention,12-mixed-240 --scenarios C --variants cpsat-cold,cpsat-lns,scip-warm,hybrid-extended
# Include construction failures; this repeats the prior holdout generator.
npm run ps1:benchmark:cloud -- --python .venv-cpsat/bin/python --output output/cloud-holdout --datasets public --holdouts 24 --scenarios B --variants cpsat-warm
```

Use a fresh output directory, or `--resume` with unchanged arguments, code, inputs
and CPU configuration. Fewer CPUs require an explicit smaller `--workers` value;
do not pretend a local oversubscribed run measures a 32-vCPU server. Worker sweep
worst-case search time is 36 minutes for 4 cases × 3 worker settings × 3 seeds.
Cases proven optimal usually finish much sooner.

Native raw objective/status and fallback-selected scores are distinct. The cold
variant has no hints but can still retain the external heuristic schedule in its
selected result. `firstSolutionMs`/`solutionTrace` are model-candidate timestamps,
not CSV-validated response times. `estimatedPipelineMs` sums prerequisite
heuristic scenarios, baseline construction and the native bridge; `elapsedMs`
includes native payload preparation, process startup, build, search and CSV
validation. It is not a strict response deadline. SCIP lacks a candidate callback
in this interface, and reports null/empty trace fields. Peak RSS is per child
process lifetime. Bounds are explicitly scoped to full or frozen-repair models.

The optional `cpsat-base-lin0` variant only changes the base linearization level;
named parallel LP subsolvers can override it. It is not an LP-free portfolio.

## Stress experiments with one total deadline

[Measured results](../../../docs/PS1_NATIVE_SEARCH_EXPERIMENTS.md) and
[raw evidence](stress-results.json) record 33 final-protocol runs: all locally
valid, no errors, and no paired final-score improvements. Tightening consistently
shortens one proof and improves the best hard-case bound to 261; production
remains unchanged. Calibration and an excluded merge-interference batch are
retained separately, not pooled into that comparison.

`stress.ts` compares three opt-in CP-SAT pipelines under a **60-second total
wall-time target per scenario/run**. Warm-start construction, native startup,
model building, search, repair selection and CSV validation all consume that
budget. Child processes have a wall-time guard; synchronous orchestration remains
cooperative and can overrun. Inspect `elapsedMs` and `deadlineOverrunMs`. This
budget differs from `cloud.ts`'s 60-second **native search** allowance plus overhead.
These experiments do not change the production solver or its default budget.

| Variant | Search within the shared budget |
| --- | --- |
| `full` | One full baseline model after the warm start |
| `tight` | One full model with redundant workload, ECLO, timing and linear capacity constraints; exact scoring and packing stay unchanged |
| `targeted` | Initial full search, up to four repairs targeting late chains, spatial blockers, locations and random subsets, then full search with the remaining time |

Each run constructs its own checked incumbent with a one-second cooperative
warm-start limit. Runs execute sequentially, and variant order rotates by case
and seed. Compare `baselineScore` as well as final scores across repeated seeds:
time-limited warm starts can differ. Tightening is CP-SAT-only; the native bridge
rejects `formulation: "tight"` for SCIP.

The immutable `ps1-stress-v1` manifest fixes these cases before comparisons:

| Family | Activities | Development seed | Holdout seed |
| --- | ---: | ---: | ---: |
| Shared hubs | 60 | 730101 | 830111 |
| Chain bottlenecks | 72 | 730103 | 830113 |
| Live interchange | 96 | 730107 | 830117 |
| Mixed spans | 120 | 730109 | 830119 |

Selectors are `development`, `holdout`, `control`, `all`, or explicit case IDs
from [stress-instances.ts](stress-instances.ts). Controls are public,
05-capacity-pressure and 11-priority-contention. Synthetic A/C schedules certify
local feasibility and are saved for audit; **they are never solver hints**.
Scenario B has no such feasibility certificate. Tune only on development cases,
freeze settings, then evaluate holdout; related synthetic families are not
independent operational data.

```sh
# Local example: use only workers available on this host.
npm run ps1:benchmark:stress -- --python .venv-cpsat/bin/python --output output/stress-development --datasets development,control --scenarios C --seconds 60 --workers 8 --seeds 1,2,3 --variants full,tight,targeted
# Evaluate once after freezing the compared methods and settings.
npm run ps1:benchmark:stress -- --python .venv-cpsat/bin/python --output output/stress-holdout --datasets holdout --scenarios C --seconds 60 --workers 8 --seeds 1,2,3 --variants full,tight,targeted
# Cloud engineer: execute sequentially on the actual 32-vCPU / 64-GiB host.
for stress_workers in 8 16 32; do
  npm run ps1:benchmark:stress -- --python .venv-cpsat/bin/python --output "output/gce-stress-w${stress_workers}" --datasets development,control --scenarios C --seconds 60 --workers "$stress_workers" --seeds 1,2,3 --variants full,tight,targeted
done
```

Use separate output directories for each setting; `--resume` requires matching
inputs, source, runtime, host and configuration. Summaries retain failures and
stage errors, including when a valid fallback survives. Report those errors
separately from selected-schedule feasibility. Every accepted candidate passes
CSV round-trip checks. `fullBound` uses only full-model bounds (or the universal
zero penalty bound); an optimal repair proves only its frozen subproblem.
All proofs remain local-model claims, with cross-possession physical-night
alignment and reference-validator equivalence unverified. Local measurements
do not establish 32-vCPU cloud performance.


## Earlier five-second native evidence — 2026-09-19

[native-results.json](native-results.json) records all 13 inputs × three scenarios:
39/39 locally feasible, 37 full-model OPTIMAL, two FEASIBLE, zero errors. Eight
workers, seed 1, five-second search limit (the current service default is 60 seconds).
Total native process/check time across these 39 cases was 40.45 seconds on an
Apple M3 Pro, Node 22.22.0, OR-Tools 9.15.6755. This is not a GCP measurement or an
equal-wall-time comparison against the iteration-budget heuristic.

| Case | Hybrid | Native | Full-model bound | Status |
| --- | ---: | ---: | ---: | --- |
| Public A | 25.2 | 25.2 | 25.2 | OPTIMAL |
| Public B | 30 | 30 | 30 | OPTIMAL |
| Public C | 25.2 | 25.2 | 25.2 | OPTIMAL |
| 05 capacity pressure B | 293 | 230 | 230 | OPTIMAL |
| 05 capacity pressure C | 1118.8 | 1090.8 | 1015.5 | FEASIBLE |
| 11 priority contention B | 483 | 279 | 279 | OPTIMAL |
| 11 priority contention C | 340.4 | 300.7 | 206.5 | FEASIBLE |

Native improves four hybrid cases and ties the remaining 35; no feasibility loss.
Compared with legacy, the selected portfolio improves 17 cases. The two remaining
nonzero gaps are unresolved; bounds are not promised achievable scores. OPTIMAL
is limited to the encoded local model. Cross-possession physical-night alignment
and reference-validator equivalence remain unverified.

Reproduce the current matrix (includes heuristic failures and records native
errors rather than filtering them out):

```sh
npm run ps1:benchmark -- output/ps1-v2-matrix
node --import tsx scripts/ps1/benchmark/native-matrix.ts .venv-cpsat/bin/python output/ps1-v2-matrix
```

The harness rejects stale browser scores under the current formula. `results.json`
is retained as explicitly superseded v1 history, including its old perturbation
runs. Its A/C scoring and proof claims must not be cited as current evidence.

## Reproduce

```sh
npm run ps1:benchmark
# Optional dataset, cooperative wall-time limit in ms, and seed count:
npm run ps1:benchmark -- output/ps1-timed public 1000 5
node --import tsx scripts/ps1/benchmark/holdout.ts output/ps1-holdout 24

python3 -m venv .venv-cpsat
.venv-cpsat/bin/python -m pip install -r scripts/benchmark/requirements.txt
.venv-cpsat/bin/python scripts/ps1/benchmark/test_cp_sat.py
node --import tsx scripts/ps1/benchmark/compare-cpsat.ts .venv-cpsat/bin/python output/ps1-benchmark 1
# One full model or a repair fixing all but the last-finishing 20 activities:
npm run ps1:benchmark:cpsat -- .venv-cpsat/bin/python output/ps1-benchmark/public-B-hybrid-1.json 5 full
npm run ps1:benchmark:cpsat -- .venv-cpsat/bin/python output/ps1-benchmark/public-B-hybrid-1.json 5 repair
```

Each TypeScript witness contains the instance, submission and re-parsed validation
report. Summaries include instance digests, failures, scores, evaluated candidates
and elapsed time. CP-SAT results echo provenance and record model schema, solver
version, objective, bound, search time and total process time. Every CP-SAT result
is decoded to the official CSVs, re-parsed, checked locally, and required to match
the model objective. A mismatch is an error, never a usable solution.

## Browser search

1. Keep the original 24 deterministic construction starts and up to 96 one-week
   reconstruction trials (`searchMode: "legacy"` remains available).
2. Revalidate provided incumbents against the target scenario, exact hard pins
   and disruptions. Also try nominal-capacity A constructions in B/C.
3. Rank per-line ECLO windows using release/deadline pressure. Search up to 64
   window combinations; the beam retains at most 256 combinations. This is a
   bounded heuristic, not exhaustive enumeration of the public 841 window pairs.
   Live work must fit every line reached by the shared closure expansion.
4. Spend remaining neighbour evaluations on adaptive destroy/repair: late chains,
   common locations, contracts and random subsets. Remove about 10–30% of work,
   include descendants, freeze unaffected accesses, and rebuild possession groups
   and weekly night assignments. User pins remain hard. Seeded annealing can move
   the current candidate uphill, but the best validated incumbent is retained.

Default neighbour budget is **256 total** across legacy shifts, window trials and
adaptive repairs, capped at 2,500 when explicitly requested. Construction starts,
nominal-capacity starts and supplied candidates are separate. Zero score skips
further quality search. `maxTimeMs` is an optional cooperative cutoff checked
between candidates; one construction/validation may overrun it. Iteration-only
runs are deterministic; wall-time runs are machine/load dependent.

An exhausted search retains the API's `INFEASIBLE` status for compatibility, with
an explicit warning that it is **not a proof of infeasibility**. Incomplete or
pin-rejecting schedules remain non-exportable. All scores below are penalties.

## Historical browser comparison — v1, superseded

Apple M3 Pro, Node 22.22.0, native OR-Tools 9.15.6755. See `results.json` for measured
rows and input digests. These are quality comparisons at the declared defaults,
not an equal-wall-time performance claim. Concurrent verification makes elapsed
times indicative only. For timing comparisons use the same wall limit and several
seeds, and count loading/model construction as well as solver search time.

| Input | Legacy A / B / C | Browser hybrid A / B / C |
| --- | --- | --- |
| Public | 25.2 / 44 / 39.2 | **25.2 / 30 / 25.2** |
| 01 small | 0 / 0 / 0 | 0 / 0 / 0 |
| 02 co-sharing | 0 / 84 / 84 | **0 / 0 / 0** |
| 03 Live interchange | 0 / 49 / 49 | **0 / 0 / 0** |
| 04 dependencies | 0 / 0 / 0 | 0 / 0 / 0 |
| 05 capacity pressure | 2184 / 293 / 1123 | **2184 / 293 / 1118.8** |
| 06 mixed 120 | 0 / 378 / 308 | **0 / 0 / 0** |
| 07 long spans | 0 / 133 / 133 | **0 / 0 / 0** |
| 08 workfronts | 0 / 0 / 0 | 0 / 0 / 0 |
| 09 separated ECLO windows | 3640 / 40 / 3640 | **3640 / 40 / 1840** |
| 10 horizon boundary | 0 / 0 / 0 | 0 / 0 / 0 |
| 11 priority contention | 1768.2 / 483 / 340.4 | 1768.2 / 483 / 340.4 |
| 12 mixed 240 | 0 / 826 / 665 | **0 / 0 / 0** |

All 39 browser outcomes pass full workload and CSV round-trip checks: 14 improved,
25 tied, none regressed. Public B improves 31.8%, public C 35.7%, and fixture 09 C
49.5%. No average percentage is computed across zero-score cases.

An untuned holdout run uses seeds 101–124, four existing input templates, workload
perturbations of -1/0/+1 and random activity/contract priorities. This is a
perturbation holdout, not independent real-world data. Across 72 scenarios: 32
improved, 32 tied, 8 remained unresolved by both heuristics, no regressions or
feasibility losses. No claim that the eight unresolved cases are impossible.

A further public-instance run with a cooperative 1,000 ms limit and seeds 1–5
retained A=25.2 / B=30 / C=25.2 for every hybrid run (15/15 feasible). Recorded
hybrid elapsed times were 548–1,003 ms. The three-millisecond overrun illustrates
that the timer is checked between candidates, not a hard process deadline.

## Historical single-worker CP-SAT comparison — v1, superseded

The weekly model represents access and ECLO booleans, full yield, starts,
strict predecessor ordering, weekly/workfront budgets, exact date deadlines,
per-line ECLO windows and disruptions. This historical version incorrectly charged
only activities finishing in their contract's last week; the v2 model charges each
activity's own lateness. It uses integer-scaled
penalties. At each location-week, minimum legal possession count is:

```
PM count + max(PC count, ceil((PC count + C count) / 4))
```

The decoder independently packs PC hosts and C workers, puts PM alone, and assigns
contract-local access-night indices. This relies on the published per-location
sharing identities; it does not invent a physical-night relationship between
separate possessions.

At a one-second **search** limit with one native worker and a hybrid incumbent,
39 full models plus 12 nonzero-score repairs yielded 37 `OPTIMAL`, 10 `FEASIBLE`
and 4 `UNKNOWN` results. All 47 solutions matched the checker after CSV round-trip.
`UNKNOWN` includes mixed-120 C and all three mixed-240 scenarios: retain the
incumbent rather than discard it. Bounds from repairs apply only to their frozen
subproblem; they cannot establish global optimality.

Full CP-SAT improved capacity-pressure B **293 → 230**, capacity-pressure C
**1118.8 → 1112.7**, and priority-contention B **483 → 279**. Public B's **30** and
fixture 09 C's **1840** were proven optimal for the encoded full local model.
Public A/C were not proven optimal by the full models at this limit. Native model
construction and Python startup are outside that one-second search limit and are
included separately in total elapsed time. An initial comparison process timed
out; the complete rerun recorded no process errors. The harness records future
process/model errors as failures rather than dropping their rows.

## Deployment decision and limitations

The owner approved native server execution. `/api/ps1/solve` is the primary path;
see [the deployment runbook](../../../docs/PS1_NATIVE_DEPLOYMENT.md). The former
browser worker remains an offline comparator, not the UI execution path. Google
Compute Engine is the initial target. IBM CP Optimizer, Hexaly and custom CP-backed
LNS remain unbenchmarked challengers, not asserted improvements.

The local checker is not the reference validator. Cross-possession physical-night
alignment remains undecidable from the official fields, so neither heuristic
feasibility nor CP-SAT optimality certifies that missing relationship. Full-model
bounds and conditional repair bounds must never be conflated.
